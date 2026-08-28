import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { LocalCandidateRepository } from '../../dist/candidate-repository.js'
import { CandidateValidationRunner } from '../../dist/candidate-validation.js'
import { ToolWorkshop } from '../../dist/tool-workshop.js'
import { ToolInstallationProposalService } from '../../dist/tool-installation-proposal.js'
import { ToolInstallationService } from '../../dist/tool-installation.js'
import { ProcessRunner } from '../../dist/process-runner.js'
import { canonicalJson } from '../../dist/laboratory-contract.js'

const roots: string[] = []
function databasePath(): string {
  const root = join(tmpdir(), `axiom-candidates-${crypto.randomUUID()}`)
  mkdirSync(root)
  roots.push(root)
  return join(root, 'candidates.sqlite3')
}
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

let nextId = 0
const model = { workspaceId: 'workspace:alpha' as const, actorId: 'actor:model' as const, authority: 'model' as const }
const specification = {
  problem: 'Provide one deterministic calculation.',
  publicName: 'calculate_value',
  description: 'Calculates a value.',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'number' },
  requestedPermissions: [] as string[],
  acceptanceCriteria: ['Returns the expected value.'],
}
const descriptor = { name: 'calculate_value', inputSchema: { type: 'object' }, outputSchema: { type: 'number' } }
function workshop(repository: LocalCandidateRepository): ToolWorkshop {
  return new ToolWorkshop({ repository, now: () => new Date('2026-08-28T03:00:00.000Z'), idFactory: () => `repository-${++nextId}` })
}

test('candidate specifications, bytes, and revision history survive restart', () => {
  const path = databasePath()
  let repository = new LocalCandidateRepository(path)
  let service = workshop(repository)
  const defined = service.defineSpecification(model, specification)
  const first = service.createCandidateRevision(model, {
    specificationId: defined.specificationId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'revision one' }],
  })
  repository.close()

  repository = new LocalCandidateRepository(path)
  service = workshop(repository)
  assert.equal(Buffer.from(service.materializeRevision(model, first.revisionId).sources[0]?.content as Uint8Array).toString(), 'revision one')
  const second = service.createCandidateRevision(model, {
    specificationId: defined.specificationId,
    parentRevisionId: first.revisionId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'revision two' }],
  })
  assert.deepEqual(service.listCandidateRevisions(model, first.candidateId).map((revision) => revision.state), ['superseded', 'current'])
  assert.equal(second.parentCandidateHash, first.candidateHash)
  assert.throws(
    () => service.materializeRevision({ ...model, workspaceId: 'workspace:other' }, first.revisionId),
    (error: unknown) => (error as { code?: string }).code === 'CANDIDATE_REVISION_NOT_FOUND',
  )
  repository.close()

  const database = new DatabaseSync(path)
  database.prepare("UPDATE candidate_revisions SET sources_json='[]' WHERE revision_id=?").run(first.revisionId)
  database.close()
  repository = new LocalCandidateRepository(path)
  service = workshop(repository)
  assert.throws(
    () => service.materializeRevision(model, first.revisionId),
    (error: unknown) => (error as { code?: string }).code === 'CORRUPT_CANDIDATE_PAYLOAD',
  )
  repository.close()
})

const fixture = fileURLToPath(new URL('../fixtures/validation-child.mjs', import.meta.url))
function validationRequest() {
  const command = (commandId: string, mode: string, stdin?: string) => ({ commandId, executable: process.execPath, args: [fixture, mode], ...(stdin === undefined ? {} : { stdin }) })
  return {
    workspaceId: 'workspace:alpha' as const,
    candidateId: 'tool:durable' as const,
    validatorActorId: 'actor:validator' as const,
    descriptor: { name: 'durable' },
    sources: [{ path: 'src/tool.cpp', content: 'source' }],
    fixtures: [{ path: 'fixture.txt', content: 'fixture' }],
    toolchain: { name: 'node', version: process.version, target: process.platform },
    policy: { allowedExecutables: [process.execPath], process: { timeoutMs: 1000, maxStdinBytes: 4096, maxStdoutBytes: 4096, maxStderrBytes: 4096, killGraceMs: 20 }, maxCommands: 3 },
    suites: [
      { suiteId: 'candidate', kind: 'candidate' as const, commands: [command('candidate-1', 'pass')] },
      { suiteId: 'standard', kind: 'standard' as const, commands: [command('standard-1', 'pass')] },
      { suiteId: 'challenge', kind: 'challenge' as const, commands: [command('challenge-1', 'challenge', 'secret-constraint')] },
    ],
  }
}

function confinedExecutionBackend() {
  const processRunner = new ProcessRunner()
  return {
    confinement: { backend: 'test-confined', filesystem: true, descendantProcesses: true, network: true, cpu: true, memory: true },
    validatePolicy() {},
    async run(command: { executable: string; args?: readonly string[]; stdin?: string; cwd?: string }, root: string, limits: { timeoutMs: number; maxStdinBytes: number; maxStdoutBytes: number; maxStderrBytes: number; killGraceMs: number }) {
      return await processRunner.run(command.executable, { ...limits, args: command.args, stdin: command.stdin, cwd: resolve(root, command.cwd ?? '.') })
    },
  }
}

async function approvedCandidate(path: string) {
  const repository = new LocalCandidateRepository(path)
  const service = workshop(repository)
  const defined = service.defineSpecification(model, { ...specification, requestedPermissions: ['memory.compute.read'] })
  const revision = service.createCandidateRevision(model, {
    specificationId: defined.specificationId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'approved source bytes' }],
  })
  const token = repository.issueValidatorCredential('actor:validator')
  const executionBackend = confinedExecutionBackend()
  const validator = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token, executionBackend })
  const request = validationRequest()
  const validation = await validator.validate({
    ...request,
    candidateId: revision.candidateId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'approved source bytes' }],
  })
  const proposals = new ToolInstallationProposalService(repository, validator, {
    now: () => new Date('2026-08-28T05:00:00.000Z'),
    idFactory: () => `approved-${++nextId}`,
  })
  const proposal = proposals.propose(model, revision.revisionId, validation.record.validationId)
  const approval = proposals.approve({ ...model, actorId: 'actor:user', authority: 'user' }, proposal.proposalId)
  return { repository, service, validator, proposals, proposal, approval, revision, installationRoot: join(dirname(path), 'installed') }
}

test('authenticated validator evidence remains authentic but not promotable after restart', async () => {
  const path = databasePath()
  let repository = new LocalCandidateRepository(path)
  const token = repository.issueValidatorCredential('actor:validator')
  const runner = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token })
  const result = await runner.validate(validationRequest())
  const immediate = repository.inspectValidation(result.record.workspaceId, result.record.validationId)
  assert.equal(immediate?.record.outcome, 'passed')
  assert.equal(immediate?.snapshot.snapshotHash, result.snapshot.snapshotHash)
  assert.equal(canonicalJson(immediate?.record), canonicalJson(result.record))
  assert.equal(repository.isValidationAuthentic(result.snapshot.snapshotHash, result.record), true)
  assert.equal(runner.isValidationAuthentic(result.snapshot.snapshotHash, result.record), true)
  assert.equal(runner.isPromotionEligible(result.snapshot.snapshotHash, result.record), false)
  assert.throws(
    () => repository.recordValidation('wrong-token', result, {}),
    (error: unknown) => (error as { code?: string }).code === 'VALIDATOR_NOT_AUTHENTICATED',
  )
  assert.throws(
    () => repository.recordValidation(token, result, {}),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_VALIDATION_EVIDENCE',
  )
  const revoked = repository.issueValidatorCredential('actor:validator')
  repository.revokeValidatorCredential(revoked)
  assert.throws(
    () => repository.recordValidation(revoked, result, {}),
    (error: unknown) => (error as { code?: string }).code === 'VALIDATOR_NOT_AUTHENTICATED',
  )
  repository.close()

  repository = new LocalCandidateRepository(path)
  const restarted = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token })
  assert.equal(repository.isValidationAuthentic(result.snapshot.snapshotHash, { ...result.record }), true)
  assert.equal(restarted.isValidationAuthentic(result.snapshot.snapshotHash, { ...result.record }), true)
  assert.equal(restarted.isPromotionEligible(result.snapshot.snapshotHash, { ...result.record }), false)
  assert.equal(restarted.isPromotionEligible(result.snapshot.snapshotHash, { ...result.record, outcome: 'failed' }), false)
  const inspection = repository.inspectValidation(result.record.workspaceId, result.record.validationId)
  assert.equal(inspection?.record.outcome, 'passed')
  assert.equal(JSON.stringify(inspection).includes('secret-constraint'), false)
  repository.close()
})

test('stored validation tampering fails integrity and promotion checks', async () => {
  const path = databasePath()
  let repository = new LocalCandidateRepository(path)
  const token = repository.issueValidatorCredential('actor:validator')
  const result = await new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token }).validate(validationRequest())
  repository.close()

  const database = new DatabaseSync(path)
  database.prepare("UPDATE validations SET record_json='{}' WHERE validation_id=?").run(result.record.validationId)
  database.close()
  repository = new LocalCandidateRepository(path)
  assert.equal(repository.isValidationAuthentic(result.snapshot.snapshotHash, result.record), false)
  assert.throws(
    () => repository.inspectValidation(result.record.workspaceId, result.record.validationId),
    (error: unknown) => (error as { code?: string }).code === 'CORRUPT_VALIDATION_EVIDENCE',
  )
  repository.close()
})

test('installation approval binds the current candidate, authentic validation, permissions, and exact proposal', async () => {
  const path = databasePath()
  let repository = new LocalCandidateRepository(path)
  const service = workshop(repository)
  const defined = service.defineSpecification(model, { ...specification, requestedPermissions: ['memory.compute.read'] })
  const revision = service.createCandidateRevision(model, {
    specificationId: defined.specificationId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'source' }],
  })
  const token = repository.issueValidatorCredential('actor:validator')
  const executionBackend = confinedExecutionBackend()
  const request = validationRequest()
  const validator = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token, executionBackend })
  const validation = await validator.validate({ ...request, candidateId: revision.candidateId, descriptor, sources: [{ path: 'src/tool.cpp', content: 'source' }] })
  assert.equal(validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record), true)

  let proposals = new ToolInstallationProposalService(repository, validator, { now: () => new Date('2026-08-28T04:00:00.000Z'), idFactory: () => `install-${++nextId}` })
  const proposal = proposals.propose(model, revision.revisionId, validation.record.validationId)
  assert.deepEqual(proposal.requestedPermissions, ['memory.compute.read'])
  assert.equal(Object.isFrozen(proposal), true)
  assert.throws(() => proposals.approve(model, proposal.proposalId), (error: unknown) => (error as { code?: string }).code === 'AUTHORITY_NOT_PERMITTED')
  repository.close()

  repository = new LocalCandidateRepository(path)
  const restartedValidator = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token, executionBackend })
  proposals = new ToolInstallationProposalService(repository, restartedValidator, { now: () => new Date('2026-08-28T04:01:00.000Z'), idFactory: () => `install-${++nextId}` })
  const approval = proposals.approve({ ...model, actorId: 'actor:user', authority: 'user' }, proposal.proposalId)
  assert.equal(approval.proposalHash, proposal.proposalHash)
  assert.equal(approval.approvedBy, 'actor:user')
  assert.equal(repository.inspectInstallationProposal(model.workspaceId, proposal.proposalId)?.state, 'approved')
  assert.deepEqual(repository.inspectInstallationApproval(model.workspaceId, proposal.proposalId), approval)
  assert.throws(() => proposals.approve({ ...model, actorId: 'actor:user', authority: 'user' }, proposal.proposalId), (error: unknown) => (error as { code?: string }).code === 'PROPOSAL_NOT_PENDING')
  assert.throws(() => proposals.approve({ ...model, workspaceId: 'workspace:other', actorId: 'actor:user', authority: 'user' }, proposal.proposalId), (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_PROPOSAL_NOT_FOUND')

  const staleWorkshop = workshop(repository)
  const staleSpecification = staleWorkshop.defineSpecification(model, { ...specification, publicName: 'calculate_stale' })
  const staleDescriptor = { ...descriptor, name: 'calculate_stale' }
  const staleRevision = staleWorkshop.createCandidateRevision(model, { specificationId: staleSpecification.specificationId, descriptor: staleDescriptor, sources: [{ path: 'src/tool.cpp', content: 'stale one' }] })
  const staleValidation = await restartedValidator.validate({ ...request, candidateId: staleRevision.candidateId, descriptor: staleDescriptor, sources: [{ path: 'src/tool.cpp', content: 'stale one' }] })
  const staleProposal = proposals.propose(model, staleRevision.revisionId, staleValidation.record.validationId)
  staleWorkshop.createCandidateRevision(model, { specificationId: staleSpecification.specificationId, parentRevisionId: staleRevision.revisionId, descriptor: staleDescriptor, sources: [{ path: 'src/tool.cpp', content: 'stale two' }] })
  assert.throws(() => proposals.approve({ ...model, actorId: 'actor:user', authority: 'user' }, staleProposal.proposalId), (error: unknown) => (error as { code?: string }).code === 'STALE_CANDIDATE_REVISION')
  assert.equal('install' in proposals, false)
  repository.close()
})

test('trusted installation consumes exact approval and restart rediscovery exposes only installed hash', async () => {
  const path = databasePath()
  let setup = await approvedCandidate(path)
  const registered: Array<{ candidateHash: string; installationEvidenceHash: string; installedRoot: string }> = []
  const registry = { register(tool: { candidateHash: string; installationEvidenceHash: string; installedRoot: string }) { registered.push(tool); return () => { registered.pop() } } }
  let installer = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry,
    now: () => new Date('2026-08-28T05:01:00.000Z'),
    idFactory: () => 'installed-1',
  })
  assert.throws(
    () => installer.install(model, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'AUTHORITY_NOT_PERMITTED',
  )
  const host = { ...model, actorId: 'actor:host' as const, authority: 'trusted-host' as const }
  const evidence = installer.install(host, setup.proposal.proposalId)
  assert.equal(evidence.outcome, 'installed')
  assert.equal(evidence.candidateHash, setup.revision.candidateHash)
  assert.equal(registered[0]?.candidateHash, setup.revision.candidateHash)
  assert.equal(registered[0]?.installationEvidenceHash, evidence.evidenceHash)
  assert.equal(readFileSync(join(registered[0]!.installedRoot, 'source', 'src', 'tool.cpp'), 'utf8'), 'approved source bytes')
  assert.throws(
    () => installer.install(host, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_APPROVAL_ALREADY_CONSUMED',
  )
  assert.throws(
    () => installer.install({ ...host, workspaceId: 'workspace:other' }, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_APPROVAL_NOT_FOUND',
  )
  setup.repository.close()

  const repository = new LocalCandidateRepository(path)
  const restartedValidator = new CandidateValidationRunner({
    evidenceRepository: repository,
    validatorCredential: 'not-used-for-inspection',
    executionBackend: confinedExecutionBackend(),
  })
  const rediscovered: Array<{ candidateHash: string; installationEvidenceHash: string; installedRoot: string }> = []
  installer = new ToolInstallationService(repository, restartedValidator, {
    installationRoot: setup.installationRoot,
    registry: { register(tool) { rediscovered.push(tool); return () => { rediscovered.pop() } } },
  })
  assert.deepEqual(installer.rediscover(host).map((item) => item.evidenceHash), [evidence.evidenceHash])
  assert.equal(rediscovered[0]?.candidateHash, setup.revision.candidateHash)
  assert.equal(repository.listInstalledTools('workspace:other').length, 0)

  writeFileSync(join(rediscovered[0]!.installedRoot, 'source', 'src', 'tool.cpp'), 'tampered bytes')
  assert.throws(
    () => new ToolInstallationService(repository, restartedValidator, { installationRoot: setup.installationRoot, registry: { register() {} } }).rediscover(host),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLED_TOOL_CORRUPT',
  )
  repository.close()
})

test('registration failure remains non-discoverable, cleans files, and consumes approval', async () => {
  const path = databasePath()
  const setup = await approvedCandidate(path)
  let failedRoot = ''
  const host = { ...model, actorId: 'actor:host' as const, authority: 'trusted-host' as const }
  const failing = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry: { register(tool) { failedRoot = tool.installedRoot; throw Object.assign(new Error('registry rejected candidate'), { code: 'REGISTRATION_FAILED' }) } },
    idFactory: () => 'failed-1',
  })
  assert.throws(
    () => failing.install(host, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'REGISTRATION_FAILED',
  )
  assert.equal(existsSync(failedRoot), false)
  assert.equal(setup.repository.listInstalledTools(model.workspaceId).length, 0)
  assert.equal(setup.repository.inspectInstallationEvidence(model.workspaceId, 'evidence:failed-1')?.outcome, 'failed')
  assert.throws(
    () => failing.install(host, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_APPROVAL_ALREADY_CONSUMED',
  )
  setup.repository.close()
})

test('partial-write staging collisions preserve existing data and remain non-discoverable', async () => {
  const path = databasePath()
  const setup = await approvedCandidate(path)
  const staging = join(setup.installationRoot, '.staging', 'evidence-partial-1')
  mkdirSync(staging, { recursive: true })
  writeFileSync(join(staging, 'sentinel.txt'), 'pre-existing staging data')
  const installer = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry: { register() { assert.fail('a partial installation must not register') } },
    idFactory: () => 'partial-1',
  })
  assert.throws(
    () => installer.install({ ...model, actorId: 'actor:host', authority: 'trusted-host' }, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_STAGING_COLLISION',
  )
  assert.equal(readFileSync(join(staging, 'sentinel.txt'), 'utf8'), 'pre-existing staging data')
  assert.equal(setup.repository.listInstalledTools(model.workspaceId).length, 0)
  assert.equal(setup.repository.inspectInstallationEvidence(model.workspaceId, 'evidence:partial-1')?.outcome, 'failed')
  setup.repository.close()
})

test('installed path collisions fail closed without replacing the registered candidate', async () => {
  const path = databasePath()
  const setup = await approvedCandidate(path)
  const host = { ...model, actorId: 'actor:host' as const, authority: 'trusted-host' as const }
  const registrations: Array<{ candidateHash: string; installedRoot: string }> = []
  const registry = { register(tool: { candidateHash: string; installedRoot: string }) { registrations.push(tool) } }
  const firstInstaller = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry,
    idFactory: () => 'collision-first',
  })
  const first = firstInstaller.install(host, setup.proposal.proposalId)
  const secondProposal = setup.proposals.propose(model, setup.revision.revisionId, setup.proposal.validationId)
  setup.proposals.approve({ ...model, actorId: 'actor:user', authority: 'user' }, secondProposal.proposalId)
  const secondInstaller = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry,
    idFactory: () => 'collision-second',
  })
  assert.throws(
    () => secondInstaller.install(host, secondProposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'INSTALLATION_PATH_COLLISION',
  )
  assert.equal(readFileSync(join(registrations[0]!.installedRoot, 'source', 'src', 'tool.cpp'), 'utf8'), 'approved source bytes')
  assert.deepEqual(setup.repository.listInstalledTools(model.workspaceId).map((item) => item.evidenceHash), [first.evidenceHash])
  assert.equal(setup.repository.inspectInstallationEvidence(model.workspaceId, 'evidence:collision-second')?.outcome, 'failed')
  setup.repository.close()
})

test('candidate revision after approval invalidates installation authority', async () => {
  const path = databasePath()
  const setup = await approvedCandidate(path)
  setup.service.createCandidateRevision(model, {
    specificationId: setup.revision.specificationId,
    parentRevisionId: setup.revision.revisionId,
    descriptor,
    sources: [{ path: 'src/tool.cpp', content: 'changed after approval' }],
  })
  const installer = new ToolInstallationService(setup.repository, setup.validator, {
    installationRoot: setup.installationRoot,
    registry: { register() {} },
  })
  assert.throws(
    () => installer.install({ ...model, actorId: 'actor:host', authority: 'trusted-host' }, setup.proposal.proposalId),
    (error: unknown) => (error as { code?: string }).code === 'STALE_CANDIDATE_REVISION',
  )
  setup.repository.close()
})
