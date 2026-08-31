import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

function fail(message) {
  throw Object.assign(new Error(message), { code: 'INVALID_PACKAGE_INPUT' })
}

function parseArguments(values) {
  const result = new Map()
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]
    const value = values[index + 1]
    if (!name?.startsWith('--') || value === undefined) fail('arguments must be --name value pairs')
    if (result.has(name)) fail(`duplicate argument: ${name}`)
    result.set(name, value)
  }
  const allowed = new Set(['--output', '--gui', '--bridge', '--node', '--windeployqt', '--qt-runtime'])
  for (const name of result.keys()) if (!allowed.has(name)) fail(`unknown argument: ${name}`)
  for (const name of ['--output', '--gui', '--bridge', '--node']) {
    if (!result.has(name)) fail(`missing argument: ${name}`)
  }
  if (result.has('--windeployqt') === result.has('--qt-runtime')) {
    fail('provide exactly one of --windeployqt or --qt-runtime')
  }
  return result
}

async function requireFile(path, name) {
  if (!isAbsolute(path) || !(await lstat(path).catch(() => null))?.isFile()) {
    fail(`${name} must be an existing absolute file`)
  }
}

async function requireDirectory(path, name) {
  if (!isAbsolute(path) || !(await lstat(path).catch(() => null))?.isDirectory()) {
    fail(`${name} must be an existing absolute directory`)
  }
}

async function manifestFiles(root, directory = root) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      fail(`packaged runtime contains unsupported entry: ${relative(root, path)}`)
    }
    if (entry.isDirectory()) files.push(...await manifestFiles(root, path))
    else files.push(path)
  }
  return files
}

async function copyDirectoryContents(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      fail(`Qt runtime contains unsupported entry: ${entry.name}`)
    }
    await cp(join(source, entry.name), join(destination, entry.name), {
      recursive: entry.isDirectory(), force: false, errorOnExist: true,
    })
  }
}

export async function packageRuntime(options) {
  const output = resolve(options.output)
  if (!isAbsolute(options.output)) fail('output must be absolute')
  if (await lstat(output).catch(() => null)) fail('output must not already exist')
  await requireFile(options.gui, 'gui')
  await requireFile(options.bridge, 'bridge')
  await requireFile(options.node, 'node')
  if (options.qtRuntime) await requireDirectory(options.qtRuntime, 'qt-runtime')
  else await requireFile(options.windeployqt, 'windeployqt')

  const bin = join(output, 'bin')
  await mkdir(bin, { recursive: true })
  await cp(options.gui, join(bin, basename(options.gui)), { errorOnExist: true })
  await cp(options.bridge, join(bin, basename(options.bridge)), { errorOnExist: true })
  await cp(options.node, join(bin, process.platform === 'win32' ? 'node.exe' : 'node'), { errorOnExist: true })
  await cp(join(projectRoot, 'dist'), join(output, 'dist'), { recursive: true, errorOnExist: true })
  await mkdir(join(output, 'proj', 'scripts'), { recursive: true })
  for (const script of ['run-supervisory.mjs', 'accept-packaged-runtime.mjs', 'state-archive.mjs', 'new-supervisory-config.ps1']) {
    await cp(join(projectRoot, 'proj', 'scripts', script), join(output, 'proj', 'scripts', script), { errorOnExist: true })
  }

  if (options.qtRuntime) {
    await copyDirectoryContents(options.qtRuntime, bin)
  } else {
    const deployed = spawnSync(options.windeployqt, ['--release', '--no-translations', join(bin, basename(options.gui))], {
      cwd: bin, encoding: 'utf8', shell: false, windowsHide: true,
    })
    if (deployed.error || deployed.status !== 0) {
      throw Object.assign(new Error(`windeployqt failed: ${deployed.error?.message ?? deployed.stderr.trim()}`), { code: 'QT_DEPLOY_FAILED' })
    }
  }

  const files = (await manifestFiles(output)).sort((left, right) => left.localeCompare(right))
  const entries = []
  for (const path of files) {
    const bytes = await readFile(path)
    entries.push({ path: relative(output, path).replaceAll('\\', '/'), size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  const manifest = { format: 'axiom-colab-runtime', version: 1, files: entries }
  await writeFile(join(output, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2))
    const manifest = await packageRuntime({
      output: args.get('--output'), gui: args.get('--gui'), bridge: args.get('--bridge'),
      node: args.get('--node'), windeployqt: args.get('--windeployqt'), qtRuntime: args.get('--qt-runtime'),
    })
    process.stdout.write(`${JSON.stringify({ output: resolve(args.get('--output')), files: manifest.files.length })}\n`)
  } catch (error) {
    process.stderr.write(`${error.code ?? 'PACKAGE_FAILED'}: ${error.message}\n`)
    process.exitCode = 1
  }
}
