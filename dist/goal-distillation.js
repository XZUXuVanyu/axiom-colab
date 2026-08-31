import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, contentHash } from './laboratory-contract.js';
export class GoalDistillationError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'GoalDistillationError';
    }
}
function fail(code, message) {
    throw new GoalDistillationError(code, message);
}
function closureBinding(value) {
    const { closureHash: _hash, ...binding } = value;
    return binding;
}
function proposalBinding(value) {
    const { proposalHash: _hash, state: _state, decidedAt: _at, decidedBy: _by, ...binding } = value;
    return binding;
}
export class GoalDistillationService {
    checkpoints;
    workflows;
    now;
    idFactory;
    database;
    constructor(path, checkpoints, workflows, now = ()=>new Date(), idFactory = randomUUID){
        this.checkpoints = checkpoints;
        this.workflows = workflows;
        this.now = now;
        this.idFactory = idFactory;
        const databasePath = resolve(path);
        mkdirSync(dirname(databasePath), {
            recursive: true
        });
        this.database = new DatabaseSync(databasePath);
        this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS goal_closures(workspace_id TEXT NOT NULL,goal_id TEXT NOT NULL,public_json TEXT NOT NULL,PRIMARY KEY(workspace_id,goal_id)) STRICT;
      CREATE TABLE IF NOT EXISTS distillation_proposals(workspace_id TEXT NOT NULL,goal_id TEXT NOT NULL,proposal_id TEXT PRIMARY KEY,proposal_hash TEXT NOT NULL UNIQUE,public_json TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('proposed','accepted','rejected','deferred')),decided_at TEXT,decided_by TEXT) STRICT;`);
    }
    closeGoal(workspaceId, goalId, planRevisionId, planHash, drafts, invocation) {
        const prior = this.inspectClosure(workspaceId, goalId);
        if (prior !== null) fail('GOAL_ALREADY_CLOSED', 'goal already has an immutable closure');
        if (invocation.authority !== 'trusted-host' || invocation.context.workspaceId !== workspaceId) fail('CLOSURE_AUTHORITY_MISMATCH', 'goal closure requires workspace-scoped trusted-host authority');
        const checkpoint = this.checkpoints.latest(workspaceId, goalId);
        this.assertCheckpoint(checkpoint, planRevisionId, planHash);
        if (drafts.length === 0) fail('DISTILLATION_REQUIRED', 'goal closure requires reviewable distillation proposals');
        const proposedAt = this.now().toISOString();
        const proposals = drafts.map((draft)=>{
            if (draft.evidenceArtifactIds.some((id)=>!id.startsWith('object:'))) fail('INVALID_DISTILLATION_EVIDENCE', 'proposal evidence identity is malformed');
            for (const artifactId of draft.evidenceArtifactIds)this.workflows.inspectArtifact(invocation, artifactId);
            const base = {
                proposalId: `proposal:${this.idFactory()}`,
                workspaceId,
                goalId,
                kind: draft.kind,
                content: draft.content,
                evidenceArtifactIds: [
                    ...draft.evidenceArtifactIds
                ],
                proposedAt
            };
            return {
                ...base,
                proposalHash: contentHash(base),
                state: 'proposed',
                decidedAt: null,
                decidedBy: null
            };
        });
        const closureId = `evidence:${this.idFactory()}`;
        const archivePayload = {
            protocolVersion: '1.0',
            closureId,
            workspaceId,
            goalId,
            planRevisionId,
            planHash,
            checkpoint,
            proposals: proposals.map((proposal)=>({
                    ...proposal
                }))
        };
        const archiveParents = [
            ...new Set([
                checkpoint.latestReportArtifactId,
                ...proposals.flatMap((proposal)=>proposal.evidenceArtifactIds)
            ])
        ];
        const archive = this.workflows.deriveArtifact(invocation, archiveParents, Buffer.from(canonicalJson(archivePayload), 'utf8'), {
            type: 'object',
            title: 'Axiom immutable goal session archive',
            protocolVersion: '1.0'
        }, {
            operation: 'goal.closure.archive',
            parametersHash: contentHash({
                closureId,
                checkpointHash: checkpoint.checkpointHash
            }),
            softwareVersion: '1.0.0',
            validationId: null
        });
        const closureBase = {
            closureId,
            workspaceId,
            goalId,
            planRevisionId,
            planHash,
            checkpointHash: checkpoint.checkpointHash,
            archiveArtifactId: archive.id,
            archiveHash: archive.hash,
            proposalIds: proposals.map((proposal)=>proposal.proposalId),
            closedAt: proposedAt
        };
        const closure = {
            ...closureBase,
            closureHash: contentHash(closureBase)
        };
        this.database.exec('BEGIN IMMEDIATE');
        try {
            this.database.prepare('INSERT INTO goal_closures VALUES (?,?,?)').run(workspaceId, goalId, canonicalJson(closure));
            const statement = this.database.prepare('INSERT INTO distillation_proposals VALUES (?,?,?,?,?,?,?,?)');
            for (const proposal of proposals)statement.run(workspaceId, goalId, proposal.proposalId, proposal.proposalHash, canonicalJson(proposal), proposal.state, null, null);
            this.database.exec('COMMIT');
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
        return {
            closure,
            proposals,
            archive
        };
    }
    decide(workspaceId, proposalId, proposalHash, decision, actorId, authority) {
        if (authority !== 'user') fail('AUTHORITY_NOT_PERMITTED', 'only user authority may review distillation proposals');
        const row = this.database.prepare('SELECT public_json,state,decided_at,decided_by FROM distillation_proposals WHERE workspace_id=? AND proposal_id=?').get(workspaceId, proposalId);
        if (row === undefined) fail('DISTILLATION_PROPOSAL_NOT_FOUND', 'proposal is not visible in this workspace');
        const proposal = JSON.parse(row.public_json);
        if (proposal.proposalHash !== proposalHash || proposal.proposalHash !== contentHash(proposalBinding(proposal))) fail('STALE_DISTILLATION_PROPOSAL', 'decision does not bind the exact proposal');
        if (row.state !== 'proposed') fail('DISTILLATION_ALREADY_DECIDED', 'proposal already has a review decision');
        const decidedAt = this.now().toISOString();
        this.database.prepare('UPDATE distillation_proposals SET state=?,decided_at=?,decided_by=? WHERE workspace_id=? AND proposal_id=? AND state=?').run(decision, decidedAt, actorId, workspaceId, proposalId, 'proposed');
        return {
            ...proposal,
            state: decision,
            decidedAt,
            decidedBy: actorId
        };
    }
    inspectClosure(workspaceId, goalId) {
        const row = this.database.prepare('SELECT public_json FROM goal_closures WHERE workspace_id=? AND goal_id=?').get(workspaceId, goalId);
        if (row === undefined) return null;
        const closure = JSON.parse(row.public_json);
        if (closure.closureHash !== contentHash(closureBinding(closure))) fail('CORRUPT_GOAL_CLOSURE', 'stored goal closure hash is invalid');
        return closure;
    }
    close() {
        this.database.close();
    }
    assertCheckpoint(checkpoint, planRevisionId, planHash) {
        if (checkpoint === null || checkpoint.planRevisionId !== planRevisionId || checkpoint.planHash !== planHash) fail('STALE_GOAL_CHECKPOINT', 'closure must bind the latest checkpoint for the exact approved plan');
        if (checkpoint.latestReportArtifactId === null || checkpoint.latestReportHash === null) fail('GOAL_HAS_NO_EVIDENCE', 'closure requires at least one sealed Tool report');
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/goal-distillation.ts