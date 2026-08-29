import type { JsonValue } from './harness-types.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { WorkspaceResources } from './local-memory-store.js'
import type { ToolDescriptor } from './protocol.js'

export type SupervisoryFactKind =
  | 'model-claim'
  | 'tool-observation'
  | 'validation-evidence'
  | 'user-decision'
  | 'installed-state'
  | 'system-event'

export interface SupervisoryTimelineEntry {
  readonly id: string
  readonly occurredAt: string
  readonly kind: SupervisoryFactKind
  readonly summary: string
  readonly subjectId: string | null
  readonly authoritativeHash: `sha256:${string}` | null
  readonly detail: JsonValue | null
}

export interface SupervisoryPlanProjection {
  readonly revisionId: LaboratoryId<'object'>
  readonly hash: `sha256:${string}`
  readonly objective: string
  readonly approved: true
}

export interface SupervisoryProgressProjection {
  readonly revisionId: LaboratoryId<'object'>
  readonly hash: `sha256:${string}`
  readonly status: 'pending' | 'running' | 'blocked' | 'completed'
  readonly summary: string
  readonly completedCalls: number
  readonly totalCalls: number
}

export interface SupervisoryToolObservation {
  readonly reportArtifactId: LaboratoryId<'object'>
  readonly reportHash: `sha256:${string}`
  readonly callId: LaboratoryId<'call'>
  readonly tool: string
  readonly result: JsonValue
  readonly observedAt: string
}

export interface SupervisoryComputeProjection {
  readonly objectId: LaboratoryId<'object'>
  readonly revision: number
  readonly hash: `sha256:${string}`
  readonly size: number
  readonly state: 'active' | 'released'
  readonly expiresAt: string | null
}

export interface SupervisoryWorkingProjection {
  readonly revisionId: LaboratoryId<'object'>
  readonly key: string
  readonly revision: number
  readonly hash: `sha256:${string}`
  readonly proposalId: LaboratoryId<'proposal'>
  readonly committedAt: string
}

export interface SupervisoryArtifactProjection {
  readonly artifactId: LaboratoryId<'object'>
  readonly hash: `sha256:${string}`
  readonly size: number
  readonly schemaHash: `sha256:${string}`
  readonly parentIds: readonly LaboratoryId<'object'>[]
  readonly childIds: readonly LaboratoryId<'object'>[]
  readonly operation: string
  readonly parametersHash: `sha256:${string}`
  readonly softwareVersion: string
  readonly validationId: LaboratoryId<'validation'> | null
  readonly createdAt: string
}

export interface SupervisoryMemoryProjection {
  readonly compute: readonly SupervisoryComputeProjection[]
  readonly working: readonly SupervisoryWorkingProjection[]
  readonly artifacts: readonly SupervisoryArtifactProjection[]
}

export interface SupervisoryToolProjection {
  readonly name: string
  readonly descriptor: ToolDescriptor
  readonly source: 'built-in' | 'installed'
  readonly installationEvidenceHash: `sha256:${string}` | null
}

export interface SupervisoryCandidateProjection {
  readonly candidateId: LaboratoryId<'tool'>
  readonly revisionId: LaboratoryId<'evidence'>
  readonly candidateHash: `sha256:${string}`
  readonly state: 'current' | 'superseded'
  readonly modelClaim: string | null
  readonly validation: {
    readonly validationId: LaboratoryId<'validation'>
    readonly recordHash: `sha256:${string}`
    readonly outcome: 'passed' | 'failed' | 'limited'
    readonly promotable: boolean
  } | null
  readonly approval: {
    readonly proposalId: LaboratoryId<'proposal'>
    readonly proposalHash: `sha256:${string}`
    readonly decision: 'approved' | 'rejected'
  } | null
  readonly installation: {
    readonly installationId: LaboratoryId<'evidence'>
    readonly evidenceHash: `sha256:${string}`
    readonly outcome: 'installed' | 'failed'
  } | null
}

export interface SupervisoryControls {
  readonly canStopGoal: boolean
  readonly revocableCapabilityIds: readonly LaboratoryId<'capability'>[]
  readonly canResumeGoal: boolean
  readonly recoveryRequired: boolean
}

export interface SupervisoryWorkspaceSnapshot {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly goalId: LaboratoryId<'goal'> | null
  readonly currentPlan: SupervisoryPlanProjection | null
  readonly progress: SupervisoryProgressProjection | null
  readonly observations: readonly SupervisoryToolObservation[]
  readonly memory: SupervisoryMemoryProjection
  readonly tools: readonly SupervisoryToolProjection[]
  readonly resources: WorkspaceResources
  readonly candidates: readonly SupervisoryCandidateProjection[]
  readonly timeline: readonly SupervisoryTimelineEntry[]
  readonly controls: SupervisoryControls
}

export interface SupervisoryBackend {
  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot>
  stopGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void>
  revokeCapability(workspaceId: LaboratoryId<'workspace'>, capabilityId: LaboratoryId<'capability'>): Promise<void>
  resumeGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void>
  recoverWorkspace(workspaceId: LaboratoryId<'workspace'>): Promise<void>
}

export class SupervisoryApplicationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'SupervisoryApplicationError'
  }
}

function fail(code: string, message: string): never { throw new SupervisoryApplicationError(code, message) }

function clone<T>(value: T): T { return structuredClone(value) }

function freezeSnapshot(snapshot: SupervisoryWorkspaceSnapshot): SupervisoryWorkspaceSnapshot {
  const copy = clone(snapshot)
  Object.freeze(copy.currentPlan)
  Object.freeze(copy.progress)
  for (const observation of copy.observations) Object.freeze(observation)
  Object.freeze(copy.observations)
  for (const item of copy.memory.compute) Object.freeze(item)
  Object.freeze(copy.memory.compute)
  for (const item of copy.memory.working) Object.freeze(item)
  Object.freeze(copy.memory.working)
  for (const item of copy.memory.artifacts) {
    Object.freeze(item.parentIds)
    Object.freeze(item.childIds)
    Object.freeze(item)
  }
  Object.freeze(copy.memory.artifacts)
  Object.freeze(copy.memory)
  for (const tool of copy.tools) Object.freeze(tool)
  Object.freeze(copy.tools)
  for (const candidate of copy.candidates) {
    Object.freeze(candidate.validation)
    Object.freeze(candidate.approval)
    Object.freeze(candidate.installation)
    Object.freeze(candidate)
  }
  Object.freeze(copy.candidates)
  for (const entry of copy.timeline) Object.freeze(entry)
  Object.freeze(copy.timeline)
  Object.freeze(copy.controls.revocableCapabilityIds)
  Object.freeze(copy.controls)
  Object.freeze(copy.resources.quota)
  Object.freeze(copy.resources)
  return Object.freeze(copy)
}

/**
 * UI-independent Stage 8 projection. It owns selection and immutable snapshots
 * only. Every authority-changing command is delegated to the trusted backend
 * and followed by a fresh inspection; this class cannot manufacture approval,
 * validation, installation, memory, or recovery state.
 */
export class SupervisoryApplicationModel {
  private selectedWorkspaceId: LaboratoryId<'workspace'> | null = null
  private selectedGoalId: LaboratoryId<'goal'> | null = null
  private currentSnapshot: SupervisoryWorkspaceSnapshot | null = null

  constructor(private readonly backend: SupervisoryBackend) {}

  snapshot(): SupervisoryWorkspaceSnapshot | null {
    return this.currentSnapshot === null ? null : freezeSnapshot(this.currentSnapshot)
  }

  async selectWorkspace(workspaceId: LaboratoryId<'workspace'>): Promise<SupervisoryWorkspaceSnapshot> {
    this.selectedWorkspaceId = workspaceId
    this.selectedGoalId = null
    return this.refresh()
  }

  async selectGoal(goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot> {
    this.requireWorkspace()
    this.selectedGoalId = goalId
    return this.refresh()
  }

  async refresh(): Promise<SupervisoryWorkspaceSnapshot> {
    const workspaceId = this.requireWorkspace()
    const inspected = await this.backend.inspect(workspaceId, this.selectedGoalId)
    if (inspected.workspaceId !== workspaceId || inspected.goalId !== this.selectedGoalId) {
      fail('BACKEND_SELECTION_MISMATCH', 'backend snapshot does not match the selected workspace and goal')
    }
    this.assertProjection(inspected)
    this.currentSnapshot = freezeSnapshot(inspected)
    return this.snapshot() as SupervisoryWorkspaceSnapshot
  }

  async stopGoal(): Promise<SupervisoryWorkspaceSnapshot> {
    const [workspaceId, goalId, snapshot] = this.requireGoalSnapshot()
    if (!snapshot.controls.canStopGoal) fail('ACTION_NOT_AVAILABLE', 'the selected goal cannot be stopped')
    await this.backend.stopGoal(workspaceId, goalId)
    return this.refresh()
  }

  async revokeCapability(capabilityId: LaboratoryId<'capability'>): Promise<SupervisoryWorkspaceSnapshot> {
    const workspaceId = this.requireWorkspace()
    const snapshot = this.requireSnapshot()
    if (!snapshot.controls.revocableCapabilityIds.includes(capabilityId)) fail('ACTION_NOT_AVAILABLE', 'capability is not revocable in the current snapshot')
    await this.backend.revokeCapability(workspaceId, capabilityId)
    return this.refresh()
  }

  async resumeGoal(): Promise<SupervisoryWorkspaceSnapshot> {
    const [workspaceId, goalId, snapshot] = this.requireGoalSnapshot()
    if (!snapshot.controls.canResumeGoal) fail('ACTION_NOT_AVAILABLE', 'the selected goal cannot be resumed')
    await this.backend.resumeGoal(workspaceId, goalId)
    return this.refresh()
  }

  async recoverWorkspace(): Promise<SupervisoryWorkspaceSnapshot> {
    const workspaceId = this.requireWorkspace()
    if (!this.requireSnapshot().controls.recoveryRequired) fail('ACTION_NOT_AVAILABLE', 'workspace recovery is not required')
    await this.backend.recoverWorkspace(workspaceId)
    return this.refresh()
  }

  private requireWorkspace(): LaboratoryId<'workspace'> {
    if (this.selectedWorkspaceId === null) fail('WORKSPACE_NOT_SELECTED', 'select a workspace first')
    return this.selectedWorkspaceId
  }

  private requireSnapshot(): SupervisoryWorkspaceSnapshot {
    if (this.currentSnapshot === null) fail('SNAPSHOT_NOT_LOADED', 'load the selected workspace first')
    return this.currentSnapshot
  }

  private requireGoalSnapshot(): readonly [LaboratoryId<'workspace'>, LaboratoryId<'goal'>, SupervisoryWorkspaceSnapshot] {
    const workspaceId = this.requireWorkspace()
    if (this.selectedGoalId === null) fail('GOAL_NOT_SELECTED', 'select a goal first')
    return [workspaceId, this.selectedGoalId, this.requireSnapshot()]
  }

  private assertProjection(snapshot: SupervisoryWorkspaceSnapshot): void {
    if (snapshot.goalId === null && (snapshot.progress !== null || snapshot.observations.length > 0)) {
      fail('BACKEND_SELECTION_MISMATCH', 'workspace overview cannot contain goal progress or observations')
    }
    if (snapshot.progress !== null && snapshot.currentPlan === null) {
      fail('MISLEADING_AUTHORITY', 'goal progress requires its approved plan projection')
    }
    if (snapshot.progress !== null && snapshot.progress.completedCalls > snapshot.progress.totalCalls) {
      fail('INVALID_PROGRESS', 'completed calls cannot exceed total calls')
    }
    const observationIds = new Set<string>()
    for (const observation of snapshot.observations) {
      const id = `${observation.reportArtifactId}\0${observation.callId}`
      if (observationIds.has(id)) fail('INVALID_OBSERVATIONS', 'duplicate Tool observation identity')
      observationIds.add(id)
    }
    const artifactIds = new Set(snapshot.memory.artifacts.map((item) => item.artifactId))
    if (artifactIds.size !== snapshot.memory.artifacts.length) {
      fail('INVALID_ARTIFACT_LINEAGE', 'artifact projection contains duplicate identities')
    }
    const artifactsById = new Map(snapshot.memory.artifacts.map((item) => [item.artifactId, item]))
    for (const artifact of snapshot.memory.artifacts) {
      if (artifact.parentIds.includes(artifact.artifactId) || artifact.childIds.includes(artifact.artifactId)) {
        fail('INVALID_ARTIFACT_LINEAGE', 'artifact lineage cannot contain a self edge')
      }
      for (const parentId of artifact.parentIds) if (!artifactIds.has(parentId)) {
        fail('INVALID_ARTIFACT_LINEAGE', `artifact parent ${parentId} is not projected`)
      } else if (!artifactsById.get(parentId)?.childIds.includes(artifact.artifactId)) {
        fail('INVALID_ARTIFACT_LINEAGE', 'artifact parent and child edges disagree')
      }
      for (const childId of artifact.childIds) if (!artifactIds.has(childId)) {
        fail('INVALID_ARTIFACT_LINEAGE', `artifact child ${childId} is not projected`)
      } else if (!artifactsById.get(childId)?.parentIds.includes(artifact.artifactId)) {
        fail('INVALID_ARTIFACT_LINEAGE', 'artifact child and parent edges disagree')
      }
    }
    const timelineIds = new Set<string>()
    for (const entry of snapshot.timeline) {
      if (timelineIds.has(entry.id)) fail('INVALID_TIMELINE', `duplicate timeline entry ${entry.id}`)
      timelineIds.add(entry.id)
      if (entry.kind === 'model-claim' && entry.authoritativeHash !== null) {
        fail('MISLEADING_AUTHORITY', 'model claims cannot carry an authoritative evidence hash')
      }
    }
    for (const candidate of snapshot.candidates) {
      if (candidate.approval !== null && candidate.validation === null) fail('MISLEADING_AUTHORITY', 'approval must retain its validation projection')
      if (candidate.installation !== null && candidate.approval === null) fail('MISLEADING_AUTHORITY', 'installation must retain its approval projection')
    }
    for (const tool of snapshot.tools) {
      if (tool.source === 'installed' && tool.installationEvidenceHash === null) fail('MISLEADING_AUTHORITY', 'installed Tools require verified installation evidence')
      if (tool.source === 'built-in' && tool.installationEvidenceHash !== null) fail('MISLEADING_AUTHORITY', 'built-ins cannot claim installation evidence')
    }
  }
}
