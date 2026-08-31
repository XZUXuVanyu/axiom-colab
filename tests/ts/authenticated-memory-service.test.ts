import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  AuthenticatedMemoryService,
  AuthenticatedMemoryHttpServer,
  AuthenticatedMemoryServiceError,
  ContractError,
  LocalMemoryStore,
  MemoryWorkflows,
  MemorySessionProvider,
  type Operation,
  type ServiceMemoryGrant,
} from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true })
})

function setup() {
  const root = join(tmpdir(), `axiom-memory-service-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  let now = new Date('2026-08-27T00:01:00.000Z')
  const store = new LocalMemoryStore(root, { now: () => now })
  store.createWorkspace('workspace:alpha', { maxBytes: 10_000, maxObjects: 100 })
  store.createWorkspace('workspace:beta', { maxBytes: 10_000, maxObjects: 100 })
  const workflows = new MemoryWorkflows(store, { now: () => now })
  const service = new AuthenticatedMemoryService(workflows, () => now)
  return { store, workflows, service, setNow: (value: string) => { now = new Date(value) } }
}

function grant(
  operations: readonly Operation[],
  overrides: Partial<ServiceMemoryGrant> = {},
): ServiceMemoryGrant {
  return {
    protocolVersion: '1.0', capabilityId: 'capability:service-one',
    workspaceId: 'workspace:alpha', actorId: 'actor:model',
    toolId: 'tool:memory', toolVersion: '1.2.3', callId: 'call:one',
    operations, issuedAt: '2026-08-27T00:00:00.000Z',
    expiresAt: '2026-08-27T00:05:00.000Z', nonce: 'host-nonce',
    sessionGeneration: 7, maxOperations: 8, maxRequestBytes: 1024,
    ...overrides,
  }
}

function request(
  issued: ReturnType<AuthenticatedMemoryService['issueGrant']>,
  operation: Operation,
  body: Record<string, unknown>,
) {
  return {
    capabilityId: issued.grant.capabilityId,
    bearerToken: issued.bearerToken,
    context: {
      workspaceId: issued.grant.workspaceId, actorId: issued.grant.actorId,
      toolId: issued.grant.toolId, callId: issued.grant.callId,
    },
    toolVersion: issued.grant.toolVersion,
    sessionGeneration: issued.grant.sessionGeneration,
    operation,
    request: body,
  }
}

function code(expected: string) {
  return (error: unknown) => (error instanceof AuthenticatedMemoryServiceError
    || error instanceof ContractError) && error.code === expected
}

test('separate Tool calls share persistent scoped compute state', () => {
  const { store, workflows, service } = setup()
  const issued = service.issueGrant(
    grant(['compute.create', 'compute.read']), 'model', 'secret-one')
  const created = service.invoke(request(
    issued, 'compute.create', { base64: Buffer.from('shared').toString('base64') },
  )) as { id: string }
  const read = service.invoke(request(
    issued, 'compute.read', { id: created.id },
  )) as { base64: string }
  assert.equal(Buffer.from(read.base64, 'base64').toString(), 'shared')
  workflows.close(); store.close()
})

test('service repeats authentication, scope, version, generation, and operation checks', () => {
  const { store, workflows, service } = setup()
  const issued = service.issueGrant(
    grant(['working.read'], { maxOperations: 4 }), 'model', 'secret-one')
  assert.throws(() => service.invoke({
    ...request(issued, 'working.read', { key: 'plan' }), bearerToken: 'forged',
  }), code('MEMORY_AUTHENTICATION_FAILED'))
  assert.throws(() => service.invoke({
    ...request(issued, 'working.read', { key: 'plan' }),
    context: { ...request(issued, 'working.read', {}).context, workspaceId: 'workspace:beta' },
  }), code('CROSS_WORKSPACE_ACCESS'))
  assert.throws(() => service.invoke({
    ...request(issued, 'working.read', { key: 'plan' }), toolVersion: 'changed',
  }), code('TOOL_IDENTITY_MISMATCH'))
  assert.throws(() => service.invoke({
    ...request(issued, 'working.read', { key: 'plan' }), sessionGeneration: 6,
  }), code('STALE_CAPABILITY'))
  assert.throws(() => service.invoke(request(
    issued, 'compute.read', { id: 'object:forged' },
  )), code('OPERATION_NOT_PERMITTED'))
  workflows.close(); store.close()
})

test('revocation, expiry, request bytes, and operation quotas fail closed', () => {
  const first = setup()
  const issued = first.service.issueGrant(grant(
    ['working.read'], { maxOperations: 1, maxRequestBytes: 64 },
  ), 'model', 'secret-one')
  assert.equal(first.service.invoke(request(issued, 'working.read', { key: 'plan' })), null)
  assert.throws(() => first.service.invoke(request(
    issued, 'working.read', { key: 'x'.repeat(100) },
  )), code('MEMORY_REQUEST_TOO_LARGE'))
  assert.throws(() => first.service.invoke(request(
    issued, 'working.read', { key: 'plan' },
  )), code('MEMORY_OPERATION_QUOTA_EXCEEDED'))
  first.service.revoke(issued.grant.capabilityId)
  assert.throws(() => first.service.invoke(request(
    issued, 'working.read', { key: 'plan' },
  )), code('CAPABILITY_REVOKED'))
  first.workflows.close(); first.store.close()

  const second = setup()
  const expiring = second.service.issueGrant(grant(
    ['working.read'], { capabilityId: 'capability:expiring' },
  ), 'model')
  second.setNow('2026-08-27T00:06:00.000Z')
  assert.throws(() => second.service.invoke(request(
    expiring, 'working.read', { key: 'plan' },
  )), code('CAPABILITY_EXPIRED'))
  second.workflows.close(); second.store.close()
})

test('loopback HTTP boundary authenticates and preserves structured failures', async () => {
  const { store, workflows, service } = setup()
  const issued = service.issueGrant(
    grant(['working.read'], { maxOperations: 2 }), 'model', 'secret-http')
  const server = new AuthenticatedMemoryHttpServer(service)
  const endpoint = await server.listen()
  try {
    const body = request(issued, 'working.read', { key: 'plan' })
    const { bearerToken: _secret, ...withoutSecret } = body
    const success = await fetch(endpoint.invokeUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-http', 'content-type': 'application/json' },
      body: JSON.stringify(withoutSecret),
    })
    assert.equal(success.status, 200)
    assert.deepEqual(await success.json(), { ok: true, result: null })

    const denied = await fetch(endpoint.invokeUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer forged', 'content-type': 'application/json' },
      body: JSON.stringify(withoutSecret),
    })
    assert.equal(denied.status, 401)
    assert.equal((await denied.json() as any).error.code, 'MEMORY_AUTHENTICATION_FAILED')
  } finally {
    await server.close(); workflows.close(); store.close()
  }
})

test('loopback HTTP boundary preserves authoritative payload quota failures', async () => {
  const { store, workflows, service } = setup()
  const issued = service.issueGrant(grant(['compute.create'], {
    maxOperations: 1, maxRequestBytes: 20_000,
  }), 'model', 'secret-quota')
  const server = new AuthenticatedMemoryHttpServer(service)
  const endpoint = await server.listen()
  try {
    const body = request(issued, 'compute.create', {
      base64: Buffer.alloc(10_001, 7).toString('base64'), expiresAt: null,
    })
    const { bearerToken: _secret, ...withoutSecret } = body
    const response = await fetch(endpoint.invokeUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-quota', 'content-type': 'application/json' },
      body: JSON.stringify(withoutSecret),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json() as any).error.code, 'QUOTA_EXCEEDED')
    assert.equal(store.resources('workspace:alpha').objectCount, 0)
  } finally {
    await server.close(); workflows.close(); store.close()
  }
})

test('host memory session provider issues a complete call-bound envelope and revokes it', async () => {
  const { store, workflows, service } = setup()
  const server = new AuthenticatedMemoryHttpServer(service)
  const endpoint = await server.listen()
  try {
    const provider = new MemorySessionProvider({
      service, endpoint,
      scope: {
        workspaceId: 'workspace:alpha', actorId: 'actor:model',
        authority: 'model', sessionGeneration: 7,
      },
      policyForTool: (toolName) => toolName === 'memory_tool' ? {
        toolId: 'tool:memory', toolVersion: '1.2.3',
        operations: ['working.read'], maxOperations: 2,
        maxRequestBytes: 1024, lifetimeMs: 60_000,
      } : undefined,
      now: () => new Date('2026-08-27T00:01:00.000Z'),
    })
    assert.equal(provider.create('pure_tool', 'call:pure'), undefined)
    const session = provider.create('memory_tool', 'call:provider')
    assert.ok(session)
    assert.equal(session.envelope.callId, 'call:provider')
    assert.equal(session.envelope.memoryGrant.endpoint, endpoint.invokeUrl)
    assert.equal(typeof session.envelope.memoryGrant.bearerToken, 'string')
    assert.deepEqual(session.envelope.memoryGrant.operations, ['working.read'])
    session.revoke()
    session.revoke()
    const memoryGrant = session.envelope.memoryGrant as any
    assert.throws(() => service.invoke({
      capabilityId: memoryGrant.capabilityId,
      bearerToken: memoryGrant.bearerToken,
      context: {
        workspaceId: session.envelope.workspaceId, actorId: session.envelope.actorId,
        toolId: session.envelope.toolId, callId: session.envelope.callId,
      },
      toolVersion: session.envelope.toolVersion,
      sessionGeneration: session.envelope.sessionGeneration,
      operation: 'working.read', request: { key: 'plan' },
    }), code('CAPABILITY_REVOKED'))
  } finally {
    await server.close(); workflows.close(); store.close()
  }
})
