import type { JsonValue } from './harness-types.js'
import type { CandidateFile, ValidationCommand } from './candidate-validation.js'
import type { LaboratoryId } from './laboratory-contract.js'
import type { SupervisoryToolExecution, SupervisoryWorkspaceSnapshot } from './supervisory-application.js'
import type { HiddenChallengeValidationResult } from './local-application-host.js'
import type { CandidateRevision, ToolSpecification, ToolSpecificationInput } from './tool-workshop.js'

export const SUPERVISORY_TRANSPORT_VERSION = '1.1' as const

export interface SupervisoryTransportHost {
  workspaces(): readonly LaboratoryId<'workspace'>[]
  goals(workspaceId: LaboratoryId<'workspace'>): readonly LaboratoryId<'goal'>[]
  inspect(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'> | null): Promise<SupervisoryWorkspaceSnapshot>
  executeTool(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>, tool: string, args: Record<string, JsonValue>): Promise<SupervisoryToolExecution>
  decideInstallation(workspaceId: LaboratoryId<'workspace'>, proposalId: LaboratoryId<'proposal'>, proposalHash: `sha256:${string}`, decision: 'approved' | 'rejected'): Promise<JsonValue>
  submitHiddenChallenge(workspaceId: LaboratoryId<'workspace'>, revisionId: LaboratoryId<'evidence'>, candidateHash: `sha256:${string}`, fixtures: readonly CandidateFile[], commands: readonly ValidationCommand[]): Promise<HiddenChallengeValidationResult>
  reviseCandidate(workspaceId: LaboratoryId<'workspace'>, parentRevisionId: LaboratoryId<'evidence'>, parentCandidateHash: `sha256:${string}`, descriptor: unknown, sources: readonly CandidateFile[]): CandidateRevision
  createCandidate(workspaceId: LaboratoryId<'workspace'>, specification: ToolSpecificationInput, descriptor: unknown, sources: readonly CandidateFile[]): { readonly specification: ToolSpecification; readonly candidate: CandidateRevision }
}

type Request =
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'list-workspaces' }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'list-goals'; readonly workspaceId: LaboratoryId<'workspace'> }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'inspect'; readonly workspaceId: LaboratoryId<'workspace'>; readonly goalId: LaboratoryId<'goal'> | null }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'execute-tool'; readonly workspaceId: LaboratoryId<'workspace'>; readonly goalId: LaboratoryId<'goal'>; readonly tool: string; readonly arguments: Record<string, JsonValue> }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'decide-installation'; readonly workspaceId: LaboratoryId<'workspace'>; readonly proposalId: LaboratoryId<'proposal'>; readonly proposalHash: `sha256:${string}`; readonly decision: 'approved' | 'rejected' }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'submit-hidden-challenge'; readonly workspaceId: LaboratoryId<'workspace'>; readonly revisionId: LaboratoryId<'evidence'>; readonly candidateHash: `sha256:${string}`; readonly fixtures: readonly CandidateFile[]; readonly commands: readonly ValidationCommand[] }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'revise-candidate'; readonly workspaceId: LaboratoryId<'workspace'>; readonly parentRevisionId: LaboratoryId<'evidence'>; readonly parentCandidateHash: `sha256:${string}`; readonly descriptor: unknown; readonly sources: readonly CandidateFile[] }
  | { readonly protocolVersion: typeof SUPERVISORY_TRANSPORT_VERSION; readonly id: string; readonly operation: 'create-candidate'; readonly workspaceId: LaboratoryId<'workspace'>; readonly specification: ToolSpecificationInput; readonly descriptor: unknown; readonly sources: readonly CandidateFile[] }

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

function parseHiddenFixtures(value: unknown): readonly CandidateFile[] {
  if (!Array.isArray(value) || value.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge fixtures must not be empty')
  return value.map((item, index) => {
    if (!record(item)) fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} must be an object`)
    exact(item, ['path', 'contentBase64'])
    if (typeof item.path !== 'string' || typeof item.contentBase64 !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.contentBase64)) {
      fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} is malformed`)
    }
    const content = Buffer.from(item.contentBase64, 'base64')
    if (content.toString('base64') !== item.contentBase64) fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} is not canonical base64`)
    return { path: item.path, content }
  })
}

function parseCandidateSources(value: unknown): readonly CandidateFile[] {
  if (!Array.isArray(value) || value.length === 0) fail('INVALID_CANDIDATE_SOURCE', 'candidate sources must not be empty')
  return value.map((item, index) => {
    if (!record(item)) fail('INVALID_CANDIDATE_SOURCE', `source ${index} must be an object`)
    exact(item, ['path', 'contentBase64'])
    if (typeof item.path !== 'string' || typeof item.contentBase64 !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.contentBase64)) fail('INVALID_CANDIDATE_SOURCE', `source ${index} is malformed`)
    const content = Buffer.from(item.contentBase64, 'base64')
    if (content.toString('base64') !== item.contentBase64) fail('INVALID_CANDIDATE_SOURCE', `source ${index} is not canonical base64`)
    return { path: item.path, content }
  })
}

function parseSpecification(value: unknown): ToolSpecificationInput {
  if (!record(value)) fail('INVALID_TOOL_SPECIFICATION', 'Tool specification must be an object')
  const required = ['problem', 'publicName', 'description', 'inputSchema', 'outputSchema', 'requestedPermissions', 'acceptanceCriteria']
  const fields = 'constraints' in value ? [...required, 'constraints'] : required
  exact(value, fields)
  if (typeof value.problem !== 'string' || typeof value.publicName !== 'string'
      || typeof value.description !== 'string' || !Array.isArray(value.requestedPermissions)
      || !value.requestedPermissions.every((item) => typeof item === 'string')
      || !Array.isArray(value.acceptanceCriteria)
      || !value.acceptanceCriteria.every((item) => typeof item === 'string')
      || ('constraints' in value && (!Array.isArray(value.constraints)
        || !value.constraints.every((item) => typeof item === 'string')))) {
    fail('INVALID_TOOL_SPECIFICATION', 'Tool specification fields are malformed')
  }
  return value as unknown as ToolSpecificationInput
}

function parseHiddenCommands(value: unknown): readonly ValidationCommand[] {
  if (!Array.isArray(value) || value.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge commands must not be empty')
  return value.map((item, index) => {
    if (!record(item)) fail('INVALID_HIDDEN_CHALLENGE', `challenge command ${index} must be an object`)
    exact(item, ['commandId', 'executable', 'args', 'cwd'])
    if (typeof item.commandId !== 'string' || typeof item.executable !== 'string'
        || !Array.isArray(item.args) || !item.args.every((arg) => typeof arg === 'string')
        || typeof item.cwd !== 'string') fail('INVALID_HIDDEN_CHALLENGE', `challenge command ${index} is malformed`)
    return { commandId: item.commandId, executable: item.executable, args: [...item.args], cwd: item.cwd }
  })
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
  if (value.operation === 'decide-installation') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'proposalId', 'proposalHash', 'decision'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (typeof value.proposalId !== 'string' || !/^proposal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.proposalId)) fail('INVALID_PROPOSAL_ID', 'proposal identity is malformed')
    if (typeof value.proposalHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.proposalHash)) fail('INVALID_PROPOSAL_HASH', 'proposal hash is malformed')
    if (value.decision !== 'approved' && value.decision !== 'rejected') fail('INVALID_DECISION', 'decision must be approved or rejected')
    return value as unknown as Request
  }
  if (value.operation === 'submit-hidden-challenge') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'revisionId', 'candidateHash', 'fixtures', 'commands'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (typeof value.revisionId !== 'string' || !/^evidence:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.revisionId)) fail('INVALID_REVISION_ID', 'candidate revision identity is malformed')
    if (typeof value.candidateHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.candidateHash)) fail('INVALID_CANDIDATE_HASH', 'candidate hash is malformed')
    return { ...value, fixtures: parseHiddenFixtures(value.fixtures), commands: parseHiddenCommands(value.commands) } as unknown as Request
  }
  if (value.operation === 'revise-candidate') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'parentRevisionId', 'parentCandidateHash', 'descriptor', 'sources'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (typeof value.parentRevisionId !== 'string' || !/^evidence:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.parentRevisionId)) fail('INVALID_REVISION_ID', 'parent revision identity is malformed')
    if (typeof value.parentCandidateHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.parentCandidateHash)) fail('INVALID_CANDIDATE_HASH', 'parent candidate hash is malformed')
    if (!record(value.descriptor)) fail('INVALID_CANDIDATE_DESCRIPTOR', 'candidate descriptor must be an object')
    return { ...value, sources: parseCandidateSources(value.sources) } as unknown as Request
  }
  if (value.operation === 'create-candidate') {
    exact(value, ['protocolVersion', 'id', 'operation', 'workspaceId', 'specification', 'descriptor', 'sources'])
    if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
    if (!record(value.descriptor)) fail('INVALID_CANDIDATE_DESCRIPTOR', 'candidate descriptor must be an object')
    return { ...value, specification: parseSpecification(value.specification), sources: parseCandidateSources(value.sources) } as unknown as Request
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
            : request.operation === 'execute-tool'
              ? await this.host.executeTool(request.workspaceId, request.goalId, request.tool, request.arguments)
              : request.operation === 'decide-installation'
                ? await this.host.decideInstallation(request.workspaceId, request.proposalId, request.proposalHash, request.decision)
                : request.operation === 'submit-hidden-challenge'
                  ? await this.host.submitHiddenChallenge(request.workspaceId, request.revisionId, request.candidateHash, request.fixtures, request.commands)
                  : request.operation === 'revise-candidate'
                    ? this.host.reviseCandidate(request.workspaceId, request.parentRevisionId, request.parentCandidateHash, request.descriptor, request.sources)
                    : this.host.createCandidate(request.workspaceId, request.specification, request.descriptor, request.sources)
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
