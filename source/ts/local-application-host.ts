import { randomUUID } from 'node:crypto'

import type { AdapterService } from './adapter-service.js'
import type { TrustedInvocationSession } from './adapter-service.js'
import type { JsonValue } from './harness-types.js'
import { contentHash } from './laboratory-contract.js'
import type { LocalCandidateRepository } from './candidate-repository.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { LocalGoalLifecycle } from './local-goal-lifecycle.js'
import { LocalSupervisoryBackend } from './local-supervisory-backend.js'
import type { LocalMemoryStore } from './local-memory-store.js'
import type { MemoryWorkflows } from './memory-workflows.js'
import type { ToolDescriptor } from './protocol.js'
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

export interface InstalledToolRediscovery {
  rediscover(context: {
    readonly workspaceId: LaboratoryId<'workspace'>
    readonly actorId: LaboratoryId<'actor'>
    readonly authority: 'trusted-host'
  }): readonly ToolInstallationEvidence[]
}

export interface LocalApplicationHostOptions {
  readonly store: LocalMemoryStore
  readonly workflows: MemoryWorkflows
  readonly candidates: LocalCandidateRepository
  readonly lifecycle: LocalGoalLifecycle
  readonly adapter: Pick<AdapterService, 'initialize' | 'invoke' | 'dispose' | 'ledger'>
  readonly validator: ValidationPromotionAuthority
  readonly createInstallation: (registry: InstalledToolRegistry) => InstalledToolRediscovery
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
        lifecycle: options.lifecycle,
        ...(options.goalProgress === undefined ? {} : { goalProgress: options.goalProgress }),
        ...(options.memory === undefined ? {} : { memory: options.memory }),
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

  installedRegistrations(workspaceId: LaboratoryId<'workspace'>): readonly InstalledToolRegistration[] {
    this.ensureReady()
    return this.registry.list(workspaceId)
  }

  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot> {
    this.ensureReady()
    return this.backend.inspect(workspaceId, goalId)
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
    const descriptor = this.descriptors.find((item) => item.name === toolName)
    if (descriptor === undefined) fail('TOOL_NOT_EXECUTABLE', 'Tool is not executable by the production Adapter')
    const callId = `call:${randomUUID()}` as LaboratoryId<'call'>
    const memorySession = this.options.memorySession?.(workspaceId, toolName, callId)
    if (descriptor.sideEffect && memorySession === undefined) {
      fail('TOOL_REQUIRES_POLICY', 'side-effecting Tool execution requires an explicit host policy')
    }
    const ledgerStart = this.options.adapter.ledger.snapshot().length
    const startedAt = new Date().toISOString()
    const result = await this.options.adapter.invoke(toolName, args, callId, signal, memorySession)
    const completedAt = new Date().toISOString()
    const report = {
      goalId, planRevisionId: goal.plan.id, planHash: goal.plan.hash,
      startedAt, completedAt,
      calls: this.options.adapter.ledger.snapshot().slice(ledgerStart),
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
    return { workspaceId, goalId, callId, tool: toolName, result, reportArtifactId: reportArtifact.id, reportHash: reportArtifact.hash }
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.closed) fail('HOST_CLOSED', 'application host is closed')
    if (this.initialized) fail('HOST_ALREADY_INITIALIZED', 'application host is already initialized')
    try {
      this.descriptors = Object.freeze([...(await this.options.adapter.initialize(signal))])
      for (const workspaceId of this.options.store.listWorkspaces()) {
        this.installation.rediscover({ workspaceId, actorId: this.options.hostActorId, authority: 'trusted-host' })
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
}
