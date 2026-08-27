import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { authorize, ContractError } from './laboratory-contract.js'
import type {
  Authority,
  CapabilityGrant,
  LaboratoryId,
  Operation,
  TrustedInvocationContext,
} from './laboratory-contract.js'
import {
  MemoryWorkflowError,
  MemoryWorkflows,
  type ArtifactProvenance,
  type WorkflowInvocation,
} from './memory-workflows.js'

const MEMORY_OPERATIONS = new Set<Operation>([
  'compute.create', 'compute.read', 'compute.update', 'compute.snapshot',
  'compute.release', 'working.read', 'working.propose', 'artifact.read',
  'artifact.create', 'artifact.derive',
])

export interface ServiceMemoryGrant extends CapabilityGrant {
  readonly toolId: LaboratoryId<'tool'>
  readonly callId: LaboratoryId<'call'>
  readonly toolVersion: string
  readonly sessionGeneration: number
  readonly maxOperations: number
  readonly maxRequestBytes: number
}

export interface IssuedMemoryGrant {
  readonly grant: ServiceMemoryGrant
  readonly bearerToken: string
}

export interface MemoryServiceRequest {
  readonly capabilityId: LaboratoryId<'capability'>
  readonly bearerToken: string
  readonly context: TrustedInvocationContext
  readonly toolVersion: string
  readonly sessionGeneration: number
  readonly operation: Operation
  readonly request: Record<string, unknown>
}

interface GrantState {
  readonly grant: ServiceMemoryGrant
  readonly authority: Authority
  readonly tokenHash: Buffer
  operationsUsed: number
  revoked: boolean
}

export class AuthenticatedMemoryServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'AuthenticatedMemoryServiceError'
  }
}

function fail(code: string, message: string): never {
  throw new AuthenticatedMemoryServiceError(code, message)
}

function positiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail('INVALID_CAPABILITY', `${field} must be a positive safe integer`)
  }
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

function authenticate(expected: Buffer, token: string): void {
  const actual = tokenHash(token)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail('MEMORY_AUTHENTICATION_FAILED', 'memory-service bearer token is invalid')
  }
}

function record(value: unknown, field = 'request'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_MEMORY_REQUEST', `${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_MEMORY_REQUEST', `${field} must be a non-empty string`)
  }
  return value
}

function bytes(value: unknown, field: string): Uint8Array {
  const encoded = string(value, field)
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) {
    fail('INVALID_MEMORY_REQUEST', `${field} must be canonical base64`)
  }
  return decoded
}

function payload(value: Uint8Array): { readonly base64: string } {
  return { base64: Buffer.from(value).toString('base64') }
}

export class AuthenticatedMemoryService {
  private readonly grants = new Map<string, GrantState>()

  constructor(
    readonly workflows: MemoryWorkflows,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  issueGrant(
    grant: ServiceMemoryGrant,
    authority: Authority,
    bearerToken = randomBytes(32).toString('base64url'),
  ): IssuedMemoryGrant {
    if (this.grants.has(grant.capabilityId)) {
      fail('DUPLICATE_CAPABILITY', 'capability identity has already been issued')
    }
    if (!grant.toolVersion) fail('INVALID_CAPABILITY', 'toolVersion must not be empty')
    if (!Number.isSafeInteger(grant.sessionGeneration) || grant.sessionGeneration < 0) {
      fail('INVALID_CAPABILITY', 'sessionGeneration must be a non-negative safe integer')
    }
    positiveInteger(grant.maxOperations, 'maxOperations')
    positiveInteger(grant.maxRequestBytes, 'maxRequestBytes')
    if (grant.operations.length === 0
      || grant.operations.some((operation) => !MEMORY_OPERATIONS.has(operation))) {
      fail('INVALID_CAPABILITY', 'grant contains no operations or a non-Tool memory operation')
    }
    // Validate identity, time window, and at least one operation before storing.
    authorize({
      workspaceId: grant.workspaceId, actorId: grant.actorId,
      toolId: grant.toolId, callId: grant.callId,
    }, grant, grant.operations[0], this.clock().toISOString())
    this.grants.set(grant.capabilityId, {
      grant, authority, tokenHash: tokenHash(bearerToken),
      operationsUsed: 0, revoked: false,
    })
    return { grant, bearerToken }
  }

  revoke(capabilityId: LaboratoryId<'capability'>): void {
    const state = this.grants.get(capabilityId)
    if (state === undefined) fail('CAPABILITY_NOT_FOUND', 'capability is unknown')
    state.revoked = true
  }

  invoke(input: MemoryServiceRequest): unknown {
    const state = this.grants.get(input.capabilityId)
    if (state === undefined) fail('CAPABILITY_NOT_FOUND', 'capability is unknown')
    authenticate(state.tokenHash, input.bearerToken)
    if (state.revoked) fail('CAPABILITY_REVOKED', 'capability has been revoked')
    if (input.toolVersion !== state.grant.toolVersion) {
      fail('TOOL_IDENTITY_MISMATCH', 'capability belongs to another Tool version')
    }
    if (input.sessionGeneration !== state.grant.sessionGeneration) {
      fail('STALE_CAPABILITY', 'capability belongs to a stale session generation')
    }
    if (!MEMORY_OPERATIONS.has(input.operation)) {
      fail('OPERATION_NOT_PERMITTED', 'operation is not available to C++ Tools')
    }
    const requestBytes = Buffer.byteLength(JSON.stringify(input.request), 'utf8')
    if (requestBytes > state.grant.maxRequestBytes) {
      fail('MEMORY_REQUEST_TOO_LARGE', 'request exceeds the grant byte quota')
    }
    if (state.operationsUsed >= state.grant.maxOperations) {
      fail('MEMORY_OPERATION_QUOTA_EXCEEDED', 'operation quota is exhausted')
    }
    // Repeat all grant/context/operation/expiry checks at the authoritative
    // boundary. MemoryWorkflows repeats them again before touching state.
    authorize(input.context, state.grant, input.operation, this.clock().toISOString())
    state.operationsUsed += 1
    const invocation: WorkflowInvocation = {
      context: input.context, capability: state.grant, authority: state.authority,
    }
    return this.dispatch(invocation, input.operation, record(input.request))
  }

  private dispatch(
    invocation: WorkflowInvocation,
    operation: Operation,
    request: Record<string, unknown>,
  ): unknown {
    switch (operation) {
      case 'compute.create':
        return this.workflows.createCompute(
          invocation, bytes(request.base64, 'request.base64'),
          request.expiresAt === null || request.expiresAt === undefined
            ? null : string(request.expiresAt, 'request.expiresAt'))
      case 'compute.read':
        return payload(this.workflows.readCompute(
          invocation, string(request.id, 'request.id') as LaboratoryId<'object'>))
      case 'compute.update':
        return this.workflows.updateCompute(
          invocation, string(request.id, 'request.id') as LaboratoryId<'object'>,
          bytes(request.base64, 'request.base64'))
      case 'compute.snapshot':
        return this.workflows.snapshotCompute(
          invocation, string(request.id, 'request.id') as LaboratoryId<'object'>)
      case 'compute.release':
        return this.workflows.releaseCompute(
          invocation, string(request.id, 'request.id') as LaboratoryId<'object'>)
      case 'working.read':
        return this.workflows.readWorking(invocation, string(request.key, 'request.key'))
      case 'working.propose':
        return this.workflows.proposeWorking(
          invocation, string(request.key, 'request.key'), request.value)
      case 'artifact.read':
        return payload(this.workflows.readArtifact(
          invocation, string(request.id, 'request.id') as LaboratoryId<'object'>))
      case 'artifact.create':
        return this.workflows.createArtifact(
          invocation, bytes(request.base64, 'request.base64'), request.schema,
          record(request.provenance, 'request.provenance') as unknown as ArtifactProvenance)
      case 'artifact.derive': {
        if (!Array.isArray(request.parentIds)) {
          fail('INVALID_MEMORY_REQUEST', 'request.parentIds must be an array')
        }
        const parentIds = request.parentIds.map((id, index) =>
          string(id, `request.parentIds[${index}]`) as LaboratoryId<'object'>)
        return this.workflows.deriveArtifact(
          invocation, parentIds, bytes(request.base64, 'request.base64'),
          request.schema,
          record(request.provenance, 'request.provenance') as unknown as ArtifactProvenance)
      }
      default:
        fail('OPERATION_NOT_PERMITTED', `operation ${operation} is not available`)
    }
  }
}

export function memoryServiceErrorCode(error: unknown): string {
  if (error instanceof AuthenticatedMemoryServiceError
    || error instanceof ContractError
    || error instanceof MemoryWorkflowError) return error.code
  return 'INTERNAL_ERROR'
}
