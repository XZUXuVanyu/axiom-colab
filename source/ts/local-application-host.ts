import { randomUUID } from 'node:crypto'

import type { AdapterService } from './adapter-service.js'
import type { TrustedInvocationSession } from './adapter-service.js'
import type { JsonValue } from './harness-types.js'
import type { LocalGoalCheckpointStore } from './goal-checkpoint.js'
import type { DistillationDecision, DistillationDraft, DistillationProposal, GoalClosure, GoalDistillationService } from './goal-distillation.js'
import type {
  CandidateFile, CandidateValidationRequest, CandidateValidationResult, ValidationCommand,
} from './candidate-validation.js'
import { captureCandidateFiles } from './candidate-content.js'
import { contentHash } from './laboratory-contract.js'
import type { LocalCandidateRepository } from './candidate-repository.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { LocalGoalLifecycle } from './local-goal-lifecycle.js'
import { LocalSupervisoryBackend } from './local-supervisory-backend.js'
import type { LocalMemoryStore } from './local-memory-store.js'
import type { MemoryWorkflows } from './memory-workflows.js'
import type { WorkflowInvocation, WorkingRevision } from './memory-workflows.js'
import type { ToolDescriptor } from './protocol.js'
import type { LoadedToolExecutableBinding } from './installed-executable-loader.js'
import { SupervisoryApplicationModel } from './supervisory-application.js'
import type {
  SupervisoryMemoryProjection, SupervisoryProgressProjection, SupervisoryToolObservation,
  SupervisoryToolExecution, SupervisoryWorkspaceSnapshot,
} from './supervisory-application.js'
import type {
  InstalledToolRegistration, InstalledToolRegistry, ToolInstallationEvidence,
} from './tool-installation.js'
import type { ValidationPromotionAuthority } from './tool-installation-proposal.js'
import type { ToolInstallationProposalService } from './tool-installation-proposal.js'
import type { ProductionValidationProfile } from './production-validation-profile.js'
import type { CandidateRevision, ToolSpecification, ToolSpecificationInput, ToolWorkshop } from './tool-workshop.js'

export interface HiddenChallengeValidationResult {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly revisionId: LaboratoryId<'evidence'>
  readonly candidateHash: `sha256:${string}`
  readonly validationId: LaboratoryId<'validation'>
  readonly snapshotHash: `sha256:${string}`
  readonly recordHash: `sha256:${string}`
  readonly outcome: 'passed' | 'failed' | 'limited'
  readonly promotable: boolean
  readonly suites: readonly {
    readonly kind: 'candidate' | 'standard' | 'challenge'
    readonly outcome: 'passed' | 'failed' | 'limited'
    readonly definitionHash: `sha256:${string}`
    readonly commandCount: number
    readonly hidden: boolean
  }[]
}

export interface GoalCreationResult {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly goalId: LaboratoryId<'goal'>
  readonly objective: string
  readonly planRevisionId: LaboratoryId<'object'>
  readonly planHash: `sha256:${string}`
}

export interface InstalledToolRediscovery {
  rediscover(context: {
    readonly workspaceId: LaboratoryId<'workspace'>
    readonly actorId: LaboratoryId<'actor'>
    readonly authority: 'trusted-host'
  }): readonly ToolInstallationEvidence[]
  install(context: {
    readonly workspaceId: LaboratoryId<'workspace'>
    readonly actorId: LaboratoryId<'actor'>
    readonly authority: 'trusted-host'
  }, proposalId: LaboratoryId<'proposal'>): ToolInstallationEvidence
}

export interface InstallationRequestBinding {
  readonly proposalId: LaboratoryId<'proposal'>
  readonly proposalHash: `sha256:${string}`
  readonly approvalId: LaboratoryId<'approval'>
  readonly approvalHash: `sha256:${string}`
  readonly candidateHash: `sha256:${string}`
  readonly validationId: LaboratoryId<'validation'>
  readonly validationRecordHash: `sha256:${string}`
  readonly candidateSnapshotHash: `sha256:${string}`
  readonly permissionsHash: `sha256:${string}`
}

export interface InstallationResult {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly installationId: LaboratoryId<'evidence'>
  readonly proposalId: LaboratoryId<'proposal'>
  readonly approvalId: LaboratoryId<'approval'>
  readonly candidateHash: `sha256:${string}`
  readonly evidenceHash: `sha256:${string}`
  readonly outcome: 'installed'
}

export interface LocalApplicationHostOptions {
  readonly store: LocalMemoryStore
  readonly workflows: MemoryWorkflows
  readonly candidates: LocalCandidateRepository
  readonly lifecycle: LocalGoalLifecycle
  readonly adapter: Pick<AdapterService, 'initialize' | 'invoke' | 'dispose' | 'ledger'>
  readonly validator: ValidationPromotionAuthority
  readonly createInstallation: (registry: InstalledToolRegistry) => InstalledToolRediscovery
  readonly checkpoints?: LocalGoalCheckpointStore
  readonly distillation?: GoalDistillationService
  readonly installedExecutables?: {
    prepare(registration: InstalledToolRegistration): Promise<LoadedToolExecutableBinding>
    close(): void
  }
  readonly createInstalledAdapter?: (binding: LoadedToolExecutableBinding) => Pick<AdapterService, 'initialize' | 'invoke' | 'dispose' | 'ledger'>
  readonly hostActorId: LaboratoryId<'actor'>
  readonly goalProgress?: (workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>) => {
    readonly progress: SupervisoryProgressProjection | null
    readonly observations: readonly SupervisoryToolObservation[]
  }
  readonly memory?: (workspaceId: LaboratoryId<'workspace'>) => SupervisoryMemoryProjection
  readonly memorySession?: (
    workspaceId: LaboratoryId<'workspace'>,
    toolName: string,
    callId: LaboratoryId<'call'>,
  ) => TrustedInvocationSession | undefined
  readonly memoryPolicyAvailable?: (toolName: string) => boolean
  readonly proposalService?: ToolInstallationProposalService
  readonly userActorId?: LaboratoryId<'actor'>
  readonly challengeValidator?: Pick<{ validate(request: CandidateValidationRequest): Promise<CandidateValidationResult> }, 'validate'>
  readonly validationProfile?: ProductionValidationProfile
  readonly validatorActorId?: LaboratoryId<'actor'>
  readonly workshop?: ToolWorkshop
  readonly workshopActorId?: LaboratoryId<'actor'>
}

export class LocalApplicationHostError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'LocalApplicationHostError'
  }
}

function fail(code: string, message: string): never { throw new LocalApplicationHostError(code, message) }

class VerifiedInstalledRegistry implements InstalledToolRegistry {
  private readonly registrations = new Map<string, InstalledToolRegistration>()

  register(registration: InstalledToolRegistration): () => void {
    const key = `${registration.workspaceId}\0${registration.installationId}`
    if (this.registrations.has(key)) fail('DUPLICATE_INSTALLED_REGISTRATION', 'installed Tool is already registered')
    const captured = structuredClone(registration)
    this.registrations.set(key, captured)
    return () => { this.registrations.delete(key) }
  }

  list(workspaceId: LaboratoryId<'workspace'>): readonly InstalledToolRegistration[] {
    return [...this.registrations.values()].filter((item) => item.workspaceId === workspaceId).map((item) => structuredClone(item))
  }

  clear(): void { this.registrations.clear() }
}

export class LocalApplicationHost {
  readonly model: SupervisoryApplicationModel
  private readonly backend: LocalSupervisoryBackend
  private readonly registry = new VerifiedInstalledRegistry()
  private readonly installation: InstalledToolRediscovery
  private descriptors: readonly ToolDescriptor[] = []
  private readonly installedAdapters = new Map<string, {
    readonly binding: LoadedToolExecutableBinding
    readonly adapter: Pick<AdapterService, 'initialize' | 'invoke' | 'dispose' | 'ledger'>
    readonly descriptor: ToolDescriptor
  }>()
  private initialized = false
  private closed = false

  constructor(private readonly options: LocalApplicationHostOptions) {
    this.installation = options.createInstallation(this.registry)
    this.backend = new LocalSupervisoryBackend(
      options.store, options.workflows, options.candidates, options.validator,
      {
        builtInTools: () => this.descriptors,
        rediscoveredTools: (workspaceId) => this.registry.list(workspaceId),
        executableBuiltIn: (_workspaceId, descriptor) => !descriptor.sideEffect
          || (options.memoryPolicyAvailable?.(descriptor.name) ?? false),
        executableInstalled: (workspaceId, registration) => this.installedAdapters.has(this.installedKey(workspaceId, registration.publicName)),
        lifecycle: options.lifecycle,
        ...(options.goalProgress === undefined && options.checkpoints === undefined ? {} : {
          goalProgress: (workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>) => {
            const projected = options.goalProgress?.(workspaceId, goalId) ?? { progress: null, observations: [] }
            const checkpoint = options.checkpoints?.latest(workspaceId, goalId) ?? null
            return checkpoint === null ? projected : {
              observations: projected.observations,
              progress: {
                revisionId: `object:checkpoint-${checkpoint.checkpointHash.slice('sha256:'.length)}` as LaboratoryId<'object'>,
                hash: checkpoint.checkpointHash, status: checkpoint.status === 'completed' ? 'completed' : 'running',
                summary: checkpoint.summary, completedCalls: checkpoint.completedCalls,
                totalCalls: checkpoint.completedCalls,
              },
            }
          },
        }),
        ...(options.memory === undefined ? {} : { memory: options.memory }),
        ...(options.distillation === undefined ? {} : { distillation: options.distillation }),
      },
    )
    this.model = new SupervisoryApplicationModel(this.backend)
  }

  workspaces(): readonly LaboratoryId<'workspace'>[] {
    this.ensureReady()
    return this.options.store.listWorkspaces()
  }

  goals(workspaceId: LaboratoryId<'workspace'>): readonly LaboratoryId<'goal'>[] {
    this.ensureReady()
    this.options.store.reopenWorkspace(workspaceId)
    return this.options.lifecycle.listGoals(workspaceId)
  }

  createWorkspace(workspaceId: LaboratoryId<'workspace'>): { readonly workspaceId: LaboratoryId<'workspace'> } {
    this.ensureReady()
    this.options.store.createWorkspace(workspaceId)
    return { workspaceId }
  }

  createGoal(
    workspaceId: LaboratoryId<'workspace'>,
    goalId: LaboratoryId<'goal'>,
    objective: string,
  ): GoalCreationResult {
    this.ensureReady()
    this.options.store.reopenWorkspace(workspaceId)
    if (objective.length === 0 || objective.length > 16_384) {
      fail('INVALID_GOAL_OBJECTIVE', 'goal objective must contain 1..16384 characters')
    }
    if (this.options.lifecycle.inspectGoal(workspaceId, goalId) !== null) {
      fail('GOAL_ALREADY_REGISTERED', 'goal is already registered in this workspace')
    }
    const key = `${goalId}:plan`
    const existing = this.options.workflows.readWorking<{ readonly goalId: LaboratoryId<'goal'>; readonly objective: string }>(
      this.workflowInvocation(workspaceId, this.options.hostActorId, 'trusted-host', ['working.read']), key,
    )
    let plan: WorkingRevision<{ readonly goalId: LaboratoryId<'goal'>; readonly objective: string }>
    if (existing !== null) {
      if (existing.value.goalId !== goalId || existing.value.objective !== objective) {
        fail('GOAL_PLAN_ALREADY_EXISTS', 'an approved plan already exists for this goal identity')
      }
      plan = existing
    } else {
      if (this.options.userActorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'user plan approval is not composed')
      const proposal = this.options.workflows.proposeWorking(
        this.workflowInvocation(workspaceId, this.options.hostActorId, 'trusted-host', ['working.propose']),
        key, { goalId, objective },
      )
      plan = this.options.workflows.approveWorking(
        this.workflowInvocation(workspaceId, this.options.userActorId, 'user', ['working.approve']),
        proposal.id,
        { workspaceId, proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved' },
      )
    }
    this.options.lifecycle.registerGoal(workspaceId, goalId)
    return { workspaceId, goalId, objective, planRevisionId: plan.id, planHash: plan.hash }
  }

  installedRegistrations(workspaceId: LaboratoryId<'workspace'>): readonly InstalledToolRegistration[] {
    this.ensureReady()
    return this.registry.list(workspaceId)
  }

  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot> {
    this.ensureReady()
    return this.backend.inspect(workspaceId, goalId)
  }

  async stopGoal(
    workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>,
    planRevisionId: LaboratoryId<'object'>, planHash: `sha256:${string}`,
  ): Promise<void> {
    const snapshot = await this.inspect(workspaceId, goalId)
    if (snapshot.currentPlan?.revisionId !== planRevisionId || snapshot.currentPlan.hash !== planHash) {
      fail('STALE_APPROVED_PLAN', 'stop request does not bind the exact visible approved plan')
    }
    if (!snapshot.controls.canStopGoal) fail('ACTION_NOT_AVAILABLE', 'selected goal cannot be stopped')
    await this.backend.stopGoal(workspaceId, goalId)
  }

  async resumeGoal(
    workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>,
    planRevisionId: LaboratoryId<'object'>, planHash: `sha256:${string}`,
  ): Promise<void> {
    const snapshot = await this.inspect(workspaceId, goalId)
    if (snapshot.currentPlan?.revisionId !== planRevisionId || snapshot.currentPlan.hash !== planHash) {
      fail('STALE_APPROVED_PLAN', 'resume request does not bind the exact visible approved plan')
    }
    if (!snapshot.controls.canResumeGoal) fail('ACTION_NOT_AVAILABLE', 'selected goal cannot be resumed')
    await this.backend.resumeGoal(workspaceId, goalId)
  }

  async revokeCapability(
    workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null,
    capabilityId: LaboratoryId<'capability'>,
  ): Promise<void> {
    const snapshot = await this.inspect(workspaceId, goalId)
    if (!snapshot.controls.revocableCapabilityIds.includes(capabilityId)) {
      fail('ACTION_NOT_AVAILABLE', 'capability is not revocable in the exact visible selection')
    }
    await this.backend.revokeCapability(workspaceId, capabilityId)
  }

  async recoverWorkspace(workspaceId: LaboratoryId<'workspace'>): Promise<void> {
    const snapshot = await this.inspect(workspaceId, null)
    if (!snapshot.controls.recoveryRequired) fail('ACTION_NOT_AVAILABLE', 'workspace recovery is not required')
    await this.backend.recoverWorkspace(workspaceId)
  }

  async decideInstallation(
    workspaceId: LaboratoryId<'workspace'>,
    proposalId: LaboratoryId<'proposal'>,
    proposalHash: `sha256:${string}`,
    decision: 'approved' | 'rejected',
  ): Promise<{ readonly workspaceId: LaboratoryId<'workspace'>; readonly proposalId: LaboratoryId<'proposal'>; readonly proposalHash: `sha256:${string}`; readonly decision: 'approved' | 'rejected' }> {
    this.ensureReady()
    if (this.options.proposalService === undefined || this.options.userActorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'installation decisions are not composed')
    const proposal = this.options.candidates.inspectInstallationProposal(workspaceId, proposalId)
    if (proposal === null || proposal.proposalHash !== proposalHash) fail('STALE_INSTALLATION_PROPOSAL', 'proposal identity and hash do not match visible state')
    const context = { workspaceId, actorId: this.options.userActorId, authority: 'user' as const }
    if (decision === 'approved') this.options.proposalService.approve(context, proposalId)
    else this.options.proposalService.reject(context, proposalId)
    return { workspaceId, proposalId, proposalHash, decision }
  }

  async installCandidate(
    workspaceId: LaboratoryId<'workspace'>,
    binding: InstallationRequestBinding,
  ): Promise<InstallationResult> {
    this.ensureReady()
    this.options.store.reopenWorkspace(workspaceId)
    const proposal = this.options.candidates.inspectInstallationProposal(workspaceId, binding.proposalId)
    const approval = this.options.candidates.inspectInstallationApproval(workspaceId, binding.proposalId)
    if (proposal === null || approval === null || proposal.state !== 'approved'
        || proposal.proposalHash !== binding.proposalHash
        || approval.approvalId !== binding.approvalId || approval.approvalHash !== binding.approvalHash
        || proposal.candidateHash !== binding.candidateHash
        || proposal.validationId !== binding.validationId
        || proposal.validationRecordHash !== binding.validationRecordHash
        || proposal.candidateSnapshotHash !== binding.candidateSnapshotHash
        || proposal.permissionsHash !== binding.permissionsHash) {
      fail('STALE_INSTALLATION_BINDING', 'installation request does not bind the exact visible approval and evidence')
    }
    const evidence = this.installation.install(
      { workspaceId, actorId: this.options.hostActorId, authority: 'trusted-host' },
      binding.proposalId,
    )
    if (evidence.outcome !== 'installed') fail('INSTALLATION_FAILED', 'installer did not produce successful immutable evidence')
    const registration = this.registry.list(workspaceId).find((item) => item.installationId === evidence.installationId)
    if (registration !== undefined) await this.prepareInstalled(registration)
    return {
      workspaceId, installationId: evidence.installationId, proposalId: evidence.proposalId,
      approvalId: evidence.approvalId, candidateHash: evidence.candidateHash,
      evidenceHash: evidence.evidenceHash, outcome: evidence.outcome,
    }
  }

  async submitHiddenChallenge(
    workspaceId: LaboratoryId<'workspace'>,
    revisionId: LaboratoryId<'evidence'>,
    candidateHash: `sha256:${string}`,
    fixtures: readonly CandidateFile[],
    commands: readonly ValidationCommand[],
  ): Promise<HiddenChallengeValidationResult> {
    this.ensureReady()
    const runner = this.options.challengeValidator
    const profile = this.options.validationProfile
    const validatorActorId = this.options.validatorActorId
    if (runner === undefined || profile === undefined || validatorActorId === undefined) {
      fail('OPERATION_NOT_AVAILABLE', 'hidden challenge validation is not composed')
    }
    const materialized = this.options.candidates.materializeRevision(workspaceId, revisionId)
    if (materialized === null) fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace')
    if (materialized.revision.state !== 'current' || materialized.revision.candidateHash !== candidateHash) {
      fail('STALE_CANDIDATE_REVISION', 'hidden challenge must bind the exact current candidate revision')
    }
    if (commands.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge must contain at least one command')
    const request: CandidateValidationRequest = {
      workspaceId,
      candidateId: materialized.revision.candidateId,
      validatorActorId,
      descriptor: materialized.descriptor,
      sources: materialized.sources,
      fixtures,
      toolchain: profile.toolchain,
      policy: profile.policy,
      suites: [profile.candidateSuite, profile.standardSuite, {
        suiteId: 'user-hidden-challenge', kind: 'challenge', commands,
      }],
    }
    const result = await runner.validate(request)
    return {
      workspaceId, revisionId, candidateHash,
      validationId: result.record.validationId,
      snapshotHash: result.snapshot.snapshotHash,
      recordHash: result.record.recordHash,
      outcome: result.record.outcome,
      promotable: this.options.validator.isPromotionEligible(result.snapshot.snapshotHash, result.record),
      suites: result.record.suites.map((suite) => ({
        kind: suite.kind, outcome: suite.outcome, definitionHash: suite.definitionHash,
        commandCount: suite.commandCount, hidden: suite.hidden,
      })),
    }
  }

  reviseCandidate(
    workspaceId: LaboratoryId<'workspace'>,
    parentRevisionId: LaboratoryId<'evidence'>,
    parentCandidateHash: `sha256:${string}`,
    descriptor: unknown,
    sources: readonly CandidateFile[],
  ): CandidateRevision {
    this.ensureReady()
    const workshop = this.options.workshop
    const actorId = this.options.workshopActorId
    if (workshop === undefined || actorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'candidate authoring is not composed')
    const parent = this.options.candidates.inspectRevision(workspaceId, parentRevisionId)
    if (parent === null || parent.state !== 'current' || parent.candidateHash !== parentCandidateHash) {
      fail('STALE_CANDIDATE_REVISION', 'candidate revision must bind the exact current parent')
    }
    return workshop.createCandidateRevision(
      { workspaceId, actorId, authority: 'trusted-host' },
      { specificationId: parent.specificationId, parentRevisionId, descriptor, sources },
    )
  }

  createCandidate(
    workspaceId: LaboratoryId<'workspace'>,
    specificationInput: ToolSpecificationInput,
    descriptor: unknown,
    sources: readonly CandidateFile[],
  ): { readonly specification: ToolSpecification; readonly candidate: CandidateRevision } {
    this.ensureReady()
    this.options.store.reopenWorkspace(workspaceId)
    const workshop = this.options.workshop
    const actorId = this.options.workshopActorId
    if (workshop === undefined || actorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'candidate authoring is not composed')
    if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)
        || (descriptor as { name?: unknown }).name !== specificationInput.publicName) {
      fail('DESCRIPTOR_NAME_MISMATCH', 'candidate descriptor name must match the new specification public name')
    }
    captureCandidateFiles(sources)
    const context = { workspaceId, actorId, authority: 'trusted-host' as const }
    const specification = workshop.defineSpecification(context, specificationInput)
    const candidate = workshop.createCandidateRevision(context, {
      specificationId: specification.specificationId, descriptor, sources,
    })
    return { specification, candidate }
  }

  async executeTool(
    workspaceId: LaboratoryId<'workspace'>,
    goalId: LaboratoryId<'goal'>,
    toolName: string,
    args: Record<string, JsonValue>,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<SupervisoryToolExecution> {
    this.ensureReady()
    this.options.store.reopenWorkspace(workspaceId)
    const goal = this.options.lifecycle.inspectGoal(workspaceId, goalId)
    if (goal?.plan === null || goal === null) fail('GOAL_NOT_FOUND', 'selected goal has no authoritative approved plan')
    if (!goal.canStop) fail('GOAL_NOT_ACTIVE', 'selected goal is not active')
    const installed = this.installedAdapters.get(this.installedKey(workspaceId, toolName))
    const descriptor = installed?.descriptor ?? this.descriptors.find((item) => item.name === toolName)
    if (descriptor === undefined) fail('TOOL_NOT_EXECUTABLE', 'Tool is not executable by the production Adapter')
    const callId = `call:${randomUUID()}` as LaboratoryId<'call'>
    const memorySession = this.options.memorySession?.(workspaceId, toolName, callId)
    if (descriptor.sideEffect && memorySession === undefined) {
      fail('TOOL_REQUIRES_POLICY', 'side-effecting Tool execution requires an explicit host policy')
    }
    const startedAt = new Date().toISOString()
    const executionAdapter = installed?.adapter ?? this.options.adapter
    const result = await executionAdapter.invoke(toolName, args, callId, signal, memorySession)
    const completedAt = new Date().toISOString()
    const calls = executionAdapter.ledger.snapshot().filter((record) => record.callId === callId)
    if (calls.length !== 1 || calls[0]?.tool !== toolName || calls[0].status !== 'succeeded') {
      fail('INVALID_TOOL_EVIDENCE', 'Adapter ledger does not contain one successful record for the exact host-issued call')
    }
    const report = {
      goalId, planRevisionId: goal.plan.id, planHash: goal.plan.hash,
      startedAt, completedAt,
      calls,
      installedExecutable: installed === undefined ? null : { ...installed.binding, executable: undefined },
      observations: [{ callId, tool: toolName, result }], resultingArtifactIds: [],
    }
    const issued = new Date()
    const reportArtifact = this.options.workflows.createArtifact({
      authority: 'trusted-host',
      context: { workspaceId, actorId: this.options.hostActorId, callId, toolId: 'tool:supervisory-host' },
      capability: {
        protocolVersion: '1.0', capabilityId: `capability:${randomUUID()}`,
        workspaceId, actorId: this.options.hostActorId, toolId: 'tool:supervisory-host', callId,
        operations: ['artifact.create'], issuedAt: issued.toISOString(),
        expiresAt: new Date(issued.getTime() + 60_000).toISOString(), nonce: randomUUID(),
      },
    }, Buffer.from(JSON.stringify(report), 'utf8'),
    { type: 'object', title: 'Axiom goal session report', protocolVersion: '1.0' },
    {
      operation: 'goal.tool.execution',
      parametersHash: contentHash({ goalId, planHash: goal.plan.hash, toolName, args }),
      softwareVersion: '1.0.0', validationId: null,
    })
    if (this.options.checkpoints !== undefined) {
      const previous = this.options.checkpoints.latest(workspaceId, goalId)
      this.options.checkpoints.append({
        workspaceId, goalId, planRevisionId: goal.plan.id, planHash: goal.plan.hash,
        status: 'active', completedCalls: (previous?.completedCalls ?? 0) + 1,
        latestCallId: callId, latestReportArtifactId: reportArtifact.id,
        latestReportHash: reportArtifact.hash, summary: `${toolName} completed with sealed evidence`,
        checkpointedAt: completedAt,
      })
    }
    return { workspaceId, goalId, callId, tool: toolName, result, reportArtifactId: reportArtifact.id, reportHash: reportArtifact.hash }
  }

  closeGoal(
    workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>,
    planRevisionId: LaboratoryId<'object'>, planHash: `sha256:${string}`,
    drafts: readonly DistillationDraft[],
  ): { readonly closure: GoalClosure; readonly proposals: readonly DistillationProposal[] } {
    this.ensureReady()
    if (this.options.distillation === undefined || this.options.checkpoints === undefined
        || this.options.lifecycle.completeGoal === undefined) fail('OPERATION_NOT_AVAILABLE', 'goal closure is not composed')
    const goal = this.options.lifecycle.inspectGoal(workspaceId, goalId)
    if (goal?.plan === null || goal === null || goal.plan.id !== planRevisionId || goal.plan.hash !== planHash) {
      fail('STALE_APPROVED_PLAN', 'goal closure does not bind the exact approved plan')
    }
    const existing = this.options.distillation.inspectClosure(workspaceId, goalId)
    let closure: GoalClosure
    let proposals: readonly DistillationProposal[]
    if (existing !== null) {
      if (existing.planRevisionId !== planRevisionId || existing.planHash !== planHash) fail('STALE_GOAL_CLOSURE', 'stored closure binds another plan')
      closure = existing; proposals = []
    } else {
      const result = this.options.distillation.closeGoal(workspaceId, goalId, planRevisionId, planHash, drafts,
        this.workflowInvocation(workspaceId, this.options.hostActorId, 'trusted-host', ['artifact.read', 'artifact.derive']))
      closure = result.closure; proposals = result.proposals
    }
    this.options.lifecycle.completeGoal(workspaceId, goalId)
    const checkpoint = this.options.checkpoints.latest(workspaceId, goalId)
    if (checkpoint !== null && checkpoint.status !== 'completed') this.options.checkpoints.append({
      workspaceId, goalId, planRevisionId, planHash, status: 'completed', completedCalls: checkpoint.completedCalls,
      latestCallId: checkpoint.latestCallId, latestReportArtifactId: checkpoint.latestReportArtifactId,
      latestReportHash: checkpoint.latestReportHash, summary: 'Goal closed with immutable archive and reviewable distillation',
      checkpointedAt: closure.closedAt,
    })
    return { closure, proposals }
  }

  decideDistillation(
    workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>,
    proposalHash: `sha256:${string}`, decision: DistillationDecision,
  ): DistillationProposal {
    this.ensureReady()
    if (this.options.distillation === undefined || this.options.userActorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'distillation review is not composed')
    return this.options.distillation.decide(workspaceId, proposalId, proposalHash, decision, this.options.userActorId, 'user')
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.closed) fail('HOST_CLOSED', 'application host is closed')
    if (this.initialized) fail('HOST_ALREADY_INITIALIZED', 'application host is already initialized')
    try {
      this.descriptors = Object.freeze([...(await this.options.adapter.initialize(signal))])
      for (const workspaceId of this.options.store.listWorkspaces()) {
        this.installation.rediscover({ workspaceId, actorId: this.options.hostActorId, authority: 'trusted-host' })
        for (const registration of this.registry.list(workspaceId)) await this.prepareInstalled(registration, signal)
      }
      this.initialized = true
    } catch (error) {
      this.registry.clear()
      this.descriptors = []
      throw error
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.registry.clear()
    for (const installed of this.installedAdapters.values()) installed.adapter.dispose()
    this.installedAdapters.clear()
    this.options.installedExecutables?.close()
    this.options.distillation?.close()
    this.options.checkpoints?.close()
    this.options.adapter.dispose()
    this.options.lifecycle.close()
    this.options.workflows.close()
    this.options.candidates.close()
    this.options.store.close()
  }

  private ensureReady(): void {
    if (this.closed) fail('HOST_CLOSED', 'application host is closed')
    if (!this.initialized) fail('HOST_NOT_INITIALIZED', 'application host is not initialized')
  }

  private installedKey(workspaceId: LaboratoryId<'workspace'>, publicName: string): string {
    return `${workspaceId}\0${publicName}`
  }

  private async prepareInstalled(registration: InstalledToolRegistration, signal?: AbortSignal): Promise<void> {
    if (this.options.installedExecutables === undefined || this.options.createInstalledAdapter === undefined) return
    const key = this.installedKey(registration.workspaceId, registration.publicName)
    if (this.installedAdapters.has(key)) return
    const binding = await this.options.installedExecutables.prepare(registration)
    const adapter = this.options.createInstalledAdapter(binding)
    try {
      const descriptors = await adapter.initialize(signal)
      if (descriptors.length !== 1 || descriptors[0]?.name !== registration.publicName
          || contentHash(descriptors[0]) !== registration.descriptorHash) {
        fail('INSTALLED_DESCRIPTOR_MISMATCH', 'installed executable did not expose the exact installed descriptor')
      }
      this.installedAdapters.set(key, { binding, adapter, descriptor: descriptors[0] })
    } catch (error) { adapter.dispose(); throw error }
  }

  private workflowInvocation(
    workspaceId: LaboratoryId<'workspace'>, actorId: LaboratoryId<'actor'>,
    authority: 'trusted-host' | 'user', operations: WorkflowInvocation['capability']['operations'],
  ): WorkflowInvocation {
    const issued = new Date()
    const callId = `call:${randomUUID()}` as LaboratoryId<'call'>
    const toolId = 'tool:supervisory-host' as LaboratoryId<'tool'>
    return {
      authority, context: { workspaceId, actorId, callId, toolId },
      capability: {
        protocolVersion: '1.0', capabilityId: `capability:${randomUUID()}`,
        workspaceId, actorId, toolId, callId, operations,
        issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
        nonce: randomUUID(),
      },
    }
  }
}
