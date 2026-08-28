import { randomUUID } from 'node:crypto';
import { LABORATORY_PROTOCOL_VERSION, contentHash } from './laboratory-contract.js';
export class ToolInstallationProposalError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'ToolInstallationProposalError';
    }
}
function fail(code, message) {
    throw new ToolInstallationProposalError(code, message);
}
function frozen(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value))frozen(item);
    return value;
}
export function installationProposalBinding(value) {
    return {
        protocolVersion: value.protocolVersion,
        proposalId: value.proposalId,
        workspaceId: value.workspaceId,
        candidateId: value.candidateId,
        revisionId: value.revisionId,
        candidateHash: value.candidateHash,
        specificationId: value.specificationId,
        specificationHash: value.specificationHash,
        validationId: value.validationId,
        validationRecordHash: value.validationRecordHash,
        candidateSnapshotHash: value.candidateSnapshotHash,
        requestedPermissions: value.requestedPermissions,
        permissionsHash: value.permissionsHash,
        createdAt: value.createdAt,
        createdBy: value.createdBy
    };
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
export class ToolInstallationProposalService {
    repository;
    validator;
    now;
    idFactory;
    constructor(repository, validator, options = {}){
        this.repository = repository;
        this.validator = validator;
        this.now = options.now ?? (()=>new Date());
        this.idFactory = options.idFactory ?? randomUUID;
    }
    propose(context, revisionId, validationId) {
        if (context.authority !== 'model' && context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot propose installation`);
        const { revision, specification, validation } = this.boundEvidence(context.workspaceId, revisionId, validationId);
        const base = {
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            proposalId: `proposal:${this.idFactory()}`,
            workspaceId: context.workspaceId,
            candidateId: revision.candidateId,
            revisionId,
            candidateHash: revision.candidateHash,
            specificationId: specification.specificationId,
            specificationHash: specification.specificationHash,
            validationId,
            validationRecordHash: validation.record.recordHash,
            candidateSnapshotHash: validation.snapshot.snapshotHash,
            requestedPermissions: [
                ...specification.requestedPermissions
            ],
            permissionsHash: contentHash(specification.requestedPermissions),
            state: 'proposed',
            createdAt: this.now().toISOString(),
            createdBy: context.actorId
        };
        const proposal = frozen({
            ...base,
            proposalHash: contentHash(installationProposalBinding(base))
        });
        this.repository.saveInstallationProposal(proposal);
        return proposal;
    }
    approve(context, proposalId) {
        if (context.authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot approve installation`);
        const proposal = this.pending(context.workspaceId, proposalId);
        this.boundEvidence(context.workspaceId, proposal.revisionId, proposal.validationId, proposal);
        const base = {
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            approvalId: `approval:${this.idFactory()}`,
            workspaceId: context.workspaceId,
            proposalId,
            proposalHash: proposal.proposalHash,
            decision: 'approved',
            approvedAt: this.now().toISOString(),
            approvedBy: context.actorId
        };
        const approval = frozen({
            ...base,
            approvalHash: contentHash(approvalBinding(base))
        });
        this.repository.approveInstallationProposal(proposal, approval);
        return approval;
    }
    reject(context, proposalId) {
        if (context.authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot reject installation`);
        const proposal = this.pending(context.workspaceId, proposalId);
        this.repository.rejectInstallationProposal(proposal, context.actorId, this.now().toISOString());
    }
    pending(workspaceId, proposalId) {
        const value = this.repository.inspectInstallationProposal(workspaceId, proposalId);
        if (value === null) fail('INSTALLATION_PROPOSAL_NOT_FOUND', 'installation proposal is not visible in this workspace');
        if (value.state !== 'proposed') fail('PROPOSAL_NOT_PENDING', 'installation proposal is no longer pending');
        if (value.proposalHash !== contentHash(installationProposalBinding(value)) || value.permissionsHash !== contentHash(value.requestedPermissions)) fail('INVALID_INSTALLATION_PROPOSAL', 'installation proposal binding is invalid');
        return value;
    }
    boundEvidence(workspaceId, revisionId, validationId, proposal) {
        const revision = this.repository.inspectRevision(workspaceId, revisionId);
        if (revision === null) fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace');
        if (revision.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current candidate revision may be proposed or approved');
        const specification = this.repository.readSpecification(workspaceId, revision.specificationId);
        const validation = this.repository.inspectValidation(workspaceId, validationId);
        if (specification === null || validation === null) fail('BOUND_EVIDENCE_NOT_FOUND', 'specification or validation evidence is not visible in this workspace');
        if (validation.snapshot.workspaceId !== workspaceId || validation.snapshot.candidateId !== revision.candidateId || validation.snapshot.descriptorHash !== revision.descriptorHash || validation.snapshot.sourceHash !== revision.sourceHash || !this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record)) fail('VALIDATION_NOT_PROMOTABLE', 'validation is not authentic, passing, confined, and bound to this candidate');
        if (proposal !== undefined && (proposal.candidateHash !== revision.candidateHash || proposal.specificationHash !== specification.specificationHash || proposal.validationRecordHash !== validation.record.recordHash || proposal.candidateSnapshotHash !== validation.snapshot.snapshotHash || proposal.permissionsHash !== contentHash(specification.requestedPermissions) || contentHash(proposal.requestedPermissions) !== contentHash(specification.requestedPermissions))) fail('STALE_INSTALLATION_PROPOSAL', 'candidate, validation, specification, or permissions changed after proposal');
        return {
            revision,
            specification,
            validation
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/tool-installation-proposal.ts