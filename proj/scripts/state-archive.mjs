import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const fail = (code, message) => { const error = new Error(`[${code}] ${message}`); error.code = code; throw error }
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const canonical = (value) => JSON.stringify(value, (_key, item) => item !== null && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item)

function argumentsOf(values) {
  const allowed = new Set(['--mode', '--state-root', '--archive', '--restore-root'])
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1]
    if (!allowed.has(key) || value === undefined || value.startsWith('--')) fail('INVALID_ARGUMENTS', 'arguments must be exact name/value pairs')
    if (result[key] !== undefined) fail('INVALID_ARGUMENTS', `duplicate argument ${key}`)
    result[key] = value
  }
  if (!['backup', 'verify', 'restore'].includes(result['--mode'])) fail('INVALID_ARGUMENTS', '--mode must be backup, verify, or restore')
  return result
}

function absolute(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail('INVALID_PATH', `${name} must be absolute`)
  return resolve(value)
}

function outside(left, right, name) {
  const path = relative(left, right)
  if (path === '' || (!path.startsWith(`..${sep}`) && path !== '..')) fail('PATH_OVERLAP', `${name} paths must not contain one another`)
}

async function files(root) {
  const output = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) fail('UNSAFE_STATE_ENTRY', 'symbolic links are not permitted in authoritative state')
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) output.push(relative(root, path).split(sep).join('/'))
      else fail('UNSAFE_STATE_ENTRY', 'special filesystem entries are not permitted in authoritative state')
    }
  }
  await visit(root); return output.sort()
}

async function exclusiveDirectory(path) {
  try { await mkdir(path) } catch (error) {
    if (error?.code === 'EEXIST') fail('TARGET_EXISTS', `target already exists: ${path}`)
    throw error
  }
}

async function buildManifest(stateRoot) {
  const names = await files(stateRoot)
  if (names.some((name) => /(?:^|\/)[^/]+\.sqlite3-(?:wal|shm)$/i.test(name))) {
    fail('STATE_NOT_OFFLINE', 'SQLite WAL/SHM files are present; stop the supervisory host and checkpoint databases before backup')
  }
  const entries = []
  for (const name of names) {
    const bytes = await readFile(join(stateRoot, ...name.split('/')))
    entries.push({ path: name, size: bytes.length, hash: hash(bytes) })
  }
  return { protocolVersion: '1.0', format: 'axiom-colab-state-archive', files: entries }
}

async function verifyArchive(archive) {
  const manifestPath = join(archive, 'manifest.json')
  const digestPath = join(archive, 'manifest.sha256')
  let manifestBytes, expectedDigest, manifest
  try {
    ;[manifestBytes, expectedDigest] = await Promise.all([readFile(manifestPath), readFile(digestPath, 'utf8')])
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch { fail('INVALID_ARCHIVE', 'archive manifest is missing or malformed') }
  if (expectedDigest.trim() !== hash(manifestBytes)) fail('CORRUPT_ARCHIVE_MANIFEST', 'archive manifest hash is invalid')
  if (manifest.protocolVersion !== '1.0' || manifest.format !== 'axiom-colab-state-archive' || !Array.isArray(manifest.files)) fail('INVALID_ARCHIVE', 'archive format is unsupported')
  const seen = new Set()
  for (const entry of manifest.files) {
    if (typeof entry?.path !== 'string' || entry.path === '' || entry.path.includes('\\') || entry.path.startsWith('/')
        || entry.path.split('/').some((part) => part === '' || part === '.' || part === '..') || seen.has(entry.path)
        || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^sha256:[0-9a-f]{64}$/.test(entry.hash)) fail('INVALID_ARCHIVE', 'archive file binding is malformed')
    seen.add(entry.path)
    let bytes
    try { bytes = await readFile(join(archive, 'payload', ...entry.path.split('/'))) } catch { fail('CORRUPT_ARCHIVE_PAYLOAD', `archive payload is missing: ${entry.path}`) }
    if (bytes.length !== entry.size || hash(bytes) !== entry.hash) fail('CORRUPT_ARCHIVE_PAYLOAD', `archive payload hash is invalid: ${entry.path}`)
  }
  const payloadFiles = await files(join(archive, 'payload'))
  if (payloadFiles.length !== seen.size || payloadFiles.some((name) => !seen.has(name))) fail('INVALID_ARCHIVE', 'archive contains unbound payload files')
  return manifest
}

async function backup(stateRoot, archive) {
  await lstat(stateRoot).catch(() => fail('STATE_NOT_FOUND', 'state root does not exist'))
  outside(stateRoot, archive, 'state/archive'); outside(archive, stateRoot, 'state/archive')
  const manifest = await buildManifest(stateRoot)
  const staging = join(dirname(archive), `.${archive.split(sep).at(-1)}.staging-${randomUUID()}`)
  await exclusiveDirectory(staging)
  try {
    await mkdir(join(staging, 'payload'))
    for (const entry of manifest.files) {
      const target = join(staging, 'payload', ...entry.path.split('/')); await mkdir(dirname(target), { recursive: true })
      await copyFile(join(stateRoot, ...entry.path.split('/')), target)
    }
    const manifestBytes = Buffer.from(canonical(manifest), 'utf8')
    await writeFile(join(staging, 'manifest.json'), manifestBytes, { flag: 'wx' })
    await writeFile(join(staging, 'manifest.sha256'), `${hash(manifestBytes)}\n`, { flag: 'wx' })
    await verifyArchive(staging); await rename(staging, archive)
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error }
  return manifest
}

async function restore(archive, restoreRoot) {
  outside(archive, restoreRoot, 'archive/restore'); outside(restoreRoot, archive, 'archive/restore')
  const manifest = await verifyArchive(archive)
  const staging = join(dirname(restoreRoot), `.${restoreRoot.split(sep).at(-1)}.staging-${randomUUID()}`)
  await exclusiveDirectory(staging)
  try {
    for (const entry of manifest.files) {
      const target = join(staging, ...entry.path.split('/')); await mkdir(dirname(target), { recursive: true })
      await copyFile(join(archive, 'payload', ...entry.path.split('/')), target)
    }
    const restored = await buildManifest(staging)
    if (canonical(restored) !== canonical(manifest)) fail('RESTORE_VERIFICATION_FAILED', 'restored state does not match the archive manifest')
    await rename(staging, restoreRoot)
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error }
  return manifest
}

const args = argumentsOf(process.argv.slice(2))
const mode = args['--mode']
const archive = absolute(args['--archive'], '--archive')
const manifest = mode === 'backup'
  ? await backup(absolute(args['--state-root'], '--state-root'), archive)
  : mode === 'restore'
    ? await restore(archive, absolute(args['--restore-root'], '--restore-root'))
    : await verifyArchive(archive)
process.stdout.write(`${JSON.stringify({ ok: true, mode, files: manifest.files.length, archive })}\n`)
