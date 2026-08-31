import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { captureCandidateFiles } from '../../dist/candidate-content.js'
import { LocalInstalledExecutableAuthority } from '../../dist/installed-executable-authority.js'
import { contentHash } from '../../dist/laboratory-contract.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = join(tmpdir(), `axiom-executable-authority-${crypto.randomUUID()}`)
  roots.push(root); mkdirSync(join(root, 'source'), { recursive: true })
  const descriptor = { name: 'candidate_tool' }
  const captured = captureCandidateFiles([{ path: 'tool.cpp', content: 'exact source' }])
  writeFileSync(join(root, 'descriptor.json'), JSON.stringify(descriptor))
  writeFileSync(join(root, 'source', 'tool.cpp'), 'exact source')
  return {
    root,
    registration: {
      workspaceId: 'workspace:alpha', installationId: 'evidence:installation', candidateId: 'tool:candidate',
      candidateHash: `sha256:${'1'.repeat(64)}`, descriptorHash: contentHash(descriptor),
      sourceHash: contentHash(captured.map((item) => item.binding)), sources: captured.map((item) => item.binding),
      publicName: 'candidate_tool', descriptor, requestedPermissions: [],
      installationEvidenceHash: `sha256:${'2'.repeat(64)}`, installedRoot: root,
    } as any,
  }
}

test('trusted executable authority persists exact build evidence and reuses it after restart', async () => {
  const value = fixture(); const database = join(value.root, 'evidence.sqlite3')
  let builds = 0
  const backend = { async build() { builds += 1; return { bytes: Buffer.from('exact executable'), relativeExecutablePath: 'bin/tool.exe' } } }
  const first = new LocalInstalledExecutableAuthority(database, backend, 'actor:builder', () => new Date('2026-08-31T00:00:00.000Z'), () => crypto.randomUUID())
  const binding = await first.prepare(value.registration)
  assert.match(binding.executableHash, /^sha256:[0-9a-f]{64}$/)
  assert.equal(readFileSync(binding.executable, 'utf8'), 'exact executable')
  first.close()
  const reopened = new LocalInstalledExecutableAuthority(database, backend, 'actor:builder')
  assert.equal((await reopened.prepare(value.registration)).executableEvidenceHash, binding.executableEvidenceHash)
  assert.equal(builds, 1)
  reopened.close()
})

test('trusted executable authority rejects path escape and changed executable bytes', async () => {
  const escaped = fixture()
  const authority = new LocalInstalledExecutableAuthority(join(escaped.root, 'evidence.sqlite3'), {
    async build() { return { bytes: Buffer.from('x'), relativeExecutablePath: '../escape.exe' } },
  }, 'actor:builder')
  await assert.rejects(authority.prepare(escaped.registration), (error: unknown) => (error as any).code === 'EXECUTABLE_PATH_ESCAPE')
  authority.close()

  const changed = fixture()
  const valid = new LocalInstalledExecutableAuthority(join(changed.root, 'evidence.sqlite3'), {
    async build() { return { bytes: Buffer.from('original'), relativeExecutablePath: 'bin/tool.exe' } },
  }, 'actor:builder')
  const binding = await valid.prepare(changed.registration)
  writeFileSync(binding.executable, 'changed')
  await assert.rejects(valid.prepare(changed.registration), (error: unknown) => (error as any).code === 'EXECUTABLE_BYTES_CHANGED')
  valid.close()
})
