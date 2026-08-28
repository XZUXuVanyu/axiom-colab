import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  LocalApplicationHost, LocalApplicationHostError, LocalCandidateRepository,
  LocalGoalLifecycle, LocalMemoryStore, MemoryWorkflows,
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
