import type { HarnessLogger, JsonValue } from './harness-types.js'

const sensitiveKey = /(?:password|passwd|token|secret|api[-_]?key|authorization|credential)/i

export interface ObserverConfig {
  readonly maxLogChars: number
}

function sanitize(value: unknown, maxChars: number): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(value, (key, candidate: unknown) => {
    if (sensitiveKey.test(key)) return '[REDACTED]'
    if (typeof candidate === 'object' && candidate !== null) {
      if (seen.has(candidate)) return '[CIRCULAR]'
      seen.add(candidate)
    }
    return candidate
  }) ?? String(value)
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`
}

export class ToolObserver {
  constructor(
    private readonly logger: HarnessLogger,
    private readonly config: ObserverConfig,
  ) {}

  start(callId: string, tool: string, args: unknown): void {
    this.logger.info(`[cpp-tool:start] callId=${callId} tool=${tool} arguments=${sanitize(args, this.config.maxLogChars)}`)
  }

  success(
    callId: string,
    tool: string,
    durationMs: number,
    exitCode: number,
    result: JsonValue,
  ): void {
    this.logger.info(`[cpp-tool:success] callId=${callId} tool=${tool} durationMs=${durationMs.toFixed(1)} exitCode=${exitCode} result=${sanitize(result, this.config.maxLogChars)}`)
  }

  error(
    callId: string,
    tool: string,
    durationMs: number,
    exitCode: number | null,
    code: string,
    message: string,
  ): void {
    this.logger.error(`[cpp-tool:error] callId=${callId} tool=${tool} durationMs=${durationMs.toFixed(1)} exitCode=${exitCode === null ? 'null' : exitCode} errorCode=${code} message=${sanitize(message, this.config.maxLogChars)}`)
  }

  diagnostic(subject: string, stderr: string): void {
    const trimmed = stderr.trim()
    if (trimmed.length > 0) {
      this.logger.warn(`[cpp-tool:stderr] subject=${subject} diagnostic=${sanitize(trimmed, this.config.maxLogChars)}`)
    }
  }
}
