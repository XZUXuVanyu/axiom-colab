import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  CandidateValidationRunner,
  contentHash,
  validationRecordJson,
} from '../../dist/index.js'

const fixture = fileURLToPath(new URL('../fixtures/validation-child.mjs', import.meta.url))
const limits = {
  timeoutMs: 1000,
  maxStdinBytes: 4096,
  maxStdoutBytes: 4096,
  maxStderrBytes: 4096,
  killGraceMs: 20,
}

let nextId = 0
function createRunner(): CandidateValidationRunner {
  return new CandidateValidationRunner({
    now: () => new Date('2026-08-28T01:00:00.000Z'),
    idFactory: () => `test-${++nextId}`,
  })
}

function request(candidateMode = 'pass', source = 'int tool = 1;', timeoutMs = 1000) {
  const command = (commandId: string, mode: string, stdin?: string) => ({
    commandId,
    executable: process.execPath,
    args: [fixture, mode],
    ...(stdin === undefined ? {} : { stdin }),
  })
  return {
    workspaceId: 'workspace:validation' as const,
    candidateId: 'tool:candidate-one' as const,
    validatorActorId: 'actor:validator' as const,
    descriptor: { name: 'candidate_one', inputSchema: { type: 'object' } },
    sources: [{ path: 'src/tool.cpp', content: source }],
    fixtures: [{ path: 'fixtures/value.txt', content: 'fixture' }],
    toolchain: { name: 'node-test-fixture', version: process.version, target: process.platform },
    policy: {
      allowedExecutables: [process.execPath],
      process: { ...limits, timeoutMs },
      maxCommands: 3,
    },
    suites: [
      { suiteId: 'candidate-tests', kind: 'candidate' as const, commands: [command('candidate-1', candidateMode)] },
      { suiteId: 'standard-safety', kind: 'standard' as const, commands: [command('standard-1', 'pass')] },
      { suiteId: 'user-challenge', kind: 'challenge' as const, commands: [command('challenge-1', 'challenge', 'hidden-value-7391')] },
    ],
  }
}

test('validation binds an immutable candidate snapshot and keeps challenge inputs hidden', async () => {
  const result = await createRunner().validate(request())
  assert.equal(result.record.outcome, 'passed')
  assert.equal(result.record.authority, 'validator')
  assert.equal(result.record.candidateSnapshotHash, result.snapshot.snapshotHash)
  assert.equal(result.snapshot.suites.map((suite) => suite.kind).join(','), 'candidate,standard,challenge')
  assert.equal(result.snapshot.suites[2]?.commitment, 'salted-sha256')
  assert.equal(result.record.suites[2]?.hidden, true)
  assert.equal(result.record.suites[2]?.processes[0]?.stdout, null)
  assert.equal(result.record.suites[2]?.processes[0]?.stderr, null)
  assert.equal(validationRecordJson(result.record).includes('hidden-value-7391'), false)
  assert.equal(Object.isFrozen(result.snapshot), true)
  assert.equal(Object.isFrozen(result.record.suites), true)
})

test('hidden challenge definition commitments use a fresh undisclosed salt', async () => {
  const runner = createRunner()
  const first = await runner.validate(request())
  const second = await runner.validate(request())
  const firstChallenge = first.snapshot.suites[2]
  const secondChallenge = second.snapshot.suites[2]
  const guessableUnsalted = contentHash([{
    commandId: 'challenge-1',
    executable: process.execPath,
    args: [fixture, 'challenge'],
    stdinHash: contentHash('hidden-value-7391'),
    cwd: '.',
  }])
  assert.notEqual(firstChallenge?.definitionHash, guessableUnsalted)
  assert.notEqual(firstChallenge?.definitionHash, secondChallenge?.definitionHash)
  assert.equal(first.snapshot.suites[0]?.definitionHash, second.snapshot.suites[0]?.definitionHash)
  assert.equal(validationRecordJson(first.record).includes('challengeCommitmentSalt'), false)
})

test('candidate-authored passing JSON cannot fabricate a passing validation', async () => {
  const result = await createRunner().validate(request('fake-pass'))
  const observed = result.record.suites[0]?.processes[0]
  assert.equal(result.record.outcome, 'failed')
  assert.equal(observed?.outcome, 'failed')
  assert.equal(observed?.exitCode, 9)
  assert.equal(observed?.errorCode, 'NON_ZERO_EXIT')
  assert.match(observed?.stdout ?? '', /"passed":true/)
})

test('candidate changes invalidate promotion eligibility for an earlier record', async () => {
  const runner = createRunner()
  const first = await runner.validate(request('pass', 'int tool = 1;'))
  const changed = await runner.validate(request('pass', 'int tool = 2;'))
  assert.notEqual(first.snapshot.snapshotHash, changed.snapshot.snapshotHash)
  assert.equal(runner.isPromotionEligible(first.snapshot.snapshotHash, first.record), true)
  assert.equal(runner.isPromotionEligible(changed.snapshot.snapshotHash, first.record), false)
  assert.equal(runner.isPromotionEligible(first.snapshot.snapshotHash, { ...first.record }), false)
})

test('time limits are observed and attributed to the exact command', async () => {
  const value = request('hang', 'int tool = 1;', 30)
  const result = await createRunner().validate(value)
  const observed = result.record.suites[0]?.processes[0]
  assert.equal(result.record.outcome, 'limited')
  assert.equal(observed?.outcome, 'limited')
  assert.equal(observed?.errorCode, 'TIMEOUT')
  assert.equal(observed?.commandId, 'candidate-1')
})
