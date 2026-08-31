import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { LocalGoalCheckpointStore } from '../../dist/goal-checkpoint.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function input(completedCalls: number) {
  return {
    workspaceId: 'workspace:alpha', goalId: 'goal:one', planRevisionId: 'object:plan',
    planHash: `sha256:${'1'.repeat(64)}`, status: 'active' as const, completedCalls,
    latestCallId: `call:${completedCalls}`, latestReportArtifactId: `object:report-${completedCalls}`,
    latestReportHash: `sha256:${String(completedCalls).repeat(64).slice(0, 64)}`,
    summary: `Completed ${completedCalls}`, checkpointedAt: `2026-08-31T00:00:0${completedCalls}.000Z`,
  } as const
}

test('goal checkpoints append exact evidence and restore latest progress after restart', () => {
  const root = join(tmpdir(), `axiom-checkpoint-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const path = join(root, 'checkpoints.sqlite3')
  const first = new LocalGoalCheckpointStore(path)
  assert.equal(first.append(input(1)).sequence, 1)
  const second = first.append(input(2))
  assert.equal(second.sequence, 2)
  first.close()
  const reopened = new LocalGoalCheckpointStore(path)
  assert.equal(reopened.latest('workspace:alpha', 'goal:one')?.checkpointHash, second.checkpointHash)
  assert.equal(reopened.latest('workspace:alpha', 'goal:one')?.latestReportArtifactId, 'object:report-2')
  reopened.close()
})

test('goal checkpoints reject stale plans, evidence gaps, and progress regression', () => {
  const root = join(tmpdir(), `axiom-checkpoint-adversarial-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalGoalCheckpointStore(join(root, 'checkpoints.sqlite3'))
  store.append(input(2))
  assert.throws(() => store.append(input(1)), (error: unknown) => (error as any).code === 'CHECKPOINT_REGRESSION')
  assert.throws(() => store.append({ ...input(3), planHash: `sha256:${'f'.repeat(64)}` }), (error: unknown) => (error as any).code === 'STALE_CHECKPOINT_PLAN')
  assert.throws(() => store.append({ ...input(3), latestReportHash: null }), (error: unknown) => (error as any).code === 'INVALID_CHECKPOINT_EVIDENCE')
  store.close()
})
