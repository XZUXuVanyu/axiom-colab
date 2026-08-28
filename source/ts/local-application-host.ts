import type { AdapterService } from './adapter-service.js'
import type { LocalCandidateRepository } from './candidate-repository.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { LocalGoalLifecycle } from './local-goal-lifecycle.js'
import { LocalSupervisoryBackend } from './local-supervisory-backend.js'
import type { LocalMemoryStore } from './local-memory-store.js'
import type { MemoryWorkflows } from './memory-workflows.js'
import type { ToolDescriptor } from './protocol.js'
import { SupervisoryApplicationModel } from './supervisory-application.js'
import type { SupervisoryWorkspaceSnapshot } from './supervisory-application.js'
import type {
  InstalledToolRegistration, InstalledToolRegistry, ToolInstallationEvidence,
} from './tool-installation.js'
import type { ValidationPromotionAuthority } from './tool-installation-proposal.js'

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
  readonly adapter: Pick<AdapterService, 'initialize' | 'dispose'>
  readonly validator: ValidationPromotionAuthority
  readonly createInstallation: (registry: InstalledToolRegistry) => InstalledToolRediscovery
  readonly hostActorId: LaboratoryId<'actor'>
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
        lifecycle: options.lifecycle,
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
