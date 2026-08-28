import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { LocalCandidateRepository } from '../../dist/candidate-repository.js'
import { CandidateValidationRunner } from '../../dist/candidate-validation.js'
import { ToolWorkshop } from '../../dist/tool-workshop.js'
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

test('authenticated validator evidence remains promotion-eligible after restart', async () => {
  const path = databasePath()
  let repository = new LocalCandidateRepository(path)
  const token = repository.issueValidatorCredential('actor:validator')
  const runner = new CandidateValidationRunner({ evidenceRepository: repository, validatorCredential: token })
  const result = await runner.validate(validationRequest())
  const immediate = repository.inspectValidation(result.record.workspaceId, result.record.validationId)
  assert.equal(immediate?.record.outcome, 'passed')
  assert.equal(immediate?.snapshot.snapshotHash, result.snapshot.snapshotHash)
  assert.equal(canonicalJson(immediate?.record), canonicalJson(result.record))
  assert.equal(runner.isPromotionEligible(result.snapshot.snapshotHash, result.record), true)
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
  assert.equal(restarted.isPromotionEligible(result.snapshot.snapshotHash, { ...result.record }), true)
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
  assert.equal(repository.isPromotionEligible(result.snapshot.snapshotHash, result.record), false)
  assert.throws(
    () => repository.inspectValidation(result.record.workspaceId, result.record.validationId),
    (error: unknown) => (error as { code?: string }).code === 'CORRUPT_VALIDATION_EVIDENCE',
  )
  repository.close()
})
