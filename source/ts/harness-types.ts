export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonSchema = boolean | { [key: string]: JsonValue }

export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface HarnessToolExecution {
  readonly callId: unknown
  readonly signal: AbortSignal
}

export interface HarnessToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, JsonValue>
  readonly output: {
    readonly schema: JsonSchema
    render(args: unknown, value: JsonValue): TextContentBlock[]
  }
  readonly timeoutMs?: number
  isConcurrencySafe?(args: unknown): boolean
  execute(args: unknown, execution: HarnessToolExecution): Promise<JsonValue>

  // Retained as adapter metadata. rc.5 does not consume this field directly;
  // the generic description projection also exposes it to the model.
  readonly sideEffect?: boolean
}

export interface HarnessToolRegistry {
  register(definition: HarnessToolDefinition): () => void
}

export interface RuntimeSkillDefinition {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly source: 'runtime'
  readonly content: string
  readonly invocation?: {
    readonly modelInvocable: boolean
    readonly userInvocable: boolean
  }
}

export interface HarnessSkillRegistry {
  register(definition: RuntimeSkillDefinition): () => void
}

export interface HarnessLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface HarnessContext {
  readonly tools: HarnessToolRegistry
  readonly skills: HarnessSkillRegistry
  readonly logger: HarnessLogger
  effect(factory: () => void | (() => void)): () => void
}
