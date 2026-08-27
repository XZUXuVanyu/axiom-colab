import { randomUUID } from 'node:crypto'

import type { Authority, LaboratoryId, Operation } from './laboratory-contract.js'
import type { MemoryServiceEndpoint } from './authenticated-memory-http.js'
import {
  AuthenticatedMemoryService,
  type ServiceMemoryGrant,
} from './authenticated-memory-service.js'
import type { TrustedInvocationSession } from './adapter-service.js'

export interface MemorySessionScope {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly actorId: LaboratoryId<'actor'>
  readonly authority: Authority
  readonly sessionGeneration: number
}

export interface MemoryToolGrantPolicy {
  readonly toolId: LaboratoryId<'tool'>
  readonly toolVersion: string
  readonly operations: readonly Operation[]
  readonly maxOperations: number
  readonly maxRequestBytes: number
  readonly lifetimeMs: number
}

export interface MemorySessionProviderOptions {
  readonly service: AuthenticatedMemoryService
  readonly endpoint: MemoryServiceEndpoint
  readonly scope: MemorySessionScope
  readonly policyForTool: (toolName: string) => MemoryToolGrantPolicy | undefined
  readonly now?: () => Date
}

export class MemorySessionProvider {
  private readonly now: () => Date

  constructor(private readonly options: MemorySessionProviderOptions) {
    this.now = options.now ?? (() => new Date())
    const endpoint = new URL(options.endpoint.invokeUrl)
    if (endpoint.protocol !== 'http:'
      || (endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== '[::1]' && endpoint.hostname !== '::1')) {
      throw new TypeError('memory endpoint must use HTTP on a numeric loopback address')
    }
  }

  create(toolName: string, callId: string): TrustedInvocationSession | undefined {
    const policy = this.options.policyForTool(toolName)
    if (policy === undefined) return undefined
    if (!Number.isSafeInteger(policy.lifetimeMs) || policy.lifetimeMs <= 0) {
      throw new TypeError('memory grant lifetimeMs must be a positive safe integer')
    }
    const issuedAt = this.now()
    const grant: ServiceMemoryGrant = {
      protocolVersion: '1.0',
      capabilityId: `capability:${randomUUID()}` as LaboratoryId<'capability'>,
      workspaceId: this.options.scope.workspaceId,
      actorId: this.options.scope.actorId,
      toolId: policy.toolId,
      toolVersion: policy.toolVersion,
      callId: callId as LaboratoryId<'call'>,
      operations: [...policy.operations],
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + policy.lifetimeMs).toISOString(),
      nonce: randomUUID(),
      sessionGeneration: this.options.scope.sessionGeneration,
      maxOperations: policy.maxOperations,
      maxRequestBytes: policy.maxRequestBytes,
    }
    const issued = this.options.service.issueGrant(grant, this.options.scope.authority)
    let revoked = false
    return {
      envelope: {
        protocolVersion: '1.0',
        workspaceId: grant.workspaceId,
        actorId: grant.actorId,
        toolId: grant.toolId,
        toolName,
        toolVersion: grant.toolVersion,
        callId,
        sessionGeneration: grant.sessionGeneration,
        memoryGrant: {
          ...grant,
          endpoint: this.options.endpoint.invokeUrl,
          bearerToken: issued.bearerToken,
        },
      },
      revoke: () => {
        if (revoked) return
        revoked = true
        this.options.service.revoke(grant.capabilityId)
      },
    }
  }
}
