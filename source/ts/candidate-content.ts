import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface CandidateFile {
  readonly path: string
  readonly content: string | Uint8Array
}

export interface BoundFile {
  readonly path: string
  readonly size: number
  readonly hash: `sha256:${string}`
}

export interface CapturedCandidateFile {
  readonly path: string
  readonly bytes: Uint8Array
  readonly binding: BoundFile
}

export class CandidateContentError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'CandidateContentError'
  }
}

function fail(code: string, message: string): never {
  throw new CandidateContentError(code, message)
}

function byteContent(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : content
}

function byteHash(content: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function safeCandidateRelativePath(value: string, field: string): string {
  if (value.length === 0 || isAbsolute(value) || value.includes('\0')) {
    fail('INVALID_SNAPSHOT_PATH', `${field} must be a non-empty relative path`)
  }
  const normalized = value.replaceAll('\\', '/')
  if (normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('INVALID_SNAPSHOT_PATH', `${field} must use canonical relative path segments`)
  }
  const resolved = resolve('snapshot-root', normalized)
  const rel = relative(resolve('snapshot-root'), resolved)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail('SNAPSHOT_PATH_ESCAPE', `${field} escapes the candidate snapshot`)
  }
  return normalized
}

export function captureCandidateFiles(
  files: readonly CandidateFile[],
  field: string,
): readonly CapturedCandidateFile[] {
  const paths = new Set<string>()
  return files.map((file, index) => {
    const path = safeCandidateRelativePath(file.path, `${field}[${index}].path`)
    if (paths.has(path)) fail('DUPLICATE_SNAPSHOT_PATH', `${field} contains duplicate path ${path}`)
    paths.add(path)
    const bytes = Buffer.from(byteContent(file.content))
    return { path, bytes, binding: { path, size: bytes.byteLength, hash: byteHash(bytes) } }
  }).sort((left, right) => left.path.localeCompare(right.path))
}
