import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { delimiter, dirname, isAbsolute } from 'node:path'

export interface ProcessLimits {
  readonly timeoutMs: number
  readonly maxStdinBytes: number
  readonly maxStdoutBytes: number
  readonly maxStderrBytes: number
  readonly killGraceMs: number
}

export interface ProcessRunOptions extends ProcessLimits {
  readonly args?: readonly string[]
  readonly stdin?: string
  readonly signal?: AbortSignal
  readonly cwd?: string
  readonly pathPrepend?: readonly string[]
}

export interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly durationMs: number
}

export class ProcessExecutionError extends Error {
  readonly code: string
  readonly exitCode: number | null
  readonly signalName: NodeJS.Signals | null
  readonly stderr: string
  readonly stdout: string
  readonly durationMs: number | null

  constructor(
    code: string,
    message: string,
    options: {
      exitCode?: number | null
      signalName?: NodeJS.Signals | null
      stderr?: string
      stdout?: string
      durationMs?: number | null
    } = {},
  ) {
    super(`[${code}] ${message}`)
    this.name = 'ProcessExecutionError'
    this.code = code
    this.exitCode = options.exitCode ?? null
    this.signalName = options.signalName ?? null
    this.stderr = options.stderr ?? ''
    this.stdout = options.stdout ?? ''
    this.durationMs = options.durationMs ?? null
  }
}

interface ActiveProcess {
  fail(error: ProcessExecutionError): void
}

function bytes(chunks: Buffer[]): string {
  return Buffer.concat(chunks).toString('utf8')
}

function childEnvironment(executable: string, pathPrepend: readonly string[] = []): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return process.env
  const environment: NodeJS.ProcessEnv = {}
  let path: string | undefined
  for (const [name, value] of Object.entries(process.env)) {
    if (name.toLowerCase() === 'path') {
      if (name === 'Path' || path === undefined) path = value
    } else {
      environment[name] = value
    }
  }
  const directories = [isAbsolute(executable) ? dirname(executable) : null, ...pathPrepend]
    .filter((item): item is string => item !== null)
  if (directories.length > 0) {
    const prefix = directories.join(delimiter)
    path = path === undefined ? prefix : `${prefix}${delimiter}${path}`
  }
  if (path !== undefined) environment.Path = path
  return environment
}

export class ProcessRunner {
  private readonly active = new Map<ChildProcessWithoutNullStreams, ActiveProcess>()
  private disposed = false

  get activeCount(): number {
    return this.active.size
  }

  async run(executable: string, options: ProcessRunOptions): Promise<ProcessResult> {
    if (this.disposed) {
      throw new ProcessExecutionError('DISPOSED', 'process runner is disposed')
    }
    if (options.signal?.aborted) {
      throw new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled before spawn')
    }
    const input = options.stdin ?? ''
    if (Buffer.byteLength(input) > options.maxStdinBytes) {
      throw new ProcessExecutionError('STDIN_LIMIT', `stdin exceeds ${options.maxStdinBytes} bytes`)
    }

    return await new Promise<ProcessResult>((resolve, reject) => {
      const startedAt = performance.now()
      const child = spawn(executable, [...(options.args ?? [])], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: options.cwd,
        env: childEnvironment(executable, options.pathPrepend),
      })
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let pendingError: ProcessExecutionError | undefined
      let settled = false
      let killTimer: NodeJS.Timeout | undefined

      const terminate = (): void => {
        if (child.exitCode !== null || child.signalCode !== null) return
        child.kill()
        killTimer = setTimeout(() => {
          if (this.active.has(child) && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
          }
        }, options.killGraceMs)
        killTimer.unref()
      }

      const fail = (error: ProcessExecutionError): void => {
        pendingError ??= error
        terminate()
      }

      const cleanup = (): void => {
        if (killTimer !== undefined) clearTimeout(killTimer)
        clearTimeout(timeoutTimer)
        options.signal?.removeEventListener('abort', onAbort)
        this.active.delete(child)
      }

      const finish = (
        code: number | null,
        signalName: NodeJS.Signals | null,
      ): void => {
        if (settled) return
        settled = true
        cleanup()
        const stdout = bytes(stdoutChunks)
        const stderr = bytes(stderrChunks)
        if (pendingError !== undefined) {
          reject(new ProcessExecutionError(pendingError.code, pendingError.message.replace(/^\[[^\]]+\]\s*/, ''), {
            exitCode: code,
            signalName,
            stderr,
            stdout,
            durationMs: performance.now() - startedAt,
          }))
          return
        }
        if (signalName !== null) {
          reject(new ProcessExecutionError('WORKER_TERMINATED', `Bridge was terminated by ${signalName}`, {
            exitCode: code,
            signalName,
            stderr,
            stdout,
            durationMs: performance.now() - startedAt,
          }))
          return
        }
        if (code !== 0) {
          reject(new ProcessExecutionError('NON_ZERO_EXIT', `Bridge exited with code ${String(code)}`, {
            exitCode: code,
            stderr,
            stdout,
            durationMs: performance.now() - startedAt,
          }))
          return
        }
        resolve({
          stdout,
          stderr,
          exitCode: 0,
          durationMs: performance.now() - startedAt,
        })
      }

      const onAbort = (): void => {
        fail(new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled'))
      }
      const timeoutTimer = setTimeout(() => {
        fail(new ProcessExecutionError('TIMEOUT', `Bridge exceeded ${options.timeoutMs} ms`))
      }, options.timeoutMs)
      timeoutTimer.unref()

      this.active.set(child, { fail })
      options.signal?.addEventListener('abort', onAbort, { once: true })
      // Close the check/listener race: adding an abort listener to an already
      // aborted signal does not replay the event.
      if (options.signal?.aborted === true) onAbort()

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length
        if (stdoutBytes > options.maxStdoutBytes) {
          fail(new ProcessExecutionError('STDOUT_LIMIT', `stdout exceeds ${options.maxStdoutBytes} bytes`))
          return
        }
        stdoutChunks.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > options.maxStderrBytes) {
          fail(new ProcessExecutionError('STDERR_LIMIT', `stderr exceeds ${options.maxStderrBytes} bytes`))
          return
        }
        stderrChunks.push(chunk)
      })
      child.on('error', (error) => {
        fail(new ProcessExecutionError('SPAWN_FAILED', `could not start Bridge: ${error.message}`))
      })
      child.on('close', finish)
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') {
          fail(new ProcessExecutionError('STDIN_WRITE_FAILED', error.message))
        }
      })
      child.stdin.end(input, 'utf8')
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const process of this.active.values()) {
      process.fail(new ProcessExecutionError('DISPOSED', 'Adapter disposed while Bridge was running'))
    }
  }
}
