import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { LaboratoryId } from './laboratory-contract.js'

export interface WorkspaceQuota {
  readonly maxBytes: number
  readonly maxObjects: number
}

export interface WorkspaceResources {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly usedBytes: number
  readonly objectCount: number
  readonly quota: WorkspaceQuota
  readonly expiredObjects: number
  readonly corruptObjects: number
}

export interface PayloadInspection {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly hash: `sha256:${string}`
  readonly size: number
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly status: 'valid' | 'expired' | 'corrupt'
}

export class MemoryStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'MemoryStoreError'
  }
}

export type FaultPoint = 'after-stage-sync' | 'after-payload-promotion' | 'after-metadata-commit'

export interface LocalMemoryStoreOptions {
  readonly defaultQuota?: WorkspaceQuota
  readonly now?: () => Date
  readonly faultInjector?: (point: FaultPoint) => void
}

type PayloadRow = { hash: string; size: number; created_at: string; expires_at: string | null; status: string }
type CountRow = { used_bytes: number; object_count: number; expired_objects: number; corrupt_objects: number }
type WorkspaceRow = { max_bytes: number; max_objects: number }

const DEFAULT_QUOTA: WorkspaceQuota = { maxBytes: 64 * 1024 * 1024, maxObjects: 1024 }

function fail(code: string, message: string): never { throw new MemoryStoreError(code, message) }

function safeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_QUOTA', `${field} must be a non-negative safe integer`)
}

function workspaceId(value: string): asserts value is LaboratoryId<'workspace'> {
  if (!/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed')
}

function payloadHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function hashHex(hash: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) fail('INVALID_CONTENT_HASH', 'payload hash is malformed')
  return hash.slice(7)
}

export class LocalMemoryStore {
  readonly root: string
  readonly databasePath: string
  readonly payloadRoot: string
  readonly stagingRoot: string
  private readonly database: DatabaseSync
  private readonly defaultQuota: WorkspaceQuota
  private readonly clock: () => Date
  private readonly injectFault?: (point: FaultPoint) => void
  private closed = false

  constructor(root: string, options: LocalMemoryStoreOptions = {}) {
    this.root = resolve(root)
    this.databasePath = join(this.root, 'metadata.sqlite3')
    this.payloadRoot = join(this.root, 'payloads')
    this.stagingRoot = join(this.root, 'staging')
    this.defaultQuota = options.defaultQuota ?? DEFAULT_QUOTA
    safeInteger(this.defaultQuota.maxBytes, 'maxBytes')
    safeInteger(this.defaultQuota.maxObjects, 'maxObjects')
    this.clock = options.now ?? (() => new Date())
    this.injectFault = options.faultInjector
    mkdirSync(this.payloadRoot, { recursive: true })
    mkdirSync(this.stagingRoot, { recursive: true })
    this.database = new DatabaseSync(this.databasePath)
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    this.migrate()
    this.recover()
  }

  private migrate(): void {
    const version = (this.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version > 1) fail('UNSUPPORTED_STORE_VERSION', `metadata schema version ${version} is newer than supported version 1`)
    if (version === 0) this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        max_bytes INTEGER NOT NULL CHECK(max_bytes >= 0),
        max_objects INTEGER NOT NULL CHECK(max_objects >= 0)
      ) STRICT;
      CREATE TABLE payloads (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        hash TEXT NOT NULL,
        size INTEGER NOT NULL CHECK(size >= 0),
        created_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('valid', 'corrupt')) DEFAULT 'valid',
        PRIMARY KEY(workspace_id, hash)
      ) STRICT;
      CREATE INDEX payload_expiry ON payloads(workspace_id, expires_at);
      PRAGMA user_version = 1;
      COMMIT;
    `)
  }

  private ensureOpen(): void { if (this.closed) fail('STORE_CLOSED', 'memory store is closed') }
  private now(): string { return this.clock().toISOString() }
  private payloadPath(hash: string): string {
    const hex = hashHex(hash)
    const path = resolve(this.payloadRoot, hex.slice(0, 2), hex)
    if (!path.startsWith(`${this.payloadRoot}${sep}`)) fail('PATH_ESCAPE', 'resolved payload path escaped the store')
    return path
  }

  private requireWorkspace(id: string): WorkspaceRow {
    workspaceId(id)
    const row = this.database.prepare('SELECT max_bytes, max_objects FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined
    if (!row) fail('WORKSPACE_NOT_FOUND', `workspace ${id} does not exist`)
    return row
  }

  createWorkspace(id: string, quota: WorkspaceQuota = this.defaultQuota): WorkspaceResources {
    this.ensureOpen(); workspaceId(id); safeInteger(quota.maxBytes, 'maxBytes'); safeInteger(quota.maxObjects, 'maxObjects')
    try {
      this.database.prepare('INSERT INTO workspaces(id, created_at, max_bytes, max_objects) VALUES (?, ?, ?, ?)').run(id, this.now(), quota.maxBytes, quota.maxObjects)
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) fail('WORKSPACE_ALREADY_EXISTS', `workspace ${id} already exists`)
      throw error
    }
    return this.resources(id)
  }

  reopenWorkspace(id: string): WorkspaceResources { this.ensureOpen(); this.requireWorkspace(id); return this.resources(id) }

  listWorkspaces(): readonly LaboratoryId<'workspace'>[] {
    this.ensureOpen()
    return (this.database.prepare('SELECT id FROM workspaces ORDER BY id').all() as Array<{ id: LaboratoryId<'workspace'> }>).map((row) => row.id)
  }

  putPayload(id: string, bytes: Uint8Array, expiresAt: string | null = null): PayloadInspection {
    this.ensureOpen(); const quota = this.requireWorkspace(id)
    const createdAt = this.now()
    if (expiresAt !== null && (!Number.isFinite(Date.parse(expiresAt)) || new Date(Date.parse(expiresAt)).toISOString() !== expiresAt || expiresAt <= createdAt)) fail('INVALID_EXPIRY', 'expiry must be a future canonical UTC timestamp')
    const hash = payloadHash(bytes)
    const existing = this.database.prepare('SELECT hash, size, created_at, expires_at, status FROM payloads WHERE workspace_id = ? AND hash = ?').get(id, hash) as PayloadRow | undefined
    if (existing) return this.inspectPayload(id, hash)
    const usage = this.resources(id)
    if (usage.objectCount + 1 > quota.max_objects || usage.usedBytes + bytes.byteLength > quota.max_bytes) fail('QUOTA_EXCEEDED', 'workspace payload quota would be exceeded')

    const destination = this.payloadPath(hash)
    const stage = join(this.stagingRoot, `${randomUUID()}.tmp`)
    const descriptor = openSync(stage, 'wx')
    try { writeFileSync(descriptor, bytes); fsyncSync(descriptor) } finally { closeSync(descriptor) }
    this.injectFault?.('after-stage-sync')
    mkdirSync(resolve(destination, '..'), { recursive: true })
    if (!existsSync(destination)) renameSync(stage, destination)
    else rmSync(stage, { force: true })
    this.injectFault?.('after-payload-promotion')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.resources(id)
      if (current.objectCount + 1 > quota.max_objects || current.usedBytes + bytes.byteLength > quota.max_bytes) fail('QUOTA_EXCEEDED', 'workspace payload quota would be exceeded')
      this.database.prepare('INSERT INTO payloads(workspace_id, hash, size, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?)').run(id, hash, bytes.byteLength, createdAt, expiresAt, 'valid')
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    this.injectFault?.('after-metadata-commit')
    return { workspaceId: id as LaboratoryId<'workspace'>, hash, size: bytes.byteLength, createdAt, expiresAt, status: 'valid' }
  }

  readPayload(id: string, hash: string): Uint8Array {
    const inspection = this.inspectPayload(id, hash)
    if (inspection.status === 'expired') fail('OBJECT_EXPIRED', 'payload has expired')
    if (inspection.status === 'corrupt') fail('CORRUPT_PAYLOAD', 'payload failed integrity validation')
    return new Uint8Array(readFileSync(this.payloadPath(hash)))
  }

  inspectPayload(id: string, hash: string): PayloadInspection {
    this.ensureOpen(); this.requireWorkspace(id); hashHex(hash)
    const row = this.database.prepare('SELECT hash, size, created_at, expires_at, status FROM payloads WHERE workspace_id = ? AND hash = ?').get(id, hash) as PayloadRow | undefined
    if (!row) fail('OBJECT_NOT_FOUND', 'payload is not visible in this workspace')
    let status: PayloadInspection['status'] = row.status as 'valid' | 'corrupt'
    if (status === 'valid' && row.expires_at !== null && row.expires_at <= this.now()) status = 'expired'
    if (status === 'valid' && !this.verifyFile(row.hash, row.size)) {
      this.database.prepare("UPDATE payloads SET status = 'corrupt' WHERE workspace_id = ? AND hash = ?").run(id, hash)
      status = 'corrupt'
    }
    return { workspaceId: id as LaboratoryId<'workspace'>, hash: row.hash as `sha256:${string}`, size: row.size, createdAt: row.created_at, expiresAt: row.expires_at, status }
  }

  resources(id: string): WorkspaceResources {
    this.ensureOpen(); const quota = this.requireWorkspace(id); const now = this.now()
    const row = this.database.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status = 'valid' AND (expires_at IS NULL OR expires_at > ?) THEN size ELSE 0 END), 0) AS used_bytes,
      COALESCE(SUM(CASE WHEN status = 'valid' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END), 0) AS object_count,
      COALESCE(SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END), 0) AS expired_objects,
      COALESCE(SUM(CASE WHEN status = 'corrupt' THEN 1 ELSE 0 END), 0) AS corrupt_objects
      FROM payloads WHERE workspace_id = ?`).get(now, now, now, id) as CountRow
    return { workspaceId: id as LaboratoryId<'workspace'>, usedBytes: row.used_bytes, objectCount: row.object_count, quota: { maxBytes: quota.max_bytes, maxObjects: quota.max_objects }, expiredObjects: row.expired_objects, corruptObjects: row.corrupt_objects }
  }

  purgeExpired(id: string): number {
    this.ensureOpen(); this.requireWorkspace(id)
    return Number(this.database.prepare('DELETE FROM payloads WHERE workspace_id = ? AND expires_at IS NOT NULL AND expires_at <= ?').run(id, this.now()).changes)
  }

  private verifyFile(hash: string, expectedSize: number): boolean {
    const path = this.payloadPath(hash)
    if (!existsSync(path) || statSync(path).size !== expectedSize) return false
    return payloadHash(readFileSync(path)) === hash
  }

  private recover(): void {
    for (const entry of readdirSync(this.stagingRoot, { withFileTypes: true })) if (entry.isFile() && basename(entry.name) === entry.name) rmSync(join(this.stagingRoot, entry.name), { force: true })
    const rows = this.database.prepare('SELECT workspace_id, hash, size FROM payloads').all() as Array<{ workspace_id: string; hash: string; size: number }>
    const referenced = new Set(rows.map((row) => hashHex(row.hash)))
    for (const prefix of readdirSync(this.payloadRoot, { withFileTypes: true })) {
      if (!prefix.isDirectory()) continue
      const directory = join(this.payloadRoot, prefix.name)
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isFile() && !referenced.has(entry.name)) rmSync(join(directory, entry.name), { force: true })
      }
    }
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const corrupt = this.database.prepare("UPDATE payloads SET status = 'corrupt' WHERE workspace_id = ? AND hash = ?")
      for (const row of rows) if (!this.verifyFile(row.hash, row.size)) corrupt.run(row.workspace_id, row.hash)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  close(): void { if (!this.closed) { this.database.close(); this.closed = true } }
}
