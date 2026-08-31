import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { GoalDistillationService, LocalGoalCheckpointStore, LocalMemoryStore, MemoryWorkflows } from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = join(tmpdir(), `axiom-distillation-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const memory = new LocalMemoryStore(join(root, 'memory')); memory.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(memory)
  const invocation = { authority: 'trusted-host', context: { workspaceId: 'workspace:alpha', actorId: 'actor:host', callId: 'call:closure', toolId: 'tool:host' },
    capability: { protocolVersion: '1.0', capabilityId: 'capability:closure', workspaceId: 'workspace:alpha', actorId: 'actor:host', toolId: 'tool:host', callId: 'call:closure', operations: ['artifact.create', 'artifact.derive', 'artifact.read'], issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'closure' } } as any
  const report = workflows.createArtifact(invocation, Buffer.from('{}'), { title: 'report' }, { operation: 'goal.tool.execution', parametersHash: `sha256:${'1'.repeat(64)}`, softwareVersion: '1', validationId: null })
  const checkpoints = new LocalGoalCheckpointStore(join(root, 'checkpoints.sqlite3'))
  const checkpoint = checkpoints.append({ workspaceId: 'workspace:alpha', goalId: 'goal:one', planRevisionId: 'object:plan', planHash: `sha256:${'2'.repeat(64)}`,
    status: 'active', completedCalls: 1, latestCallId: 'call:one', latestReportArtifactId: report.id, latestReportHash: report.hash,
    summary: 'One call complete', checkpointedAt: '2026-08-31T01:00:00.000Z' })
  const service = new GoalDistillationService(join(root, 'distillation.sqlite3'), checkpoints, workflows, () => new Date('2026-08-31T02:00:00.000Z'), () => crypto.randomUUID())
  return { memory, workflows, invocation, report, checkpoints, checkpoint, service }
}

test('goal closure archives exact checkpoint evidence and creates review-only proposals', () => {
  const value = fixture()
  const result = value.service.closeGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'2'.repeat(64)}`, [
    { kind: 'experience', content: { summary: 'Observed result' }, evidenceArtifactIds: [value.report.id] },
    { kind: 'retention', content: { action: 'retain' }, evidenceArtifactIds: [value.report.id] },
  ], value.invocation)
  assert.equal(result.closure.checkpointHash, value.checkpoint.checkpointHash)
  assert.deepEqual(result.archive.parentIds, [value.report.id])
  assert.equal(result.proposals.every((proposal) => proposal.state === 'proposed'), true)
  assert.equal(result.proposals.some((proposal: any) => 'activated' in proposal), false)
  assert.throws(() => value.service.closeGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'2'.repeat(64)}`, [], value.invocation), (error: unknown) => (error as any).code === 'GOAL_ALREADY_CLOSED')
  value.service.close(); value.checkpoints.close(); value.workflows.close(); value.memory.close()
})

test('distillation review binds exact proposal and cannot replay or cross workspace', () => {
  const value = fixture()
  const { proposals } = value.service.closeGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'2'.repeat(64)}`, [
    { kind: 'knowledge', content: { claim: 'Needs review' }, evidenceArtifactIds: [value.report.id] },
  ], value.invocation)
  const proposal = proposals[0]!
  assert.throws(() => value.service.decide('workspace:beta', proposal.proposalId, proposal.proposalHash, 'accepted', 'actor:user', 'user'), (error: unknown) => (error as any).code === 'DISTILLATION_PROPOSAL_NOT_FOUND')
  assert.throws(() => value.service.decide('workspace:alpha', proposal.proposalId, `sha256:${'f'.repeat(64)}`, 'accepted', 'actor:user', 'user'), (error: unknown) => (error as any).code === 'STALE_DISTILLATION_PROPOSAL')
  assert.equal(value.service.decide('workspace:alpha', proposal.proposalId, proposal.proposalHash, 'deferred', 'actor:user', 'user').state, 'deferred')
  assert.throws(() => value.service.decide('workspace:alpha', proposal.proposalId, proposal.proposalHash, 'accepted', 'actor:user', 'user'), (error: unknown) => (error as any).code === 'DISTILLATION_ALREADY_DECIDED')
  value.service.close(); value.checkpoints.close(); value.workflows.close(); value.memory.close()
})

test('goal closure rejects stale plans and closure without sealed evidence', () => {
  const value = fixture()
  assert.throws(() => value.service.closeGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'f'.repeat(64)}`, [{ kind: 'cleanup', content: null, evidenceArtifactIds: [] }], value.invocation), (error: unknown) => (error as any).code === 'STALE_GOAL_CHECKPOINT')
  assert.throws(() => value.service.closeGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'2'.repeat(64)}`, [{ kind: 'knowledge', content: { claim: 'unsupported' }, evidenceArtifactIds: ['object:missing'] }], value.invocation), (error: unknown) => (error as any).code === 'ARTIFACT_NOT_FOUND')
  value.service.close(); value.checkpoints.close(); value.workflows.close(); value.memory.close()
})
