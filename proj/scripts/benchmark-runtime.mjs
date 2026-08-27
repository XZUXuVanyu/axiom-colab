import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'

const cli = process.argv.slice(2).filter(value => value !== '--')
const bridge = resolve(cli[0] ?? (process.platform === 'win32'
  ? 'build/windows/Release/cpp-tool-bridge.exe'
  : 'build/linux/cpp-tool-bridge'))
const iterations = Number(cli[1] ?? 30)
if (!existsSync(bridge)) throw new Error(`Bridge not found: ${bridge}`)
if (!Number.isInteger(iterations) || iterations < 5) throw new Error('iterations must be an integer of at least 5')

function run(args, stdin = '') {
  return new Promise((resolveRun, reject) => {
    const started = performance.now()
    const child = spawn(bridge, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolveRun({ durationMs: performance.now() - started, stdout })
      : reject(new Error(`Bridge exited ${code}: ${stderr}`)))
    child.stdin.end(stdin)
  })
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
  return {
    samples: sorted.length,
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  }
}

const description = JSON.parse((await run(['--describe-tools'])).stdout)
const descriptor = description.tools[0]
if (descriptor === undefined) throw new Error('Bridge exposes no tools')
const request = JSON.stringify({ protocolVersion: '1.0', id: 'benchmark', tool: descriptor.name, arguments: {} })
const startup = []
const invocation = []
for (let index = 0; index < iterations; index += 1) startup.push((await run(['--describe-tools'])).durationMs)
for (let index = 0; index < iterations; index += 1) invocation.push((await run([], request)).durationMs)
console.log(JSON.stringify({ bridge, tool: descriptor.name, iterations, discoveryProcess: stats(startup), invocationProcess: stats(invocation) }, null, 2))
