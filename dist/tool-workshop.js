import { randomUUID } from 'node:crypto';
import { CandidateContentError, captureCandidateFiles } from './candidate-content.js';
import { LABORATORY_PROTOCOL_VERSION, contentHash } from './laboratory-contract.js';
export class ToolWorkshopError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'ToolWorkshopError';
    }
}
function fail(code, message) {
    throw new ToolWorkshopError(code, message);
}
function requiredText(value, field) {
    if (value.trim().length === 0) fail('INVALID_TOOL_SPECIFICATION', `${field} must not be empty`);
}
function validateSpecification(input) {
    requiredText(input.problem, 'problem');
    requiredText(input.publicName, 'publicName');
    requiredText(input.description, 'description');
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(input.publicName)) {
        fail('INVALID_TOOL_NAME', 'publicName must be a snake_case identifier');
    }
    if (input.acceptanceCriteria.length === 0) {
        fail('INVALID_TOOL_SPECIFICATION', 'acceptanceCriteria must not be empty');
    }
    for (const [index, criterion] of input.acceptanceCriteria.entries()){
        requiredText(criterion, `acceptanceCriteria[${index}]`);
    }
    for (const [index, permission] of input.requestedPermissions.entries()){
        requiredText(permission, `requestedPermissions[${index}]`);
    }
    for (const [index, constraint] of (input.constraints ?? []).entries()){
        requiredText(constraint, `constraints[${index}]`);
    }
    if (new Set(input.requestedPermissions).size !== input.requestedPermissions.length) {
        fail('INVALID_TOOL_SPECIFICATION', 'requestedPermissions must not contain duplicates');
    }
    contentHash(input.inputSchema);
    contentHash(input.outputSchema);
}
function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
}
function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value))deepFreeze(item);
    return value;
}
function assertAuthor(context) {
    if (context.authority !== 'model' && context.authority !== 'trusted-host') {
        fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot author Tool workshop content`);
    }
}
function descriptorName(descriptor) {
    if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) return null;
    const name = descriptor.name;
    return typeof name === 'string' ? name : null;
}
export class ToolWorkshop {
    now;
    idFactory;
    repository;
    specifications = new Map();
    revisions = new Map();
    candidateRevisions = new Map();
    constructor(options = {}){
        this.now = options.now ?? (()=>new Date());
        this.idFactory = options.idFactory ?? randomUUID;
        this.repository = options.repository;
    }
    defineSpecification(context, input) {
        assertAuthor(context);
        validateSpecification(input);
        const captured = deepCopy({
            problem: input.problem,
            publicName: input.publicName,
            description: input.description,
            inputSchema: input.inputSchema,
            outputSchema: input.outputSchema,
            requestedPermissions: [
                ...input.requestedPermissions
            ],
            acceptanceCriteria: [
                ...input.acceptanceCriteria
            ],
            constraints: [
                ...input.constraints ?? []
            ]
        });
        const binding = {
            workspaceId: context.workspaceId,
            createdBy: context.actorId,
            ...captured
        };
        const specification = deepFreeze({
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            specificationId: `proposal:${this.idFactory()}`,
            workspaceId: context.workspaceId,
            createdAt: this.now().toISOString(),
            createdBy: context.actorId,
            ...captured,
            specificationHash: contentHash(binding)
        });
        this.repository?.saveSpecification(specification);
        this.specifications.set(specification.specificationId, specification);
        return specification;
    }
    createCandidateRevision(context, input) {
        assertAuthor(context);
        const specification = this.specifications.get(input.specificationId) ?? this.repository?.readSpecification(context.workspaceId, input.specificationId);
        if (specification === undefined || specification === null || specification.workspaceId !== context.workspaceId) {
            fail('SPECIFICATION_NOT_FOUND', 'specification is not visible in this workspace');
        }
        if (descriptorName(input.descriptor) !== specification.publicName) {
            fail('DESCRIPTOR_NAME_MISMATCH', 'candidate descriptor does not implement the specified public name');
        }
        if (input.sources.length === 0) fail('EMPTY_CANDIDATE_SOURCE', 'candidate must contain at least one source file');
        let files;
        try {
            files = captureCandidateFiles(input.sources, 'sources');
        } catch (error) {
            if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2));
            throw error;
        }
        contentHash(input.descriptor);
        const descriptor = deepCopy(input.descriptor);
        const bindings = files.map((file)=>file.binding);
        const priorIds = this.candidateIdsForSpecification(context.workspaceId, specification.specificationId);
        let candidateId;
        let parent;
        if (input.parentRevisionId === undefined) {
            if (priorIds.length !== 0) fail('PARENT_REVISION_REQUIRED', 'an existing candidate must be revised from its current revision');
            candidateId = `tool:${this.idFactory()}`;
        } else {
            parent = this.storedRevision(context.workspaceId, input.parentRevisionId);
            if (parent === undefined || parent.public.workspaceId !== context.workspaceId) {
                fail('CANDIDATE_REVISION_NOT_FOUND', 'parent revision is not visible in this workspace');
            }
            if (parent.public.specificationId !== specification.specificationId) {
                fail('SPECIFICATION_MISMATCH', 'parent revision belongs to another specification');
            }
            if (parent.public.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current revision can be revised');
            candidateId = parent.public.candidateId;
        }
        const revision = (parent?.public.revision ?? 0) + 1;
        const descriptorHash = contentHash(descriptor);
        const sourceHash = contentHash(bindings);
        if (parent !== undefined && parent.public.descriptorHash === descriptorHash && parent.public.sourceHash === sourceHash) {
            fail('UNCHANGED_CANDIDATE', 'a revision must change candidate content');
        }
        const binding = {
            workspaceId: context.workspaceId,
            candidateId,
            specificationId: specification.specificationId,
            specificationHash: specification.specificationHash,
            revision,
            parentCandidateHash: parent?.public.candidateHash ?? null,
            descriptorHash,
            sourceHash,
            sources: bindings
        };
        const candidateHash = contentHash(binding);
        const publicRevision = deepFreeze({
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            revisionId: `evidence:${this.idFactory()}`,
            ...binding,
            parentRevisionId: parent?.public.revisionId ?? null,
            candidateHash,
            state: 'current',
            createdAt: this.now().toISOString(),
            createdBy: context.actorId
        });
        this.repository?.saveRevision(publicRevision, descriptor, input.sources);
        if (parent !== undefined) {
            parent.public = deepFreeze({
                ...parent.public,
                state: 'superseded'
            });
        }
        this.revisions.set(publicRevision.revisionId, {
            public: publicRevision,
            descriptor,
            files
        });
        this.candidateRevisions.set(candidateId, [
            ...this.candidateRevisions.get(candidateId) ?? [],
            publicRevision.revisionId
        ]);
        return publicRevision;
    }
    inspectRevision(context, revisionId) {
        return this.visibleRevision(context, revisionId).public;
    }
    listCandidateRevisions(context, candidateId) {
        if (this.repository !== undefined) return this.repository.listCandidateRevisions(context.workspaceId, candidateId);
        return (this.candidateRevisions.get(candidateId) ?? []).map((revisionId)=>this.revisions.get(revisionId)).filter((revision)=>revision !== undefined && revision.public.workspaceId === context.workspaceId).map((revision)=>revision.public);
    }
    materializeRevision(context, revisionId) {
        if (this.repository !== undefined) {
            const materialized = this.repository.materializeRevision(context.workspaceId, revisionId);
            if (materialized === null) fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace');
            return materialized;
        }
        const stored = this.visibleRevision(context, revisionId);
        return {
            revision: stored.public,
            descriptor: deepCopy(stored.descriptor),
            sources: stored.files.map((file)=>({
                    path: file.path,
                    content: Buffer.from(file.bytes)
                }))
        };
    }
    candidateIdsForSpecification(workspaceId, specificationId) {
        if (this.repository !== undefined) {
            return this.repository.listSpecificationRevisions(workspaceId, specificationId).map((revision)=>revision.revisionId);
        }
        return [
            ...this.revisions.values()
        ].filter((revision)=>revision.public.specificationId === specificationId).map((revision)=>revision.public.revisionId);
    }
    visibleRevision(context, revisionId) {
        const revision = this.storedRevision(context.workspaceId, revisionId);
        if (revision === undefined || revision.public.workspaceId !== context.workspaceId) {
            fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace');
        }
        return revision;
    }
    storedRevision(workspaceId, revisionId) {
        const memory = this.revisions.get(revisionId);
        if (memory !== undefined) return memory;
        const materialized = this.repository?.materializeRevision(workspaceId, revisionId);
        if (materialized === undefined || materialized === null) return undefined;
        return {
            public: materialized.revision,
            descriptor: materialized.descriptor,
            files: captureCandidateFiles(materialized.sources, 'sources')
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/tool-workshop.ts