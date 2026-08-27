import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

function parseArguments(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--') || index + 1 >= values.length) {
      throw new Error(`expected --name value, received ${value}`)
    }
    result[value.slice(2)] = values[index + 1]
    index += 1
  }
  return result
}

async function readJson(path, required) {
  if (!existsSync(path)) {
    if (required) throw new Error(`configuration file does not exist: ${path}`)
    return {}
  }
  const value = JSON.parse(await readFile(path, 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`configuration must be a JSON object: ${path}`)
  }
  return value
}

const args = parseArguments(process.argv.slice(2))
const defaultsPath = resolve(args.defaults ?? join(projectRoot, 'proj', 'config', 'adapter.defaults.json'))
const localPath = resolve(args.local ?? join(projectRoot, 'proj', 'config', 'adapter.local.json'))
const mode = args.mode ?? 'normal'
if (!['normal', 'tool-only'].includes(mode)) {
  throw new Error(`mode must be normal or tool-only; received ${mode}`)
}

const settings = {
  ...await readJson(defaultsPath, true),
  ...await readJson(localPath, false),
}
const bridgePath = resolve(args.bridge ?? settings.bridgePath ?? join(
  projectRoot,
  process.platform === 'win32'
    ? 'build/windows/Release/cpp-tool-bridge.exe'
    : 'build/linux/cpp-tool-bridge',
))
const outputPath = resolve(args.output ?? join(
  projectRoot,
  'proj',
  'patches',
  'generated',
  `general-ts-cpp-adapter-${mode}.yml`,
))
const pluginUrl = pathToFileURL(join(projectRoot, 'dist', 'index.js')).href
const config = {
  bridgePath,
  workingDirectory: projectRoot,
  verificationMode: mode,
  descriptorTimeoutMs: settings.descriptorTimeoutMs,
  maxStdinBytes: settings.maxStdinBytes,
  maxStdoutBytes: settings.maxStdoutBytes,
  maxStderrBytes: settings.maxStderrBytes,
  killGraceMs: settings.killGraceMs,
  maxLogChars: settings.maxLogChars,
}
const lines = [
  '- insert:',
  '    - id: general-ts-cpp-adapter',
  `      name: ${JSON.stringify(pluginUrl)}`,
  '      config:',
  ...Object.entries(config).map(([key, value]) => `        ${key}: ${JSON.stringify(value)}`),
  '',
]
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, lines.join('\n'), 'utf8')
console.log(outputPath)
