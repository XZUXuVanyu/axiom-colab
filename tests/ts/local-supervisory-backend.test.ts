import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  LocalCandidateRepository, LocalMemoryStore, LocalSupervisoryBackend, LocalSupervisoryBackendError,
  MemoryWorkflows, ToolWorkshop, type LocalSupervisoryLifecycle,
} from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function lifecycle(): LocalSupervisoryLifecycle {
  return {
    listGoals: () => [],
    inspectGoal: () => null,
    revocableCapabilities: () => [],
    recoveryRequired: () => false,
    async stopGoal() {}, async revokeCapability() {}, async resumeGoal() {}, async recoverWorkspace() {},
  }
}

const builtIn = {
  name: 'add_numbers', description: 'Adds two values.', whenToUse: 'Use for addition.',
  parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000,
  allowParallel: true, sideEffect: false,
} as const

test('local supervisory backend composes isolated durable state from authoritative services', async () => {
  const root = join(tmpdir(), `axiom-supervisory-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const now = () => new Date('2026-08-28T03:00:00.000Z')
  let store = new LocalMemoryStore(join(root, 'memory'), { now })
  store.createWorkspace('workspace:alpha', { maxBytes: 1000, maxObjects: 10 })
  store.createWorkspace('workspace:beta', { maxBytes: 2000, maxObjects: 20 })
  let workflows = new MemoryWorkflows(store, { now })
  let repository = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const workshop = new ToolWorkshop({ repository, now, idFactory: () => crypto.randomUUID() })
  const specification = workshop.defineSpecification(
    { workspaceId: 'workspace:alpha', actorId: 'actor:model', authority: 'model' },
    {
      problem: 'Need a deterministic bounded addition Tool.', publicName: 'bounded_add',
      description: 'Adds bounded values.', inputSchema: { type: 'object' }, outputSchema: { type: 'number' },
      requestedPermissions: [], acceptanceCriteria: ['Returns a sum.'],
    },
  )
  const revision = workshop.createCandidateRevision(
    { workspaceId: 'workspace:alpha', actorId: 'actor:model', authority: 'model' },
    { specificationId: specification.specificationId, descriptor: { name: 'bounded_add' }, sources: [{ path: 'tool.cpp', content: 'int tool = 1;' }] },
  )

  const makeBackend = () => new LocalSupervisoryBackend(store, workflows, repository, { isPromotionEligible: () => false }, {
    builtInTools: () => [builtIn], rediscoveredTools: () => [], lifecycle: lifecycle(),
  })
  let snapshot = await makeBackend().inspect('workspace:alpha', null)
  assert.equal(snapshot.resources.quota.maxBytes, 1000)
  assert.equal(snapshot.tools[0]?.name, 'add_numbers')
  assert.equal(snapshot.candidates[0]?.candidateHash, revision.candidateHash)
  assert.equal(snapshot.candidates[0]?.modelClaim, 'Need a deterministic bounded addition Tool.')
  assert.equal(snapshot.candidates[0]?.descriptorHash, revision.descriptorHash)
  assert.deepEqual(snapshot.candidates[0]?.sources, revision.sources)
  assert.equal(snapshot.timeline[0]?.kind, 'model-claim')

  const other = await makeBackend().inspect('workspace:beta', null)
  assert.deepEqual(other.candidates, [])
  assert.deepEqual(other.timeline, [])

  workflows.close(); repository.close(); store.close()
  store = new LocalMemoryStore(join(root, 'memory'), { now })
  workflows = new MemoryWorkflows(store, { now })
  repository = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  snapshot = await makeBackend().inspect('workspace:alpha', null)
  assert.equal(snapshot.candidates[0]?.candidateHash, revision.candidateHash)
  assert.deepEqual(snapshot.candidates[0]?.sources, revision.sources)

  workflows.close(); repository.close(); store.close()
})

test('local supervisory backend refuses unverified rediscovered registrations', async () => {
  const root = join(tmpdir(), `axiom-supervisory-unverified-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(join(root, 'memory'))
  store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const repository = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const backend = new LocalSupervisoryBackend(store, workflows, repository, { isPromotionEligible: () => false }, {
    builtInTools: () => [], lifecycle: lifecycle(),
    rediscoveredTools: () => [{
      workspaceId: 'workspace:alpha', installationId: 'evidence:forged', candidateId: 'tool:forged',
      candidateHash: `sha256:${'1'.repeat(64)}`, publicName: 'forged_tool', descriptor: builtIn,
      requestedPermissions: [], installationEvidenceHash: `sha256:${'2'.repeat(64)}`, installedRoot: 'forged',
    }],
  })
  await assert.rejects(
    backend.inspect('workspace:alpha', null),
    (error: unknown) => error instanceof LocalSupervisoryBackendError && error.code === 'UNVERIFIED_INSTALLED_TOOL',
  )
  workflows.close(); repository.close(); store.close()
})
