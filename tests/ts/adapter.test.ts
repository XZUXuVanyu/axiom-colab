import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  AdapterService,
  ProcessRunner,
  ToolObserver,
} from '../../dist/adapter-service.js'
import {
  createHarnessToolDefinition,
  HarnessContractError,
  projectHarnessOutputSchema,
} from '../../dist/dynamic-tool-registry.js'
import { apply, getInvocationLedger, resolveConfig } from '../../dist/index.js'
import {
  ProcessExecutionError,
} from '../../dist/process-runner.js'
import { InvocationLedger } from '../../dist/invocation-ledger.js'
import {
  BridgeToolError,
  parseDescribeToolsResponse,
  parseToolCallResponse,
  ProtocolError,
} from '../../dist/protocol.js'

const fixture = fileURLToPath(new URL('../fixtures/fake-bridge.mjs', import.meta.url))
const limits = {
  timeoutMs: 1000,
  maxStdinBytes: 1024 * 1024,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  killGraceMs: 50,
}

class MemoryLogger {
  readonly infoLines: string[] = []
  readonly warnLines: string[] = []
  readonly errorLines: string[] = []
  info(message: string): void { this.infoLines.push(message) }
  warn(message: string): void { this.warnLines.push(message) }
  error(message: string): void { this.errorLines.push(message) }
}

test('portable verification profiles are validated without business-specific policy', () => {
  assert.equal(resolveConfig({}).verificationMode, 'normal')
  assert.equal(resolveConfig({ verificationMode: 'tool-only' }).verificationMode, 'tool-only')
  assert.equal(resolveConfig({}).maxConcurrentCalls, 4)
  assert.equal(resolveConfig({ maxConcurrentCalls: 2, maxQueuedCalls: 7 }).maxQueuedCalls, 7)
  assert.throws(
    () => resolveConfig({ verificationMode: 'strict-ish' }),
    /verificationMode must be normal or tool-only/,
  )
})

test('invocation ledger verifies generic call, success, and validation policies', () => {
  const ledger = new InvocationLedger()
  ledger.start('one', 'first_tool')
  ledger.succeed('one', 12)
  ledger.start('two', 'other_tool')
  ledger.fail('two', 5, 'OUTPUT_VALIDATION_FAILED')
  const result = ledger.verify({
    permittedTools: ['first_tool'],
    calls: { first_tool: { min: 1, max: 1 }, missing_tool: { min: 1 } },
    requireSuccessfulCompletion: true,
    requireValidation: true,
  })
  assert.equal(result.ok, false)
  assert.deepEqual(new Set(result.violations.map(item => item.code)), new Set([
    'UNEXPECTED_TOOL',
    'CALL_NOT_SUCCESSFUL',
    'VALIDATION_NOT_PROVEN',
    'TOO_FEW_CALLS',
  ]))
  assert.equal(result.records[0].inputValidated, true)
  assert.equal(result.records[0].outputValidated, true)
  assert.throws(() => ledger.start('one', 'duplicate'), /duplicate call ID/)
})

test('adversarial policies reject prose-only, missing, duplicate, and unexpected calls', () => {
  const proseOnly = new InvocationLedger().verify({ calls: { required_tool: { min: 1 } } })
  assert.deepEqual(proseOnly.violations.map(item => item.code), ['TOO_FEW_CALLS'])

  const ledger = new InvocationLedger()
  ledger.start('one', 'required_tool')
  ledger.succeed('one', 1)
  ledger.start('two', 'required_tool')
  ledger.succeed('two', 1)
  ledger.start('three', 'unexpected_tool')
  ledger.succeed('three', 1)
  const result = ledger.verify({
    permittedTools: ['required_tool'],
    calls: { required_tool: { min: 1, max: 1 }, missing_tool: { min: 1 } },
  })
  assert.deepEqual(new Set(result.violations.map(item => item.code)), new Set([
    'UNEXPECTED_TOOL', 'TOO_MANY_CALLS', 'TOO_FEW_CALLS',
  ]))
})

test('invalid arguments, validation failures, and fabricated call IDs are recorded', async () => {
  const invokeMode = async (mode: string, callId: string, args: unknown = {}): Promise<InvocationLedger> => {
    const service = new AdapterService(
      new ProcessRunner(),
      new ToolObserver(new MemoryLogger(), { maxLogChars: 512 }),
      {
        bridge: { executable: process.execPath, prefixArgs: [fixture, mode] },
        descriptorLimits: limits,
        callLimits: {
          maxStdinBytes: limits.maxStdinBytes,
          maxStdoutBytes: limits.maxStdoutBytes,
          maxStderrBytes: limits.maxStderrBytes,
          killGraceMs: limits.killGraceMs,
        },
      },
    )
    await service.initialize()
    await assert.rejects(service.invoke('echo_cpp', args, callId, new AbortController().signal))
    service.dispose()
    return service.ledger
  }

  const invalid = await invokeMode('normal', 'invalid-args', [])
  assert.equal(invalid.snapshot()[0].errorCode, 'INVALID_ARGUMENTS')
  const input = await invokeMode('input-validation-error', 'bad-input')
  assert.equal(input.snapshot()[0].inputValidated, false)
  const output = await invokeMode('output-validation-error', 'bad-output')
  assert.equal(output.snapshot()[0].outputValidated, false)
  const fabricated = await invokeMode('fabricated-id', 'real-id')
  assert.equal(fabricated.snapshot()[0].errorCode, 'CALL_ID_MISMATCH')
})

test('adapter bounds concurrency, rejects overflow, and records every attempt', async () => {
  const service = new AdapterService(
    new ProcessRunner(),
    new ToolObserver(new MemoryLogger(), { maxLogChars: 512 }),
    {
      bridge: { executable: process.execPath, prefixArgs: [fixture, 'delay'] },
      descriptorLimits: limits,
      callLimits: {
        maxStdinBytes: limits.maxStdinBytes,
        maxStdoutBytes: limits.maxStdoutBytes,
        maxStderrBytes: limits.maxStderrBytes,
        killGraceMs: limits.killGraceMs,
      },
      maxConcurrentCalls: 1,
      maxQueuedCalls: 1,
    },
  )
  await service.initialize()
  const signal = new AbortController().signal
  const first = service.invoke('echo_cpp', { order: 1 }, 'bounded-1', signal)
  const second = service.invoke('echo_cpp', { order: 2 }, 'bounded-2', signal)
  await assert.rejects(
    service.invoke('echo_cpp', { order: 3 }, 'bounded-3', signal),
    (error: unknown) => error instanceof ProcessExecutionError && error.code === 'BACKPRESSURE',
  )
  await Promise.all([first, second])
  const records = service.ledger.snapshot()
  assert.deepEqual(records.map(record => record.status), ['succeeded', 'succeeded', 'rejected'])
  service.dispose()
})

test('trusted invocation context is supplied by the host beside Tool arguments', async () => {
  const service = new AdapterService(
    new ProcessRunner(),
    new ToolObserver(new MemoryLogger(), { maxLogChars: 512 }),
    {
      bridge: { executable: process.execPath, prefixArgs: [fixture, 'trusted-context'] },
      descriptorLimits: limits,
      callLimits: {
        maxStdinBytes: limits.maxStdinBytes,
        maxStdoutBytes: limits.maxStdoutBytes,
        maxStderrBytes: limits.maxStderrBytes,
        killGraceMs: limits.killGraceMs,
      },
      trustedContextProvider: (toolName, callId) => ({
        protocolVersion: '1.0', workspaceId: 'workspace:one',
        actorId: 'actor:model', toolId: 'tool:echo', toolName,
        toolVersion: '1.0.0', callId,
        sessionGeneration: 4, memoryGrant: { capabilityId: 'capability:one' },
      }),
    },
  )
  await service.initialize()
  const result = await service.invoke(
    'echo_cpp',
    { trustedContext: { workspaceId: 'workspace:forged' } },
    'call:trusted',
    new AbortController().signal,
  )
  assert.deepEqual(result, {
    tool: 'echo_cpp',
    arguments: { trustedContext: { workspaceId: 'workspace:forged' } },
    trustedContext: {
      protocolVersion: '1.0', workspaceId: 'workspace:one',
      actorId: 'actor:model', toolId: 'tool:echo', toolName: 'echo_cpp', toolVersion: '1.0.0',
      callId: 'call:trusted', sessionGeneration: 4,
      memoryGrant: { capabilityId: 'capability:one' },
    },
  })
  service.dispose()
})

test('call-scoped trusted sessions are revoked when a Bridge call is cancelled', async () => {
  let revocations = 0
  const service = new AdapterService(
    new ProcessRunner(),
    new ToolObserver(new MemoryLogger(), { maxLogChars: 512 }),
    {
      bridge: { executable: process.execPath, prefixArgs: [fixture, 'call-hang'] },
      descriptorLimits: limits,
      callLimits: {
        maxStdinBytes: limits.maxStdinBytes,
        maxStdoutBytes: limits.maxStdoutBytes,
        maxStderrBytes: limits.maxStderrBytes,
        killGraceMs: limits.killGraceMs,
      },
      trustedContextProvider: (toolName, callId) => ({
        envelope: {
          protocolVersion: '1.0', workspaceId: 'workspace:one',
          actorId: 'actor:model', toolId: 'tool:echo', toolName,
          toolVersion: '1.0.0', callId, sessionGeneration: 4,
          memoryGrant: { capabilityId: 'capability:cancelled' },
        },
        revoke: () => { revocations += 1 },
      }),
    },
  )
  await service.initialize()
  const controller = new AbortController()
  const invocation = service.invoke('echo_cpp', {}, 'call:cancelled', controller.signal)
  setTimeout(() => controller.abort(), 50)
  await assert.rejects(invocation, (error: unknown) =>
    error instanceof ProcessExecutionError && error.code === 'CANCELLED')
  assert.equal(revocations, 1)
  service.dispose()
})

async function expectProcessCode(
  promise: Promise<unknown>,
  expected: string,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ProcessExecutionError)
    assert.equal(error.code, expected)
    return true
  })
}

test('descriptor schema and protocol version are validated', () => {
  const validDocument = {
    protocolVersion: '1.0',
    capabilities: [
      'describe-tools',
      'tool-call',
      'input-schema-validation',
      'output-schema-validation',
    ],
    tools: [{
      name: 'sample_tool',
      description: 'sample',
      whenToUse: 'tests',
      parameters: { type: 'object' },
      output: { type: 'object' },
      timeoutMs: 1000,
      allowParallel: true,
      sideEffect: false,
    }],
  }
  const valid = JSON.stringify(validDocument)
  assert.equal(parseDescribeToolsResponse(valid).tools[0].name, 'sample_tool')
  assert.throws(
    () => parseDescribeToolsResponse(valid.replace('"1.0"', '"2.0"')),
    (error: unknown) => error instanceof ProtocolError
      && error.code === 'UNSUPPORTED_PROTOCOL_VERSION',
  )
  assert.throws(
    () => parseDescribeToolsResponse(JSON.stringify({
      ...validDocument,
      tools: [validDocument.tools[0], validDocument.tools[0]],
    })),
    (error: unknown) => error instanceof ProtocolError
      && error.code === 'DUPLICATE_TOOL_NAME',
  )
  assert.throws(
    () => parseDescribeToolsResponse(JSON.stringify({
      ...validDocument,
      tools: [{
        ...validDocument.tools[0],
        parameters: { type: 'object', unsupportedKeyword: true },
      }],
    })),
    (error: unknown) => error instanceof ProtocolError
      && error.code === 'INVALID_DESCRIPTOR',
  )
  assert.throws(
    () => parseDescribeToolsResponse(JSON.stringify({
      ...validDocument,
      capabilities: ['describe-tools'],
    })),
    (error: unknown) => error instanceof ProtocolError
      && error.code === 'MISSING_PROTOCOL_CAPABILITY',
  )
})

test('Harness output projection removes constraints unsupported by rc.5', () => {
  assert.deepEqual(projectHarnessOutputSchema({
    type: 'object',
    properties: {
      value: { type: 'number', minimum: 0, description: 'result' },
      trace: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    },
    required: ['value', 'trace'],
    additionalProperties: false,
  }), {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'result' },
      trace: { type: 'array', items: { type: 'string' } },
    },
    required: ['value', 'trace'],
    additionalProperties: false,
  })
  assert.deepEqual(projectHarnessOutputSchema({ const: true }), {
    type: 'boolean',
    const: true,
  })
  assert.deepEqual(projectHarnessOutputSchema({
    oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    minimum: 0,
  }), {
    oneOf: [{ type: 'string' }, { type: 'null' }],
  })
  assert.deepEqual(projectHarnessOutputSchema(true), {})
  assert.throws(
    () => projectHarnessOutputSchema(false),
    (error: unknown) => error instanceof HarnessContractError,
  )
  assert.throws(
    () => projectHarnessOutputSchema({ allOf: [{ type: 'string' }] }),
    (error: unknown) => error instanceof HarnessContractError,
  )
  assert.throws(
    () => projectHarnessOutputSchema({ type: ['string', 'null'] }),
    (error: unknown) => error instanceof HarnessContractError,
  )
})

test('ProcessRunner captures stdout and stderr without a shell', async () => {
  const runner = new ProcessRunner()
  const result = await runner.run(process.execPath, {
    ...limits,
    args: [fixture, 'stderr', '--describe-tools'],
  })
  assert.match(result.stderr, /fake diagnostic/)
  assert.equal(parseDescribeToolsResponse(result.stdout).tools.length, 1)
  assert.equal(runner.activeCount, 0)
})

test('ProcessRunner normalizes duplicate Windows PATH spellings for child toolchains', async () => {
  const runner = new ProcessRunner()
  const result = await runner.run(process.execPath, {
    args: ['-e', 'process.stdout.write(JSON.stringify({ keys: Object.keys(process.env).filter((key) => key.toLowerCase() === "path"), path: process.env.Path ?? process.env.PATH }))'],
    timeoutMs: 5_000, maxStdinBytes: 1, maxStdoutBytes: 16 * 1024,
    maxStderrBytes: 1024, killGraceMs: 100,
  })
  const environment = JSON.parse(result.stdout)
  assert.equal(environment.keys.length, 1)
  if (process.platform === 'win32') assert.equal(environment.path.split(';')[0], dirname(process.execPath))
  runner.dispose()
})

test('malformed stdout and non-zero exit are distinguished', async () => {
  const runner = new ProcessRunner()
  const malformed = await runner.run(process.execPath, {
    ...limits,
    args: [fixture, 'malformed'],
  })
  assert.throws(
    () => parseToolCallResponse(malformed.stdout, 'call-1'),
    (error: unknown) => error instanceof ProtocolError
      && error.code === 'MALFORMED_STDOUT',
  )
  await expectProcessCode(runner.run(process.execPath, {
    ...limits,
    args: [fixture, 'nonzero'],
  }), 'NON_ZERO_EXIT')
})

test('timeout, cancellation, and output limits terminate the worker', async () => {
  const timeoutRunner = new ProcessRunner()
  await expectProcessCode(timeoutRunner.run(process.execPath, {
    ...limits,
    timeoutMs: 50,
    args: [fixture, 'hang'],
  }), 'TIMEOUT')
  assert.equal(timeoutRunner.activeCount, 0)

  const cancellationRunner = new ProcessRunner()
  const controller = new AbortController()
  const cancellation = cancellationRunner.run(process.execPath, {
    ...limits,
    args: [fixture, 'hang'],
    signal: controller.signal,
  })
  setTimeout(() => controller.abort(), 30)
  await expectProcessCode(cancellation, 'CANCELLED')
  assert.equal(cancellationRunner.activeCount, 0)

  const preCancelledRunner = new ProcessRunner()
  const preCancelledController = new AbortController()
  preCancelledController.abort()
  await expectProcessCode(preCancelledRunner.run(process.execPath, {
    ...limits,
    args: [fixture, 'hang'],
    signal: preCancelledController.signal,
  }), 'CANCELLED')
  assert.equal(preCancelledRunner.activeCount, 0)

  const limitRunner = new ProcessRunner()
  await expectProcessCode(limitRunner.run(process.execPath, {
    ...limits,
    maxStdinBytes: 1,
    args: [fixture, 'normal'],
    stdin: '{}',
  }), 'STDIN_LIMIT')
  await expectProcessCode(limitRunner.run(process.execPath, {
    ...limits,
    maxStdoutBytes: 128,
    args: [fixture, 'large-stdout'],
  }), 'STDOUT_LIMIT')
  await expectProcessCode(limitRunner.run(process.execPath, {
    ...limits,
    maxStderrBytes: 128,
    args: [fixture, 'large-stderr'],
  }), 'STDERR_LIMIT')
})

test('unexpected worker termination is distinguished from an exit code', async () => {
  const runner = new ProcessRunner()
  await assert.rejects(runner.run(process.execPath, {
    ...limits,
    args: [fixture, 'self-terminate'],
  }), (error: unknown) => {
    assert.ok(error instanceof ProcessExecutionError)
    if (process.platform === 'win32') {
      assert.ok(error.code === 'WORKER_TERMINATED' || error.code === 'NON_ZERO_EXIT')
    } else {
      assert.equal(error.code, 'WORKER_TERMINATED')
    }
    return true
  })
  assert.equal(runner.activeCount, 0)
})

test('observer redacts sensitive values and truncates oversized records', () => {
  const logger = new MemoryLogger()
  const observer = new ToolObserver(logger, { maxLogChars: 64 })
  observer.start('audit-1', 'sample_tool', {
    apiKey: 'must-not-appear',
    payload: 'x'.repeat(256),
  })
  assert.match(logger.infoLines[0], /\[REDACTED\]/)
  assert.doesNotMatch(logger.infoLines[0], /must-not-appear/)
  assert.match(logger.infoLines[0], /truncated/)
})

test('dynamic Tool definition is generic and forwards Tool errors', async () => {
  const logger = new MemoryLogger()
  const service = new AdapterService(
    new ProcessRunner(),
    new ToolObserver(logger, { maxLogChars: 512 }),
    {
      bridge: { executable: process.execPath, prefixArgs: [fixture, 'tool-error'] },
      descriptorLimits: limits,
      callLimits: {
        maxStdinBytes: limits.maxStdinBytes,
        maxStdoutBytes: limits.maxStdoutBytes,
        maxStderrBytes: limits.maxStderrBytes,
        killGraceMs: limits.killGraceMs,
      },
    },
  )
  const [descriptor] = await service.initialize()
  const definition = createHarnessToolDefinition(descriptor, service)
  assert.match(definition.description, /When to use:/)
  await assert.rejects(
    definition.execute({ value: 1 }, {
      callId: 'tool-error-1',
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof BridgeToolError
      && error.code === 'FAKE_TOOL_ERROR',
  )
  assert.ok(logger.errorLines.some((line) => line.includes('errorCode=FAKE_TOOL_ERROR')))
  service.dispose()
})

test('dispose kills an active process and leaves no runner state', async () => {
  const runner = new ProcessRunner()
  const pending = runner.run(process.execPath, {
    ...limits,
    args: [fixture, 'hang'],
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(runner.activeCount, 1)
  runner.dispose()
  await expectProcessCode(pending, 'DISPOSED')
  assert.equal(runner.activeCount, 0)
})

test('Cordis-style apply discovers tools, registers Skill, logs calls, and disposes cleanly', async () => {
  const logger = new MemoryLogger()
  const tools = new Map<string, any>()
  const skills = new Map<string, any>()
  const effects: Array<() => void> = []
  const context = {
    logger,
    tools: {
      register(definition: any) {
        tools.set(definition.name, definition)
        const dispose = () => { tools.delete(definition.name) }
        effects.push(dispose)
        return dispose
      },
    },
    skills: {
      register(definition: any) {
        skills.set(definition.name, definition)
        const dispose = () => { skills.delete(definition.name) }
        effects.push(dispose)
        return dispose
      },
    },
    effect(factory: () => void | (() => void)) {
      const dispose = factory()
      const resolved = typeof dispose === 'function' ? dispose : () => {}
      effects.push(resolved)
      return resolved
    },
  }

  await apply(context, {
    bridgePath: process.execPath,
    bridgeArgs: [fixture, 'normal'],
    descriptorTimeoutMs: 1000,
  })
  assert.deepEqual([...tools.keys()], ['echo_cpp'])
  assert.deepEqual([...skills.keys()], ['general-ts-cpp-tools'])
  const definition = tools.get('echo_cpp')
  const result = await definition.execute({ hello: 'world' }, {
    callId: 'apply-call-1',
    signal: new AbortController().signal,
  })
  assert.deepEqual(result, { tool: 'echo_cpp', arguments: { hello: 'world' } })
  const verification = getInvocationLedger(context)?.verify({
    permittedTools: ['echo_cpp'],
    calls: { echo_cpp: { min: 1, max: 1 } },
    requireSuccessfulCompletion: true,
    requireValidation: true,
  })
  assert.equal(verification?.ok, true)
  assert.ok(logger.infoLines.some((line) => line.startsWith('[cpp-tool:start]')))
  assert.ok(logger.infoLines.some((line) => line.startsWith('[cpp-tool:success]')))

  for (const dispose of effects.reverse()) dispose()
  assert.equal(getInvocationLedger(context), undefined)
  assert.equal(tools.size, 0)
  assert.equal(skills.size, 0)
  await assert.rejects(
    definition.execute({}, {
      callId: 'after-dispose',
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof ProcessExecutionError
      && error.code === 'DISPOSED',
  )
})
