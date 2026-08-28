import { randomUUID } from 'node:crypto';
import { contentHash } from './laboratory-contract.js';
import { MemoryWorkflows } from './memory-workflows.js';
export class GoalCoordinatorError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'GoalCoordinatorError';
    }
}
export class GoalCoordinator {
    tools;
    workflows;
    now;
    constructor(tools, workflows, now = ()=>new Date()){
        this.tools = tools;
        this.workflows = workflows;
        this.now = now;
    }
    async run(approvedPlan, reportInvocation, signal) {
        const committed = this.workflows.readWorking(reportInvocation, approvedPlan.key);
        if (committed === null || committed.id !== approvedPlan.id || committed.hash !== approvedPlan.hash) {
            throw new GoalCoordinatorError('UNAPPROVED_PLAN', 'goal plan is not the current committed working-memory revision');
        }
        const plan = approvedPlan.value;
        if (!plan.goalId.startsWith('goal:') || plan.calls.length === 0) {
            throw new GoalCoordinatorError('INVALID_APPROVED_PLAN', 'approved goal plan must identify a goal and contain at least one call');
        }
        const startedAt = this.now().toISOString();
        const ledgerStart = this.tools.ledger.snapshot().length;
        const observations = [];
        const resultingArtifactIds = [];
        for (const call of plan.calls){
            if (signal.aborted) throw new GoalCoordinatorError('GOAL_CANCELLED', 'goal execution was cancelled');
            const callId = `call:${randomUUID()}`;
            const result = await this.tools.invoke(call.tool, call.arguments, callId, signal);
            observations.push({
                callId,
                tool: call.tool,
                result
            });
            if (call.artifactResult === true && typeof result === 'object' && result !== null && !Array.isArray(result) && typeof result.id === 'string' && result.id.startsWith('object:')) {
                resultingArtifactIds.push(result.id);
            }
        }
        const report = {
            goalId: plan.goalId,
            planRevisionId: approvedPlan.id,
            planHash: approvedPlan.hash,
            startedAt,
            completedAt: this.now().toISOString(),
            calls: this.tools.ledger.snapshot().slice(ledgerStart),
            observations,
            resultingArtifactIds
        };
        const bytes = Buffer.from(JSON.stringify(report), 'utf8');
        const reportArtifact = this.workflows.createArtifact(reportInvocation, bytes, {
            type: 'object',
            title: 'Axiom goal session report',
            protocolVersion: '1.0'
        }, {
            operation: 'goal.session.report',
            parametersHash: contentHash({
                goalId: plan.goalId,
                planHash: approvedPlan.hash
            }),
            softwareVersion: '1.0.0',
            validationId: null
        });
        return {
            report,
            reportArtifact
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/goal-coordinator.ts