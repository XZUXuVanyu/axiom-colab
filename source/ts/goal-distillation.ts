import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { JsonValue } from './harness-types.js'
import type { GoalCheckpoint, LocalGoalCheckpointStore } from './goal-checkpoint.js'
import { canonicalJson, contentHash, type LaboratoryId } from './laboratory-contract.js'
import type { Artifact, MemoryWorkflows, WorkflowInvocation } from './memory-workflows.js'

export type DistillationKind = 'experience' | 'knowledge' | 'skill-candidate' | 'tool-candidate'
  | 'tool-reference' | 'unresolved-question' | 'cleanup' | 'retention'
export type DistillationDecision = 'accepted' | 'rejected' | 'deferred'

export interface DistillationDraft {
  readonly kind: DistillationKind
  readonly content: JsonValue
  readonly evidenceArtifactIds: readonly LaboratoryId<'object'>[]
}

export interface DistillationProposal extends DistillationDraft {
  readonly proposalId: LaboratoryId<'proposal'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly goalId: LaboratoryId<'goal'>
  readonly proposalHash: `sha256:${string}`
  readonly state: 'proposed' | DistillationDecision
  readonly proposedAt: string
  readonly decidedAt: string | null
  readonly decidedBy: LaboratoryId<'actor'> | null
}

export interface GoalClosure {
  readonly closureId: LaboratoryId<'evidence'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly goalId: LaboratoryId<'goal'>
  readonly planRevisionId: LaboratoryId<'object'>
  readonly planHash: `sha256:${string}`
  readonly checkpointHash: `sha256:${string}`
  readonly archiveArtifactId: LaboratoryId<'object'>
  readonly archiveHash: `sha256:${string}`
  readonly proposalIds: readonly LaboratoryId<'proposal'>[]
  readonly closedAt: string
  readonly closureHash: `sha256:${string}`
}

export interface GoalDistillationInspection {
  readonly closure: GoalClosure | null
  readonly proposals: readonly DistillationProposal[]
}

export class GoalDistillationError extends Error {
  constructor(readonly code: string, message: string) { super(`[${code}] ${message}`); this.name = 'GoalDistillationError' }
}
function fail(code: string, message: string): never { throw new GoalDistillationError(code, message) }
function closureBinding(value: GoalClosure): unknown { const { closureHash: _hash, ...binding } = value; return binding }
function proposalBinding(value: DistillationProposal): unknown {
  const { proposalHash: _hash, state: _state, decidedAt: _at, decidedBy: _by, ...binding } = value
  return binding
}
type ClosureRow = { public_json: string }
type ProposalRow = { public_json: string; state: DistillationProposal['state']; decided_at: string | null; decided_by: string | null }
type ClaimRow = { request_hash: string; claim_json: string; state: string }
interface ClosureClaim {
  readonly requestHash: `sha256:${string}`
  readonly closureId: LaboratoryId<'evidence'>
  readonly checkpoint: GoalCheckpoint
  readonly proposals: readonly DistillationProposal[]
  readonly proposedAt: string
}

/** Goal closure produces review material only; it has no activation or deletion authority. */
export class GoalDistillationService {
  private readonly database: DatabaseSync
  constructor(
    path: string,
    private readonly checkpoints: LocalGoalCheckpointStore,
    private readonly workflows: MemoryWorkflows,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
    private readonly afterArchive?: (artifact: Artifact) => void,
  ) {
    const databasePath = resolve(path); mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath)
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS goal_closures(workspace_id TEXT NOT NULL,goal_id TEXT NOT NULL,public_json TEXT NOT NULL,PRIMARY KEY(workspace_id,goal_id)) STRICT;
      CREATE TABLE IF NOT EXISTS goal_closure_claims(workspace_id TEXT NOT NULL,goal_id TEXT NOT NULL,request_hash TEXT NOT NULL,claim_json TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('claimed','completed')),PRIMARY KEY(workspace_id,goal_id)) STRICT;
      CREATE TABLE IF NOT EXISTS distillation_proposals(workspace_id TEXT NOT NULL,goal_id TEXT NOT NULL,proposal_id TEXT PRIMARY KEY,proposal_hash TEXT NOT NULL UNIQUE,public_json TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('proposed','accepted','rejected','deferred')),decided_at TEXT,decided_by TEXT) STRICT;`)
  }

  closeGoal(
    workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>,
    planRevisionId: LaboratoryId<'object'>, planHash: `sha256:${string}`,
    drafts: readonly DistillationDraft[], invocation: WorkflowInvocation,
  ): { readonly closure: GoalClosure; readonly proposals: readonly DistillationProposal[]; readonly archive: Artifact } {
    const prior = this.inspectClosure(workspaceId, goalId)
    if (prior !== null) fail('GOAL_ALREADY_CLOSED', 'goal already has an immutable closure')
    if (invocation.authority !== 'trusted-host' || invocation.context.workspaceId !== workspaceId) fail('CLOSURE_AUTHORITY_MISMATCH', 'goal closure requires workspace-scoped trusted-host authority')
    const checkpoint = this.checkpoints.latest(workspaceId, goalId)
    this.assertCheckpoint(checkpoint, planRevisionId, planHash)
    if (drafts.length === 0) fail('DISTILLATION_REQUIRED', 'goal closure requires reviewable distillation proposals')
    const requestHash = contentHash({ workspaceId, goalId, planRevisionId, planHash, checkpointHash: checkpoint.checkpointHash, drafts })
    const existingClaim = this.database.prepare('SELECT request_hash,claim_json,state FROM goal_closure_claims WHERE workspace_id=? AND goal_id=?').get(workspaceId, goalId) as ClaimRow | undefined
    let claim: ClosureClaim
    if (existingClaim !== undefined) {
      if (existingClaim.request_hash !== requestHash) fail('STALE_GOAL_CLOSURE_REQUEST', 'an interrupted closure binds different inputs')
      try { claim = JSON.parse(existingClaim.claim_json) as ClosureClaim } catch { fail('CORRUPT_GOAL_CLOSURE_CLAIM', 'stored closure claim is malformed') }
      if (claim.requestHash !== requestHash || claim.checkpoint.checkpointHash !== checkpoint.checkpointHash) fail('CORRUPT_GOAL_CLOSURE_CLAIM', 'stored closure claim binding is invalid')
    } else {
      const proposedAt = this.now().toISOString()
      const proposals = drafts.map((draft) => {
      if (draft.evidenceArtifactIds.some((id) => !id.startsWith('object:'))) fail('INVALID_DISTILLATION_EVIDENCE', 'proposal evidence identity is malformed')
      for (const artifactId of draft.evidenceArtifactIds) this.workflows.inspectArtifact(invocation, artifactId)
      const base = { proposalId: `proposal:${this.idFactory()}` as LaboratoryId<'proposal'>, workspaceId, goalId,
        kind: draft.kind, content: draft.content, evidenceArtifactIds: [...draft.evidenceArtifactIds], proposedAt }
      return { ...base, proposalHash: contentHash(base), state: 'proposed' as const, decidedAt: null, decidedBy: null }
      })
      claim = { requestHash, closureId: `evidence:${this.idFactory()}` as LaboratoryId<'evidence'>, checkpoint, proposals, proposedAt }
      this.database.prepare('INSERT INTO goal_closure_claims VALUES (?,?,?,?,?)').run(workspaceId, goalId, requestHash, canonicalJson(claim), 'claimed')
    }
    const archivePayload = { protocolVersion: '1.0', closureId: claim.closureId, workspaceId, goalId, planRevisionId, planHash,
      checkpoint: claim.checkpoint, proposals: claim.proposals.map((proposal) => ({ ...proposal })) }
    const archiveBytes = Buffer.from(canonicalJson(archivePayload), 'utf8')
    const archiveParametersHash = contentHash({ closureId: claim.closureId, checkpointHash: checkpoint.checkpointHash })
    const existingArchive = this.workflows.listArtifacts(invocation).find((artifact) => artifact.provenance.operation === 'goal.closure.archive'
      && artifact.provenance.parametersHash === archiveParametersHash)
    let archive: Artifact
    if (existingArchive !== undefined) {
      const bytes = this.workflows.readArtifact(invocation, existingArchive.id)
      if (!Buffer.from(bytes).equals(archiveBytes)) fail('CORRUPT_GOAL_CLOSURE_ARCHIVE', 'claimed archive bytes do not match the closure request')
      archive = existingArchive
    } else {
      const archiveParents = [...new Set([checkpoint.latestReportArtifactId!, ...claim.proposals.flatMap((proposal) => proposal.evidenceArtifactIds)])]
      archive = this.workflows.deriveArtifact(invocation, archiveParents, archiveBytes,
      { type: 'object', title: 'Axiom immutable goal session archive', protocolVersion: '1.0' },
      { operation: 'goal.closure.archive', parametersHash: archiveParametersHash, softwareVersion: '1.0.0', validationId: null })
      this.afterArchive?.(archive)
    }
    const closureBase = { closureId: claim.closureId, workspaceId, goalId, planRevisionId, planHash, checkpointHash: checkpoint.checkpointHash,
      archiveArtifactId: archive.id, archiveHash: archive.hash, proposalIds: claim.proposals.map((proposal) => proposal.proposalId), closedAt: claim.proposedAt }
    const closure = { ...closureBase, closureHash: contentHash(closureBase) } as GoalClosure
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('INSERT INTO goal_closures VALUES (?,?,?)').run(workspaceId, goalId, canonicalJson(closure))
      const statement = this.database.prepare('INSERT INTO distillation_proposals VALUES (?,?,?,?,?,?,?,?)')
      for (const proposal of claim.proposals) statement.run(workspaceId, goalId, proposal.proposalId, proposal.proposalHash, canonicalJson(proposal), proposal.state, null, null)
      this.database.prepare("UPDATE goal_closure_claims SET state='completed' WHERE workspace_id=? AND goal_id=? AND state='claimed'").run(workspaceId, goalId)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return { closure, proposals: claim.proposals, archive }
  }

  decide(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>, proposalHash: `sha256:${string}`,
    decision: DistillationDecision, actorId: LaboratoryId<'actor'>, authority: 'user'): DistillationProposal {
    if (authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', 'only user authority may review distillation proposals')
    const row = this.database.prepare('SELECT public_json,state,decided_at,decided_by FROM distillation_proposals WHERE workspace_id=? AND proposal_id=?').get(workspaceId, proposalId) as ProposalRow | undefined
    if (row === undefined) fail('DISTILLATION_PROPOSAL_NOT_FOUND', 'proposal is not visible in this workspace')
    const proposal = JSON.parse(row.public_json) as DistillationProposal
    if (proposal.proposalHash !== proposalHash || proposal.proposalHash !== contentHash(proposalBinding(proposal))) fail('STALE_DISTILLATION_PROPOSAL', 'decision does not bind the exact proposal')
    if (row.state !== 'proposed') fail('DISTILLATION_ALREADY_DECIDED', 'proposal already has a review decision')
    const decidedAt = this.now().toISOString()
    this.database.prepare('UPDATE distillation_proposals SET state=?,decided_at=?,decided_by=? WHERE workspace_id=? AND proposal_id=? AND state=?')
      .run(decision, decidedAt, actorId, workspaceId, proposalId, 'proposed')
    return { ...proposal, state: decision, decidedAt, decidedBy: actorId }
  }

  inspectClosure(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): GoalClosure | null {
    const row = this.database.prepare('SELECT public_json FROM goal_closures WHERE workspace_id=? AND goal_id=?').get(workspaceId, goalId) as ClosureRow | undefined
    if (row === undefined) return null
    const closure = JSON.parse(row.public_json) as GoalClosure
    if (closure.closureHash !== contentHash(closureBinding(closure))) fail('CORRUPT_GOAL_CLOSURE', 'stored goal closure hash is invalid')
    return closure
  }

  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): GoalDistillationInspection {
    const closure = this.inspectClosure(workspaceId, goalId)
    const rows = this.database.prepare('SELECT public_json,state,decided_at,decided_by FROM distillation_proposals WHERE workspace_id=? AND goal_id=? ORDER BY proposal_id')
      .all(workspaceId, goalId) as ProposalRow[]
    const proposals = rows.map((row) => {
      let stored: DistillationProposal
      try { stored = JSON.parse(row.public_json) as DistillationProposal } catch { fail('CORRUPT_DISTILLATION_PROPOSAL', 'stored proposal is malformed') }
      if (stored.workspaceId !== workspaceId || stored.goalId !== goalId
        || stored.proposalHash !== contentHash(proposalBinding(stored))
        || stored.state !== 'proposed' || stored.decidedAt !== null || stored.decidedBy !== null) {
        fail('CORRUPT_DISTILLATION_PROPOSAL', 'stored proposal binding is invalid')
      }
      if ((row.state === 'proposed') !== (row.decided_at === null && row.decided_by === null)) {
        fail('CORRUPT_DISTILLATION_DECISION', 'stored proposal decision is incomplete')
      }
      return { ...stored, state: row.state, decidedAt: row.decided_at,
        decidedBy: row.decided_by as LaboratoryId<'actor'> | null }
    })
    if (closure === null) {
      if (proposals.length > 0) fail('CORRUPT_GOAL_DISTILLATION', 'proposals exist without an immutable closure')
    } else if (closure.proposalIds.length !== proposals.length
      || closure.proposalIds.some((id) => !proposals.some((proposal) => proposal.proposalId === id))) {
      fail('CORRUPT_GOAL_DISTILLATION', 'closure proposal bindings do not match stored proposals')
    }
    return { closure, proposals }
  }

  close(): void { this.database.close() }

  private assertCheckpoint(checkpoint: GoalCheckpoint | null, planRevisionId: LaboratoryId<'object'>, planHash: `sha256:${string}`): asserts checkpoint is GoalCheckpoint {
    if (checkpoint === null || checkpoint.planRevisionId !== planRevisionId || checkpoint.planHash !== planHash) fail('STALE_GOAL_CHECKPOINT', 'closure must bind the latest checkpoint for the exact approved plan')
    if (checkpoint.latestReportArtifactId === null || checkpoint.latestReportHash === null) fail('GOAL_HAS_NO_EVIDENCE', 'closure requires at least one sealed Tool report')
  }
}
