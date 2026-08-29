import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import {
  createLocalApprovedPlanReader, createLocalGoalProgressReader, createLocalMemoryProjectionReader,
  contentHash, LocalGoalLifecycle, LocalMemoryStore, MemoryWorkflows,
  parseLocalSupervisoryProcessConfig,
} from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test('local supervisory process composes durable state and Bridge discovery behind JSON lines', async () => {
  const root = join(tmpdir(), `axiom-supervisory-main-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const stateRoot = join(root, 'state')
  const store = new LocalMemoryStore(join(stateRoot, 'memory'))
  store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const issued = new Date()
  const invoke = (authority: 'model' | 'user', operation: 'working.propose' | 'working.approve') => ({
    authority, context: { workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, callId: `call:${authority}`, toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: `capability:${authority}`, workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, toolId: 'tool:test', callId: `call:${authority}`, operations: [operation], issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 60_000).toISOString(), nonce: authority },
  }) as any
  const proposal = workflows.proposeWorking(invoke('model', 'working.propose'), 'goal:one:plan', { goalId: 'goal:one', objective: 'Echo through the production host.', calls: [] })
  workflows.approveWorking(invoke('user', 'working.approve'), proposal.id, { workspaceId: 'workspace:alpha', proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved' })
  const lifecycle = new LocalGoalLifecycle(join(stateRoot, 'lifecycle.sqlite3'), {
    approvedPlan: createLocalApprovedPlanReader(workflows, 'actor:local-host'),
    async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  lifecycle.close(); workflows.close(); store.close()
  const configPath = join(root, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    stateRoot,
    bridgePath: process.execPath,
    bridgeArgs: [resolve('tests/fixtures/fake-bridge.mjs')],
    bridgeWorkingDirectory: resolve('.'),
  }))

  const child = spawn(process.execPath, [resolve('proj/scripts/run-supervisory.mjs'), configPath], {
    cwd: resolve('.'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.stdin.end([
    '{"protocolVersion":"1.1","id":"process:1","operation":"list-workspaces"}',
    '{"protocolVersion":"1.1","id":"process:2","operation":"execute-tool","workspaceId":"workspace:alpha","goalId":"goal:one","tool":"echo_cpp","arguments":{"value":5}}',
  ].join('\n') + '\n')
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', resolveExit)
  })
  assert.equal(exitCode, 0, stderr)
  const responses = stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line))
  assert.deepEqual(responses[0], {
    protocolVersion: '1.1', id: 'process:1', ok: true,
    result: { workspaces: ['workspace:alpha'] },
  })
  assert.equal(responses[1].id, 'process:2')
  assert.deepEqual(responses[1].result.result, { tool: 'echo_cpp', arguments: { value: 5 } })
  assert.match(responses[1].result.reportArtifactId, /^object:/)
  assert.doesNotMatch(stdout, /cpp-tool:/)
})

test('local supervisory process config rejects ambient paths and unknown authority fields', () => {
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: 'relative', bridgePath: process.execPath,
  }), /stateRoot must be an absolute path/)
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath, approval: true,
  }), /unknown field approval/)
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath, userActorId: 'actor:bad value',
  }), /userActorId is malformed/)
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath,
    memoryToolPolicies: [{
      toolName: 'memory_tool', toolId: 'tool:memory', toolVersion: '1.0.0',
      operations: ['working.approve'], maxOperations: 1, maxRequestBytes: 1024, lifetimeMs: 1000,
    }],
  }), /only Tool memory operations/)
  const parsed = parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath,
    memoryToolPolicies: [{
      toolName: 'memory_tool', toolId: 'tool:memory', toolVersion: '1.0.0',
      operations: ['compute.read'], maxOperations: 1, maxRequestBytes: 1024, lifetimeMs: 1000,
    }],
  })
  assert.deepEqual(parsed.memoryToolPolicies.get('memory_tool')?.operations, ['compute.read'])
})

test('local approved-plan reader binds committed working state to the exact goal', () => {
  const root = join(tmpdir(), `axiom-supervisory-plan-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const at = new Date('2026-08-29T01:00:00.000Z')
  const store = new LocalMemoryStore(join(root, 'memory'), { now: () => at })
  store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store, { now: () => at })
  const invocation = (authority: 'model' | 'user', operation: 'working.propose' | 'working.approve') => ({
    authority,
    context: { workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, callId: `call:${authority}`, toolId: 'tool:test' },
    capability: {
      protocolVersion: '1.0', capabilityId: `capability:${authority}`,
      workspaceId: 'workspace:alpha', actorId: `actor:${authority}`,
      toolId: 'tool:test', callId: `call:${authority}`, operations: [operation],
      issuedAt: at.toISOString(), expiresAt: new Date(at.getTime() + 60_000).toISOString(), nonce: authority,
    },
  }) as any
  const proposal = workflows.proposeWorking(
    invocation('model', 'working.propose'), 'goal:one:plan',
    { goalId: 'goal:one', objective: 'Inspect authoritative state.', calls: [] },
  )
  const committed = workflows.approveWorking(
    invocation('user', 'working.approve'), proposal.id,
    { workspaceId: 'workspace:alpha', proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved' },
  )
  const reader = createLocalApprovedPlanReader(workflows, 'actor:host', () => at)
  assert.equal(reader('workspace:alpha', 'goal:one')?.id, committed.id)
  assert.equal(reader('workspace:alpha', 'goal:missing'), null)

  const malformed = workflows.proposeWorking(
    invocation('model', 'working.propose'), 'goal:bad:plan',
    { goalId: 'goal:other', objective: 'Wrong binding.', calls: [] },
  )
  workflows.approveWorking(
    invocation('user', 'working.approve'), malformed.id,
    { workspaceId: 'workspace:alpha', proposalId: malformed.id, proposalHash: malformed.hash, decision: 'approved' },
  )
  assert.throws(
    () => reader('workspace:alpha', 'goal:bad'),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_APPROVED_PLAN',
  )
  workflows.close(); store.close()
})

test('local progress reader binds checkpoints and observed Tool results to the approved plan', () => {
  const root = join(tmpdir(), `axiom-supervisory-progress-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const at = new Date('2026-08-29T02:00:00.000Z')
  const store = new LocalMemoryStore(join(root, 'memory'), { now: () => at })
  store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store, { now: () => at })
  const invocation = (authority: 'model' | 'user' | 'trusted-host', operations: string[]) => ({
    authority,
    context: { workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, callId: `call:${authority}:${operations[0]}`, toolId: 'tool:test' },
    capability: {
      protocolVersion: '1.0', capabilityId: `capability:${authority}:${operations[0]}`,
      workspaceId: 'workspace:alpha', actorId: `actor:${authority}`,
      toolId: 'tool:test', callId: `call:${authority}:${operations[0]}`, operations,
      issuedAt: at.toISOString(), expiresAt: new Date(at.getTime() + 60_000).toISOString(), nonce: `${authority}:${operations[0]}`,
    },
  }) as any
  const commit = (key: string, value: unknown) => {
    const proposal = workflows.proposeWorking(invocation('model', ['working.propose']), key, value)
    return workflows.approveWorking(invocation('user', ['working.approve']), proposal.id, {
      workspaceId: 'workspace:alpha', proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved',
    })
  }
  const plan = commit('goal:one:plan', { goalId: 'goal:one', objective: 'Observe a Tool.', calls: [{ tool: 'add_numbers', arguments: {} }] })
  const progress = commit('goal:one:progress', {
    goalId: 'goal:one', planRevisionId: plan.id, planHash: plan.hash,
    status: 'completed', summary: 'The planned Tool call completed.', completedCalls: 1, totalCalls: 1,
  })
  const report = {
    goalId: 'goal:one', planRevisionId: plan.id, planHash: plan.hash,
    startedAt: at.toISOString(), completedAt: at.toISOString(), calls: [],
    observations: [{ callId: 'call:observed', tool: 'add_numbers', result: { result: 5 } }], resultingArtifactIds: [],
  }
  const artifact = workflows.createArtifact(
    invocation('trusted-host', ['artifact.create']), Buffer.from(JSON.stringify(report)),
    { type: 'object', title: 'Axiom goal session report', protocolVersion: '1.0' },
    { operation: 'goal.session.report', parametersHash: plan.hash, softwareVersion: '1.0.0', validationId: null },
  )
  const approvedPlan = createLocalApprovedPlanReader(workflows, 'actor:host', () => at)
  const projected = createLocalGoalProgressReader(workflows, 'actor:host', approvedPlan, () => at)('workspace:alpha', 'goal:one')
  assert.equal(projected.progress?.revisionId, progress.id)
  assert.equal(projected.progress?.status, 'completed')
  assert.equal(projected.observations[0]?.reportArtifactId, artifact.id)
  assert.deepEqual(projected.observations[0]?.result, { result: 5 })
  workflows.close(); store.close()
})

test('local memory projection exposes metadata and complete immutable artifact lineage', () => {
  const root = join(tmpdir(), `axiom-supervisory-memory-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const at = new Date('2026-08-29T03:00:00.000Z')
  const store = new LocalMemoryStore(join(root, 'memory'), { now: () => at })
  store.createWorkspace('workspace:alpha'); store.createWorkspace('workspace:beta')
  const workflows = new MemoryWorkflows(store, { now: () => at })
  const invocation = (authority: 'model' | 'user' | 'trusted-host', operations: string[]) => ({
    authority,
    context: { workspaceId: 'workspace:alpha', actorId: `actor:${authority}`, callId: `call:${authority}:${operations[0]}`, toolId: 'tool:test' },
    capability: {
      protocolVersion: '1.0', capabilityId: `capability:${authority}:${operations[0]}`,
      workspaceId: 'workspace:alpha', actorId: `actor:${authority}`,
      toolId: 'tool:test', callId: `call:${authority}:${operations[0]}`, operations,
      issuedAt: at.toISOString(), expiresAt: new Date(at.getTime() + 60_000).toISOString(), nonce: `${authority}:${operations[0]}`,
    },
  }) as any
  const compute = workflows.createCompute(invocation('model', ['compute.create']), new Uint8Array([1, 2]))
  const proposal = workflows.proposeWorking(invocation('model', ['working.propose']), 'decision', { selected: true })
  const revision = workflows.approveWorking(invocation('user', ['working.approve']), proposal.id, {
    workspaceId: 'workspace:alpha', proposalId: proposal.id, proposalHash: proposal.hash, decision: 'approved',
  })
  const provenance = { operation: 'seed', parametersHash: contentHash({ seed: true }), softwareVersion: '1.0.0', validationId: null }
  const parent = workflows.createArtifact(invocation('trusted-host', ['artifact.create']), new Uint8Array([3]), { type: 'bytes' }, provenance)
  const child = workflows.deriveArtifact(invocation('trusted-host', ['artifact.derive']), [parent.id], new Uint8Array([4]), { type: 'bytes' }, { ...provenance, operation: 'derive' })
  const reader = createLocalMemoryProjectionReader(workflows, 'actor:host', () => at)
  const projected = reader('workspace:alpha')
  assert.equal(projected.compute[0]?.objectId, compute.id)
  assert.equal(projected.working[0]?.revisionId, revision.id)
  assert.deepEqual(projected.artifacts.find((item) => item.artifactId === parent.id)?.childIds, [child.id])
  assert.deepEqual(projected.artifacts.find((item) => item.artifactId === child.id)?.parentIds, [parent.id])
  assert.deepEqual(reader('workspace:beta'), { compute: [], working: [], artifacts: [] })
  workflows.close(); store.close()
})
