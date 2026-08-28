import { fileURLToPath } from 'node:url'
import type { HarnessContext } from './harness-types.js'
import { AdapterService, ProcessRunner, ToolObserver } from './adapter-service.js'
import { registerDynamicTools } from './dynamic-tool-registry.js'
import { registerRuntimeSkill } from './skill.js'
import type { InvocationLedger } from './invocation-ledger.js'

export * from './laboratory-contract.js'
export * from './local-memory-store.js'
export * from './memory-workflows.js'
export * from './authenticated-memory-service.js'
export * from './authenticated-memory-http.js'
export * from './memory-session-provider.js'
export * from './goal-coordinator.js'
export * from './candidate-validation.js'
export * from './wsl-validation-backend.js'
export * from './tool-workshop.js'
export * from './tool-installation-proposal.js'
export * from './candidate-repository.js'

export const name = 'general-ts-cpp-adapter'
export const inject = ['tools', 'skills']
const ledgersByContext = new WeakMap<object, InvocationLedger>()

export function getInvocationLedger(ctx: HarnessContext): InvocationLedger | undefined {
  return ledgersByContext.get(ctx)
}

export interface Config {
  readonly bridgePath?: string
  readonly bridgeArgs?: string[]
  readonly workingDirectory?: string
  readonly descriptorTimeoutMs?: number
  readonly maxStdinBytes?: number
  readonly maxStdoutBytes?: number
  readonly maxStderrBytes?: number
  readonly killGraceMs?: number
  readonly maxLogChars?: number
  readonly verificationMode?: 'normal' | 'tool-only'
  readonly maxConcurrentCalls?: number
  readonly maxQueuedCalls?: number
}

interface ResolvedConfig {
  readonly bridgePath: string
  readonly bridgeArgs: string[]
  readonly workingDirectory?: string
  readonly descriptorTimeoutMs: number
  readonly maxStdinBytes: number
  readonly maxStdoutBytes: number
  readonly maxStderrBytes: number
  readonly killGraceMs: number
  readonly maxLogChars: number
  readonly verificationMode: 'normal' | 'tool-only'
  readonly maxConcurrentCalls: number
  readonly maxQueuedCalls: number
}

function defaultBridgePath(): string {
  const relative = process.platform === 'win32'
    ? '../build/windows/Release/cpp-tool-bridge.exe'
    : '../build/linux/cpp-tool-bridge'
  return fileURLToPath(new URL(relative, import.meta.url))
}

function positiveInteger(
  value: unknown,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || (resolved as number) <= 0) {
    throw new TypeError(`${field} must be a positive integer`)
  }
  return resolved as number
}

export function resolveConfig(value: unknown): ResolvedConfig {
  if (value === undefined) value = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('plugin config must be an object')
  }
  const config = value as Record<string, unknown>
  if (config.bridgePath !== undefined && typeof config.bridgePath !== 'string') {
    throw new TypeError('bridgePath must be a string')
  }
  if (config.workingDirectory !== undefined && typeof config.workingDirectory !== 'string') {
    throw new TypeError('workingDirectory must be a string')
  }
  if (config.bridgeArgs !== undefined
      && (!Array.isArray(config.bridgeArgs)
        || !config.bridgeArgs.every((item) => typeof item === 'string'))) {
    throw new TypeError('bridgeArgs must be an array of strings')
  }
  if (config.verificationMode !== undefined
      && config.verificationMode !== 'normal'
      && config.verificationMode !== 'tool-only') {
    throw new TypeError('verificationMode must be normal or tool-only')
  }
  return {
    bridgePath: (config.bridgePath as string | undefined) ?? defaultBridgePath(),
    bridgeArgs: [...((config.bridgeArgs as string[] | undefined) ?? [])],
    ...(config.workingDirectory === undefined
      ? {}
      : { workingDirectory: config.workingDirectory as string }),
    descriptorTimeoutMs: positiveInteger(config.descriptorTimeoutMs, 10_000, 'descriptorTimeoutMs'),
    maxStdinBytes: positiveInteger(config.maxStdinBytes, 4 * 1024 * 1024, 'maxStdinBytes'),
    maxStdoutBytes: positiveInteger(config.maxStdoutBytes, 8 * 1024 * 1024, 'maxStdoutBytes'),
    maxStderrBytes: positiveInteger(config.maxStderrBytes, 1024 * 1024, 'maxStderrBytes'),
    killGraceMs: positiveInteger(config.killGraceMs, 250, 'killGraceMs'),
    maxLogChars: positiveInteger(config.maxLogChars, 2048, 'maxLogChars'),
    verificationMode: (config.verificationMode as 'normal' | 'tool-only' | undefined) ?? 'normal',
    maxConcurrentCalls: positiveInteger(config.maxConcurrentCalls, 4, 'maxConcurrentCalls'),
    maxQueuedCalls: positiveInteger(config.maxQueuedCalls, 32, 'maxQueuedCalls'),
  }
}

// Cordis accepts Standard Schema values. Keeping this tiny implementation local
// avoids bundling a second Schemastery/Cordis runtime into an external plugin.
export const Config = {
  '~standard': {
    version: 1 as const,
    vendor: name,
    validate(value: unknown) {
      try {
        return { value: resolveConfig(value) }
      } catch (error) {
        return {
          issues: [{ message: error instanceof Error ? error.message : String(error) }],
        }
      }
    },
  },
}

export async function apply(ctx: HarnessContext, rawConfig: Config = {}): Promise<void> {
  const config = resolveConfig(rawConfig)
  const runner = new ProcessRunner()
  const observer = new ToolObserver(ctx.logger, { maxLogChars: config.maxLogChars })
  const commonLimits = {
    maxStdinBytes: config.maxStdinBytes,
    maxStdoutBytes: config.maxStdoutBytes,
    maxStderrBytes: config.maxStderrBytes,
    killGraceMs: config.killGraceMs,
  }
  const service = new AdapterService(runner, observer, {
    bridge: {
      executable: config.bridgePath,
      prefixArgs: config.bridgeArgs,
      ...(config.workingDirectory === undefined ? {} : { cwd: config.workingDirectory }),
    },
    descriptorLimits: {
      ...commonLimits,
      timeoutMs: config.descriptorTimeoutMs,
    },
    callLimits: commonLimits,
    maxConcurrentCalls: config.maxConcurrentCalls,
    maxQueuedCalls: config.maxQueuedCalls,
  })
  ledgersByContext.set(ctx, service.ledger)
  // Own the runner before awaiting discovery so an unload during async startup
  // cannot leave the descriptor child alive until its timeout.
  ctx.effect(() => () => {
    ledgersByContext.delete(ctx)
    service.dispose()
  })

  try {
    const descriptors = await service.initialize()
    const count = registerDynamicTools(ctx.tools, descriptors, service)
    await registerRuntimeSkill(ctx.skills, import.meta.url)
    ctx.logger.info(
      `[cpp-tool:ready] tools=${count} bridge=${config.bridgePath} verificationMode=${config.verificationMode}`,
    )
  } catch (error) {
    ledgersByContext.delete(ctx)
    service.dispose()
    throw error
  }
}

export type { HarnessContext, HarnessToolDefinition } from './harness-types.js'
export type { ToolDescriptor } from './protocol.js'
export { InvocationLedger } from './invocation-ledger.js'
export type { ExpectedCallPolicy, InvocationRecord, VerificationResult } from './invocation-ledger.js'
