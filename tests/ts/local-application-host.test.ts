import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  LocalApplicationHost, LocalApplicationHostError, LocalCandidateRepository,
  InvocationLedger, LocalGoalLifecycle, LocalMemoryStore, MemoryWorkflows,
} from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = join(tmpdir(), `axiom-host-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(join(root, 'memory'))
  store.createWorkspace('workspace:beta'); store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const candidates = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const lifecycle = new LocalGoalLifecycle(join(root, 'lifecycle.sqlite3'), {
    approvedPlan: () => null, async stopGoal() {}, async resumeGoal() {},
    async revokeCapability() {}, async recoverWorkspace() {},
  })
  let disposed = false
  const adapter = {
    async initialize() { return [{
      name: 'add_numbers', description: 'Adds values.', whenToUse: 'For addition.',
      parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000,
      allowParallel: true, sideEffect: false,
    }] },
    dispose() { disposed = true },
  }
  return { root, store, workflows, candidates, lifecycle, adapter, disposed: () => disposed }
}

test('application host initializes discovery, enumerates workspaces, and owns shutdown', async () => {
  const value = fixture()
  const rediscovered: string[] = []
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover(context) { rediscovered.push(context.workspaceId); return [] } }),
  } as any)
  assert.throws(
    () => host.workspaces(),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_NOT_INITIALIZED',
  )
  await host.initialize()
  assert.deepEqual(host.workspaces(), ['workspace:alpha', 'workspace:beta'])
  assert.deepEqual(host.goals('workspace:alpha'), [])
  assert.deepEqual(rediscovered, ['workspace:alpha', 'workspace:beta'])
  const snapshot = await host.model.selectWorkspace('workspace:alpha')
  assert.equal(snapshot.tools[0]?.name, 'add_numbers')
  host.close()
  assert.equal(value.disposed(), true)
  assert.throws(
    () => host.workspaces(),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_CLOSED',
  )
})

test('application host rolls back startup registration when rediscovery fails', async () => {
  const value = fixture()
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: (registry: any) => ({
      rediscover(context: any) {
        registry.register({
          workspaceId: context.workspaceId, installationId: `evidence:${context.workspaceId}`,
          candidateId: 'tool:candidate', candidateHash: `sha256:${'1'.repeat(64)}`,
          publicName: 'candidate', descriptor: {}, requestedPermissions: [],
          installationEvidenceHash: `sha256:${'2'.repeat(64)}`, installedRoot: 'installed',
        })
        if (context.workspaceId === 'workspace:beta') throw new Error('rediscovery failed')
        return []
      },
    }),
  } as any)
  await assert.rejects(host.initialize(), /rediscovery failed/)
  assert.throws(
    () => host.installedRegistrations('workspace:alpha'),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_NOT_INITIALIZED',
  )
  host.close()
})

test('application host executes only discovered pure Tools and seals the observation', async () => {
  const root = join(tmpdir(), `axiom-host-execute-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(join(root, 'memory')); store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const candidates = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const plan = {
    id: 'object:plan', key: 'goal:one:plan', revision: 1,
    value: { goalId: 'goal:one', objective: 'Run a pure Tool.' }, hash: `sha256:${'1'.repeat(64)}`,
    proposalId: 'proposal:plan', committedAt: '2026-08-29T04:00:00.000Z',
  } as const
  const lifecycle = new LocalGoalLifecycle(join(root, 'lifecycle.sqlite3'), {
    approvedPlan: (workspaceId, goalId) => workspaceId === 'workspace:alpha' && goalId === 'goal:one' ? plan : null,
    async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  const ledger = new InvocationLedger()
  const adapter = {
    ledger,
    async initialize() { return [
      { name: 'add_numbers', description: 'Adds.', whenToUse: 'For addition.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false },
      { name: 'mutate_state', description: 'Mutates.', whenToUse: 'Never here.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: false, sideEffect: true },
    ] },
    async invoke(tool: string, args: unknown, callId: string) {
      ledger.start(callId, tool); ledger.succeed(callId, 1)
      return { tool, arguments: args }
    },
    dispose() {},
  }
  const host = new LocalApplicationHost({
    store, workflows, candidates, lifecycle, adapter, validator: { isPromotionEligible: () => false },
    hostActorId: 'actor:host', createInstallation: () => ({ rediscover: () => [] }),
  } as any)
  await host.initialize()
  const execution = await host.executeTool('workspace:alpha', 'goal:one', 'add_numbers', { left: 2, right: 3 })
  assert.equal(execution.tool, 'add_numbers')
  assert.deepEqual(execution.result, { tool: 'add_numbers', arguments: { left: 2, right: 3 } })
  const artifacts = workflows.listArtifacts({
    authority: 'trusted-host', context: { workspaceId: 'workspace:alpha', actorId: 'actor:test', callId: 'call:read', toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: 'capability:read', workspaceId: 'workspace:alpha', actorId: 'actor:test', toolId: 'tool:test', callId: 'call:read', operations: ['artifact.read'], issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'read' },
  } as any)
  assert.equal(artifacts[0]?.id, execution.reportArtifactId)
  await assert.rejects(host.executeTool('workspace:alpha', 'goal:one', 'mutate_state', {}), (error: unknown) => (error as any).code === 'TOOL_REQUIRES_POLICY')
  host.close()
})
