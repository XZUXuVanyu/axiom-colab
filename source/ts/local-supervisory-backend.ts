import type { StoredValidationInspection, LocalCandidateRepository } from './candidate-repository.js'
import type { JsonValue } from './harness-types.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { LocalMemoryStore } from './local-memory-store.js'
import type { MemoryWorkflows, WorkingRevision } from './memory-workflows.js'
import { assertToolDescriptor, type ToolDescriptor } from './protocol.js'
import type { InstalledToolRegistration } from './tool-installation.js'
import type { ToolInstallationProposal, ValidationPromotionAuthority } from './tool-installation-proposal.js'
import type { CandidateRevision } from './tool-workshop.js'
import type {
  SupervisoryBackend, SupervisoryCandidateProjection, SupervisoryPlanProjection,
  SupervisoryProgressProjection, SupervisoryTimelineEntry, SupervisoryToolObservation,
  SupervisoryMemoryProjection, SupervisoryToolProjection, SupervisoryWorkspaceSnapshot,
} from './supervisory-application.js'

export interface LocalGoalProjection {
  readonly goalId: LaboratoryId<'goal'>
  readonly plan: WorkingRevision<{ readonly objective: string }> | null
  readonly canStop: boolean
  readonly canResume: boolean
}

export interface LocalSupervisoryLifecycle {
  listGoals(workspaceId: LaboratoryId<'workspace'>): readonly LaboratoryId<'goal'>[]
  inspectGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): LocalGoalProjection | null
  revocableCapabilities(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): readonly LaboratoryId<'capability'>[]
  recoveryRequired(workspaceId: LaboratoryId<'workspace'>): boolean
  stopGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void>
  revokeCapability(workspaceId: LaboratoryId<'workspace'>, capabilityId: LaboratoryId<'capability'>): Promise<void>
  resumeGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void>
  recoverWorkspace(workspaceId: LaboratoryId<'workspace'>): Promise<void>
}

export interface LocalSupervisoryBackendOptions {
  readonly builtInTools: () => readonly ToolDescriptor[]
  readonly executableBuiltIn?: (workspaceId: LaboratoryId<'workspace'>, descriptor: ToolDescriptor) => boolean
  /** Registrations returned by successful ToolInstallationService rediscovery. */
  readonly rediscoveredTools: (workspaceId: LaboratoryId<'workspace'>) => readonly InstalledToolRegistration[]
  readonly executableInstalled?: (workspaceId: LaboratoryId<'workspace'>, registration: InstalledToolRegistration) => boolean
  readonly lifecycle: LocalSupervisoryLifecycle
  readonly goalProgress?: (workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>) => {
    readonly progress: SupervisoryProgressProjection | null
    readonly observations: readonly SupervisoryToolObservation[]
  }
  readonly memory?: (workspaceId: LaboratoryId<'workspace'>) => SupervisoryMemoryProjection
}

export class LocalSupervisoryBackendError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'LocalSupervisoryBackendError'
  }
}

function fail(code: string, message: string): never { throw new LocalSupervisoryBackendError(code, message) }

function planProjection(goal: LocalGoalProjection | null): SupervisoryPlanProjection | null {
  if (goal?.plan === null || goal === null) return null
  return {
    revisionId: goal.plan.id,
    hash: goal.plan.hash,
    objective: goal.plan.value.objective,
    approved: true,
  }
}

function latestValidation(revision: CandidateRevision, validations: readonly StoredValidationInspection[]): StoredValidationInspection | null {
  const matching = validations.filter((item) => item.snapshot.candidateId === revision.candidateId
    && item.snapshot.descriptorHash === revision.descriptorHash && item.snapshot.sourceHash === revision.sourceHash)
  return matching.sort((left, right) => left.record.completedAt.localeCompare(right.record.completedAt)).at(-1) ?? null
}

function proposalFor(revision: CandidateRevision, proposals: readonly ToolInstallationProposal[]): ToolInstallationProposal | null {
  return proposals.filter((item) => item.revisionId === revision.revisionId && item.candidateHash === revision.candidateHash)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1) ?? null
}

export class LocalSupervisoryBackend implements SupervisoryBackend {
  constructor(
    private readonly store: LocalMemoryStore,
    private readonly workflows: MemoryWorkflows,
    private readonly candidates: LocalCandidateRepository,
    private readonly validator: ValidationPromotionAuthority,
    private readonly options: LocalSupervisoryBackendOptions,
  ) {}

  async inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot> {
    const resources = this.store.reopenWorkspace(workspaceId)
    const goal = goalId === null ? null : this.options.lifecycle.inspectGoal(workspaceId, goalId)
    if (goalId !== null && goal === null) fail('GOAL_NOT_FOUND', `goal is not visible in ${workspaceId}`)

    const revisions = this.candidates.listWorkspaceCandidateRevisions(workspaceId)
    const validations = this.candidates.listValidations(workspaceId)
    const proposals = this.candidates.listInstallationProposals(workspaceId)
    const installations = this.candidates.listInstallationEvidence(workspaceId)
    const projectedCandidates = revisions.map((revision): SupervisoryCandidateProjection => {
      const specification = this.candidates.readSpecification(workspaceId, revision.specificationId)
      const materialized = this.candidates.materializeRevision(workspaceId, revision.revisionId)
      if (materialized === null) fail('CANDIDATE_NOT_FOUND', 'candidate revision disappeared during inspection')
      const validation = latestValidation(revision, validations)
      const proposal = proposalFor(revision, proposals)
      const approval = proposal?.state === 'approved' ? this.candidates.inspectInstallationApproval(workspaceId, proposal.proposalId) : null
      const installation = installations.find((item) => item.revisionId === revision.revisionId && item.candidateHash === revision.candidateHash) ?? null
      return {
        candidateId: revision.candidateId, revisionId: revision.revisionId, revision: revision.revision,
        candidateHash: revision.candidateHash, state: revision.state,
        modelClaim: specification?.problem ?? null,
        descriptor: structuredClone(materialized.descriptor) as JsonValue, descriptorHash: revision.descriptorHash,
        sourceHash: revision.sourceHash, sources: revision.sources.map((source) => ({ ...source })),
        proposal: proposal === null ? null : {
          proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
          validationId: proposal.validationId, validationRecordHash: proposal.validationRecordHash,
          candidateSnapshotHash: proposal.candidateSnapshotHash,
          requestedPermissions: [...proposal.requestedPermissions], permissionsHash: proposal.permissionsHash,
          state: proposal.state,
        },
        validation: validation === null ? null : {
          validationId: validation.record.validationId, recordHash: validation.record.recordHash,
          snapshotHash: validation.snapshot.snapshotHash,
          outcome: validation.record.outcome,
          promotable: this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record),
          completedAt: validation.record.completedAt,
          toolchain: { ...validation.snapshot.toolchain }, toolchainHash: validation.snapshot.toolchainHash,
          policyHash: validation.snapshot.policyHash,
          confinement: { ...validation.record.confinement },
          suites: validation.record.suites.map((suite) => ({
            ...suite, processes: suite.processes.map((process) => ({ ...process })),
          })),
        },
        approval: proposal === null || proposal.state === 'proposed' ? null : {
          proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
          approvalId: approval?.approvalId ?? null, approvalHash: approval?.approvalHash ?? null,
          decision: approval === null ? 'rejected' : 'approved',
        },
        installation: installation === null ? null : {
          installationId: installation.installationId, evidenceHash: installation.evidenceHash,
          outcome: installation.outcome,
        },
      }
    })

    const tools: SupervisoryToolProjection[] = this.options.builtInTools().map((descriptor) => ({
      name: descriptor.name, descriptor, source: 'built-in',
      executable: this.options.executableBuiltIn?.(workspaceId, descriptor) ?? !descriptor.sideEffect,
      installationEvidenceHash: null,
    }))
    const installedEvidence = new Map(this.candidates.listInstalledTools(workspaceId).map((item) => [item.evidenceHash, item]))
    for (const registration of this.options.rediscoveredTools(workspaceId)) {
      const evidence = installedEvidence.get(registration.installationEvidenceHash)
      if (evidence === undefined || evidence.candidateHash !== registration.candidateHash || evidence.publicName !== registration.publicName) {
        fail('UNVERIFIED_INSTALLED_TOOL', 'rediscovered Tool does not bind stored successful installation evidence')
      }
      tools.push({
        name: registration.publicName, descriptor: assertToolDescriptor(registration.descriptor),
        source: 'installed', executable: this.options.executableInstalled?.(workspaceId, registration) ?? false,
        installationEvidenceHash: registration.installationEvidenceHash,
      })
    }

    const goalState = goalId === null || this.options.goalProgress === undefined
      ? { progress: null, observations: [] }
      : this.options.goalProgress(workspaceId, goalId)
    const memory = this.options.memory?.(workspaceId) ?? { compute: [], working: [], artifacts: [] }
    const timeline = this.timeline(workspaceId, revisions, validations, proposals, installations)
    for (const observation of goalState.observations) timeline.push({
      id: `observation:${observation.reportArtifactId}:${observation.callId}`,
      occurredAt: observation.observedAt, kind: 'tool-observation',
      summary: `${observation.tool} returned an observed result`, subjectId: observation.callId,
      authoritativeHash: observation.reportHash, detail: observation.result,
    })
    timeline.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    return {
      workspaceId, goalId, currentPlan: planProjection(goal), progress: goalState.progress,
      observations: [...goalState.observations], memory, tools, resources,
      candidates: projectedCandidates, timeline,
      controls: {
        canStopGoal: goal?.canStop ?? false,
        revocableCapabilityIds: [...this.options.lifecycle.revocableCapabilities(workspaceId, goalId)],
        canResumeGoal: goal?.canResume ?? false,
        recoveryRequired: this.options.lifecycle.recoveryRequired(workspaceId),
      },
    }
  }

  stopGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void> { return this.options.lifecycle.stopGoal(workspaceId, goalId) }
  revokeCapability(workspaceId: LaboratoryId<'workspace'>, capabilityId: LaboratoryId<'capability'>): Promise<void> { return this.options.lifecycle.revokeCapability(workspaceId, capabilityId) }
  resumeGoal(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): Promise<void> { return this.options.lifecycle.resumeGoal(workspaceId, goalId) }
  recoverWorkspace(workspaceId: LaboratoryId<'workspace'>): Promise<void> { return this.options.lifecycle.recoverWorkspace(workspaceId) }

  private timeline(
    workspaceId: LaboratoryId<'workspace'>,
    revisions: readonly CandidateRevision[],
    validations: readonly StoredValidationInspection[],
    proposals: readonly ToolInstallationProposal[],
    installations: ReturnType<LocalCandidateRepository['listInstallationEvidence']>,
  ): SupervisoryTimelineEntry[] {
    const entries: SupervisoryTimelineEntry[] = this.workflows.auditEvents()
      .filter((event) => event.workspaceId === workspaceId)
      .map((event) => ({
        id: event.eventId, occurredAt: event.occurredAt, kind: 'system-event',
        summary: `${event.operation} ${event.outcome}`, subjectId: event.targetId,
        authoritativeHash: event.inputHash, detail: { outcome: event.outcome, errorCode: event.errorCode } as JsonValue,
      }))
    for (const revision of revisions) entries.push({
      id: `candidate:${revision.revisionId}`, occurredAt: revision.createdAt, kind: 'model-claim',
      summary: `Candidate revision ${revision.revision} created`, subjectId: revision.revisionId,
      authoritativeHash: null, detail: { candidateHash: revision.candidateHash },
    })
    for (const validation of validations) entries.push({
      id: `validation:${validation.record.validationId}`, occurredAt: validation.record.completedAt, kind: 'validation-evidence',
      summary: `Validation ${validation.record.outcome}`, subjectId: validation.record.validationId,
      authoritativeHash: validation.record.recordHash, detail: { outcome: validation.record.outcome },
    })
    for (const proposal of proposals) if (proposal.state !== 'proposed') entries.push({
      id: `decision:${proposal.proposalId}`, occurredAt: proposal.createdAt, kind: 'user-decision',
      summary: `Installation proposal ${proposal.state}`, subjectId: proposal.proposalId,
      authoritativeHash: proposal.proposalHash, detail: { decision: proposal.state },
    })
    for (const installation of installations) entries.push({
      id: `installation:${installation.installationId}`, occurredAt: installation.completedAt, kind: 'installed-state',
      summary: `Installation ${installation.outcome}`, subjectId: installation.installationId,
      authoritativeHash: installation.evidenceHash, detail: { outcome: installation.outcome, failureCode: installation.failureCode },
    })
    return entries.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
  }
}
