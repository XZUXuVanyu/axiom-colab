import type {
  HarnessToolDefinition,
  HarnessToolRegistry,
  JsonValue,
} from './harness-types.js'
import type { AdapterService } from './adapter-service.js'
import type { ToolDescriptor } from './protocol.js'
import { projectHarnessOutputSchema } from './harness-contract.js'

export {
  HarnessContractError,
  projectHarnessOutputSchema,
} from './harness-contract.js'

function renderJson(value: JsonValue): string {
  return JSON.stringify(value, null, 2)
}

export function createHarnessToolDefinition(
  descriptor: ToolDescriptor,
  service: AdapterService,
): HarnessToolDefinition {
  const description = [
    descriptor.description,
    `When to use: ${descriptor.whenToUse}`,
    descriptor.sideEffect
      ? 'Side effects: this capability declares side effects.'
      : 'Side effects: none declared.',
  ].join('\n')

  return {
    name: descriptor.name,
    description,
    parameters: descriptor.parameters,
    output: {
      schema: projectHarnessOutputSchema(descriptor.output),
      render: (_args, value) => [{ type: 'text', text: renderJson(value) }],
    },
    timeoutMs: descriptor.timeoutMs,
    isConcurrencySafe: () => descriptor.allowParallel,
    sideEffect: descriptor.sideEffect,
    async execute(args, execution) {
      return await service.invoke(
        descriptor.name,
        args,
        String(execution.callId),
        execution.signal,
      )
    },
  }
}

export function registerDynamicTools(
  registry: HarnessToolRegistry,
  descriptors: readonly ToolDescriptor[],
  service: AdapterService,
): number {
  const rollback: Array<() => void> = []
  try {
    for (const descriptor of descriptors) {
      rollback.push(registry.register(createHarnessToolDefinition(descriptor, service)))
    }
    return rollback.length
  } catch (error) {
    for (const dispose of rollback.reverse()) {
      try {
        dispose()
      } catch {
        // Preserve the registration failure; cleanup is best effort here.
      }
    }
    throw error
  }
}
