import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  AuthenticatedMemoryHttpServer,
  AuthenticatedMemoryService,
  LocalMemoryStore,
  MemorySessionProvider,
  MemoryWorkflows,
} from '../../dist/index.js'
import {
  AdapterService, ProcessRunner, ToolObserver,
  type TrustedInvocationSession,
} from '../../dist/adapter-service.js'
import { ProcessExecutionError } from '../../dist/process-runner.js'
import { BridgeToolError, type TrustedInvocationEnvelope } from '../../dist/protocol.js'

const defaultBridge = process.platform === 'win32'
  ? resolve('build/windows/Release/cpp-memory-test-bridge.exe')
  : resolve('build/linux/cpp-memory-test-bridge')
const bridge = process.env.AXIOM_MEMORY_TEST_BRIDGE ?? defaultBridge
const available = existsSync(bridge)
const roots: string[] = []

class SilentLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

const limits = {
  timeoutMs: 2_000,
  maxStdinBytes: 1024 * 1024,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  killGraceMs: 50,
}

interface Fixture {
  readonly store: LocalMemoryStore
  readonly workflows: MemoryWorkflows
  readonly memoryService: AuthenticatedMemoryService
  readonly server: AuthenticatedMemoryHttpServer
  readonly adapter: AdapterService
  readonly provider: MemorySessionProvider
  lastSession: TrustedInvocationSession | undefined
  transformSession: (session: TrustedInvocationSession | undefined) =>
    TrustedInvocationSession | undefined
}

async function fixture(lifetimeMs = 60_000): Promise<Fixture> {
  const root = join(tmpdir(), `axiom-stage4-integration-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(root)
  store.createWorkspace('workspace:alpha', { maxBytes: 1024 * 1024, maxObjects: 100 })
  store.createWorkspace('workspace:beta', { maxBytes: 1024 * 1024, maxObjects: 100 })
  const workflows = new MemoryWorkflows(store)
  const memoryService = new AuthenticatedMemoryService(workflows)
  const server = new AuthenticatedMemoryHttpServer(memoryService)
  const endpoint = await server.listen()
  const provider = new MemorySessionProvider({
    service: memoryService, endpoint,
    scope: {
      workspaceId: 'workspace:alpha', actorId: 'actor:model',
      authority: 'model', sessionGeneration: 1,
    },
    policyForTool: (name) => name === 'memory_roundtrip' ? {
      toolId: 'tool:memory-roundtrip', toolVersion: '1.0.0',
      operations: ['compute.create', 'compute.read'],
      maxOperations: 2, maxRequestBytes: 4096, lifetimeMs,
    } : undefined,
  })
  const result = {
    store, workflows, memoryService, server, provider,
    lastSession: undefined,
    transformSession: (session: TrustedInvocationSession | undefined) => session,
  } as unknown as Fixture
  const adapter = new AdapterService(
    new ProcessRunner(), new ToolObserver(new SilentLogger(), { maxLogChars: 512 }),
    {
      bridge: { executable: bridge, prefixArgs: [] }, descriptorLimits: limits,
      callLimits: {
        maxStdinBytes: limits.maxStdinBytes,
        maxStdoutBytes: limits.maxStdoutBytes,
        maxStderrBytes: limits.maxStderrBytes,
        killGraceMs: limits.killGraceMs,
      },
      trustedContextProvider: (toolName, callId) => {
        const session = provider.create(toolName, callId)
        result.lastSession = session
        return result.transformSession(session)
      },
    },
  )
  Object.assign(result, { adapter })
  await adapter.initialize()
  return result
}

async function close(value: Fixture): Promise<void> {
  value.adapter.dispose()
  await value.server.close()
  value.workflows.close()
  value.store.close()
}

function revokedRequest(envelope: TrustedInvocationEnvelope) {
  const grant = envelope.memoryGrant as Record<string, any>
  return fetch(grant.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${grant.bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      capabilityId: grant.capabilityId,
      context: {
        workspaceId: envelope.workspaceId, actorId: envelope.actorId,
        toolId: envelope.toolId, callId: envelope.callId,
      },
      toolVersion: envelope.toolVersion,
      sessionGeneration: envelope.sessionGeneration,
      operation: 'compute.read', request: { id: 'object:any' },
    }),
  })
}

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test('real Bridge processes share scoped state and completed grants are revoked', { skip: !available }, async () => {
  const value = await fixture()
  try {
    const signal = new AbortController().signal
    const created = await value.adapter.invoke(
      'memory_roundtrip', { action: 'create', base64: Buffer.from('shared').toString('base64') },
      'call:create', signal,
    ) as { id: string }
    const firstEnvelope = value.lastSession?.envelope
    assert.ok(firstEnvelope)
    const denied = await revokedRequest(firstEnvelope)
    assert.equal((await denied.json() as any).error.code, 'CAPABILITY_REVOKED')
    const read = await value.adapter.invoke(
      'memory_roundtrip', { action: 'read', id: created.id }, 'call:read', signal,
    ) as { base64: string }
    assert.equal(Buffer.from(read.base64, 'base64').toString(), 'shared')
  } finally { await close(value) }
})

test('real Bridge rejects cross-workspace and expired grants', { skip: !available }, async () => {
  const value = await fixture(40)
  try {
    value.transformSession = (session) => session === undefined ? undefined : ({
      ...session,
      envelope: {
        ...session.envelope,
        memoryGrant: {
          ...session.envelope.memoryGrant,
          endpoint: 'http://example.com:80/v1/memory/invoke',
        },
      },
    })
    await assert.rejects(
      value.adapter.invoke(
        'memory_roundtrip', { action: 'create', base64: 'eA==' },
        'call:non-loopback', new AbortController().signal,
      ),
      (error: unknown) => error instanceof BridgeToolError
        && error.code === 'INVALID_TRUSTED_CONTEXT',
    )

    value.transformSession = (session) => {
      if (session === undefined) return undefined
      return {
        ...session,
        envelope: { ...session.envelope, workspaceId: 'workspace:beta' },
      }
    }
    await assert.rejects(
      value.adapter.invoke(
        'memory_roundtrip', { action: 'create', base64: 'eA==' },
        'call:cross-workspace', new AbortController().signal,
      ),
      (error: unknown) => error instanceof BridgeToolError
        && error.code === 'CROSS_WORKSPACE_ACCESS',
    )

    value.transformSession = (session) => session
    await assert.rejects(
      value.adapter.invoke(
        'memory_roundtrip', { action: 'create', base64: 'eA==', delayMs: 80 },
        'call:expired', new AbortController().signal,
      ),
      (error: unknown) => error instanceof BridgeToolError
        && error.code === 'CAPABILITY_EXPIRED',
    )
  } finally { await close(value) }
})

test('real Bridge cancellation and timeout terminate workers and revoke grants', { skip: !available }, async () => {
  const value = await fixture()
  try {
    const controller = new AbortController()
    const cancelled = value.adapter.invoke(
      'memory_roundtrip', { action: 'create', base64: 'eA==', delayMs: 400 },
      'call:cancel', controller.signal,
    )
    setTimeout(() => controller.abort(), 50)
    await assert.rejects(cancelled, (error: unknown) =>
      error instanceof ProcessExecutionError && error.code === 'CANCELLED')
    assert.ok(value.lastSession)
    assert.equal((await (await revokedRequest(value.lastSession.envelope)).json() as any).error.code,
      'CAPABILITY_REVOKED')

    await assert.rejects(
      value.adapter.invoke(
        'memory_roundtrip', { action: 'create', base64: 'eA==', delayMs: 1000 },
        'call:timeout', new AbortController().signal,
      ),
      (error: unknown) => error instanceof ProcessExecutionError && error.code === 'TIMEOUT',
    )
    assert.ok(value.lastSession)
    assert.equal((await (await revokedRequest(value.lastSession.envelope)).json() as any).error.code,
      'CAPABILITY_REVOKED')
  } finally { await close(value) }
})
