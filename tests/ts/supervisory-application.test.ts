import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SupervisoryApplicationError, SupervisoryApplicationModel,
  type SupervisoryBackend, type SupervisoryWorkspaceSnapshot,
} from '../../dist/index.js'

function state(): SupervisoryWorkspaceSnapshot {
  return {
    workspaceId: 'workspace:alpha', goalId: null, currentPlan: null,
    tools: [{
      name: 'add_numbers', source: 'built-in', installationEvidenceHash: null,
      descriptor: {
        name: 'add_numbers', description: 'Add numbers', whenToUse: 'When addition is required.',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
        sideEffects: [], timeoutMs: 1000, concurrency: 'parallel',
      },
    }],
    resources: {
      workspaceId: 'workspace:alpha', usedBytes: 12, objectCount: 1,
      quota: { maxBytes: 100, maxObjects: 10 }, expiredObjects: 0, corruptObjects: 0,
    },
    candidates: [{
      candidateId: 'tool:candidate', revisionId: 'evidence:revision', candidateHash: `sha256:${'1'.repeat(64)}`,
      state: 'current', modelClaim: 'All tests should pass.',
      validation: { validationId: 'validation:run', recordHash: `sha256:${'2'.repeat(64)}`, outcome: 'failed', promotable: false },
      approval: null, installation: null,
    }],
    timeline: [
      { id: 'claim', occurredAt: '2026-08-28T00:00:00.000Z', kind: 'model-claim', summary: 'Candidate should pass', subjectId: 'tool:candidate', authoritativeHash: null, detail: null },
      { id: 'observed', occurredAt: '2026-08-28T00:01:00.000Z', kind: 'validation-evidence', summary: 'Standard suite failed', subjectId: 'validation:run', authoritativeHash: `sha256:${'2'.repeat(64)}`, detail: null },
    ],
    controls: { canStopGoal: false, revocableCapabilityIds: [], canResumeGoal: false, recoveryRequired: false },
  }
}

class Backend implements SupervisoryBackend {
  value = state()
  readonly calls: string[] = []
  async inspect(workspaceId: 'workspace:alpha', goalId: 'goal:one' | null) { return structuredClone({ ...this.value, workspaceId, goalId }) }
  async stopGoal() { this.calls.push('stop'); this.value = { ...this.value, controls: { ...this.value.controls, canStopGoal: false, canResumeGoal: true } } }
  async revokeCapability(_workspaceId: string, capabilityId: string) { this.calls.push(`revoke:${capabilityId}`) }
  async resumeGoal() { this.calls.push('resume') }
  async recoverWorkspace() { this.calls.push('recover') }
}

test('supervisory projection keeps claims and authoritative validation visibly distinct and immutable', async () => {
  const backend = new Backend()
  const model = new SupervisoryApplicationModel(backend as unknown as SupervisoryBackend)
  const snapshot = await model.selectWorkspace('workspace:alpha')

  assert.equal(snapshot.candidates[0]?.modelClaim, 'All tests should pass.')
  assert.equal(snapshot.candidates[0]?.validation?.outcome, 'failed')
  assert.deepEqual(snapshot.timeline.map((entry) => entry.kind), ['model-claim', 'validation-evidence'])
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.timeline), true)
  assert.throws(() => { (snapshot.timeline as any[]).push({}) }, TypeError)
})

test('supervisory actions delegate to the backend and refresh authoritative state', async () => {
  const backend = new Backend()
  backend.value = {
    ...backend.value, goalId: 'goal:one',
    controls: { canStopGoal: true, revocableCapabilityIds: ['capability:active'], canResumeGoal: false, recoveryRequired: false },
  }
  const model = new SupervisoryApplicationModel(backend as unknown as SupervisoryBackend)
  await model.selectWorkspace('workspace:alpha')
  await model.selectGoal('goal:one')
  const stopped = await model.stopGoal()
  assert.deepEqual(backend.calls, ['stop'])
  assert.equal(stopped.controls.canResumeGoal, true)

  await assert.rejects(
    model.revokeCapability('capability:forged'),
    (error: unknown) => error instanceof SupervisoryApplicationError && error.code === 'ACTION_NOT_AVAILABLE',
  )
})

test('supervisory projection rejects authority laundering', async () => {
  const backend = new Backend()
  backend.value = {
    ...backend.value,
    tools: [{ ...backend.value.tools[0]!, source: 'installed', installationEvidenceHash: null }],
  }
  const model = new SupervisoryApplicationModel(backend as unknown as SupervisoryBackend)
  await assert.rejects(
    model.selectWorkspace('workspace:alpha'),
    (error: unknown) => error instanceof SupervisoryApplicationError && error.code === 'MISLEADING_AUTHORITY',
  )
})
