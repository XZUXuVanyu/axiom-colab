import { createHash, randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  InstalledExecutableLoader,
  installedExecutableEvidenceBinding,
  type InstalledExecutableAuthority,
  type InstalledExecutableEvidence,
  type LoadedToolExecutableBinding,
} from './installed-executable-loader.js'
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash, type LaboratoryId } from './laboratory-contract.js'
import type { InstalledToolRegistration } from './tool-installation.js'
import { ProcessRunner, type ProcessLimits } from './process-runner.js'

export interface InstalledExecutableBuildResult {
  readonly bytes: Uint8Array
  readonly relativeExecutablePath: string
}

export interface InstalledExecutableBuildBackend {
  build(registration: InstalledToolRegistration): Promise<InstalledExecutableBuildResult>
}

export interface InstalledExecutableBuildCommand {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
}

export interface ShellFreeInstalledExecutableBuildOptions {
  readonly commands: readonly InstalledExecutableBuildCommand[]
  readonly outputPath: string
  readonly installedPath: string
  readonly limits: ProcessLimits
  readonly runner?: Pick<ProcessRunner, 'run'>
}

/** Runs a fixed host-owned command profile without a shell against captured installed source. */
export class ShellFreeInstalledExecutableBuildBackend implements InstalledExecutableBuildBackend {
  private readonly runner: Pick<ProcessRunner, 'run'>
  constructor(private readonly options: ShellFreeInstalledExecutableBuildOptions) {
    if (options.commands.length === 0) fail('INVALID_BUILD_PROFILE', 'executable build profile must contain commands')
    this.runner = options.runner ?? new ProcessRunner()
  }

  async build(registration: InstalledToolRegistration): Promise<InstalledExecutableBuildResult> {
    const expand = (value: string): string => value.replaceAll('{publicName}', registration.publicName)
    for (const command of this.options.commands) {
      if (!isAbsolute(command.executable)) fail('INVALID_BUILD_PROFILE', 'build command executable must be absolute')
      const cwd = resolve(registration.installedRoot, expand(command.cwd))
      if (isAbsolute(command.cwd) || !contained(registration.installedRoot, cwd)) fail('BUILD_PATH_ESCAPE', 'build working directory escaped the installation')
      const result = await this.runner.run(command.executable, {
        ...this.options.limits, args: command.args.map(expand), cwd,
      })
      if (result.exitCode !== 0) fail('EXECUTABLE_BUILD_FAILED', `trusted build command exited with ${result.exitCode}`)
    }
    const output = resolve(registration.installedRoot, expand(this.options.outputPath))
    if (isAbsolute(this.options.outputPath) || !contained(registration.installedRoot, output)) fail('BUILD_PATH_ESCAPE', 'build output escaped the installation')
    let bytes: Uint8Array
    try { bytes = readFileSync(output) } catch { fail('EXECUTABLE_BUILD_OUTPUT_MISSING', 'trusted build profile did not produce its configured output') }
    return { bytes, relativeExecutablePath: expand(this.options.installedPath) }
  }
}

export class InstalledExecutableAuthorityError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'InstalledExecutableAuthorityError'
  }
}

function fail(code: string, message: string): never { throw new InstalledExecutableAuthorityError(code, message) }

function contained(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function bytesHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

type EvidenceRow = { public_json: string }

/**
 * The only local boundary allowed to turn an exact installed candidate into an
 * executable. Build output is captured once, written beneath that installation,
 * and authenticated in a restart-safe store before it can be loaded.
 */
export class LocalInstalledExecutableAuthority implements InstalledExecutableAuthority {
  private readonly database: DatabaseSync
  private readonly loader: InstalledExecutableLoader

  constructor(
    databasePath: string,
    private readonly backend: InstalledExecutableBuildBackend,
    private readonly actorId: LaboratoryId<'actor'>,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
  ) {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true })
    this.database = new DatabaseSync(resolve(databasePath))
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS installed_executables (
        executable_evidence_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        installation_id TEXT NOT NULL UNIQUE,
        evidence_hash TEXT NOT NULL UNIQUE,
        public_json TEXT NOT NULL
      ) STRICT;
    `)
    this.loader = new InstalledExecutableLoader(this)
  }

  async prepare(registration: InstalledToolRegistration): Promise<LoadedToolExecutableBinding> {
    const existing = this.find(registration)
    if (existing !== null) return this.loader.load(registration, existing)
    const built = await this.backend.build(structuredClone(registration))
    if (!(built.bytes instanceof Uint8Array) || built.bytes.byteLength === 0) fail('INVALID_BUILD_OUTPUT', 'trusted build backend returned no executable bytes')
    if (isAbsolute(built.relativeExecutablePath)) fail('EXECUTABLE_PATH_ESCAPE', 'build output path must be relative to the installation')
    const executable = resolve(registration.installedRoot, built.relativeExecutablePath)
    if (!contained(registration.installedRoot, executable)) fail('EXECUTABLE_PATH_ESCAPE', 'build output escaped the exact installation')

    const staging = `${executable}.staging-${this.idFactory()}`
    mkdirSync(dirname(executable), { recursive: true })
    let handle: number | undefined
    try {
      handle = openSync(staging, 'wx')
      writeFileSync(handle, built.bytes)
      closeSync(handle); handle = undefined
      renameSync(staging, executable)
    } catch (error) {
      if (handle !== undefined) closeSync(handle)
      rmSync(staging, { force: true })
      throw error
    }

    const base = {
      protocolVersion: LABORATORY_PROTOCOL_VERSION,
      executableEvidenceId: `evidence:${this.idFactory()}` as LaboratoryId<'evidence'>,
      workspaceId: registration.workspaceId,
      installationId: registration.installationId,
      installationEvidenceHash: registration.installationEvidenceHash,
      candidateId: registration.candidateId,
      candidateHash: registration.candidateHash,
      descriptorHash: registration.descriptorHash,
      sourceHash: registration.sourceHash,
      publicName: registration.publicName,
      relativeExecutablePath: built.relativeExecutablePath,
      executableHash: bytesHash(built.bytes),
      producedAt: this.now().toISOString(),
      producedBy: this.actorId,
    }
    const evidence = { ...base, evidenceHash: contentHash(base) } as InstalledExecutableEvidence
    try {
      this.database.prepare(`INSERT INTO installed_executables
        (executable_evidence_id, workspace_id, installation_id, evidence_hash, public_json)
        VALUES (?, ?, ?, ?, ?)`)
        .run(evidence.executableEvidenceId, evidence.workspaceId, evidence.installationId, evidence.evidenceHash, canonicalJson(evidence))
    } catch (error) {
      rmSync(executable, { force: true })
      throw error
    }
    return this.loader.load(registration, evidence)
  }

  isLoadEligible(evidence: InstalledExecutableEvidence): boolean {
    const row = this.database.prepare('SELECT public_json FROM installed_executables WHERE executable_evidence_id = ? AND evidence_hash = ?')
      .get(evidence.executableEvidenceId, evidence.evidenceHash) as EvidenceRow | undefined
    if (row === undefined) return false
    try {
      const stored = JSON.parse(row.public_json) as InstalledExecutableEvidence
      return canonicalJson(stored) === canonicalJson(evidence)
        && evidence.evidenceHash === contentHash(installedExecutableEvidenceBinding(evidence))
    } catch { return false }
  }

  close(): void { this.database.close() }

  private find(registration: InstalledToolRegistration): InstalledExecutableEvidence | null {
    const row = this.database.prepare('SELECT public_json FROM installed_executables WHERE installation_id = ?')
      .get(registration.installationId) as EvidenceRow | undefined
    if (row === undefined) return null
    let evidence: InstalledExecutableEvidence
    try { evidence = JSON.parse(row.public_json) as InstalledExecutableEvidence }
    catch { fail('CORRUPT_EXECUTABLE_EVIDENCE', 'stored executable evidence is malformed') }
    if (evidence.workspaceId !== registration.workspaceId) fail('EXECUTABLE_BINDING_MISMATCH', 'stored executable evidence belongs to another workspace')
    return evidence
  }
}
