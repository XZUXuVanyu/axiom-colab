import { randomUUID } from 'node:crypto'

import type { CandidateValidationResult, ValidationRecord } from './candidate-validation.js'
import { LABORATORY_PROTOCOL_VERSION, contentHash, type Authority, type LaboratoryId } from './laboratory-contract.js'
import type { CandidateRevision, ToolSpecification, WorkshopContext } from './tool-workshop.js'

export type InstallationProposalState = 'proposed' | 'approved' | 'rejected'

export interface ToolInstallationProposal {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly proposalId: LaboratoryId<'proposal'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly revisionId: LaboratoryId<'evidence'>
  readonly candidateHash: `sha256:${string}`
  readonly specificationId: LaboratoryId<'proposal'>
  readonly specificationHash: `sha256:${string}`
  readonly validationId: LaboratoryId<'validation'>
  readonly validationRecordHash: `sha256:${string}`
  readonly candidateSnapshotHash: `sha256:${string}`
  readonly requestedPermissions: readonly string[]
  readonly permissionsHash: `sha256:${string}`
  readonly state: InstallationProposalState
  readonly createdAt: string
  readonly createdBy: LaboratoryId<'actor'>
  readonly proposalHash: `sha256:${string}`
}

export interface ToolInstallationApproval {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly approvalId: LaboratoryId<'approval'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly proposalId: LaboratoryId<'proposal'>
  readonly proposalHash: `sha256:${string}`
  readonly decision: 'approved'
  readonly approvedAt: string
  readonly approvedBy: LaboratoryId<'actor'>
  readonly approvalHash: `sha256:${string}`
}

export interface InstallationProposalRepository {
  inspectRevision(workspaceId: LaboratoryId<'workspace'>, revisionId: LaboratoryId<'evidence'>): CandidateRevision | null
  readSpecification(workspaceId: LaboratoryId<'workspace'>, specificationId: LaboratoryId<'proposal'>): ToolSpecification | null
  inspectValidation(workspaceId: LaboratoryId<'workspace'>, validationId: LaboratoryId<'validation'>): CandidateValidationResult | null
  saveInstallationProposal(proposal: ToolInstallationProposal): void
  inspectInstallationProposal(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>): ToolInstallationProposal | null
  approveInstallationProposal(proposal: ToolInstallationProposal, approval: ToolInstallationApproval): void
  inspectInstallationApproval(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>): ToolInstallationApproval | null
  rejectInstallationProposal(proposal: ToolInstallationProposal, actorId: LaboratoryId<'actor'>, decidedAt: string): void
}

export interface ValidationPromotionAuthority {
  isPromotionEligible(snapshotHash: string, record: ValidationRecord): boolean
}

export class ToolInstallationProposalError extends Error {
  constructor(readonly code: string, message: string) { super(`[${code}] ${message}`); this.name = 'ToolInstallationProposalError' }
}

function fail(code: string, message: string): never { throw new ToolInstallationProposalError(code, message) }
function frozen<T>(value: T): T { if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) frozen(item); return value }

export function installationProposalBinding(value: ToolInstallationProposal): unknown {
  return {
    protocolVersion: value.protocolVersion, proposalId: value.proposalId, workspaceId: value.workspaceId,
    candidateId: value.candidateId, revisionId: value.revisionId,
    candidateHash: value.candidateHash, specificationId: value.specificationId,
    specificationHash: value.specificationHash, validationId: value.validationId,
    validationRecordHash: value.validationRecordHash, candidateSnapshotHash: value.candidateSnapshotHash,
    requestedPermissions: value.requestedPermissions, permissionsHash: value.permissionsHash,
    createdAt: value.createdAt, createdBy: value.createdBy,
  }
}

function approvalBinding(value: ToolInstallationApproval): unknown {
  return { protocolVersion: value.protocolVersion, approvalId: value.approvalId, workspaceId: value.workspaceId, proposalId: value.proposalId, proposalHash: value.proposalHash, decision: value.decision, approvedAt: value.approvedAt, approvedBy: value.approvedBy }
}

export class ToolInstallationProposalService {
  private readonly now: () => Date
  private readonly idFactory: () => string
  constructor(private readonly repository: InstallationProposalRepository, private readonly validator: ValidationPromotionAuthority, options: { now?: () => Date; idFactory?: () => string } = {}) {
    this.now = options.now ?? (() => new Date()); this.idFactory = options.idFactory ?? randomUUID
  }

  propose(context: WorkshopContext, revisionId: LaboratoryId<'evidence'>, validationId: LaboratoryId<'validation'>): ToolInstallationProposal {
    if (context.authority !== 'model' && context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot propose installation`)
    const { revision, specification, validation } = this.boundEvidence(context.workspaceId, revisionId, validationId)
    const base = {
      protocolVersion: LABORATORY_PROTOCOL_VERSION, proposalId: `proposal:${this.idFactory()}` as LaboratoryId<'proposal'>,
      workspaceId: context.workspaceId, candidateId: revision.candidateId, revisionId, candidateHash: revision.candidateHash,
      specificationId: specification.specificationId, specificationHash: specification.specificationHash,
      validationId, validationRecordHash: validation.record.recordHash, candidateSnapshotHash: validation.snapshot.snapshotHash,
      requestedPermissions: [...specification.requestedPermissions], permissionsHash: contentHash(specification.requestedPermissions),
      state: 'proposed' as const, createdAt: this.now().toISOString(), createdBy: context.actorId,
    }
    const proposal = frozen({ ...base, proposalHash: contentHash(installationProposalBinding(base as ToolInstallationProposal)) })
    this.repository.saveInstallationProposal(proposal)
    return proposal
  }

  approve(context: WorkshopContext, proposalId: LaboratoryId<'proposal'>): ToolInstallationApproval {
    if (context.authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot approve installation`)
    const proposal = this.pending(context.workspaceId, proposalId)
    this.boundEvidence(context.workspaceId, proposal.revisionId, proposal.validationId, proposal)
    const base = { protocolVersion: LABORATORY_PROTOCOL_VERSION, approvalId: `approval:${this.idFactory()}` as LaboratoryId<'approval'>, workspaceId: context.workspaceId, proposalId, proposalHash: proposal.proposalHash, decision: 'approved' as const, approvedAt: this.now().toISOString(), approvedBy: context.actorId }
    const approval = frozen({ ...base, approvalHash: contentHash(approvalBinding(base as ToolInstallationApproval)) })
    this.repository.approveInstallationProposal(proposal, approval)
    return approval
  }

  reject(context: WorkshopContext, proposalId: LaboratoryId<'proposal'>): void {
    if (context.authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot reject installation`)
    const proposal = this.pending(context.workspaceId, proposalId)
    this.repository.rejectInstallationProposal(proposal, context.actorId, this.now().toISOString())
  }

  private pending(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>): ToolInstallationProposal {
    const value = this.repository.inspectInstallationProposal(workspaceId, proposalId)
    if (value === null) fail('INSTALLATION_PROPOSAL_NOT_FOUND', 'installation proposal is not visible in this workspace')
    if (value.state !== 'proposed') fail('PROPOSAL_NOT_PENDING', 'installation proposal is no longer pending')
    if (value.proposalHash !== contentHash(installationProposalBinding(value)) || value.permissionsHash !== contentHash(value.requestedPermissions)) fail('INVALID_INSTALLATION_PROPOSAL', 'installation proposal binding is invalid')
    return value
  }

  private boundEvidence(workspaceId: LaboratoryId<'workspace'>, revisionId: LaboratoryId<'evidence'>, validationId: LaboratoryId<'validation'>, proposal?: ToolInstallationProposal) {
    const revision = this.repository.inspectRevision(workspaceId, revisionId)
    if (revision === null) fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace')
    if (revision.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current candidate revision may be proposed or approved')
    const specification = this.repository.readSpecification(workspaceId, revision.specificationId)
    const validation = this.repository.inspectValidation(workspaceId, validationId)
    if (specification === null || validation === null) fail('BOUND_EVIDENCE_NOT_FOUND', 'specification or validation evidence is not visible in this workspace')
    if (validation.snapshot.workspaceId !== workspaceId || validation.snapshot.candidateId !== revision.candidateId
      || validation.snapshot.descriptorHash !== revision.descriptorHash || validation.snapshot.sourceHash !== revision.sourceHash
      || !this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record)) fail('VALIDATION_NOT_PROMOTABLE', 'validation is not authentic, passing, confined, and bound to this candidate')
    if (proposal !== undefined && (proposal.candidateHash !== revision.candidateHash || proposal.specificationHash !== specification.specificationHash
      || proposal.validationRecordHash !== validation.record.recordHash || proposal.candidateSnapshotHash !== validation.snapshot.snapshotHash
      || proposal.permissionsHash !== contentHash(specification.requestedPermissions)
      || contentHash(proposal.requestedPermissions) !== contentHash(specification.requestedPermissions))) fail('STALE_INSTALLATION_PROPOSAL', 'candidate, validation, specification, or permissions changed after proposal')
    return { revision, specification, validation }
  }
}
