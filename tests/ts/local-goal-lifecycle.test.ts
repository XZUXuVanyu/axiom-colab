import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LocalGoalLifecycle, LocalGoalLifecycleError } from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function approvedPlan(hash = `sha256:${'1'.repeat(64)}` as const) {
  return {
    id: 'object:plan', key: 'goal:one:plan', revision: 1, value: { objective: 'Research safely.' },
    hash, proposalId: 'proposal:plan', committedAt: '2026-08-28T04:00:00.000Z',
  } as const
}

test('goal lifecycle persists stop, capability, and recovery state across restart', async () => {
  const root = join(tmpdir(), `axiom-goal-life-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const path = join(root, 'lifecycle.sqlite3')
  const revoked: string[] = []; const recovered: string[] = []; const goalActions: string[] = []
  const options = {
    approvedPlan: (workspaceId: string, goalId: string) => workspaceId === 'workspace:alpha' && goalId === 'goal:one' ? approvedPlan() : null,
    async revokeCapability(_workspaceId: string, capabilityId: string) { revoked.push(capabilityId) },
    async stopGoal() { goalActions.push('stop') }, async resumeGoal() { goalActions.push('resume') },
    async recoverWorkspace(workspaceId: string) { recovered.push(workspaceId) },
    now: () => new Date('2026-08-28T04:30:00.000Z'),
  }
  let lifecycle = new LocalGoalLifecycle(path, options as any)
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  lifecycle.trackCapability('workspace:alpha', 'goal:one', 'capability:active')
  lifecycle.requireRecovery('workspace:alpha')
  await lifecycle.stopGoal('workspace:alpha', 'goal:one')
  lifecycle.close()

  lifecycle = new LocalGoalLifecycle(path, options as any)
  assert.equal(lifecycle.inspectGoal('workspace:alpha', 'goal:one')?.canResume, true)
  assert.deepEqual(goalActions, ['stop'])
  assert.deepEqual(lifecycle.revocableCapabilities('workspace:alpha', 'goal:one'), ['capability:active'])
  assert.equal(lifecycle.recoveryRequired('workspace:alpha'), true)
  await lifecycle.revokeCapability('workspace:alpha', 'capability:active')
  await lifecycle.recoverWorkspace('workspace:alpha')
  await lifecycle.resumeGoal('workspace:alpha', 'goal:one')
  assert.deepEqual(revoked, ['capability:active'])
  assert.deepEqual(recovered, ['workspace:alpha'])
  assert.deepEqual(lifecycle.revocableCapabilities('workspace:alpha', 'goal:one'), [])
  assert.equal(lifecycle.recoveryRequired('workspace:alpha'), false)
  assert.deepEqual(goalActions, ['stop', 'resume'])
  lifecycle.close()
})

test('goal lifecycle rejects cross-workspace actions, replay, and stale approved plans', async () => {
  const root = join(tmpdir(), `axiom-goal-life-adversarial-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  let plan = approvedPlan()
  const lifecycle = new LocalGoalLifecycle(join(root, 'lifecycle.sqlite3'), {
    approvedPlan: (workspaceId, goalId) => workspaceId === 'workspace:alpha' && goalId === 'goal:one' ? plan : null,
    async revokeCapability() {}, async stopGoal() {}, async resumeGoal() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  lifecycle.trackCapability('workspace:alpha', 'goal:one', 'capability:active')
  await assert.rejects(
    lifecycle.stopGoal('workspace:beta', 'goal:one'),
    (error: unknown) => error instanceof LocalGoalLifecycleError && error.code === 'GOAL_NOT_FOUND',
  )
  await lifecycle.stopGoal('workspace:alpha', 'goal:one')
  await assert.rejects(
    lifecycle.stopGoal('workspace:alpha', 'goal:one'),
    (error: unknown) => error instanceof LocalGoalLifecycleError && error.code === 'GOAL_NOT_ACTIVE',
  )
  plan = approvedPlan(`sha256:${'2'.repeat(64)}`)
  assert.throws(
    () => lifecycle.inspectGoal('workspace:alpha', 'goal:one'),
    (error: unknown) => error instanceof LocalGoalLifecycleError && error.code === 'STALE_APPROVED_PLAN',
  )
  await assert.rejects(
    lifecycle.revokeCapability('workspace:beta', 'capability:active'),
    (error: unknown) => error instanceof LocalGoalLifecycleError && error.code === 'CAPABILITY_NOT_FOUND',
  )
  lifecycle.close()
})
