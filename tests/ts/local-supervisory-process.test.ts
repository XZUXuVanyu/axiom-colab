import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import {
  createLocalApprovedPlanReader, LocalMemoryStore, MemoryWorkflows,
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
  store.close()
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
  child.stdin.end('{"protocolVersion":"1.0","id":"process:1","operation":"list-workspaces"}\n')
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', resolveExit)
  })
  assert.equal(exitCode, 0, stderr)
  assert.deepEqual(JSON.parse(stdout.trim()), {
    protocolVersion: '1.0', id: 'process:1', ok: true,
    result: { workspaces: ['workspace:alpha'] },
  })
  assert.doesNotMatch(stdout, /cpp-tool:/)
})

test('local supervisory process config rejects ambient paths and unknown authority fields', () => {
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: 'relative', bridgePath: process.execPath,
  }), /stateRoot must be an absolute path/)
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath, approval: true,
  }), /unknown field approval/)
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
