import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  GoalCoordinator, GoalCoordinatorError, InvocationLedger, LocalMemoryStore,
  MemoryWorkflows, type ApprovedGoalPlan,
} from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function invocation(operations: readonly any[], authority: 'model' | 'user' | 'trusted-host') {
  const actorId = `actor:${authority}` as const
  const callId = `call:${authority}` as const
  return {
    authority,
    context: { workspaceId: 'workspace:alpha' as const, actorId, callId, toolId: 'tool:goal-coordinator' as const },
    capability: {
      protocolVersion: '1.0' as const, capabilityId: `capability:${authority}` as const,
      workspaceId: 'workspace:alpha' as const, actorId, toolId: 'tool:goal-coordinator' as const,
      callId, operations, issuedAt: '2026-08-28T00:00:00.000Z',
      expiresAt: '2026-08-28T01:00:00.000Z', nonce: 'trusted',
    },
  }
}

test('goal coordinator executes only a committed plan and seals its actual trail', async () => {
  const root = join(tmpdir(), `axiom-goal-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const now = () => new Date('2026-08-28T00:30:00.000Z')
  const store = new LocalMemoryStore(root, { now }); store.createWorkspace('workspace:alpha', { maxBytes: 100_000, maxObjects: 100 })
  const workflows = new MemoryWorkflows(store, { now })
  const model = invocation(['working.propose'], 'model')
  const user = invocation(['working.approve'], 'user')
  const trusted = invocation(['working.read', 'artifact.create', 'artifact.read'], 'trusted-host')
  const plan: ApprovedGoalPlan = {
    goalId: 'goal:research', objective: 'add two values',
    calls: [{ tool: 'add_numbers', arguments: { a: 2, b: 3 } }],
  }
  const proposal = workflows.proposeWorking(model, 'goal:research:plan', plan)
  const approved = workflows.approveWorking<ApprovedGoalPlan>(user, proposal.id, {
    workspaceId: 'workspace:alpha', proposalId: proposal.id,
    proposalHash: proposal.hash, decision: 'approved',
  })
  const ledger = new InvocationLedger()
  const tools = {
    ledger,
    async invoke(tool: string, args: unknown, callId: string) {
      ledger.start('call:overlapping', 'unrelated_tool'); ledger.succeed('call:overlapping', 1)
      ledger.start(callId, tool); ledger.succeed(callId, 1)
      const input = args as { a: number; b: number }
      return { result: input.a + input.b }
    },
  }
  const coordinator = new GoalCoordinator(tools, workflows, now)
  const completed = await coordinator.run(approved, trusted, new AbortController().signal)
  assert.equal(completed.report.observations[0]?.result.result, 5)
  assert.equal(completed.report.calls[0]?.status, 'succeeded')
  assert.equal(completed.report.calls.length, 1)
  assert.equal(completed.report.calls[0]?.callId, completed.report.observations[0]?.callId)
  assert.deepEqual(JSON.parse(Buffer.from(workflows.readArtifact(trusted, completed.reportArtifact.id)).toString('utf8')), completed.report)

  await assert.rejects(
    coordinator.run({ ...approved, hash: 'sha256:forged' }, trusted, new AbortController().signal),
    (error: unknown) => error instanceof GoalCoordinatorError && error.code === 'UNAPPROVED_PLAN',
  )
  workflows.close(); store.close()
})
