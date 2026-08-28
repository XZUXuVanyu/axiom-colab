import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CandidateValidationError,
  WslValidationBackend,
  windowsPathToWsl,
} from '../../dist/index.js'

test('WSL path projection accepts local drives and rejects non-drive roots', () => {
  assert.equal(windowsPathToWsl('D:\\Lab Root\\candidate'), '/mnt/d/Lab Root/candidate')
  assert.throws(() => windowsPathToWsl('\\\\server\\share\\candidate'), (error: unknown) => {
    assert.ok(error instanceof CandidateValidationError)
    assert.equal(error.code, 'INVALID_WSL_VALIDATION_BACKEND')
    return true
  })
})

test('WSL backend requires bound resources and preserves command arguments without a shell', async () => {
  let executable = ''
  let args: readonly string[] = []
  const backend = new WslValidationBackend({
    distribution: 'Ubuntu-24.04',
    runner: {
      async run(value, options) {
        executable = value
        args = options.args ?? []
        return { stdout: '', stderr: '', exitCode: 0, durationMs: 1 }
      },
    },
  })
  assert.throws(() => backend.validatePolicy({
    allowedExecutables: ['/usr/bin/python3'],
    process: { timeoutMs: 1000, maxStdinBytes: 1, maxStdoutBytes: 1, maxStderrBytes: 1, killGraceMs: 1 },
    maxCommands: 3,
  }), /requires explicit resource limits/)

  const literal = '; touch /workspace/forged'
  await backend.run(
    { commandId: 'command-1', executable: '/usr/bin/python3', args: ['-c', literal], cwd: 'src' },
    'D:\\Lab Root\\candidate',
    { timeoutMs: 1000, maxStdinBytes: 1, maxStdoutBytes: 1, maxStderrBytes: 1, killGraceMs: 1 },
    { maxMemoryBytes: 1024, cpuQuotaPercent: 50, maxProcesses: 4 },
  )
  assert.equal(executable, 'wsl.exe')
  assert.equal(args.filter((value) => value === literal).length, 1)
  assert.equal(args.includes('/mnt/d/Lab Root/candidate'), true)
  assert.equal(args.includes('/workspace/src'), true)
  assert.equal(args.includes('--unshare-all'), true)
  assert.equal(args.includes('--property=MemoryMax=1024'), true)
  assert.equal(args.includes('--property=CPUQuota=50%'), true)
  assert.equal(args.includes('--property=TasksMax=4'), true)
})
