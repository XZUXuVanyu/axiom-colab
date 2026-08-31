import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function run(...args: string[]) {
  return spawnSync(process.execPath, ['proj/scripts/state-archive.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8' })
}

test('offline state archive verifies exact bytes and restores only to a new root', () => {
  const root = join(tmpdir(), `axiom-state-archive-${crypto.randomUUID()}`); roots.push(root); mkdirSync(root)
  const state = join(root, 'state'); const archive = join(root, 'backup'); const restored = join(root, 'restored')
  mkdirSync(join(state, 'memory'), { recursive: true }); writeFileSync(join(state, 'memory', 'state.sqlite3'), 'database-bytes')
  writeFileSync(join(state, 'memory', 'payload.bin'), Buffer.from([0, 1, 2, 255]))
  assert.equal(run('--mode', 'backup', '--state-root', state, '--archive', archive).status, 0)
  assert.equal(run('--mode', 'verify', '--archive', archive).status, 0)
  assert.equal(run('--mode', 'restore', '--archive', archive, '--restore-root', restored).status, 0)
  assert.equal(readFileSync(join(restored, 'memory', 'state.sqlite3'), 'utf8'), 'database-bytes')
  assert.notEqual(run('--mode', 'restore', '--archive', archive, '--restore-root', restored).status, 0)
})

test('state archive rejects online SQLite state and corrupted payload bytes', () => {
  const root = join(tmpdir(), `axiom-state-corruption-${crypto.randomUUID()}`); roots.push(root); mkdirSync(root)
  const state = join(root, 'state'); const archive = join(root, 'backup'); mkdirSync(state)
  writeFileSync(join(state, 'goals.sqlite3'), 'db'); writeFileSync(join(state, 'goals.sqlite3-wal'), 'live')
  const online = run('--mode', 'backup', '--state-root', state, '--archive', archive)
  assert.notEqual(online.status, 0); assert.match(online.stderr, /STATE_NOT_OFFLINE/)
  rmSync(join(state, 'goals.sqlite3-wal')); assert.equal(run('--mode', 'backup', '--state-root', state, '--archive', archive).status, 0)
  writeFileSync(join(archive, 'payload', 'goals.sqlite3'), 'changed')
  const corrupt = run('--mode', 'verify', '--archive', archive)
  assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /CORRUPT_ARCHIVE_PAYLOAD/)
})
