import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
export class LocalGoalLifecycleError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'LocalGoalLifecycleError';
    }
}
function fail(code, message) {
    throw new LocalGoalLifecycleError(code, message);
}
export class LocalGoalLifecycle {
    options;
    databasePath;
    database;
    now;
    closed = false;
    constructor(path, options){
        this.options = options;
        this.databasePath = resolve(path);
        mkdirSync(dirname(this.databasePath), {
            recursive: true
        });
        this.database = new DatabaseSync(this.databasePath);
        this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        this.now = options.now ?? (()=>new Date());
        this.migrate();
    }
    migrate() {
        const version = this.database.prepare('PRAGMA user_version').get().user_version;
        if (version > 1) fail('UNSUPPORTED_GOAL_LIFECYCLE_VERSION', `goal lifecycle schema version ${version} is newer than supported version 1`);
        if (version === 0) this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE goals (
        workspace_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        plan_revision_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','stopped','completed')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(workspace_id,goal_id)
      ) STRICT;
      CREATE TABLE capabilities (
        workspace_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','revoked')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(workspace_id,capability_id),
        FOREIGN KEY(workspace_id,goal_id) REFERENCES goals(workspace_id,goal_id)
      ) STRICT;
      CREATE TABLE recovery (
        workspace_id TEXT PRIMARY KEY,
        required INTEGER NOT NULL CHECK(required IN (0,1)),
        updated_at TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version = 1;
      COMMIT;
    `);
    }
    registerGoal(workspaceId, goalId) {
        this.ensureOpen();
        const plan = this.options.approvedPlan(workspaceId, goalId);
        if (plan === null) fail('APPROVED_PLAN_NOT_FOUND', 'goal lifecycle requires a current approved working-memory plan');
        const existing = this.goalRow(workspaceId, goalId);
        if (existing !== null) {
            if (existing.plan_revision_id !== plan.id || existing.plan_hash !== plan.hash) fail('GOAL_ALREADY_REGISTERED', 'registered goal binds another approved plan');
            return;
        }
        this.database.prepare('INSERT INTO goals VALUES (?,?,?,?,?,?)').run(workspaceId, goalId, plan.id, plan.hash, 'active', this.now().toISOString());
    }
    trackCapability(workspaceId, goalId, capabilityId) {
        this.ensureOpen();
        if (this.goalRow(workspaceId, goalId) === null) fail('GOAL_NOT_FOUND', 'capability goal is not registered in this workspace');
        try {
            this.database.prepare('INSERT INTO capabilities VALUES (?,?,?,?,?)').run(workspaceId, goalId, capabilityId, 'active', this.now().toISOString());
        } catch (error) {
            if (String(error).includes('UNIQUE constraint failed')) fail('CAPABILITY_ALREADY_TRACKED', 'capability is already tracked');
            throw error;
        }
    }
    requireRecovery(workspaceId) {
        this.ensureOpen();
        this.database.prepare(`INSERT INTO recovery VALUES (?,?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET required=excluded.required,updated_at=excluded.updated_at`).run(workspaceId, 1, this.now().toISOString());
    }
    inspectGoal(workspaceId, goalId) {
        this.ensureOpen();
        const row = this.goalRow(workspaceId, goalId);
        if (row === null) return null;
        const plan = this.options.approvedPlan(workspaceId, goalId);
        if (plan === null || plan.id !== row.plan_revision_id || plan.hash !== row.plan_hash) {
            fail('STALE_APPROVED_PLAN', 'registered goal no longer binds the current approved working-memory plan');
        }
        return {
            goalId,
            plan,
            canStop: row.state === 'active',
            canResume: row.state === 'stopped'
        };
    }
    listGoals(workspaceId) {
        this.ensureOpen();
        const rows = this.database.prepare('SELECT goal_id FROM goals WHERE workspace_id=? ORDER BY goal_id').all(workspaceId);
        for (const row of rows)this.inspectGoal(workspaceId, row.goal_id);
        return rows.map((row)=>row.goal_id);
    }
    revocableCapabilities(workspaceId, goalId) {
        this.ensureOpen();
        const rows = goalId === null ? this.database.prepare("SELECT capability_id FROM capabilities WHERE workspace_id=? AND state='active' ORDER BY capability_id").all(workspaceId) : this.database.prepare("SELECT capability_id FROM capabilities WHERE workspace_id=? AND goal_id=? AND state='active' ORDER BY capability_id").all(workspaceId, goalId);
        return rows.map((row)=>row.capability_id);
    }
    recoveryRequired(workspaceId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT required FROM recovery WHERE workspace_id=?').get(workspaceId);
        return row?.required === 1;
    }
    async stopGoal(workspaceId, goalId) {
        this.assertCurrentPlan(workspaceId, goalId);
        if (this.goalRow(workspaceId, goalId)?.state !== 'active') fail('GOAL_NOT_ACTIVE', 'goal is not active');
        await this.options.stopGoal(workspaceId, goalId);
        this.transition(workspaceId, goalId, 'active', 'stopped', 'GOAL_NOT_ACTIVE');
    }
    async resumeGoal(workspaceId, goalId) {
        this.assertCurrentPlan(workspaceId, goalId);
        if (this.goalRow(workspaceId, goalId)?.state !== 'stopped') fail('GOAL_NOT_STOPPED', 'goal is not stopped');
        await this.options.resumeGoal(workspaceId, goalId);
        this.transition(workspaceId, goalId, 'stopped', 'active', 'GOAL_NOT_STOPPED');
    }
    async revokeCapability(workspaceId, capabilityId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT state FROM capabilities WHERE workspace_id=? AND capability_id=?').get(workspaceId, capabilityId);
        if (row === undefined) fail('CAPABILITY_NOT_FOUND', 'capability is not tracked in this workspace');
        if (row.state !== 'active') fail('CAPABILITY_ALREADY_REVOKED', 'capability has already been revoked');
        await this.options.revokeCapability(workspaceId, capabilityId);
        const changed = this.database.prepare("UPDATE capabilities SET state='revoked',updated_at=? WHERE workspace_id=? AND capability_id=? AND state='active'").run(this.now().toISOString(), workspaceId, capabilityId);
        if (changed.changes !== 1) fail('STALE_CAPABILITY_STATE', 'capability state changed during revocation');
    }
    async recoverWorkspace(workspaceId) {
        this.ensureOpen();
        if (!this.recoveryRequired(workspaceId)) fail('RECOVERY_NOT_REQUIRED', 'workspace does not require recovery');
        await this.options.recoverWorkspace(workspaceId);
        const changed = this.database.prepare('UPDATE recovery SET required=0,updated_at=? WHERE workspace_id=? AND required=1').run(this.now().toISOString(), workspaceId);
        if (changed.changes !== 1) fail('STALE_RECOVERY_STATE', 'workspace recovery state changed during recovery');
    }
    completeGoal(workspaceId, goalId) {
        this.assertCurrentPlan(workspaceId, goalId);
        const row = this.goalRow(workspaceId, goalId);
        if (row?.state === 'completed') return;
        if (row?.state !== 'active' && row?.state !== 'stopped') fail('GOAL_NOT_CLOSABLE', 'goal cannot be completed from its current state');
        const changed = this.database.prepare("UPDATE goals SET state='completed',updated_at=? WHERE workspace_id=? AND goal_id=? AND state IN ('active','stopped')").run(this.now().toISOString(), workspaceId, goalId);
        if (changed.changes !== 1) fail('STALE_GOAL_STATE', 'goal state changed during completion');
    }
    close() {
        if (!this.closed) {
            this.database.close();
            this.closed = true;
        }
    }
    assertCurrentPlan(workspaceId, goalId) {
        const row = this.goalRow(workspaceId, goalId);
        if (row === null) fail('GOAL_NOT_FOUND', 'goal is not registered in this workspace');
        const plan = this.options.approvedPlan(workspaceId, goalId);
        if (plan === null || plan.id !== row.plan_revision_id || plan.hash !== row.plan_hash) fail('STALE_APPROVED_PLAN', 'goal plan changed after lifecycle registration');
    }
    transition(workspaceId, goalId, from, to, code) {
        this.ensureOpen();
        const changed = this.database.prepare('UPDATE goals SET state=?,updated_at=? WHERE workspace_id=? AND goal_id=? AND state=?').run(to, this.now().toISOString(), workspaceId, goalId, from);
        if (changed.changes !== 1) fail(code, `goal cannot transition from ${from} to ${to}`);
    }
    goalRow(workspaceId, goalId) {
        this.ensureOpen();
        return this.database.prepare('SELECT plan_revision_id,plan_hash,state FROM goals WHERE workspace_id=? AND goal_id=?').get(workspaceId, goalId) ?? null;
    }
    ensureOpen() {
        if (this.closed) fail('GOAL_LIFECYCLE_CLOSED', 'goal lifecycle is closed');
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/local-goal-lifecycle.ts