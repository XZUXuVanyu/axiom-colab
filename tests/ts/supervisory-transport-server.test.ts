import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'

import { ProcessRunner } from '../../dist/process-runner.js'

test('supervisory process boundary serves correlated JSON lines without stdout diagnostics', async () => {
  const runner = new ProcessRunner()
  const request = [
    JSON.stringify({ protocolVersion: '1.0', id: 'one', operation: 'list-workspaces' }),
    JSON.stringify({ protocolVersion: '1.0', id: 'two', operation: 'inspect', workspaceId: 'workspace:alpha', goalId: null }),
    JSON.stringify({ protocolVersion: '1.0', id: 'three', operation: 'approve' }),
  ].join('\n')
  const result = await runner.run(process.execPath, {
    args: [join(process.cwd(), 'tests/fixtures/supervisory-transport-child.mjs')],
    stdin: request, timeoutMs: 5000, maxStdinBytes: 16_384,
    maxStdoutBytes: 64_000, maxStderrBytes: 16_000, killGraceMs: 100,
  })
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line))
  assert.deepEqual(responses.map((item) => item.id), ['one', 'two', 'three'])
  assert.deepEqual(responses[0].result.workspaces, ['workspace:alpha', 'workspace:beta'])
  assert.equal(responses[1].result.workspaceId, 'workspace:alpha')
  assert.equal(responses[2].error.code, 'UNKNOWN_OPERATION')
  assert.equal(result.stderr, '')
  runner.dispose()
})

test('supervisory process boundary contains oversized lines and resumes at framing boundary', async () => {
  const runner = new ProcessRunner()
  const valid = JSON.stringify({ protocolVersion: '1.0', id: 'after', operation: 'list-workspaces' })
  const result = await runner.run(process.execPath, {
    args: [join(process.cwd(), 'tests/fixtures/supervisory-transport-child.mjs')],
    stdin: `${'x'.repeat(1500)}\n${valid}\n`, timeoutMs: 5000, maxStdinBytes: 4096,
    maxStdoutBytes: 64_000, maxStderrBytes: 16_000, killGraceMs: 100,
  })
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line))
  assert.equal(responses[0].error.code, 'REQUEST_TOO_LARGE')
  assert.equal(responses[1].id, 'after')
  runner.dispose()
})
