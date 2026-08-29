import { randomUUID } from 'node:crypto'

import type { JsonValue } from './harness-types.js'
import type { InvocationLedger, InvocationRecord } from './invocation-ledger.js'
import { contentHash, type LaboratoryId } from './laboratory-contract.js'
import {
  MemoryWorkflows,
  type Artifact,
  type WorkflowInvocation,
  type WorkingRevision,
} from './memory-workflows.js'

export interface GoalCall {
  readonly tool: string
  readonly arguments: JsonValue
  readonly artifactResult?: boolean
}

export interface ApprovedGoalPlan {
  readonly goalId: LaboratoryId<'goal'>
  readonly objective: string
  readonly calls: readonly GoalCall[]
}

export interface GoalObservation {
  readonly callId: LaboratoryId<'call'>
  readonly tool: string
  readonly result: JsonValue
}

export interface GoalSessionReport {
  readonly goalId: LaboratoryId<'goal'>
  readonly planRevisionId: LaboratoryId<'object'>
  readonly planHash: `sha256:${string}`
  readonly startedAt: string
  readonly completedAt: string
  readonly calls: readonly InvocationRecord[]
  readonly observations: readonly GoalObservation[]
  readonly resultingArtifactIds: readonly LaboratoryId<'object'>[]
}

export interface GoalToolInvoker {
  readonly ledger: InvocationLedger
  invoke(toolName: string, args: unknown, callId: string, signal: AbortSignal): Promise<JsonValue>
}

export class GoalCoordinatorError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'GoalCoordinatorError'
  }
}

export class GoalCoordinator {
  constructor(
    private readonly tools: GoalToolInvoker,
    private readonly workflows: MemoryWorkflows,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(
    approvedPlan: WorkingRevision<ApprovedGoalPlan>,
    reportInvocation: WorkflowInvocation,
    signal: AbortSignal,
  ): Promise<{ readonly report: GoalSessionReport; readonly reportArtifact: Artifact }> {
    const committed = this.workflows.readWorking<ApprovedGoalPlan>(reportInvocation, approvedPlan.key)
    if (committed === null || committed.id !== approvedPlan.id || committed.hash !== approvedPlan.hash) {
      throw new GoalCoordinatorError('UNAPPROVED_PLAN', 'goal plan is not the current committed working-memory revision')
    }
    const plan = approvedPlan.value
    if (!plan.goalId.startsWith('goal:') || plan.calls.length === 0) {
      throw new GoalCoordinatorError('INVALID_APPROVED_PLAN', 'approved goal plan must identify a goal and contain at least one call')
    }
    const startedAt = this.now().toISOString()
    const observations: GoalObservation[] = []
    const issuedCallIds = new Set<string>()
    const resultingArtifactIds: LaboratoryId<'object'>[] = []
    for (const call of plan.calls) {
      if (signal.aborted) throw new GoalCoordinatorError('GOAL_CANCELLED', 'goal execution was cancelled')
      const callId = `call:${randomUUID()}` as LaboratoryId<'call'>
      issuedCallIds.add(callId)
      const result = await this.tools.invoke(call.tool, call.arguments, callId, signal)
      observations.push({ callId, tool: call.tool, result })
      if (call.artifactResult === true && typeof result === 'object' && result !== null
          && !Array.isArray(result) && typeof result.id === 'string'
          && result.id.startsWith('object:')) {
        resultingArtifactIds.push(result.id as LaboratoryId<'object'>)
      }
    }
    const calls = this.tools.ledger.snapshot().filter((record) => issuedCallIds.has(record.callId))
    if (calls.length !== issuedCallIds.size
        || calls.some((record) => record.status !== 'succeeded')
        || observations.some((observation) => !calls.some((record) =>
          record.callId === observation.callId && record.tool === observation.tool))) {
      throw new GoalCoordinatorError(
        'INVALID_TOOL_EVIDENCE',
        'Tool ledger does not contain one successful matching record for every coordinator-issued call',
      )
    }
    const report: GoalSessionReport = {
      goalId: plan.goalId,
      planRevisionId: approvedPlan.id,
      planHash: approvedPlan.hash,
      startedAt,
      completedAt: this.now().toISOString(),
      calls,
      observations,
      resultingArtifactIds,
    }
    const bytes = Buffer.from(JSON.stringify(report), 'utf8')
    const reportArtifact = this.workflows.createArtifact(
      reportInvocation,
      bytes,
      { type: 'object', title: 'Axiom goal session report', protocolVersion: '1.0' },
      {
        operation: 'goal.session.report',
        parametersHash: contentHash({ goalId: plan.goalId, planHash: approvedPlan.hash }),
        softwareVersion: '1.0.0',
        validationId: null,
      },
    )
    return { report, reportArtifact }
  }
}
