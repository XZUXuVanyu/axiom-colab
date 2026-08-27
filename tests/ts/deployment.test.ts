import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

test('overlay generation resolves paths and merges local overrides', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'cpp-adapter-overlay-'))
  const defaults = join(temporary, 'defaults.json')
  const local = join(temporary, 'local.json')
  const output = join(temporary, 'strict.yml')
  await writeFile(defaults, JSON.stringify({
    descriptorTimeoutMs: 1,
    maxStdinBytes: 2,
    maxStdoutBytes: 3,
    maxStderrBytes: 4,
    killGraceMs: 5,
    maxLogChars: 6,
  }))
  await writeFile(local, JSON.stringify({ descriptorTimeoutMs: 99 }))
  const result = spawnSync(process.execPath, [
    join(projectRoot, 'proj', 'scripts', 'generate-overlay.mjs'),
    '--defaults', defaults,
    '--local', local,
    '--output', output,
    '--bridge', join(temporary, 'bridge executable'),
    '--mode', 'tool-only',
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const overlay = await readFile(output, 'utf8')
  assert.match(overlay, /name: "file:\/\/\//)
  assert.match(overlay, /verificationMode: "tool-only"/)
  assert.match(overlay, /descriptorTimeoutMs: 99/)
  assert.match(overlay, /bridgePath: ".*bridge executable"/)
})
