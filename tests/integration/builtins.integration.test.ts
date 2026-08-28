import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  AuthenticatedMemoryHttpServer, AuthenticatedMemoryService,
  contentHash, LocalMemoryStore, MemorySessionProvider, MemoryWorkflows,
} from '../../dist/index.js'
import { AdapterService, ProcessRunner, ToolObserver } from '../../dist/adapter-service.js'

const defaultBridge = process.platform === 'win32'
  ? resolve('build/windows/Release/cpp-tool-bridge.exe')
  : resolve('build/linux/cpp-tool-bridge')
const bridge = process.env.CPP_BRIDGE_PATH ?? defaultBridge
const available = existsSync(bridge)
const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
class SilentLogger { info(): void {} warn(): void {} error(): void {} }

test('production built-ins use explicit scoped policy for compute and artifact derivation', { skip: !available }, async () => {
  const root = join(tmpdir(), `axiom-builtins-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(root); store.createWorkspace('workspace:alpha', { maxBytes: 1_000_000, maxObjects: 100 })
  const workflows = new MemoryWorkflows(store)
  const service = new AuthenticatedMemoryService(workflows)
  const server = new AuthenticatedMemoryHttpServer(service); const endpoint = await server.listen()
  const provider = new MemorySessionProvider({
    service, endpoint,
    scope: { workspaceId: 'workspace:alpha', actorId: 'actor:trusted-host', authority: 'trusted-host', sessionGeneration: 1 },
    policyForTool: (name) => name === 'compute_buffer' ? {
      toolId: 'tool:compute-buffer', toolVersion: '1.0.0',
      operations: ['compute.create', 'compute.read'], maxOperations: 2,
      maxRequestBytes: 4096, lifetimeMs: 10_000,
    } : name === 'derive_artifact' ? {
      toolId: 'tool:derive-artifact', toolVersion: '1.0.0',
      operations: ['artifact.read', 'artifact.derive'], maxOperations: 2,
      maxRequestBytes: 4096, lifetimeMs: 10_000,
    } : undefined,
  })
  const limits = { timeoutMs: 3000, maxStdinBytes: 1_000_000, maxStdoutBytes: 1_000_000, maxStderrBytes: 1_000_000, killGraceMs: 50 }
  const adapter = new AdapterService(new ProcessRunner(), new ToolObserver(new SilentLogger(), { maxLogChars: 256 }), {
    bridge: { executable: bridge, prefixArgs: [] }, descriptorLimits: limits,
    callLimits: { maxStdinBytes: limits.maxStdinBytes, maxStdoutBytes: limits.maxStdoutBytes, maxStderrBytes: limits.maxStderrBytes, killGraceMs: limits.killGraceMs },
    trustedContextProvider: (name, callId) => provider.create(name, callId),
  })
  try {
    await adapter.initialize()
    const created = await adapter.invoke('compute_buffer', { action: 'create', base64: Buffer.from('scratch').toString('base64') }, 'call:compute-create', new AbortController().signal) as any
    const read = await adapter.invoke('compute_buffer', { action: 'read', id: created.id }, 'call:compute-read', new AbortController().signal) as any
    assert.equal(Buffer.from(read.base64, 'base64').toString(), 'scratch')

    const trusted = {
      authority: 'trusted-host' as const,
      context: { workspaceId: 'workspace:alpha' as const, actorId: 'actor:trusted-host' as const, callId: 'call:seed' as const, toolId: 'tool:seed' as const },
      capability: { protocolVersion: '1.0' as const, capabilityId: 'capability:seed' as const, workspaceId: 'workspace:alpha' as const, actorId: 'actor:trusted-host' as const, toolId: 'tool:seed' as const, callId: 'call:seed' as const, operations: ['artifact.create', 'artifact.read'] as const, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'seed' },
    }
    const seed = workflows.createArtifact(trusted, Buffer.from('evidence'), { type: 'string' }, { operation: 'seed', parametersHash: contentHash({}), softwareVersion: '1.0.0', validationId: null })
    const derived = await adapter.invoke('derive_artifact', { parentId: seed.id }, 'call:derive', new AbortController().signal) as any
    assert.deepEqual(derived.parentIds, [seed.id])
    assert.equal(Buffer.from(workflows.readArtifact(trusted, derived.id)).toString(), 'evidence')
  } finally {
    adapter.dispose(); await server.close(); workflows.close(); store.close()
  }
})
