import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { LocalMemoryStore, parseLocalSupervisoryProcessConfig } from '../../dist/index.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test('local supervisory process composes durable state and Bridge discovery behind JSON lines', async () => {
  const root = join(tmpdir(), `axiom-supervisory-main-${crypto.randomUUID()}`)
  mkdirSync(root); roots.push(root)
  const stateRoot = join(root, 'state')
  const store = new LocalMemoryStore(join(stateRoot, 'memory'))
  store.createWorkspace('workspace:alpha')
  store.close()
  const configPath = join(root, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    stateRoot,
    bridgePath: process.execPath,
    bridgeArgs: [resolve('tests/fixtures/fake-bridge.mjs')],
    bridgeWorkingDirectory: resolve('.'),
  }))

  const child = spawn(process.execPath, [resolve('proj/scripts/run-supervisory.mjs'), configPath], {
    cwd: resolve('.'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.stdin.end('{"protocolVersion":"1.0","id":"process:1","operation":"list-workspaces"}\n')
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', resolveExit)
  })
  assert.equal(exitCode, 0, stderr)
  assert.deepEqual(JSON.parse(stdout.trim()), {
    protocolVersion: '1.0', id: 'process:1', ok: true,
    result: { workspaces: ['workspace:alpha'] },
  })
  assert.doesNotMatch(stdout, /cpp-tool:/)
})

test('local supervisory process config rejects ambient paths and unknown authority fields', () => {
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: 'relative', bridgePath: process.execPath,
  }), /stateRoot must be an absolute path/)
  assert.throws(() => parseLocalSupervisoryProcessConfig({
    stateRoot: resolve('.'), bridgePath: process.execPath, approval: true,
  }), /unknown field approval/)
})
