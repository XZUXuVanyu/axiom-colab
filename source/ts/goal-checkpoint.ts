import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { canonicalJson, contentHash, type LaboratoryId } from './laboratory-contract.js'

export interface GoalCheckpoint {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly goalId: LaboratoryId<'goal'>
  readonly sequence: number
  readonly planRevisionId: LaboratoryId<'object'>
  readonly planHash: `sha256:${string}`
  readonly status: 'active' | 'stopped' | 'completed'
  readonly completedCalls: number
  readonly latestCallId: LaboratoryId<'call'> | null
  readonly latestReportArtifactId: LaboratoryId<'object'> | null
  readonly latestReportHash: `sha256:${string}` | null
  readonly summary: string
  readonly checkpointedAt: string
  readonly checkpointHash: `sha256:${string}`
}

export type GoalCheckpointInput = Omit<GoalCheckpoint, 'sequence' | 'checkpointHash'>

export class GoalCheckpointError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'GoalCheckpointError'
  }
}

function fail(code: string, message: string): never { throw new GoalCheckpointError(code, message) }
function binding(value: GoalCheckpoint): unknown { const { checkpointHash: _hash, ...rest } = value; return rest }
type Row = { checkpoint_json: string }

/** Append-only operational checkpoints; these are recovery facts, not user-approved knowledge. */
export class LocalGoalCheckpointStore {
  private readonly database: DatabaseSync
  constructor(path: string) {
    const databasePath = resolve(path)
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath)
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
    `)
  }

  append(input: GoalCheckpointInput): GoalCheckpoint {
    const current = this.latest(input.workspaceId, input.goalId)
    if (current !== null && (current.planRevisionId !== input.planRevisionId || current.planHash !== input.planHash)) {
      fail('STALE_CHECKPOINT_PLAN', 'checkpoint does not bind the active approved plan')
    }
    if (current?.status === 'completed') fail('GOAL_ALREADY_COMPLETED', 'completed goal cannot receive another checkpoint')
    if (current !== null && input.completedCalls < current.completedCalls) fail('CHECKPOINT_REGRESSION', 'completed call count cannot decrease')
    if ((input.latestReportArtifactId === null) !== (input.latestReportHash === null)) fail('INVALID_CHECKPOINT_EVIDENCE', 'report identity and hash must be present together')
    const base = { ...input, sequence: (current?.sequence ?? 0) + 1 }
    const checkpoint = { ...base, checkpointHash: contentHash(base) } as GoalCheckpoint
    this.database.prepare('INSERT INTO goal_checkpoints VALUES (?, ?, ?, ?, ?)')
      .run(checkpoint.workspaceId, checkpoint.goalId, checkpoint.sequence, checkpoint.checkpointHash, canonicalJson(checkpoint))
    return structuredClone(checkpoint)
  }

  latest(workspaceId: LaboratoryId<'workspace'>, goalId: LaboratoryId<'goal'>): GoalCheckpoint | null {
    const row = this.database.prepare(`SELECT checkpoint_json FROM goal_checkpoints
      WHERE workspace_id=? AND goal_id=? ORDER BY sequence DESC LIMIT 1`).get(workspaceId, goalId) as Row | undefined
    if (row === undefined) return null
    let checkpoint: GoalCheckpoint
    try { checkpoint = JSON.parse(row.checkpoint_json) as GoalCheckpoint } catch { fail('CORRUPT_GOAL_CHECKPOINT', 'stored checkpoint is malformed') }
    if (checkpoint.workspaceId !== workspaceId || checkpoint.goalId !== goalId
        || checkpoint.checkpointHash !== contentHash(binding(checkpoint))) {
      fail('CORRUPT_GOAL_CHECKPOINT', 'stored checkpoint binding or hash is invalid')
    }
    return structuredClone(checkpoint)
  }

  close(): void { this.database.close() }
}
