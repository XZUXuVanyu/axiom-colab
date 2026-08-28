import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import {
  CandidateContentError,
  captureCandidateFiles,
  safeCandidateRelativePath,
  type BoundFile,
  type CandidateFile,
  type CapturedCandidateFile,
} from './candidate-content.js'

import {
  LABORATORY_PROTOCOL_VERSION,
  canonicalJson,
  contentHash,
  type LaboratoryId,
} from './laboratory-contract.js'
import {
  ProcessExecutionError,
  ProcessRunner,
  type ProcessLimits,
} from './process-runner.js'

export type ValidationSuiteKind = 'candidate' | 'standard' | 'challenge'
export type ValidationOutcome = 'passed' | 'failed' | 'limited'

export type { BoundFile, CandidateFile } from './candidate-content.js'

export interface CandidateToolchain {
  readonly name: string
  readonly version: string
  readonly target: string
}

export interface CandidateValidationPolicy {
  readonly allowedExecutables: readonly string[]
  readonly process: ProcessLimits
  readonly maxCommands: number
}

export interface ValidationCommand {
  readonly commandId: string
  readonly executable: string
  readonly args?: readonly string[]
  readonly stdin?: string
  readonly cwd?: string
}

export interface ValidationSuite {
  readonly suiteId: string
  readonly kind: ValidationSuiteKind
  readonly commands: readonly ValidationCommand[]
}

export interface CandidateValidationRequest {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly validatorActorId: LaboratoryId<'actor'>
  readonly descriptor: unknown
  readonly sources: readonly CandidateFile[]
  readonly fixtures: readonly CandidateFile[]
  readonly toolchain: CandidateToolchain
  readonly policy: CandidateValidationPolicy
  readonly suites: readonly ValidationSuite[]
}

export interface BoundValidationSuite {
  readonly suiteId: string
  readonly kind: ValidationSuiteKind
  readonly definitionHash: `sha256:${string}`
  readonly commandCount: number
  readonly hidden: boolean
}

export interface CandidateSnapshot {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly snapshotId: LaboratoryId<'evidence'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly createdAt: string
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly sources: readonly BoundFile[]
  readonly fixtureHash: `sha256:${string}`
  readonly fixtures: readonly BoundFile[]
  readonly toolchain: CandidateToolchain
  readonly toolchainHash: `sha256:${string}`
  readonly policyHash: `sha256:${string}`
  readonly suites: readonly BoundValidationSuite[]
  readonly snapshotHash: `sha256:${string}`
}

export interface ObservedProcessResult {
  readonly commandId: string
  readonly commandHash: `sha256:${string}`
  readonly outcome: ValidationOutcome
  readonly exitCode: number | null
  readonly signalName: NodeJS.Signals | null
  readonly errorCode: string | null
  readonly durationMs: number
  readonly stdoutBytes: number
  readonly stderrBytes: number
  readonly stdoutHash: `sha256:${string}`
  readonly stderrHash: `sha256:${string}`
  readonly stdout: string | null
  readonly stderr: string | null
}

export interface ValidationSuiteRun {
  readonly suiteId: string
  readonly kind: ValidationSuiteKind
  readonly definitionHash: `sha256:${string}`
  readonly hidden: boolean
  readonly commandCount: number
  readonly outcome: ValidationOutcome
  readonly processes: readonly ObservedProcessResult[]
}

export interface ValidationRecord {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly validationId: LaboratoryId<'validation'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly validatorActorId: LaboratoryId<'actor'>
  readonly candidateSnapshotHash: `sha256:${string}`
  readonly authority: 'validator'
  readonly startedAt: string
  readonly completedAt: string
  readonly outcome: ValidationOutcome
  readonly suites: readonly ValidationSuiteRun[]
  readonly recordHash: `sha256:${string}`
}

export interface CandidateValidationResult {
  readonly snapshot: CandidateSnapshot
  readonly record: ValidationRecord
}

export class CandidateValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'CandidateValidationError'
  }
}

export interface CandidateValidationRunnerOptions {
  readonly runner?: ProcessRunner
  readonly temporaryRoot?: string
  readonly now?: () => Date
  readonly idFactory?: () => string
  readonly evidenceRepository?: ValidationEvidenceRepository
  readonly validatorCredential?: string
}

export interface ValidationEvidenceRepository {
  recordValidation(token: string, result: CandidateValidationResult, privatePayload: unknown): void
  isPromotionEligible(snapshotHash: string, record: ValidationRecord): boolean
}

interface PreparedCandidate {
  readonly snapshot: CandidateSnapshot
  readonly root: string
  readonly policy: CandidateValidationPolicy
  readonly suites: readonly ValidationSuite[]
  readonly privatePayload: unknown
}

const suiteOrder: Readonly<Record<ValidationSuiteKind, number>> = {
  candidate: 0,
  standard: 1,
  challenge: 2,
}

function fail(code: string, message: string): never {
  throw new CandidateValidationError(code, message)
}

function captureSuites(suites: readonly ValidationSuite[]): readonly ValidationSuite[] {
  return suites.map((suite) => ({
    suiteId: suite.suiteId,
    kind: suite.kind,
    commands: suite.commands.map((command) => ({
      commandId: command.commandId,
      executable: command.executable,
      args: [...(command.args ?? [])],
      ...(command.stdin === undefined ? {} : { stdin: command.stdin }),
      ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    })),
  }))
}

function publicCommandBinding(command: ValidationCommand): unknown {
  return {
    commandId: command.commandId,
    executable: command.executable,
    args: [...(command.args ?? [])],
    stdinHash: contentHash(command.stdin ?? ''),
    cwd: command.cwd ?? '.',
  }
}

function commandHash(command: ValidationCommand): `sha256:${string}` {
  return contentHash(publicCommandBinding(command))
}

function bindSuites(suites: readonly ValidationSuite[]): readonly BoundValidationSuite[] {
  const seenKinds = new Set<ValidationSuiteKind>()
  const seenIds = new Set<string>()
  const seenCommandIds = new Set<string>()
  const bound = suites.map((suite) => {
    if (seenKinds.has(suite.kind)) fail('DUPLICATE_SUITE_KIND', `validation suite kind ${suite.kind} is duplicated`)
    if (seenIds.has(suite.suiteId)) fail('DUPLICATE_SUITE_ID', `validation suite ${suite.suiteId} is duplicated`)
    if (suite.commands.length === 0) fail('EMPTY_VALIDATION_SUITE', `validation suite ${suite.suiteId} has no commands`)
    seenKinds.add(suite.kind)
    seenIds.add(suite.suiteId)
    for (const command of suite.commands) {
      if (seenCommandIds.has(command.commandId)) fail('DUPLICATE_COMMAND_ID', `validation command ${command.commandId} is duplicated`)
      seenCommandIds.add(command.commandId)
    }
    return {
      suiteId: suite.suiteId,
      kind: suite.kind,
      definitionHash: contentHash(suite.commands.map(publicCommandBinding)),
      commandCount: suite.commands.length,
      hidden: suite.kind === 'challenge',
    }
  }).sort((left, right) => suiteOrder[left.kind] - suiteOrder[right.kind])
  for (const kind of Object.keys(suiteOrder) as ValidationSuiteKind[]) {
    if (!seenKinds.has(kind)) fail('MISSING_VALIDATION_SUITE', `validation suite kind ${kind} is required`)
  }
  return bound
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item)
  return value
}

function overallOutcome(outcomes: readonly ValidationOutcome[]): ValidationOutcome {
  return outcomes.includes('limited') ? 'limited' : outcomes.includes('failed') ? 'failed' : 'passed'
}

function isLimitError(code: string): boolean {
  return code === 'TIMEOUT' || code === 'STDIN_LIMIT' || code === 'STDOUT_LIMIT' || code === 'STDERR_LIMIT'
}

function validatePolicy(policy: CandidateValidationPolicy): void {
  if (!Number.isSafeInteger(policy.maxCommands) || policy.maxCommands < 3) {
    fail('INVALID_VALIDATION_POLICY', 'maxCommands must be a safe integer of at least three')
  }
  if (policy.allowedExecutables.length === 0) fail('INVALID_VALIDATION_POLICY', 'allowedExecutables cannot be empty')
  for (const [field, value] of Object.entries(policy.process)) {
    if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_VALIDATION_POLICY', `process.${field} must be a positive safe integer`)
  }
}

function assertAllowedCommand(command: ValidationCommand, policy: CandidateValidationPolicy): void {
  if (!policy.allowedExecutables.includes(command.executable)) {
    fail('EXECUTABLE_NOT_ALLOWED', `command ${command.commandId} uses an executable outside the validation policy`)
  }
  if (command.cwd !== undefined) {
    try {
      safeCandidateRelativePath(command.cwd, `command ${command.commandId} cwd`)
    } catch (error) {
      if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2))
      throw error
    }
  }
}

export class CandidateValidationRunner {
  private readonly runner: ProcessRunner
  private readonly temporaryRoot: string
  private readonly now: () => Date
  private readonly idFactory: () => string
  private readonly evidenceRepository?: ValidationEvidenceRepository
  private readonly validatorCredential?: string
  private readonly issuedRecords = new WeakSet<ValidationRecord>()

  constructor(options: CandidateValidationRunnerOptions = {}) {
    this.runner = options.runner ?? new ProcessRunner()
    this.temporaryRoot = options.temporaryRoot ?? tmpdir()
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? randomUUID
    this.evidenceRepository = options.evidenceRepository
    this.validatorCredential = options.validatorCredential
    if ((this.evidenceRepository === undefined) !== (this.validatorCredential === undefined)) {
      fail('INVALID_VALIDATION_REPOSITORY', 'evidenceRepository and validatorCredential must be configured together')
    }
  }

  async validate(request: CandidateValidationRequest): Promise<CandidateValidationResult> {
    validatePolicy(request.policy)
    const totalCommands = request.suites.reduce((sum, suite) => sum + suite.commands.length, 0)
    if (totalCommands > request.policy.maxCommands) fail('COMMAND_LIMIT', `validation requests ${totalCommands} commands but policy allows ${request.policy.maxCommands}`)
    const prepared = await this.prepare(request)
    const startedAt = this.now().toISOString()
    try {
      const suiteRuns: ValidationSuiteRun[] = []
      const orderedSuites = [...prepared.suites].sort((left, right) => suiteOrder[left.kind] - suiteOrder[right.kind])
      for (const suite of orderedSuites) {
        const binding = prepared.snapshot.suites.find((item) => item.kind === suite.kind)
        if (binding === undefined) fail('INVALID_VALIDATION_STATE', `missing snapshot binding for ${suite.kind}`)
        const processes: ObservedProcessResult[] = []
        for (const command of suite.commands) {
          assertAllowedCommand(command, prepared.policy)
          processes.push(await this.execute(command, prepared.root, binding.hidden, prepared.policy.process))
        }
        suiteRuns.push({
          ...binding,
          outcome: overallOutcome(processes.map((process) => process.outcome)),
          processes,
        })
      }
      const completedAt = this.now().toISOString()
      const recordWithoutHash = {
        protocolVersion: LABORATORY_PROTOCOL_VERSION,
        validationId: `validation:${this.idFactory()}` as LaboratoryId<'validation'>,
        workspaceId: request.workspaceId,
        candidateId: request.candidateId,
        validatorActorId: request.validatorActorId,
        candidateSnapshotHash: prepared.snapshot.snapshotHash,
        authority: 'validator' as const,
        startedAt,
        completedAt,
        outcome: overallOutcome(suiteRuns.map((suite) => suite.outcome)),
        suites: suiteRuns,
      }
      const record = deepFreeze({ ...recordWithoutHash, recordHash: contentHash(recordWithoutHash) })
      const result = deepFreeze({ snapshot: prepared.snapshot, record })
      if (this.evidenceRepository !== undefined && this.validatorCredential !== undefined) {
        this.evidenceRepository.recordValidation(this.validatorCredential, result, prepared.privatePayload)
      }
      this.issuedRecords.add(record)
      return result
    } finally {
      await rm(prepared.root, { recursive: true, force: true })
    }
  }

  isPromotionEligible(snapshotHash: string, record: ValidationRecord): boolean {
    if (this.evidenceRepository !== undefined) {
      return this.evidenceRepository.isPromotionEligible(snapshotHash, record)
    }
    if (!this.issuedRecords.has(record)) return false
    const { recordHash, ...recordWithoutHash } = record
    return record.outcome === 'passed'
      && record.candidateSnapshotHash === snapshotHash
      && recordHash === contentHash(recordWithoutHash)
  }

  private async prepare(request: CandidateValidationRequest): Promise<PreparedCandidate> {
    let capturedSources: readonly CapturedCandidateFile[]
    let capturedFixtures: readonly CapturedCandidateFile[]
    try {
      capturedSources = captureCandidateFiles(request.sources, 'sources')
      capturedFixtures = captureCandidateFiles(request.fixtures, 'fixtures')
    } catch (error) {
      if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2))
      throw error
    }
    const sources = capturedSources.map((file) => file.binding)
    const fixtures = capturedFixtures.map((file) => file.binding)
    const capturedSuites = captureSuites(request.suites)
    const capturedPolicy: CandidateValidationPolicy = {
      allowedExecutables: [...request.policy.allowedExecutables],
      process: { ...request.policy.process },
      maxCommands: request.policy.maxCommands,
    }
    const allPaths = new Set(sources.map((file) => file.path))
    for (const fixture of fixtures) {
      if (allPaths.has(fixture.path)) fail('DUPLICATE_SNAPSHOT_PATH', `fixture path ${fixture.path} collides with a source`)
      allPaths.add(fixture.path)
    }
    const suites = bindSuites(capturedSuites)
    const binding = {
      workspaceId: request.workspaceId,
      candidateId: request.candidateId,
      descriptorHash: contentHash(request.descriptor),
      sourceHash: contentHash(sources),
      sources,
      fixtureHash: contentHash(fixtures),
      fixtures,
      toolchain: request.toolchain,
      toolchainHash: contentHash(request.toolchain),
      policyHash: contentHash(capturedPolicy),
      suites,
    }
    const snapshot: CandidateSnapshot = deepFreeze({
      protocolVersion: LABORATORY_PROTOCOL_VERSION,
      snapshotId: `evidence:${this.idFactory()}` as LaboratoryId<'evidence'>,
      ...binding,
      createdAt: this.now().toISOString(),
      snapshotHash: contentHash(binding),
    })
    await mkdir(this.temporaryRoot, { recursive: true })
    const root = await mkdtemp(resolve(this.temporaryRoot, 'axiom-validation-'))
    try {
      for (const file of [...capturedSources, ...capturedFixtures]) {
        const path = resolve(root, file.path)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, file.bytes, { flag: 'wx' })
      }
      const privatePayload = {
        descriptor: request.descriptor,
        sources: capturedSources.map((file) => ({ path: file.path, contentBase64: Buffer.from(file.bytes).toString('base64') })),
        fixtures: capturedFixtures.map((file) => ({ path: file.path, contentBase64: Buffer.from(file.bytes).toString('base64') })),
        toolchain: request.toolchain,
        policy: capturedPolicy,
        suites: capturedSuites,
      }
      return { snapshot, root, policy: capturedPolicy, suites: capturedSuites, privatePayload }
    } catch (error) {
      await rm(root, { recursive: true, force: true })
      throw error
    }
  }

  private async execute(command: ValidationCommand, root: string, hidden: boolean, limits: ProcessLimits): Promise<ObservedProcessResult> {
    const startedAt = performance.now()
    const bindingHash = commandHash(command)
    try {
      const result = await this.runner.run(command.executable, {
        ...limits,
        args: command.args,
        stdin: command.stdin,
        cwd: resolve(root, command.cwd ?? '.'),
      })
      return {
        commandId: command.commandId,
        commandHash: bindingHash,
        outcome: 'passed',
        exitCode: result.exitCode,
        signalName: null,
        errorCode: null,
        durationMs: result.durationMs,
        stdoutBytes: Buffer.byteLength(result.stdout),
        stderrBytes: Buffer.byteLength(result.stderr),
        stdoutHash: contentHash(result.stdout),
        stderrHash: contentHash(result.stderr),
        stdout: hidden ? null : result.stdout,
        stderr: hidden ? null : result.stderr,
      }
    } catch (error) {
      if (!(error instanceof ProcessExecutionError)) throw error
      const stdout = error.stdout
      const stderr = error.stderr
      return {
        commandId: command.commandId,
        commandHash: bindingHash,
        outcome: isLimitError(error.code) ? 'limited' : 'failed',
        exitCode: error.exitCode,
        signalName: error.signalName,
        errorCode: error.code,
        durationMs: error.durationMs ?? performance.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr),
        stdoutHash: contentHash(stdout),
        stderrHash: contentHash(stderr),
        stdout: hidden ? null : stdout,
        stderr: hidden ? null : stderr,
      }
    }
  }
}

export function validationRecordJson(record: ValidationRecord): string {
  return canonicalJson(record)
}
