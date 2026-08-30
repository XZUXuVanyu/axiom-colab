import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, closeSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { captureCandidateFiles, safeCandidateRelativePath } from './candidate-content.js';
import { installationProposalBinding } from './tool-installation-proposal.js';
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash } from './laboratory-contract.js';
export class ToolInstallationError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'ToolInstallationError';
    }
}
function fail(code, message) {
    throw new ToolInstallationError(code, message);
}
function approvalBinding(value) {
    return {
        protocolVersion: value.protocolVersion,
        approvalId: value.approvalId,
        workspaceId: value.workspaceId,
        proposalId: value.proposalId,
        proposalHash: value.proposalHash,
        decision: value.decision,
        approvedAt: value.approvedAt,
        approvedBy: value.approvedBy
    };
}
export function installationClaimBinding(value) {
    const { claimHash: _hash, ...binding } = value;
    return binding;
}
export function installationEvidenceBinding(value) {
    const { evidenceHash: _hash, ...binding } = value;
    return binding;
}
function errorCode(error) {
    if (typeof error === 'object' && error !== null && typeof error.code === 'string') {
        return error.code;
    }
    return 'INSTALLATION_FAILED';
}
function contained(root, path) {
    const rel = relative(root, path);
    return rel === '' || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function locationFor(workspaceId, publicName, candidateHash) {
    const workspace = contentHash(workspaceId).slice('sha256:'.length);
    const candidate = candidateHash.slice('sha256:'.length);
    return `${workspace}/${publicName}/${candidate}`;
}
function writeExclusive(path, bytes) {
    mkdirSync(dirname(path), {
        recursive: true
    });
    const handle = openSync(path, 'wx');
    try {
        writeFileSync(handle, bytes);
    } finally{
        closeSync(handle);
    }
}
export class ToolInstallationService {
    repository;
    validator;
    root;
    registry;
    now;
    idFactory;
    constructor(repository, validator, options){
        this.repository = repository;
        this.validator = validator;
        this.root = resolve(options.installationRoot);
        this.registry = options.registry;
        this.now = options.now ?? (()=>new Date());
        this.idFactory = options.idFactory ?? randomUUID;
        mkdirSync(this.root, {
            recursive: true
        });
        mkdirSync(resolve(this.root, '.staging'), {
            recursive: true
        });
    }
    install(context, proposalId) {
        if (context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot install Tools`);
        const bound = this.boundApproval(context.workspaceId, proposalId);
        const installationId = `evidence:${this.idFactory()}`;
        const claimedAt = this.now().toISOString();
        const claimBase = {
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            installationId,
            workspaceId: context.workspaceId,
            proposalId,
            proposalHash: bound.proposal.proposalHash,
            approvalId: bound.approval.approvalId,
            approvalHash: bound.approval.approvalHash,
            candidateId: bound.revision.candidateId,
            candidateHash: bound.revision.candidateHash,
            claimedAt,
            claimedBy: context.actorId
        };
        const claim = {
            ...claimBase,
            claimHash: contentHash(claimBase)
        };
        this.repository.claimInstallation(claim);
        const relativeLocation = locationFor(context.workspaceId, bound.specification.publicName, bound.revision.candidateHash);
        const finalRoot = resolve(this.root, relativeLocation);
        const stagingRoot = resolve(this.root, '.staging', installationId.replace(':', '-'));
        if (!contained(this.root, finalRoot) || !contained(this.root, stagingRoot)) fail('INSTALLATION_PATH_ESCAPE', 'installation path escaped its configured root');
        let registeredDispose;
        let promoted = false;
        let stagingOwned = false;
        try {
            try {
                mkdirSync(stagingRoot, {
                    recursive: false
                });
                stagingOwned = true;
            } catch (error) {
                if (existsSync(stagingRoot)) fail('INSTALLATION_STAGING_COLLISION', 'installation staging identity already exists');
                throw error;
            }
            this.writeCandidate(stagingRoot, bound.materialized);
            mkdirSync(dirname(finalRoot), {
                recursive: true
            });
            try {
                renameSync(stagingRoot, finalRoot);
                promoted = true;
            } catch (error) {
                if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY' || existsSync(finalRoot)) {
                    fail('INSTALLATION_PATH_COLLISION', 'the exact installed-Tool location already exists');
                }
                throw error;
            }
            const completedAt = this.now().toISOString();
            const evidence = this.evidence(claim, bound, relativeLocation, 'installed', null, completedAt);
            const registration = {
                workspaceId: context.workspaceId,
                installationId,
                candidateId: bound.revision.candidateId,
                candidateHash: bound.revision.candidateHash,
                descriptorHash: bound.revision.descriptorHash,
                sourceHash: bound.revision.sourceHash,
                sources: bound.revision.sources.map((source)=>({
                        ...source
                    })),
                publicName: bound.specification.publicName,
                descriptor: bound.materialized.descriptor,
                requestedPermissions: [
                    ...bound.proposal.requestedPermissions
                ],
                installationEvidenceHash: evidence.evidenceHash,
                installedRoot: finalRoot
            };
            const registrationDispose = this.registry.register(registration);
            registeredDispose = typeof registrationDispose === 'function' ? registrationDispose : undefined;
            this.repository.recordInstallationEvidence(evidence);
            return evidence;
        } catch (error) {
            try {
                registeredDispose?.();
            } catch  {}
            try {
                if (promoted) rmSync(finalRoot, {
                    recursive: true,
                    force: true
                });
                else if (stagingOwned) rmSync(stagingRoot, {
                    recursive: true,
                    force: true
                });
            } catch  {}
            const code = errorCode(error);
            const evidence = this.evidence(claim, bound, relativeLocation, 'failed', code, this.now().toISOString());
            try {
                this.repository.recordInstallationEvidence(evidence);
            } catch  {}
            if (error instanceof ToolInstallationError) throw error;
            throw new ToolInstallationError(code, error instanceof Error ? error.message : String(error));
        }
    }
    rediscover(context) {
        if (context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot rediscover installed Tools`);
        const installed = this.repository.listInstalledTools(context.workspaceId);
        const rollback = [];
        try {
            for (const evidence of installed){
                const proposal = this.repository.inspectInstallationProposal(context.workspaceId, evidence.proposalId);
                if (proposal === null || proposal.proposalHash !== evidence.proposalHash) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool proposal binding is unavailable');
                const materialized = this.repository.materializeRevision(context.workspaceId, evidence.revisionId);
                if (materialized === null || materialized.revision.candidateHash !== evidence.candidateHash) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool candidate binding is unavailable');
                const specification = this.repository.readSpecification(context.workspaceId, materialized.revision.specificationId);
                if (specification === null || specification.publicName !== evidence.publicName) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool specification binding is unavailable');
                const installedRoot = resolve(this.root, evidence.relativeLocation);
                if (!contained(this.root, installedRoot)) fail('INSTALLATION_PATH_ESCAPE', 'stored installation location escaped its configured root');
                this.verifyCandidate(installedRoot, materialized);
                const dispose = this.registry.register({
                    workspaceId: context.workspaceId,
                    installationId: evidence.installationId,
                    candidateId: evidence.candidateId,
                    candidateHash: evidence.candidateHash,
                    descriptorHash: evidence.descriptorHash,
                    sourceHash: evidence.sourceHash,
                    sources: materialized.revision.sources.map((source)=>({
                            ...source
                        })),
                    publicName: evidence.publicName,
                    descriptor: materialized.descriptor,
                    requestedPermissions: [
                        ...evidence.requestedPermissions
                    ],
                    installationEvidenceHash: evidence.evidenceHash,
                    installedRoot
                });
                if (dispose) rollback.push(dispose);
            }
            return installed;
        } catch (error) {
            for (const dispose of rollback.reverse()){
                try {
                    dispose();
                } catch  {}
            }
            if (error instanceof ToolInstallationError) throw error;
            throw new ToolInstallationError(errorCode(error), error instanceof Error ? error.message : String(error));
        }
    }
    boundApproval(workspaceId, proposalId) {
        const proposal = this.repository.inspectInstallationProposal(workspaceId, proposalId);
        const approval = this.repository.inspectInstallationApproval(workspaceId, proposalId);
        if (proposal === null || approval === null) fail('INSTALLATION_APPROVAL_NOT_FOUND', 'approved proposal is not visible in this workspace');
        if (proposal.state !== 'approved' || proposal.proposalHash !== contentHash(installationProposalBinding(proposal)) || approval.proposalHash !== proposal.proposalHash || approval.approvalHash !== contentHash(approvalBinding(approval))) {
            fail('INVALID_INSTALLATION_APPROVAL', 'approval does not bind the exact approved proposal');
        }
        const revision = this.repository.inspectRevision(workspaceId, proposal.revisionId);
        const materialized = this.repository.materializeRevision(workspaceId, proposal.revisionId);
        const specification = revision === null ? null : this.repository.readSpecification(workspaceId, revision.specificationId);
        const validation = this.repository.inspectValidation(workspaceId, proposal.validationId);
        if (revision === null || materialized === null || specification === null || validation === null) fail('BOUND_EVIDENCE_NOT_FOUND', 'installation evidence is not visible in this workspace');
        if (revision.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current approved candidate may be installed');
        if (proposal.candidateId !== revision.candidateId || proposal.candidateHash !== revision.candidateHash || proposal.specificationHash !== specification.specificationHash || proposal.requestedPermissions.length !== specification.requestedPermissions.length || canonicalJson(proposal.requestedPermissions) !== canonicalJson(specification.requestedPermissions) || proposal.permissionsHash !== contentHash(specification.requestedPermissions) || proposal.validationRecordHash !== validation.record.recordHash || proposal.candidateSnapshotHash !== validation.snapshot.snapshotHash || validation.snapshot.candidateId !== revision.candidateId || validation.snapshot.descriptorHash !== revision.descriptorHash || validation.snapshot.sourceHash !== revision.sourceHash || !this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record)) {
            fail('STALE_INSTALLATION_APPROVAL', 'candidate, validation, specification, permissions, proposal, or approval changed before installation');
        }
        return {
            proposal,
            approval,
            revision,
            materialized,
            specification,
            validation
        };
    }
    evidence(claim, bound, relativeLocation, outcome, failureCode, completedAt) {
        const base = {
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            installationId: claim.installationId,
            workspaceId: claim.workspaceId,
            proposalId: claim.proposalId,
            proposalHash: claim.proposalHash,
            approvalId: claim.approvalId,
            approvalHash: claim.approvalHash,
            candidateId: bound.revision.candidateId,
            revisionId: bound.revision.revisionId,
            candidateHash: bound.revision.candidateHash,
            descriptorHash: bound.revision.descriptorHash,
            sourceHash: bound.revision.sourceHash,
            validationId: bound.validation.record.validationId,
            validationRecordHash: bound.validation.record.recordHash,
            requestedPermissions: [
                ...bound.proposal.requestedPermissions
            ],
            permissionsHash: bound.proposal.permissionsHash,
            publicName: bound.specification.publicName,
            relativeLocation,
            outcome,
            failureCode,
            completedAt,
            completedBy: claim.claimedBy
        };
        return {
            ...base,
            evidenceHash: contentHash(base)
        };
    }
    writeCandidate(root, materialized) {
        writeExclusive(resolve(root, 'descriptor.json'), canonicalJson(materialized.descriptor));
        for (const source of materialized.sources){
            const path = safeCandidateRelativePath(source.path, 'installed source path');
            const target = resolve(root, 'source', path);
            if (!contained(resolve(root, 'source'), target)) fail('INSTALLATION_PATH_ESCAPE', 'candidate source escaped its installed root');
            writeExclusive(target, Buffer.from(typeof source.content === 'string' ? Buffer.from(source.content) : source.content));
        }
        this.verifyCandidate(root, materialized);
    }
    verifyCandidate(root, materialized) {
        let descriptor;
        try {
            descriptor = JSON.parse(readFileSync(resolve(root, 'descriptor.json'), 'utf8'));
        } catch  {
            fail('INSTALLED_TOOL_CORRUPT', 'installed descriptor is missing or malformed');
        }
        const sources = [];
        try {
            for (const source of materialized.sources){
                const path = safeCandidateRelativePath(source.path, 'installed source path');
                sources.push({
                    path,
                    content: readFileSync(resolve(root, 'source', path))
                });
            }
        } catch (error) {
            if (error instanceof ToolInstallationError) throw error;
            fail('INSTALLED_TOOL_CORRUPT', 'installed source bytes are missing');
        }
        const bindings = captureCandidateFiles(sources, 'installed sources').map((file)=>file.binding);
        if (contentHash(descriptor) !== materialized.revision.descriptorHash || contentHash(bindings) !== materialized.revision.sourceHash || canonicalJson(bindings) !== canonicalJson(materialized.revision.sources)) {
            fail('INSTALLED_TOOL_CORRUPT', 'installed descriptor or source bytes do not match the approved candidate');
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/tool-installation.ts