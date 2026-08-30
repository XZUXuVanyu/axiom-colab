import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { captureCandidateFiles } from '../../dist/candidate-content.js'
import {
  InstalledExecutableLoader,
  installedExecutableEvidenceBinding,
} from '../../dist/installed-executable-loader.js'
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash } from '../../dist/laboratory-contract.js'

const byteHash = (bytes: Uint8Array | string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'axiom-installed-loader-'))
  const descriptor = { name: 'candidate_tool', description: 'candidate' }
  const sourceBytes = Buffer.from('exact approved source')
  const sources = captureCandidateFiles([{ path: 'src/tool.cpp', content: sourceBytes }], 'test sources').map((item) => item.binding)
  mkdirSync(join(root, 'source', 'src'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  writeFileSync(join(root, 'descriptor.json'), canonicalJson(descriptor))
  writeFileSync(join(root, 'source', 'src', 'tool.cpp'), sourceBytes)
  const executableBytes = Buffer.from('exact executable artifact')
  writeFileSync(join(root, 'bin', 'candidate-bridge'), executableBytes)
  const registration = {
    workspaceId: 'workspace:alpha' as const,
    installationId: 'evidence:installation' as const,
    candidateId: 'tool:candidate' as const,
    candidateHash: contentHash({ descriptor, sources }),
    descriptorHash: contentHash(descriptor),
    sourceHash: contentHash(sources),
    sources,
    publicName: 'candidate_tool',
    descriptor,
    requestedPermissions: [],
    installationEvidenceHash: contentHash({ installation: 'exact' }),
    installedRoot: root,
  }
  const base = {
    protocolVersion: LABORATORY_PROTOCOL_VERSION,
    executableEvidenceId: 'evidence:executable' as const,
    workspaceId: registration.workspaceId,
    installationId: registration.installationId,
    installationEvidenceHash: registration.installationEvidenceHash,
    candidateId: registration.candidateId,
    candidateHash: registration.candidateHash,
    descriptorHash: registration.descriptorHash,
    sourceHash: registration.sourceHash,
    publicName: registration.publicName,
    relativeExecutablePath: 'bin/candidate-bridge',
    executableHash: byteHash(executableBytes),
    producedAt: '2026-08-30T00:00:00.000Z',
    producedBy: 'actor:trusted-builder' as const,
  }
  const evidence = { ...base, evidenceHash: contentHash(base) }
  return { root, registration, evidence }
}

test('authenticated executable evidence loads with immutable exact-candidate call bindings', () => {
  const value = fixture()
  try {
    const loader = new InstalledExecutableLoader({ isLoadEligible: (evidence) => evidence === value.evidence })
    const loaded = loader.load(value.registration, value.evidence)
    assert.equal(loaded.executable, join(value.root, 'bin', 'candidate-bridge'))
    assert.equal(loaded.candidateHash, value.registration.candidateHash)
    assert.equal(loaded.installationEvidenceHash, value.registration.installationEvidenceHash)
    assert.equal(loaded.executableEvidenceHash, value.evidence.evidenceHash)
    assert.equal(Object.isFrozen(loaded), true)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('source-only installation, forged evidence, path escape, and changed bytes fail closed', () => {
  const value = fixture()
  try {
    const trusted = new InstalledExecutableLoader({ isLoadEligible: (evidence) => evidence === value.evidence })
    assert.throws(
      () => trusted.load(value.registration, { ...value.evidence, executableHash: byteHash('different') }),
      (error: unknown) => (error as { code?: string }).code === 'UNAUTHENTICATED_EXECUTABLE_EVIDENCE',
    )
    const escapedBase = { ...installedExecutableEvidenceBinding(value.evidence) as Omit<typeof value.evidence, 'evidenceHash'>, relativeExecutablePath: '../outside' }
    const escaped = { ...escapedBase, evidenceHash: contentHash(escapedBase) }
    assert.throws(
      () => new InstalledExecutableLoader({ isLoadEligible: (evidence) => evidence === escaped }).load(value.registration, escaped),
      (error: unknown) => (error as { code?: string }).code === 'EXECUTABLE_PATH_ESCAPE',
    )
    writeFileSync(join(value.root, 'source', 'src', 'tool.cpp'), 'later mutable source')
    assert.throws(
      () => trusted.load(value.registration, value.evidence),
      (error: unknown) => (error as { code?: string }).code === 'INSTALLED_CANDIDATE_CHANGED',
    )
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('executable evidence cannot be replayed across installations or after executable mutation', () => {
  const value = fixture()
  try {
    const loader = new InstalledExecutableLoader({ isLoadEligible: (evidence) => evidence === value.evidence })
    assert.throws(
      () => loader.load({ ...value.registration, installationId: 'evidence:other' }, value.evidence),
      (error: unknown) => (error as { code?: string }).code === 'EXECUTABLE_BINDING_MISMATCH',
    )
    writeFileSync(join(value.root, 'bin', 'candidate-bridge'), 'changed executable')
    assert.throws(
      () => loader.load(value.registration, value.evidence),
      (error: unknown) => (error as { code?: string }).code === 'EXECUTABLE_BYTES_CHANGED',
    )
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})
