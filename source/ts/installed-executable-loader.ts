import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { captureCandidateFiles, safeCandidateRelativePath, type BoundFile } from './candidate-content.js'
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash, type LaboratoryId } from './laboratory-contract.js'
import type { InstalledToolRegistration } from './tool-installation.js'

export interface InstalledExecutableEvidence {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly executableEvidenceId: LaboratoryId<'evidence'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly installationId: LaboratoryId<'evidence'>
  readonly installationEvidenceHash: `sha256:${string}`
  readonly candidateId: LaboratoryId<'tool'>
  readonly candidateHash: `sha256:${string}`
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly publicName: string
  readonly relativeExecutablePath: string
  readonly executableHash: `sha256:${string}`
  readonly producedAt: string
  readonly producedBy: LaboratoryId<'actor'>
  readonly evidenceHash: `sha256:${string}`
}

export interface InstalledExecutableAuthority {
  /** Authenticate evidence issued by the independently trusted build boundary. */
  isLoadEligible(evidence: InstalledExecutableEvidence): boolean
}

export interface LoadedToolExecutableBinding {
  readonly executable: string
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly installationId: LaboratoryId<'evidence'>
  readonly installationEvidenceHash: `sha256:${string}`
  readonly executableEvidenceId: LaboratoryId<'evidence'>
  readonly executableEvidenceHash: `sha256:${string}`
  readonly candidateId: LaboratoryId<'tool'>
  readonly candidateHash: `sha256:${string}`
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly executableHash: `sha256:${string}`
  readonly publicName: string
}

export class InstalledExecutableLoadError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'InstalledExecutableLoadError'
  }
}

function fail(code: string, message: string): never {
  throw new InstalledExecutableLoadError(code, message)
}

function contained(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function byteHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function installedExecutableEvidenceBinding(value: InstalledExecutableEvidence): unknown {
  const { evidenceHash: _hash, ...binding } = value
  return binding
}

/**
 * Converts authenticated build evidence into an executable location while
 * retaining every installed-candidate binding required by subsequent calls.
 * This loader never builds source and never treats installation alone as
 * executable authority.
 */
export class InstalledExecutableLoader {
  constructor(private readonly authority: InstalledExecutableAuthority) {}

  load(registration: InstalledToolRegistration, evidence: InstalledExecutableEvidence): LoadedToolExecutableBinding {
    if (evidence.evidenceHash !== contentHash(installedExecutableEvidenceBinding(evidence))
        || !this.authority.isLoadEligible(evidence)) {
      fail('UNAUTHENTICATED_EXECUTABLE_EVIDENCE', 'executable evidence is not authenticated by the trusted build boundary')
    }
    if (evidence.workspaceId !== registration.workspaceId
        || evidence.installationId !== registration.installationId
        || evidence.installationEvidenceHash !== registration.installationEvidenceHash
        || evidence.candidateId !== registration.candidateId
        || evidence.candidateHash !== registration.candidateHash
        || evidence.descriptorHash !== registration.descriptorHash
        || evidence.sourceHash !== registration.sourceHash
        || evidence.publicName !== registration.publicName) {
      fail('EXECUTABLE_BINDING_MISMATCH', 'executable evidence does not bind the exact installed candidate')
    }

    this.verifyInstalledCandidate(registration)
    const executable = resolve(registration.installedRoot, evidence.relativeExecutablePath)
    if (isAbsolute(evidence.relativeExecutablePath) || !contained(registration.installedRoot, executable)) {
      fail('EXECUTABLE_PATH_ESCAPE', 'executable path escaped the exact installed candidate root')
    }
    let executableBytes: Uint8Array
    try { executableBytes = readFileSync(executable) } catch { fail('EXECUTABLE_NOT_FOUND', 'bound executable bytes are unavailable') }
    if (byteHash(executableBytes) !== evidence.executableHash) {
      fail('EXECUTABLE_BYTES_CHANGED', 'executable bytes no longer match authenticated build evidence')
    }

    return Object.freeze({
      executable,
      workspaceId: evidence.workspaceId,
      installationId: evidence.installationId,
      installationEvidenceHash: evidence.installationEvidenceHash,
      executableEvidenceId: evidence.executableEvidenceId,
      executableEvidenceHash: evidence.evidenceHash,
      candidateId: evidence.candidateId,
      candidateHash: evidence.candidateHash,
      descriptorHash: evidence.descriptorHash,
      sourceHash: evidence.sourceHash,
      executableHash: evidence.executableHash,
      publicName: evidence.publicName,
    })
  }

  private verifyInstalledCandidate(registration: InstalledToolRegistration): void {
    let descriptor: unknown
    try { descriptor = JSON.parse(readFileSync(resolve(registration.installedRoot, 'descriptor.json'), 'utf8')) } catch {
      fail('INSTALLED_CANDIDATE_CHANGED', 'installed descriptor is missing or malformed')
    }
    const sources = registration.sources.map((source) => {
      const path = safeCandidateRelativePath(source.path, 'installed executable source path')
      try { return { path, content: readFileSync(resolve(registration.installedRoot, 'source', path)) } } catch {
        fail('INSTALLED_CANDIDATE_CHANGED', 'installed source bytes are missing')
      }
    })
    const bindings: readonly BoundFile[] = captureCandidateFiles(sources, 'installed executable sources').map((file) => file.binding)
    if (contentHash(descriptor) !== registration.descriptorHash
        || contentHash(bindings) !== registration.sourceHash
        || canonicalJson(bindings) !== canonicalJson(registration.sources)) {
      fail('INSTALLED_CANDIDATE_CHANGED', 'installed candidate bytes changed after installation')
    }
  }
}
