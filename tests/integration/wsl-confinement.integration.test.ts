import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  CandidateValidationRunner,
  WslValidationBackend,
} from '../../dist/index.js'

const enabled = process.platform === 'win32' && process.env.AXIOM_TEST_WSL_CONFINEMENT === '1'

test('WSL backend enforces filesystem, descendants, network, CPU, and memory confinement', { skip: !enabled }, async () => {
  const temporaryRoot = resolve('build/wsl-validation-tests')
  const marker = resolve(temporaryRoot, 'escaped-descendant.txt')
  const runner = new CandidateValidationRunner({
    temporaryRoot,
    executionBackend: new WslValidationBackend({ distribution: 'Ubuntu-24.04', startupGraceMs: 30_000 }),
  })
  const command = (commandId: string, script: string) => ({
    commandId,
    executable: '/usr/bin/python3',
    args: ['-c', script],
  })
  const result = await runner.validate({
    workspaceId: 'workspace:wsl-validation',
    candidateId: 'tool:wsl-candidate',
    validatorActorId: 'actor:wsl-validator',
    descriptor: { name: 'wsl_candidate', inputSchema: { type: 'object' } },
    sources: [{ path: 'src/tool.py', content: 'value = 1\n' }],
    fixtures: [],
    toolchain: { name: 'ubuntu-python', version: '3', target: 'wsl2-ubuntu-24.04' },
    policy: {
      allowedExecutables: ['/usr/bin/python3'],
      process: {
        timeoutMs: 5_000,
        maxStdinBytes: 4_096,
        maxStdoutBytes: 4_096,
        maxStderrBytes: 4_096,
        killGraceMs: 100,
      },
      resources: { maxMemoryBytes: 128 * 1024 * 1024, cpuQuotaPercent: 50, maxProcesses: 16 },
      maxCommands: 3,
    },
    suites: [
      {
        suiteId: 'candidate-tests',
        kind: 'candidate',
        commands: [command('candidate-1', "assert open('src/tool.py', encoding='utf-8').read() == 'value = 1\\n'")],
      },
      {
        suiteId: 'standard-safety',
        kind: 'standard',
        commands: [command('standard-1', [
          'import os, socket, subprocess, sys',
          "assert not os.path.exists('/mnt/c')",
          'try:',
          " socket.create_connection(('1.1.1.1', 53), 0.2)",
          " raise AssertionError('network was reachable')",
          'except OSError: pass',
          "subprocess.Popen([sys.executable, '-c', \"import time; time.sleep(0.5); open('/workspace/escaped-descendant.txt','w').write('escaped')\"])",
        ].join('\n'))],
      },
      {
        suiteId: 'user-challenge',
        kind: 'challenge',
        commands: [command('challenge-1', "assert not __import__('os').path.exists('/workspace/escaped-descendant.txt')")],
      },
    ],
  })

  assert.equal(result.record.outcome, 'passed')
  assert.deepEqual(result.record.confinement, {
    backend: 'wsl2-bubblewrap-systemd-v1',
    filesystem: true,
    descendantProcesses: true,
    network: true,
    cpu: true,
    memory: true,
  })
  assert.equal(runner.isPromotionEligible(result.snapshot.snapshotHash, result.record), true)
  await assert.rejects(access(marker))
})

async function limitedValidation(script: string, timeoutMs: number, maxMemoryBytes: number) {
  const runner = new CandidateValidationRunner({
    temporaryRoot: resolve('build/wsl-validation-tests'),
    executionBackend: new WslValidationBackend({ distribution: 'Ubuntu-24.04', startupGraceMs: 30_000 }),
  })
  const command = (commandId: string, value: string) => ({
    commandId,
    executable: '/usr/bin/python3',
    args: ['-c', value],
  })
  return await runner.validate({
    workspaceId: 'workspace:wsl-limits',
    candidateId: 'tool:wsl-limited-candidate',
    validatorActorId: 'actor:wsl-validator',
    descriptor: { name: 'wsl_limited_candidate', inputSchema: { type: 'object' } },
    sources: [{ path: 'src/tool.py', content: 'value = 1\n' }],
    fixtures: [],
    toolchain: { name: 'ubuntu-python', version: '3', target: 'wsl2-ubuntu-24.04' },
    policy: {
      allowedExecutables: ['/usr/bin/python3'],
      process: { timeoutMs, maxStdinBytes: 4096, maxStdoutBytes: 4096, maxStderrBytes: 4096, killGraceMs: 100 },
      resources: { maxMemoryBytes, cpuQuotaPercent: 50, maxProcesses: 8 },
      maxCommands: 3,
    },
    suites: [
      { suiteId: 'candidate-tests', kind: 'candidate', commands: [command('candidate-1', script)] },
      { suiteId: 'standard-safety', kind: 'standard', commands: [command('standard-1', 'pass')] },
      { suiteId: 'user-challenge', kind: 'challenge', commands: [command('challenge-1', 'pass')] },
    ],
  })
}

test('WSL backend terminates memory exhaustion inside its bound cgroup and rlimit', { skip: !enabled }, async () => {
  const result = await limitedValidation("value = bytearray(256 * 1024 * 1024); print(len(value))", 5_000, 64 * 1024 * 1024)
  const observed = result.record.suites[0]?.processes[0]
  assert.notEqual(observed?.outcome, 'passed')
  assert.equal(result.record.confinement.memory, true)
  assert.equal(result.record.outcome, 'failed')
})

test('WSL backend terminates CPU exhaustion within the policy runtime', { skip: !enabled }, async () => {
  const started = performance.now()
  const result = await limitedValidation('while True: pass', 1_500, 128 * 1024 * 1024)
  const observed = result.record.suites[0]?.processes[0]
  assert.notEqual(observed?.outcome, 'passed')
  assert.equal(result.record.confinement.cpu, true)
  assert.ok(performance.now() - started < 20_000)
})
