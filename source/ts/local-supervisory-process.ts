import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { AdapterService } from './adapter-service.js'
import type { ValidationRecord } from './candidate-validation.js'
import { LocalCandidateRepository } from './candidate-repository.js'
import type { LaboratoryId } from './laboratory-contract.js'
import { LocalApplicationHost } from './local-application-host.js'
import { LocalGoalLifecycle } from './local-goal-lifecycle.js'
import { LocalMemoryStore } from './local-memory-store.js'
import { MemoryWorkflows, type WorkingRevision } from './memory-workflows.js'
import { ToolObserver } from './observer.js'
import { ProcessRunner } from './process-runner.js'
import { SupervisoryTransport } from './supervisory-transport.js'
import { runSupervisoryTransportServer } from './supervisory-transport-server.js'
import { ToolInstallationService } from './tool-installation.js'

export interface LocalSupervisoryProcessConfig {
  readonly stateRoot: string
  readonly bridgePath: string
  readonly bridgeArgs: readonly string[]
  readonly bridgeWorkingDirectory?: string
  readonly hostActorId: LaboratoryId<'actor'>
  readonly maxLineBytes: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function absolute(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new TypeError(`${field} must be an absolute path`)
  return resolve(value)
}

function approvedPlanValue(value: unknown, goalId: LaboratoryId<'goal'>): value is { readonly objective: string } {
  return record(value)
    && value.goalId === goalId
    && typeof value.objective === 'string'
    && value.objective.length > 0
}

export function createLocalApprovedPlanReader(
  workflows: MemoryWorkflows,
  hostActorId: LaboratoryId<'actor'>,
  now: () => Date = () => new Date(),
): (workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>) => WorkingRevision<{ readonly objective: string }> | null {
  return (workspaceId, goalId) => {
    const issued = now()
    const callId = `call:${randomUUID()}` as LaboratoryId<'call'>
    const toolId = 'tool:supervisory-host' as LaboratoryId<'tool'>
    const revision = workflows.readWorking<unknown>({
      authority: 'trusted-host',
      context: { workspaceId, actorId: hostActorId, callId, toolId },
      capability: {
        protocolVersion: '1.0', capabilityId: 'capability:supervisory-plan-read',
        workspaceId, actorId: hostActorId, toolId, callId,
        operations: ['working.read'], issuedAt: issued.toISOString(),
        expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
        nonce: randomUUID(),
      },
    }, `${goalId}:plan`)
    if (revision === null) return null
    if (revision.key !== `${goalId}:plan` || !approvedPlanValue(revision.value, goalId)) {
      throw Object.assign(new Error('approved goal plan is malformed or bound to another goal'), {
        code: 'INVALID_APPROVED_PLAN',
      })
    }
    return revision as WorkingRevision<{ readonly objective: string }>
  }
}

export function parseLocalSupervisoryProcessConfig(value: unknown): LocalSupervisoryProcessConfig {
  if (!record(value)) throw new TypeError('supervisory process config must be an object')
  const allowed = new Set(['stateRoot', 'bridgePath', 'bridgeArgs', 'bridgeWorkingDirectory', 'hostActorId', 'maxLineBytes'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`supervisory process config contains unknown field ${key}`)
  const bridgeArgs = value.bridgeArgs ?? []
  if (!Array.isArray(bridgeArgs) || !bridgeArgs.every((item) => typeof item === 'string')) throw new TypeError('bridgeArgs must be an array of strings')
  const hostActorId = value.hostActorId ?? 'actor:local-host'
  if (typeof hostActorId !== 'string' || !/^actor:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(hostActorId)) throw new TypeError('hostActorId is malformed')
  const maxLineBytes = value.maxLineBytes ?? 64 * 1024
  if (!Number.isSafeInteger(maxLineBytes) || (maxLineBytes as number) < 256) throw new TypeError('maxLineBytes must be a safe integer of at least 256')
  return {
    stateRoot: absolute(value.stateRoot, 'stateRoot'),
    bridgePath: absolute(value.bridgePath, 'bridgePath'),
    bridgeArgs: [...bridgeArgs] as string[],
    ...(value.bridgeWorkingDirectory === undefined ? {} : { bridgeWorkingDirectory: absolute(value.bridgeWorkingDirectory, 'bridgeWorkingDirectory') }),
    hostActorId: hostActorId as LaboratoryId<'actor'>,
    maxLineBytes: maxLineBytes as number,
  }
}

export async function runLocalSupervisoryProcess(configValue: unknown): Promise<void> {
  const config = parseLocalSupervisoryProcessConfig(configValue)
  const store = new LocalMemoryStore(join(config.stateRoot, 'memory'))
  const workflows = new MemoryWorkflows(store)
  const candidates = new LocalCandidateRepository(join(config.stateRoot, 'candidates.sqlite3'))
  const validator = {
    isPromotionEligible(snapshotHash: string, record: ValidationRecord): boolean {
      return record.outcome === 'passed'
        && record.confinement.filesystem
        && record.confinement.descendantProcesses
        && record.confinement.network
        && record.confinement.cpu
        && record.confinement.memory
        && candidates.isValidationAuthentic(snapshotHash, record)
    },
  }
  const unavailable = async (): Promise<never> => { throw Object.assign(new Error('lifecycle mutation is not exposed by the read-only process'), { code: 'OPERATION_NOT_AVAILABLE' }) }
  const lifecycle = new LocalGoalLifecycle(join(config.stateRoot, 'lifecycle.sqlite3'), {
    approvedPlan: createLocalApprovedPlanReader(workflows, config.hostActorId),
    revokeCapability: unavailable,
    stopGoal: unavailable,
    resumeGoal: unavailable,
    recoverWorkspace: unavailable,
  })
  const observer = new ToolObserver({
    info: (message) => process.stderr.write(`${message}\n`),
    warn: (message) => process.stderr.write(`${message}\n`),
    error: (message) => process.stderr.write(`${message}\n`),
  }, { maxLogChars: 2048 })
  const limits = { timeoutMs: 10_000, maxStdinBytes: 4 * 1024 * 1024, maxStdoutBytes: 8 * 1024 * 1024, maxStderrBytes: 1024 * 1024, killGraceMs: 250 }
  const adapter = new AdapterService(new ProcessRunner(), observer, {
    bridge: { executable: config.bridgePath, prefixArgs: [...config.bridgeArgs], ...(config.bridgeWorkingDirectory === undefined ? {} : { cwd: config.bridgeWorkingDirectory }) },
    descriptorLimits: limits,
    callLimits: limits,
  })
  const host = new LocalApplicationHost({
    store, workflows, candidates, lifecycle, adapter, validator,
    hostActorId: config.hostActorId,
    createInstallation: (registry) => new ToolInstallationService(candidates, validator, {
      installationRoot: join(config.stateRoot, 'installed'), registry,
    }),
  })
  const close = (): void => host.close()
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  try {
    await host.initialize()
    await runSupervisoryTransportServer(new SupervisoryTransport(host, config.maxLineBytes), process.stdin, process.stdout, {
      maxLineBytes: config.maxLineBytes,
      diagnostic: (message) => process.stderr.write(`${message}\n`),
    })
  } finally {
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
    host.close()
  }
}

export function readLocalSupervisoryProcessConfig(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown
}
