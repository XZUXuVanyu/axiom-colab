import {
  ProcessExecutionError,
  ProcessRunner,
  type ProcessLimits,
} from './process-runner.js'
import { parseDescribeToolsResponse, type ToolDescriptor } from './protocol.js'
import type { ToolObserver } from './observer.js'

export interface BridgeLocation {
  readonly executable: string
  readonly prefixArgs: readonly string[]
  readonly cwd?: string
}

export class DescriptorLoader {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly bridge: BridgeLocation,
    private readonly limits: ProcessLimits,
    private readonly observer: ToolObserver,
  ) {}

  async load(signal?: AbortSignal): Promise<ToolDescriptor[]> {
    try {
      const process = await this.runner.run(this.bridge.executable, {
        ...this.limits,
        args: [...this.bridge.prefixArgs, '--describe-tools'],
        cwd: this.bridge.cwd,
        signal,
      })
      this.observer.diagnostic('describe-tools', process.stderr)
      return parseDescribeToolsResponse(process.stdout).tools
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        this.observer.diagnostic('describe-tools', error.stderr)
      }
      throw error
    }
  }
}
