import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, contentHash } from './laboratory-contract.js';
export class GoalCheckpointError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'GoalCheckpointError';
    }
}
function fail(code, message) {
    throw new GoalCheckpointError(code, message);
}
function binding(value) {
    const { checkpointHash: _hash, ...rest } = value;
    return rest;
}
export class LocalGoalCheckpointStore {
    database;
    constructor(path){
        const databasePath = resolve(path);
        mkdirSync(dirname(databasePath), {
            recursive: true
        });
        this.database = new DatabaseSync(databasePath);
        this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS goal_checkpoints (
        workspace_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        checkpoint_hash TEXT NOT NULL UNIQUE,
        checkpoint_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id, goal_id, sequence)
      ) STRICT;
    `);
    }
    append(input) {
        const current = this.latest(input.workspaceId, input.goalId);
        if (current !== null && (current.planRevisionId !== input.planRevisionId || current.planHash !== input.planHash)) {
            fail('STALE_CHECKPOINT_PLAN', 'checkpoint does not bind the active approved plan');
        }
        if (current?.status === 'completed') fail('GOAL_ALREADY_COMPLETED', 'completed goal cannot receive another checkpoint');
        if (current !== null && input.completedCalls < current.completedCalls) fail('CHECKPOINT_REGRESSION', 'completed call count cannot decrease');
        if (input.latestReportArtifactId === null !== (input.latestReportHash === null)) fail('INVALID_CHECKPOINT_EVIDENCE', 'report identity and hash must be present together');
        const base = {
            ...input,
            sequence: (current?.sequence ?? 0) + 1
        };
        const checkpoint = {
            ...base,
            checkpointHash: contentHash(base)
        };
        this.database.prepare('INSERT INTO goal_checkpoints VALUES (?, ?, ?, ?, ?)').run(checkpoint.workspaceId, checkpoint.goalId, checkpoint.sequence, checkpoint.checkpointHash, canonicalJson(checkpoint));
        return structuredClone(checkpoint);
    }
    latest(workspaceId, goalId) {
        const row = this.database.prepare(`SELECT checkpoint_json FROM goal_checkpoints
      WHERE workspace_id=? AND goal_id=? ORDER BY sequence DESC LIMIT 1`).get(workspaceId, goalId);
        if (row === undefined) return null;
        let checkpoint;
        try {
            checkpoint = JSON.parse(row.checkpoint_json);
        } catch  {
            fail('CORRUPT_GOAL_CHECKPOINT', 'stored checkpoint is malformed');
        }
        if (checkpoint.workspaceId !== workspaceId || checkpoint.goalId !== goalId || checkpoint.checkpointHash !== contentHash(binding(checkpoint))) {
            fail('CORRUPT_GOAL_CHECKPOINT', 'stored checkpoint binding or hash is invalid');
        }
        return structuredClone(checkpoint);
    }
    close() {
        this.database.close();
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/goal-checkpoint.ts