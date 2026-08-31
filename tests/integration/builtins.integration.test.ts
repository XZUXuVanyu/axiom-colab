import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  AuthenticatedMemoryHttpServer, AuthenticatedMemoryService,
  contentHash, createLocalApprovedPlanReader, LocalGoalLifecycle, LocalMemoryStore,
  MemorySessionProvider, MemoryWorkflows,
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

test('production supervisory process executes a configured memory-dependent built-in', { skip: !available }, async () => {
  const root = join(tmpdir(), `axiom-supervisory-builtins-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const stateRoot = join(root, 'state')
  const store = new LocalMemoryStore(join(stateRoot, 'memory')); store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const now = new Date()
  const invocation = (authority: 'model' | 'user', operation: 'working.propose' | 'working.approve') => ({
    authority, context: { workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, callId: `call:${authority}`, toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: `capability:${authority}`, workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, toolId: 'tool:test', callId: `call:${authority}`, operations: [operation], issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60_000).toISOString(), nonce: authority },
  }) as any
  const proposal = workflows.proposeWorking(invocation('model', 'working.propose'), 'goal:one:plan', { goalId: 'goal:one', objective: 'Create scoped compute memory.' })
  workflows.approveWorking(invocation('user', 'working.approve'), proposal.id, { workspaceId: 'workspace:alpha', proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved' })
  const lifecycle = new LocalGoalLifecycle(join(stateRoot, 'lifecycle.sqlite3'), {
    approvedPlan: createLocalApprovedPlanReader(workflows, 'actor:local-host'),
    async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  lifecycle.close(); workflows.close(); store.close()
  const configPath = join(root, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    stateRoot, bridgePath: bridge, bridgeArgs: [], bridgeWorkingDirectory: resolve('.'),
    executableBuild: {
      commands: [{ executable: process.execPath, args: ['--version'], cwd: 'source' }],
      outputPath: 'source/build/tool.exe', installedPath: 'bin/tool.exe',
      limits: { timeoutMs: 30_000, maxStdinBytes: 1024, maxStdoutBytes: 1_048_576, maxStderrBytes: 1_048_576, killGraceMs: 250 },
    },
    validationProfile: {
      toolchain: { name: 'cmake', version: 'system', target: 'linux-x86_64' },
      wslDistribution: 'Ubuntu-24.04', stagingRoot: join(root, 'validation-staging'),
      allowedExecutables: ['/usr/bin/cmake', '/usr/bin/ctest'],
      process: { timeoutMs: 30_000, maxStdinBytes: 1024, maxStdoutBytes: 1_048_576, maxStderrBytes: 1_048_576, killGraceMs: 250 },
      resources: { maxMemoryBytes: 536_870_912, cpuQuotaPercent: 100, maxProcesses: 32 },
      maxCommands: 2,
      candidateCommands: [{ commandId: 'candidate-build', executable: '/usr/bin/cmake', args: ['--build', 'build'], cwd: 'candidate' }],
      standardCommands: [{ commandId: 'standard-test', executable: '/usr/bin/ctest', args: ['--test-dir', 'build'], cwd: 'candidate' }],
    },
    memoryToolPolicies: [{
      toolName: 'compute_buffer', toolId: 'tool:compute-buffer', toolVersion: '1.0.0',
      operations: ['compute.create'], maxOperations: 1, maxRequestBytes: 4096, lifetimeMs: 10_000,
    }],
  }))
  const child = spawn(process.execPath, [resolve('proj/scripts/run-supervisory.mjs'), configPath], {
    cwd: resolve('.'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  let stdout = ''; let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.stdin.end(`${JSON.stringify({
    protocolVersion: '1.1', id: 'memory:1', operation: 'execute-tool',
    workspaceId: 'workspace:alpha', goalId: 'goal:one', tool: 'compute_buffer',
    arguments: { action: 'create', base64: Buffer.from('scoped').toString('base64') },
  })}\n`)
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject); child.once('exit', resolveExit)
  })
  assert.equal(exitCode, 0, stderr)
  const response = JSON.parse(stdout.trim())
  assert.equal(response.ok, true)
  assert.match(response.result.result.id, /^object:/)
})
