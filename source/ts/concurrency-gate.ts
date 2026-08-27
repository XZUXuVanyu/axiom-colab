import { ProcessExecutionError } from './process-runner.js'

interface Waiter {
  readonly resolve: (release: () => void) => void
  readonly reject: (error: ProcessExecutionError) => void
  readonly signal?: AbortSignal
  readonly onAbort: () => void
}

export class ConcurrencyGate {
  private active = 0
  private readonly queue: Waiter[] = []
  private disposed = false

  constructor(private readonly limit: number, private readonly maxQueued: number) {}

  get activeCount(): number { return this.active }
  get queuedCount(): number { return this.queue.length }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.disposed) throw new ProcessExecutionError('DISPOSED', 'concurrency gate is disposed')
    if (signal?.aborted === true) throw new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled while queued')
    if (this.active < this.limit) return this.admit()
    if (this.queue.length >= this.maxQueued) {
      throw new ProcessExecutionError('BACKPRESSURE', `Bridge queue limit of ${this.maxQueued} was reached`)
    }
    return await new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.queue.indexOf(waiter)
          if (index >= 0) this.queue.splice(index, 1)
          reject(new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled while queued'))
        },
      }
      this.queue.push(waiter)
      signal?.addEventListener('abort', waiter.onAbort, { once: true })
      if (signal?.aborted === true) waiter.onAbort()
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const waiter of this.queue.splice(0)) {
      waiter.signal?.removeEventListener('abort', waiter.onAbort)
      waiter.reject(new ProcessExecutionError('DISPOSED', 'concurrency gate disposed while call was queued'))
    }
  }

  private admit(): () => void {
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      while (!this.disposed && this.active < this.limit && this.queue.length > 0) {
        const waiter = this.queue.shift()!
        waiter.signal?.removeEventListener('abort', waiter.onAbort)
        if (waiter.signal?.aborted === true) continue
        waiter.resolve(this.admit())
      }
    }
  }
}
