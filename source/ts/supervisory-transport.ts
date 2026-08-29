import type { JsonValue } from './harness-types.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { SupervisoryToolExecution, SupervisoryWorkspaceSnapshot } from './supervisory-application.js'

export const SUPERVISORY_TRANSPORT_VERSION = '1.1' as const

export interface SupervisoryTransportHost {
  workspaces(): readonly LaboratoryId<'workspace'>[]
  goals(workspaceId: LaboratoryId<'workspace'>): readonly LaboratoryId<'goal'>[]
  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot>
  executeTool(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>, tool: string, args: Record<string, JsonValue>): Promise<SupervisoryToolExecution>
}

type Request =
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'list-workspaces' }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'list-goals'; readonly workspaceId: LaboratoryId<'workspace'> }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'inspect'; readonly workspaceId: LaboratoryId<'workspace'>; readonly goalId: LaboratoryId<'goal'> | null }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'execute-tool'; readonly workspaceId: LaboratoryId<'workspace'>; readonly goalId: LaboratoryId<'goal'>; readonly tool: string; readonly arguments: Record<string, JsonValue> }

interface ErrorPayload { readonly code: string; readonly message: string }
type Response =
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly ok: true; readonly result: JsonValue }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string | null; readonly ok: false; readonly error: ErrorPayload }

export class SupervisoryTransportError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'SupervisoryTransportError'
  }
}

function fail(code: string, message: string): never { throw new SupervisoryTransportError(code, message) }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

function exact(value: Record<string, unknown>, fields: readonly string[]): void {
  const allowed = new Set(fields)
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail('INVALID_REQUEST', `request contains unknown field ${key}`)
  for (const key of fields) if (!(key in value)) fail('INVALID_REQUEST', `request is missing field ${key}`)
}

function parseRequest(text: string, maxBytes: number): Request {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) fail('REQUEST_TOO_LARGE', `request exceeds ${maxBytes} bytes`)
  let value: unknown
  try { value = JSON.parse(text) } catch { fail('MALFORMED_REQUEST', 'request is not valid JSON') }
  if (!record(value)) fail('INVALID_REQUEST', 'request must be an object')
  if (value.protocolVersion !== SUPERVISORY_TRANSPORT_VERSION) fail('UNSUPPORTED_PROTOCOL_VERSION', 'supervisory protocol version is unsupported')
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 128) fail('INVALID_REQUEST_ID', 'request id must contain 1..128 characters')
  if (value.operation === 'list-workspaces') {
    exact(value, ['protocolVersion', 'id', 'operation'])
    return value as unknown as Request
  }
  if (value.operation === 'list-goals') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    return value as unknown as Request
  }
  if (value.operation === 'inspect') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'goalId'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (value.goalId !== null && (typeof value.goalId !== 'string' || !/^goal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.goalId))) fail('INVALID_GOAL_ID', 'goal identity is malformed')
    return value as unknown as Request
  }
  if (value.operation === 'execute-tool') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'goalId', 'tool', 'arguments'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (typeof value.goalId !== 'string' || !/^goal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.goalId)) fail('INVALID_GOAL_ID', 'goal identity is malformed')
    if (typeof value.tool !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(value.tool)) fail('INVALID_TOOL_NAME', 'Tool name is malformed')
    if (!record(value.arguments)) fail('INVALID_TOOL_ARGUMENTS', 'Tool arguments must be an object')
    return value as unknown as Request
  }
  fail('UNKNOWN_OPERATION', 'supervisory operation is unknown')
}

function code(error: unknown): string {
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code : 'INTERNAL_ERROR'
}

function recoverRequestId(text: string): string | null {
  try {
    const value = JSON.parse(text) as unknown
    return record(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128 ? value.id : null
  } catch { return null }
}

export class SupervisoryTransport {
  constructor(private readonly host: SupervisoryTransportHost, private readonly maxRequestBytes = 64 * 1024) {
    if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 256) fail('INVALID_TRANSPORT_LIMIT', 'maxRequestBytes must be a safe integer of at least 256')
  }

  async handle(text: string): Promise<string> {
    let request: Request
    try { request = parseRequest(text, this.maxRequestBytes) } catch (error) {
      return JSON.stringify(this.failure(recoverRequestId(text), code(error), error instanceof Error ? error.message : String(error)))
    }
    try {
      const result = request.operation === 'list-workspaces'
        ? { workspaces: [...this.host.workspaces()] }
        : request.operation === 'list-goals'
          ? { workspaceId: request.workspaceId, goals: [...this.host.goals(request.workspaceId)] }
          : request.operation === 'inspect'
            ? await this.host.inspect(request.workspaceId, request.goalId)
            : await this.host.executeTool(request.workspaceId, request.goalId, request.tool, request.arguments)
      const response: Response = { protocolVersion: SUPERVISORY_TRANSPORT_VERSION, id: request.id, ok: true, result: result as JsonValue }
      return JSON.stringify(response)
    } catch (error) {
      return JSON.stringify(this.failure(request.id, code(error), error instanceof Error ? error.message : String(error)))
    }
  }

  private failure(id: string | null, errorCode: string, message: string): Response {
    return { protocolVersion: SUPERVISORY_TRANSPORT_VERSION, id, ok: false, error: { code: errorCode, message } }
  }
}
