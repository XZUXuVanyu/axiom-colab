import type { JsonValue } from './harness-types.js'
import { DescriptorLoader, type BridgeLocation } from './descriptor-loader.js'
import { ToolObserver } from './observer.js'
import { ConcurrencyGate } from './concurrency-gate.js'
import { InvocationLedger } from './invocation-ledger.js'
import {
  ProcessExecutionError,
  ProcessRunner,
  type ProcessLimits,
} from './process-runner.js'
import {
  BridgeToolError,
  errorCode,
  makeToolCallRequest,
  parseToolCallResponse,
  type ToolDescriptor,
} from './protocol.js'

export interface AdapterServiceConfig {
  readonly bridge: BridgeLocation
  readonly descriptorLimits: ProcessLimits
  readonly callLimits: Omit<ProcessLimits, 'timeoutMs'>
  readonly maxConcurrentCalls?: number
  readonly maxQueuedCalls?: number
}

export class AdapterService {
  private readonly descriptorsByName = new Map<string, ToolDescriptor>()
  readonly ledger: InvocationLedger
  private readonly gate: ConcurrencyGate
  private disposed = false

  constructor(
    private readonly runner: ProcessRunner,
    private readonly observer: ToolObserver,
    private readonly config: AdapterServiceConfig,
  ) {
    this.ledger = new InvocationLedger()
    this.gate = new ConcurrencyGate(config.maxConcurrentCalls ?? 4, config.maxQueuedCalls ?? 32)
  }

  async initialize(signal?: AbortSignal): Promise<ToolDescriptor[]> {
    if (this.disposed) {
      throw new ProcessExecutionError('DISPOSED', 'adapter service is disposed')
    }
    const descriptors = await new DescriptorLoader(
      this.runner,
      this.config.bridge,
      this.config.descriptorLimits,
      this.observer,
    ).load(signal)
    this.descriptorsByName.clear()
    for (const descriptor of descriptors) this.descriptorsByName.set(descriptor.name, descriptor)
    return descriptors
  }

  async invoke(
    toolName: string,
    args: unknown,
    callId: string,
    signal: AbortSignal,
  ): Promise<JsonValue> {
    if (this.disposed) {
      throw new ProcessExecutionError('DISPOSED', 'adapter service is disposed')
    }
    const descriptor = this.descriptorsByName.get(toolName)
    if (descriptor === undefined) {
      const error = new BridgeToolError({
        code: 'UNKNOWN_TOOL',
        message: `Adapter has no descriptor for ${toolName}`,
        details: { tool: toolName },
      })
      this.ledger.start(callId, toolName)
      this.observer.start(callId, toolName, args)
      this.ledger.fail(callId, 0, error.code, true)
      this.observer.error(callId, toolName, 0, null, error.code, error.message)
      throw error
    }
    const startedAt = performance.now()
    this.ledger.start(callId, toolName)
    this.observer.start(callId, toolName, args)
    let release: (() => void) | undefined
    try {
      const request = makeToolCallRequest(callId, toolName, args)
      release = await this.gate.acquire(signal)
      const process = await this.runner.run(this.config.bridge.executable, {
        ...this.config.callLimits,
        timeoutMs: descriptor.timeoutMs,
        args: this.config.bridge.prefixArgs,
        cwd: this.config.bridge.cwd,
        signal,
        stdin: JSON.stringify(request),
      })
      this.observer.diagnostic(`${callId}:${toolName}`, process.stderr)
      const response = parseToolCallResponse(process.stdout, callId)
      this.observer.success(callId, toolName, process.durationMs, process.exitCode, response.result)
      this.ledger.succeed(callId, performance.now() - startedAt)
      return response.result
    } catch (error) {
      const exitCode = error instanceof ProcessExecutionError ? error.exitCode : null
      if (error instanceof ProcessExecutionError) {
        this.observer.diagnostic(`${callId}:${toolName}`, error.stderr)
      }
      const message = error instanceof Error ? error.message : String(error)
      const code = errorCode(error)
      this.ledger.fail(callId, performance.now() - startedAt, code, code === 'BACKPRESSURE')
      this.observer.error(
        callId,
        toolName,
        performance.now() - startedAt,
        exitCode,
        code,
        message,
      )
      throw error
    } finally {
      release?.()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.runner.dispose()
    this.gate.dispose()
    this.descriptorsByName.clear()
  }
}

export { ProcessRunner, ToolObserver }
