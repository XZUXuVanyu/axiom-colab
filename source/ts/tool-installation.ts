import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  closeSync,
  existsSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { captureCandidateFiles, safeCandidateRelativePath, type CandidateFile } from './candidate-content.js'
import type { CandidateValidationResult, ValidationRecord } from './candidate-validation.js'
import {
  installationProposalBinding,
  type ToolInstallationApproval,
  type ToolInstallationProposal,
  type ValidationPromotionAuthority,
} from './tool-installation-proposal.js'
import {
  LABORATORY_PROTOCOL_VERSION,
  canonicalJson,
  contentHash,
  type LaboratoryId,
} from './laboratory-contract.js'
import type {
  CandidateRevision,
  MaterializedCandidateRevision,
  ToolSpecification,
  WorkshopContext,
} from './tool-workshop.js'

export interface ToolInstallationClaim {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly installationId: LaboratoryId<'evidence'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly proposalId: LaboratoryId<'proposal'>
  readonly proposalHash: `sha256:${string}`
  readonly approvalId: LaboratoryId<'approval'>
  readonly approvalHash: `sha256:${string}`
  readonly candidateId: LaboratoryId<'tool'>
  readonly candidateHash: `sha256:${string}`
  readonly claimedAt: string
  readonly claimedBy: LaboratoryId<'actor'>
  readonly claimHash: `sha256:${string}`
}

export type ToolInstallationOutcome = 'installed' | 'failed'

export interface ToolInstallationEvidence {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly installationId: LaboratoryId<'evidence'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly proposalId: LaboratoryId<'proposal'>
  readonly proposalHash: `sha256:${string}`
  readonly approvalId: LaboratoryId<'approval'>
  readonly approvalHash: `sha256:${string}`
  readonly candidateId: LaboratoryId<'tool'>
  readonly revisionId: LaboratoryId<'evidence'>
  readonly candidateHash: `sha256:${string}`
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly validationId: LaboratoryId<'validation'>
  readonly validationRecordHash: `sha256:${string}`
  readonly requestedPermissions: readonly string[]
  readonly permissionsHash: `sha256:${string}`
  readonly publicName: string
  readonly relativeLocation: string
  readonly outcome: ToolInstallationOutcome
  readonly failureCode: string | null
  readonly completedAt: string
  readonly completedBy: LaboratoryId<'actor'>
  readonly evidenceHash: `sha256:${string}`
}

export interface InstalledToolRegistration {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly installationId: LaboratoryId<'evidence'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly candidateHash: `sha256:${string}`
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly sources: readonly CandidateFile['binding'][]
  readonly publicName: string
  readonly descriptor: unknown
  readonly requestedPermissions: readonly string[]
  readonly installationEvidenceHash: `sha256:${string}`
  readonly installedRoot: string
}

export interface InstalledToolRegistry {
  register(tool: InstalledToolRegistration): void | (() => void)
}

export interface ToolInstallationRepository {
  inspectRevision(workspaceId: LaboratoryId<'workspace'>, revisionId: LaboratoryId<'evidence'>): CandidateRevision | null
  materializeRevision(workspaceId: LaboratoryId<'workspace'>, revisionId: LaboratoryId<'evidence'>): MaterializedCandidateRevision | null
  readSpecification(workspaceId: LaboratoryId<'workspace'>, specificationId: LaboratoryId<'proposal'>): ToolSpecification | null
  inspectValidation(workspaceId: LaboratoryId<'workspace'>, validationId: LaboratoryId<'validation'>): CandidateValidationResult | null
  inspectInstallationProposal(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>): ToolInstallationProposal | null
  inspectInstallationApproval(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>): ToolInstallationApproval | null
  claimInstallation(claim: ToolInstallationClaim): void
  recordInstallationEvidence(evidence: ToolInstallationEvidence): void
  listInstalledTools(workspaceId: LaboratoryId<'workspace'>): readonly ToolInstallationEvidence[]
}

export interface ToolInstallationOptions {
  readonly installationRoot: string
  readonly registry: InstalledToolRegistry
  readonly now?: () => Date
  readonly idFactory?: () => string
}

export class ToolInstallationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ToolInstallationError'
  }
}

function fail(code: string, message: string): never {
  throw new ToolInstallationError(code, message)
}

function approvalBinding(value: ToolInstallationApproval): unknown {
  return {
    protocolVersion: value.protocolVersion,
    approvalId: value.approvalId,
    workspaceId: value.workspaceId,
    proposalId: value.proposalId,
    proposalHash: value.proposalHash,
    decision: value.decision,
    approvedAt: value.approvedAt,
    approvedBy: value.approvedBy,
  }
}

export function installationClaimBinding(value: ToolInstallationClaim): unknown {
  const { claimHash: _hash, ...binding } = value
  return binding
}

export function installationEvidenceBinding(value: ToolInstallationEvidence): unknown {
  const { evidenceHash: _hash, ...binding } = value
  return binding
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'INSTALLATION_FAILED'
}

function contained(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function locationFor(workspaceId: string, publicName: string, candidateHash: string): string {
  // These are collision-detecting filesystem locators, not authority
  // identities. Full hashes remain bound in evidence and every byte is
  // reverified on rediscovery/load. Shortening each component keeps trusted
  // Windows compiler staging below legacy MAX_PATH limits; a prefix collision
  // fails closed at the existing exclusive final-directory promotion.
  const workspace = contentHash(workspaceId).slice('sha256:'.length, 'sha256:'.length + 32)
  const candidate = candidateHash.slice('sha256:'.length, 'sha256:'.length + 32)
  return `${workspace}/${publicName}/${candidate}`
}

function writeExclusive(path: string, bytes: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true })
  const handle = openSync(path, 'wx')
  try { writeFileSync(handle, bytes); } finally { closeSync(handle) }
}

export class ToolInstallationService {
  private readonly root: string
  private readonly registry: InstalledToolRegistry
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(
    private readonly repository: ToolInstallationRepository,
    private readonly validator: ValidationPromotionAuthority,
    options: ToolInstallationOptions,
  ) {
    this.root = resolve(options.installationRoot)
    this.registry = options.registry
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? randomUUID
    mkdirSync(this.root, { recursive: true })
    mkdirSync(resolve(this.root, '.staging'), { recursive: true })
  }

  install(context: WorkshopContext, proposalId: LaboratoryId<'proposal'>): ToolInstallationEvidence {
    if (context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot install Tools`)
    const bound = this.boundApproval(context.workspaceId, proposalId)
    const installationId = `evidence:${this.idFactory()}` as LaboratoryId<'evidence'>
    const claimedAt = this.now().toISOString()
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
      claimedBy: context.actorId,
    }
    const claim = { ...claimBase, claimHash: contentHash(claimBase) } as ToolInstallationClaim
    this.repository.claimInstallation(claim)

    const relativeLocation = locationFor(context.workspaceId, bound.specification.publicName, bound.revision.candidateHash)
    const finalRoot = resolve(this.root, relativeLocation)
    const stagingRoot = resolve(this.root, '.staging', installationId.replace(':', '-'))
    if (!contained(this.root, finalRoot) || !contained(this.root, stagingRoot)) fail('INSTALLATION_PATH_ESCAPE', 'installation path escaped its configured root')

    let registeredDispose: (() => void) | undefined
    let promoted = false
    let stagingOwned = false
    try {
      try { mkdirSync(stagingRoot, { recursive: false }); stagingOwned = true } catch (error) {
        if (existsSync(stagingRoot)) fail('INSTALLATION_STAGING_COLLISION', 'installation staging identity already exists')
        throw error
      }
      this.writeCandidate(stagingRoot, bound.materialized)
      mkdirSync(dirname(finalRoot), { recursive: true })
      try { renameSync(stagingRoot, finalRoot); promoted = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST'
            || (error as NodeJS.ErrnoException).code === 'ENOTEMPTY'
            || existsSync(finalRoot)) {
          fail('INSTALLATION_PATH_COLLISION', 'the exact installed-Tool location already exists')
        }
        throw error
      }
      const completedAt = this.now().toISOString()
      const evidence = this.evidence(claim, bound, relativeLocation, 'installed', null, completedAt)
      const registration: InstalledToolRegistration = {
        workspaceId: context.workspaceId,
        installationId,
        candidateId: bound.revision.candidateId,
        candidateHash: bound.revision.candidateHash,
        descriptorHash: bound.revision.descriptorHash,
        sourceHash: bound.revision.sourceHash,
        sources: bound.revision.sources.map((source) => ({ ...source })),
        publicName: bound.specification.publicName,
        descriptor: bound.materialized.descriptor,
        requestedPermissions: [...bound.proposal.requestedPermissions],
        installationEvidenceHash: evidence.evidenceHash,
        installedRoot: finalRoot,
      }
      const registrationDispose = this.registry.register(registration)
      registeredDispose = typeof registrationDispose === 'function' ? registrationDispose : undefined
      this.repository.recordInstallationEvidence(evidence)
      return evidence
    } catch (error) {
      try { registeredDispose?.() } catch { /* Preserve the installation error. */ }
      try {
        if (promoted) rmSync(finalRoot, { recursive: true, force: true })
        else if (stagingOwned) rmSync(stagingRoot, { recursive: true, force: true })
      } catch { /* Evidence still fails closed. */ }
      const code = errorCode(error)
      const evidence = this.evidence(claim, bound, relativeLocation, 'failed', code, this.now().toISOString())
      try { this.repository.recordInstallationEvidence(evidence) } catch { /* An unrecorded claim remains non-discoverable. */ }
      if (error instanceof ToolInstallationError) throw error
      throw new ToolInstallationError(code, error instanceof Error ? error.message : String(error))
    }
  }

  rediscover(context: WorkshopContext): readonly ToolInstallationEvidence[] {
    if (context.authority !== 'trusted-host') fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot rediscover installed Tools`)
    const installed = this.repository.listInstalledTools(context.workspaceId)
    const rollback: Array<() => void> = []
    try {
      for (const evidence of installed) {
        const proposal = this.repository.inspectInstallationProposal(context.workspaceId, evidence.proposalId)
        if (proposal === null || proposal.proposalHash !== evidence.proposalHash) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool proposal binding is unavailable')
        const materialized = this.repository.materializeRevision(context.workspaceId, evidence.revisionId)
        if (materialized === null || materialized.revision.candidateHash !== evidence.candidateHash) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool candidate binding is unavailable')
        const specification = this.repository.readSpecification(context.workspaceId, materialized.revision.specificationId)
        if (specification === null || specification.publicName !== evidence.publicName) fail('CORRUPT_INSTALLATION_EVIDENCE', 'installed Tool specification binding is unavailable')
        const installedRoot = resolve(this.root, evidence.relativeLocation)
        if (!contained(this.root, installedRoot)) fail('INSTALLATION_PATH_ESCAPE', 'stored installation location escaped its configured root')
        this.verifyCandidate(installedRoot, materialized)
        const dispose = this.registry.register({
          workspaceId: context.workspaceId,
          installationId: evidence.installationId,
          candidateId: evidence.candidateId,
          candidateHash: evidence.candidateHash,
          descriptorHash: evidence.descriptorHash,
          sourceHash: evidence.sourceHash,
          sources: materialized.revision.sources.map((source) => ({ ...source })),
          publicName: evidence.publicName,
          descriptor: materialized.descriptor,
          requestedPermissions: [...evidence.requestedPermissions],
          installationEvidenceHash: evidence.evidenceHash,
          installedRoot,
        })
        if (dispose) rollback.push(dispose)
      }
      return installed
    } catch (error) {
      for (const dispose of rollback.reverse()) { try { dispose() } catch { /* Preserve discovery failure. */ } }
      if (error instanceof ToolInstallationError) throw error
      throw new ToolInstallationError(errorCode(error), error instanceof Error ? error.message : String(error))
    }
  }

  private boundApproval(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>) {
    const proposal = this.repository.inspectInstallationProposal(workspaceId, proposalId)
    const approval = this.repository.inspectInstallationApproval(workspaceId, proposalId)
    if (proposal === null || approval === null) fail('INSTALLATION_APPROVAL_NOT_FOUND', 'approved proposal is not visible in this workspace')
    if (proposal.state !== 'approved'
        || proposal.proposalHash !== contentHash(installationProposalBinding(proposal))
        || approval.proposalHash !== proposal.proposalHash
        || approval.approvalHash !== contentHash(approvalBinding(approval))) {
      fail('INVALID_INSTALLATION_APPROVAL', 'approval does not bind the exact approved proposal')
    }
    const revision = this.repository.inspectRevision(workspaceId, proposal.revisionId)
    const materialized = this.repository.materializeRevision(workspaceId, proposal.revisionId)
    const specification = revision === null ? null : this.repository.readSpecification(workspaceId, revision.specificationId)
    const validation = this.repository.inspectValidation(workspaceId, proposal.validationId)
    if (revision === null || materialized === null || specification === null || validation === null) fail('BOUND_EVIDENCE_NOT_FOUND', 'installation evidence is not visible in this workspace')
    if (revision.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current approved candidate may be installed')
    if (proposal.candidateId !== revision.candidateId || proposal.candidateHash !== revision.candidateHash
        || proposal.specificationHash !== specification.specificationHash
        || proposal.requestedPermissions.length !== specification.requestedPermissions.length
        || canonicalJson(proposal.requestedPermissions) !== canonicalJson(specification.requestedPermissions)
        || proposal.permissionsHash !== contentHash(specification.requestedPermissions)
        || proposal.validationRecordHash !== validation.record.recordHash
        || proposal.candidateSnapshotHash !== validation.snapshot.snapshotHash
        || validation.snapshot.candidateId !== revision.candidateId
        || validation.snapshot.descriptorHash !== revision.descriptorHash
        || validation.snapshot.sourceHash !== revision.sourceHash
        || !this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record)) {
      fail('STALE_INSTALLATION_APPROVAL', 'candidate, validation, specification, permissions, proposal, or approval changed before installation')
    }
    return { proposal, approval, revision, materialized, specification, validation }
  }

  private evidence(
    claim: ToolInstallationClaim,
    bound: { proposal: ToolInstallationProposal; approval: ToolInstallationApproval; revision: CandidateRevision; specification: ToolSpecification; validation: CandidateValidationResult },
    relativeLocation: string,
    outcome: ToolInstallationOutcome,
    failureCode: string | null,
    completedAt: string,
  ): ToolInstallationEvidence {
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
      requestedPermissions: [...bound.proposal.requestedPermissions],
      permissionsHash: bound.proposal.permissionsHash,
      publicName: bound.specification.publicName,
      relativeLocation,
      outcome,
      failureCode,
      completedAt,
      completedBy: claim.claimedBy,
    }
    return { ...base, evidenceHash: contentHash(base) }
  }

  private writeCandidate(root: string, materialized: MaterializedCandidateRevision): void {
    writeExclusive(resolve(root, 'descriptor.json'), canonicalJson(materialized.descriptor))
    for (const source of materialized.sources) {
      const path = safeCandidateRelativePath(source.path, 'installed source path')
      const target = resolve(root, 'source', path)
      if (!contained(resolve(root, 'source'), target)) fail('INSTALLATION_PATH_ESCAPE', 'candidate source escaped its installed root')
      writeExclusive(target, Buffer.from(typeof source.content === 'string' ? Buffer.from(source.content) : source.content))
    }
    this.verifyCandidate(root, materialized)
  }

  private verifyCandidate(root: string, materialized: MaterializedCandidateRevision): void {
    let descriptor: unknown
    try { descriptor = JSON.parse(readFileSync(resolve(root, 'descriptor.json'), 'utf8')) } catch { fail('INSTALLED_TOOL_CORRUPT', 'installed descriptor is missing or malformed') }
    const sources: CandidateFile[] = []
    try {
      for (const source of materialized.sources) {
        const path = safeCandidateRelativePath(source.path, 'installed source path')
        sources.push({ path, content: readFileSync(resolve(root, 'source', path)) })
      }
    } catch (error) {
      if (error instanceof ToolInstallationError) throw error
      fail('INSTALLED_TOOL_CORRUPT', 'installed source bytes are missing')
    }
    const bindings = captureCandidateFiles(sources, 'installed sources').map((file) => file.binding)
    if (contentHash(descriptor) !== materialized.revision.descriptorHash
        || contentHash(bindings) !== materialized.revision.sourceHash
        || canonicalJson(bindings) !== canonicalJson(materialized.revision.sources)) {
      fail('INSTALLED_TOOL_CORRUPT', 'installed descriptor or source bytes do not match the approved candidate')
    }
  }
}
