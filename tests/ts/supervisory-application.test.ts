import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SupervisoryApplicationError, SupervisoryApplicationModel,
  type SupervisoryBackend, type SupervisoryWorkspaceSnapshot,
} from '../../dist/index.js'

function state(): SupervisoryWorkspaceSnapshot {
  return {
    workspaceId: 'workspace:alpha', goalId: null, currentPlan: null, progress: null, observations: [],
    memory: { compute: [], working: [], artifacts: [] },
    tools: [{
      name: 'add_numbers', source: 'built-in', executable: true, installationEvidenceHash: null,
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
      candidateId: 'tool:candidate', revisionId: 'evidence:revision', revision: 1, candidateHash: `sha256:${'1'.repeat(64)}`,
      state: 'current', modelClaim: 'All tests should pass.',
      descriptor: { name: 'candidate' }, descriptorHash: `sha256:${'3'.repeat(64)}`,
      sourceHash: `sha256:${'4'.repeat(64)}`,
      sources: [{ path: 'src/tool.cpp', size: 12, hash: `sha256:${'5'.repeat(64)}` }],
      proposal: null,
      validation: {
        validationId: 'validation:run', snapshotHash: `sha256:${'6'.repeat(64)}`,
        recordHash: `sha256:${'2'.repeat(64)}`, outcome: 'failed', promotable: false,
        completedAt: '2026-08-28T00:01:00.000Z',
        toolchain: { name: 'MSVC', version: '19.51', target: 'x64' },
        toolchainHash: `sha256:${'7'.repeat(64)}`, policyHash: `sha256:${'8'.repeat(64)}`,
        confinement: { backend: 'wsl', filesystem: true, descendantProcesses: true, network: true, cpu: true, memory: true },
        suites: (['candidate', 'standard', 'challenge'] as const).map((kind) => ({
          suiteId: `${kind}-suite`, kind, definitionHash: `sha256:${'9'.repeat(64)}`,
          hidden: kind === 'challenge', commandCount: 1, outcome: kind === 'standard' ? 'failed' as const : 'passed' as const,
          processes: [{
            commandId: `${kind}-command`, commandHash: `sha256:${'a'.repeat(64)}`,
            outcome: kind === 'standard' ? 'failed' as const : 'passed' as const,
            exitCode: kind === 'standard' ? 1 : 0, signalName: null, errorCode: null,
            durationMs: 10, stdoutBytes: 0, stderrBytes: 0,
            stdoutHash: `sha256:${'b'.repeat(64)}`, stderrHash: `sha256:${'c'.repeat(64)}`,
            stdout: kind === 'challenge' ? null : '', stderr: kind === 'challenge' ? null : '',
          }],
        })),
      },
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

test('supervisory projection rejects incomplete artifact lineage', async () => {
  const backend = new Backend()
  backend.value = {
    ...backend.value,
    memory: {
      ...backend.value.memory,
      artifacts: [{
        artifactId: 'object:child', hash: `sha256:${'3'.repeat(64)}`, size: 1,
        schemaHash: `sha256:${'4'.repeat(64)}`, parentIds: ['object:missing'], childIds: [],
        operation: 'derive', parametersHash: `sha256:${'5'.repeat(64)}`,
        softwareVersion: '1.0.0', validationId: null, createdAt: '2026-08-28T00:00:00.000Z',
      }],
    },
  }
  const model = new SupervisoryApplicationModel(backend as unknown as SupervisoryBackend)
  await assert.rejects(
    model.selectWorkspace('workspace:alpha'),
    (error: unknown) => error instanceof SupervisoryApplicationError && error.code === 'INVALID_ARTIFACT_LINEAGE',
  )
})

test('supervisory projection rejects disclosed hidden challenge output', async () => {
  const backend = new Backend()
  const challenge = backend.value.candidates[0]!.validation!.suites.find((suite) => suite.kind === 'challenge')!
  ;(challenge.processes[0] as any).stdout = 'hidden fixture leaked'
  const model = new SupervisoryApplicationModel(backend as unknown as SupervisoryBackend)
  await assert.rejects(
    model.selectWorkspace('workspace:alpha'),
    (error: unknown) => error instanceof SupervisoryApplicationError && error.code === 'MISLEADING_AUTHORITY',
  )
})
