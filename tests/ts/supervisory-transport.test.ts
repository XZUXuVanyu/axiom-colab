import assert from 'node:assert/strict'
import test from 'node:test'

import { SupervisoryTransport } from '../../dist/index.js'

function snapshot(workspaceId: 'workspace:alpha' | 'workspace:beta') {
  return {
    workspaceId, goalId: null, currentPlan: null, progress: null, observations: [],
    memory: { compute: [], working: [], artifacts: [] }, tools: [], candidates: [], timeline: [],
    resources: { workspaceId, usedBytes: 0, objectCount: 0, quota: { maxBytes: 10, maxObjects: 1 }, expiredObjects: 0, corruptObjects: 0 },
    controls: { canStopGoal: false, revocableCapabilityIds: [], canResumeGoal: false, recoveryRequired: false },
  } as const
}

test('supervisory transport lists workspaces and correlates immutable inspection results', async () => {
  const host = {
    workspaces: () => ['workspace:alpha', 'workspace:beta'] as const,
    goals: (workspaceId: string) => workspaceId === 'workspace:alpha' ? ['goal:one'] as const : [],
    async inspect(workspaceId: 'workspace:alpha' | 'workspace:beta') { return snapshot(workspaceId) },
    async executeTool(workspaceId: string, goalId: string, tool: string, args: unknown) {
      return { workspaceId, goalId, callId: 'call:one', tool, result: args, reportArtifactId: 'object:report', reportHash: `sha256:${'1'.repeat(64)}` }
    },
    async decideInstallation(workspaceId: string, proposalId: string, proposalHash: string, decision: string) {
      return { workspaceId, proposalId, proposalHash, decision }
    },
    async submitHiddenChallenge(workspaceId: string, revisionId: string, candidateHash: string, fixtures: any[], commands: any[]) {
      assert.equal(Buffer.from(fixtures[0].content).toString(), 'private fixture')
      assert.equal(commands[0].commandId, 'hidden-test')
      return {
        workspaceId, revisionId, candidateHash, validationId: 'validation:one',
        snapshotHash: `sha256:${'3'.repeat(64)}`, recordHash: `sha256:${'4'.repeat(64)}`,
        outcome: 'passed', promotable: true,
        suites: [{ kind: 'challenge', outcome: 'passed', definitionHash: `sha256:${'5'.repeat(64)}`, commandCount: 1, hidden: true }],
      }
    },
    reviseCandidate(workspaceId: string, parentRevisionId: string, parentCandidateHash: string, descriptor: any, sources: any[]) {
      assert.equal(Buffer.from(sources[0].content).toString(), 'revised source')
      return { protocolVersion: '1.0', workspaceId, revisionId: 'evidence:revised', candidateId: 'tool:one', specificationId: 'proposal:spec', specificationHash: `sha256:${'1'.repeat(64)}`, revision: 2, parentRevisionId, parentCandidateHash, descriptorHash: `sha256:${'2'.repeat(64)}`, sourceHash: `sha256:${'3'.repeat(64)}`, sources: [], candidateHash: `sha256:${'4'.repeat(64)}`, state: 'current', createdAt: '2026-08-30T00:00:00.000Z', createdBy: 'actor:host' }
    },
    createCandidate(workspaceId: string, specification: any, descriptor: any, sources: any[]) {
      assert.equal(specification.publicName, 'new_tool')
      assert.equal(descriptor.name, 'new_tool')
      assert.equal(Buffer.from(sources[0].content).toString(), 'initial source')
      return {
        specification: { protocolVersion: '1.0', specificationId: 'proposal:new', workspaceId, createdAt: '2026-08-30T01:00:00.000Z', createdBy: 'actor:host', ...specification, constraints: [], specificationHash: `sha256:${'6'.repeat(64)}` },
        candidate: { protocolVersion: '1.0', workspaceId, revisionId: 'evidence:initial', candidateId: 'tool:new', specificationId: 'proposal:new', specificationHash: `sha256:${'6'.repeat(64)}`, revision: 1, parentRevisionId: null, parentCandidateHash: null, descriptorHash: `sha256:${'7'.repeat(64)}`, sourceHash: `sha256:${'8'.repeat(64)}`, sources: [], candidateHash: `sha256:${'9'.repeat(64)}`, state: 'current', createdAt: '2026-08-30T01:00:00.000Z', createdBy: 'actor:host' },
      }
    },
    async stopGoal(workspaceId: string, goalId: string, planRevisionId: string, planHash: string) {
      assert.deepEqual([workspaceId, goalId, planRevisionId, planHash], ['workspace:alpha', 'goal:one', 'object:plan', `sha256:${'1'.repeat(64)}`])
    },
    async resumeGoal() {},
    async revokeCapability(workspaceId: string, goalId: string | null, capabilityId: string) {
      assert.deepEqual([workspaceId, goalId, capabilityId], ['workspace:alpha', 'goal:one', 'capability:active'])
    },
    async recoverWorkspace() {},
  }
  const transport = new SupervisoryTransport(host as any)
  const listed = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'one', operation: 'list-workspaces' })))
  assert.deepEqual(listed, { protocolVersion: '1.1', id: 'one', ok: true, result: { workspaces: ['workspace:alpha', 'workspace:beta'] } })
  const goals = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'goals', operation: 'list-goals', workspaceId: 'workspace:alpha' })))
  assert.deepEqual(goals.result, { workspaceId: 'workspace:alpha', goals: ['goal:one'] })
  const inspected = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'two', operation: 'inspect', workspaceId: 'workspace:beta', goalId: null })))
  assert.equal(inspected.id, 'two')
  assert.equal(inspected.result.workspaceId, 'workspace:beta')
  const executed = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'three', operation: 'execute-tool', workspaceId: 'workspace:alpha', goalId: 'goal:one', tool: 'add_numbers', arguments: { left: 2, right: 3 } })))
  assert.equal(executed.result.callId, 'call:one')
  assert.deepEqual(executed.result.result, { left: 2, right: 3 })
  const decided = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'four', operation: 'decide-installation', workspaceId: 'workspace:alpha', proposalId: 'proposal:one', proposalHash: `sha256:${'2'.repeat(64)}`, decision: 'rejected' })))
  assert.equal(decided.result.decision, 'rejected')
  const challenged = JSON.parse(await transport.handle(JSON.stringify({
    protocolVersion: '1.1', id: 'five', operation: 'submit-hidden-challenge',
    workspaceId: 'workspace:alpha', revisionId: 'evidence:revision', candidateHash: `sha256:${'2'.repeat(64)}`,
    fixtures: [{ path: 'tests/private.txt', contentBase64: Buffer.from('private fixture').toString('base64') }],
    commands: [{ commandId: 'hidden-test', executable: '/usr/bin/ctest', args: ['--test-dir', 'build'], cwd: 'candidate' }],
  })))
  assert.equal(challenged.result.validationId, 'validation:one')
  assert.doesNotMatch(JSON.stringify(challenged.result), /private fixture|contentBase64|stdout|stderr/)
  const revised = JSON.parse(await transport.handle(JSON.stringify({
    protocolVersion: '1.1', id: 'six', operation: 'revise-candidate', workspaceId: 'workspace:alpha',
    parentRevisionId: 'evidence:revision', parentCandidateHash: `sha256:${'2'.repeat(64)}`,
    descriptor: { name: 'candidate_tool' },
    sources: [{ path: 'src/tool.cpp', contentBase64: Buffer.from('revised source').toString('base64') }],
  })))
  assert.equal(revised.result.revision, 2)
  const created = JSON.parse(await transport.handle(JSON.stringify({
    protocolVersion: '1.1', id: 'seven', operation: 'create-candidate', workspaceId: 'workspace:alpha',
    specification: { problem: 'Need a Tool.', publicName: 'new_tool', description: 'New Tool.', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, requestedPermissions: [], acceptanceCriteria: ['It works.'] },
    descriptor: { name: 'new_tool' },
    sources: [{ path: 'src/tool.cpp', contentBase64: Buffer.from('initial source').toString('base64') }],
  })))
  assert.equal(created.result.candidate.revision, 1)
  assert.equal(created.result.candidate.specificationId, created.result.specification.specificationId)
  const stopped = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'eight', operation: 'stop-goal', workspaceId: 'workspace:alpha', goalId: 'goal:one', planRevisionId: 'object:plan', planHash: `sha256:${'1'.repeat(64)}` })))
  assert.deepEqual(stopped.result, { workspaceId: 'workspace:alpha', goalId: 'goal:one', action: 'stopped' })
  const revoked = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'nine', operation: 'revoke-capability', workspaceId: 'workspace:alpha', goalId: 'goal:one', capabilityId: 'capability:active' })))
  assert.equal(revoked.result.action, 'revoked')
  const recovered = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'ten', operation: 'recover-workspace', workspaceId: 'workspace:alpha' })))
  assert.deepEqual(recovered.result, { workspaceId: 'workspace:alpha', action: 'recovered' })
})

test('supervisory transport rejects malformed, oversized, and authority-changing requests', async () => {
  const transport = new SupervisoryTransport({ workspaces: () => [], goals: () => [], async inspect() { throw new Error('unused') } } as any, 256)
  const malformed = JSON.parse(await transport.handle('{'))
  assert.equal(malformed.id, null)
  assert.equal(malformed.error.code, 'MALFORMED_REQUEST')

  const mutation = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'mutate', operation: 'approve', proposalId: 'proposal:x' })))
  assert.equal(mutation.error.code, 'UNKNOWN_OPERATION')
  const unknown = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'extra', operation: 'list-workspaces', approval: true })))
  assert.equal(unknown.error.code, 'INVALID_REQUEST')
  const malformedWorkspace = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'goals', operation: 'list-goals', workspaceId: 'goal:wrong-kind' })))
  assert.equal(malformedWorkspace.error.code, 'INVALID_WORKSPACE_ID')
  const oversized = JSON.parse(await transport.handle(' '.repeat(257)))
  assert.equal(oversized.error.code, 'REQUEST_TOO_LARGE')
  const invalidArguments = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'execute', operation: 'execute-tool', workspaceId: 'workspace:alpha', goalId: 'goal:one', tool: 'add_numbers', arguments: [] })))
  assert.equal(invalidArguments.error.code, 'INVALID_TOOL_ARGUMENTS')
  const invalidDecision = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'decision', operation: 'decide-installation', workspaceId: 'workspace:alpha', proposalId: 'proposal:one', proposalHash: `sha256:${'2'.repeat(64)}`, decision: 'installed' })))
  assert.equal(invalidDecision.error.code, 'INVALID_DECISION')
  const challengeTransport = new SupervisoryTransport({ workspaces: () => [], goals: () => [], async inspect() { throw new Error('unused') } } as any)
  const invalidChallenge = JSON.parse(await challengeTransport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'challenge', operation: 'submit-hidden-challenge', workspaceId: 'workspace:alpha', revisionId: 'evidence:one', candidateHash: `sha256:${'2'.repeat(64)}`, fixtures: [{ path: 'secret', contentBase64: 'not base64' }], commands: [] })))
  assert.equal(invalidChallenge.error.code, 'INVALID_HIDDEN_CHALLENGE')
  const invalidSpecification = JSON.parse(await challengeTransport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'candidate', operation: 'create-candidate', workspaceId: 'workspace:alpha', specification: { publicName: 'incomplete' }, descriptor: { name: 'incomplete' }, sources: [{ path: 'tool.cpp', contentBase64: '' }] })))
  assert.equal(invalidSpecification.error.code, 'INVALID_REQUEST')
  const invalidLifecycle = JSON.parse(await challengeTransport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'stop', operation: 'stop-goal', workspaceId: 'workspace:alpha', goalId: 'goal:one', planRevisionId: 'object:plan', planHash: 'sha256:bad' })))
  assert.equal(invalidLifecycle.error.code, 'INVALID_PLAN_HASH')
})

test('supervisory transport preserves deterministic host failure codes', async () => {
  const transport = new SupervisoryTransport({
    workspaces: () => [],
    goals: () => [],
    async inspect() { throw Object.assign(new Error('not visible'), { code: 'WORKSPACE_NOT_FOUND' }) },
  } as any)
  const response = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.1', id: 'missing', operation: 'inspect', workspaceId: 'workspace:missing', goalId: null })))
  assert.deepEqual(response.error, { code: 'WORKSPACE_NOT_FOUND', message: 'not visible' })
})
