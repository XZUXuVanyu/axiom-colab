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
  }
  const transport = new SupervisoryTransport(host as any)
  const listed = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'one', operation: 'list-workspaces' })))
  assert.deepEqual(listed, { protocolVersion: '1.0', id: 'one', ok: true, result: { workspaces: ['workspace:alpha', 'workspace:beta'] } })
  const goals = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'goals', operation: 'list-goals', workspaceId: 'workspace:alpha' })))
  assert.deepEqual(goals.result, { workspaceId: 'workspace:alpha', goals: ['goal:one'] })
  const inspected = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'two', operation: 'inspect', workspaceId: 'workspace:beta', goalId: null })))
  assert.equal(inspected.id, 'two')
  assert.equal(inspected.result.workspaceId, 'workspace:beta')
})

test('supervisory transport rejects malformed, oversized, and authority-changing requests', async () => {
  const transport = new SupervisoryTransport({ workspaces: () => [], goals: () => [], async inspect() { throw new Error('unused') } } as any, 256)
  const malformed = JSON.parse(await transport.handle('{'))
  assert.equal(malformed.id, null)
  assert.equal(malformed.error.code, 'MALFORMED_REQUEST')

  const mutation = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'mutate', operation: 'approve', proposalId: 'proposal:x' })))
  assert.equal(mutation.error.code, 'UNKNOWN_OPERATION')
  const unknown = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'extra', operation: 'list-workspaces', approval: true })))
  assert.equal(unknown.error.code, 'INVALID_REQUEST')
  const malformedWorkspace = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'goals', operation: 'list-goals', workspaceId: 'goal:wrong-kind' })))
  assert.equal(malformedWorkspace.error.code, 'INVALID_WORKSPACE_ID')
  const oversized = JSON.parse(await transport.handle(' '.repeat(257)))
  assert.equal(oversized.error.code, 'REQUEST_TOO_LARGE')
})

test('supervisory transport preserves deterministic host failure codes', async () => {
  const transport = new SupervisoryTransport({
    workspaces: () => [],
    goals: () => [],
    async inspect() { throw Object.assign(new Error('not visible'), { code: 'WORKSPACE_NOT_FOUND' }) },
  } as any)
  const response = JSON.parse(await transport.handle(JSON.stringify({ protocolVersion: '1.0', id: 'missing', operation: 'inspect', workspaceId: 'workspace:missing', goalId: null })))
  assert.deepEqual(response.error, { code: 'WORKSPACE_NOT_FOUND', message: 'not visible' })
})
