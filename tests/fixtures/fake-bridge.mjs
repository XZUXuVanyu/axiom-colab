const mode = process.argv[2] ?? 'normal'
const describe = process.argv.includes('--describe-tools')

const descriptor = {
  name: 'echo_cpp',
  description: 'Echo JSON through a fake C++ Bridge.',
  whenToUse: 'Use only in adapter tests.',
  parameters: { type: 'object', additionalProperties: true },
  output: { type: 'object', additionalProperties: true },
  timeoutMs: 1000,
  allowParallel: true,
  sideEffect: false,
}

const capabilities = [
  'describe-tools',
  'tool-call',
  'input-schema-validation',
  'output-schema-validation',
]

if (mode === 'hang') {
  setInterval(() => {}, 1000)
} else if (mode === 'self-terminate') {
  process.kill(process.pid, 'SIGTERM')
} else if (mode === 'nonzero') {
  process.stderr.write('intentional non-zero exit\n')
  process.exitCode = 17
} else if (mode === 'large-stdout') {
  process.stdout.write('x'.repeat(16 * 1024))
} else if (mode === 'large-stderr') {
  process.stderr.write('e'.repeat(16 * 1024))
  setInterval(() => {}, 1000)
} else if (mode === 'malformed') {
  process.stdout.write('{ definitely not json')
} else if (describe) {
  if (mode === 'bad-version') {
    process.stdout.write(JSON.stringify({ protocolVersion: '9.9', capabilities, tools: [descriptor] }))
  } else if (mode === 'missing-capability') {
    process.stdout.write(JSON.stringify({ protocolVersion: '1.0', capabilities: ['describe-tools'], tools: [descriptor] }))
  } else if (mode === 'duplicate') {
    process.stdout.write(JSON.stringify({ protocolVersion: '1.0', capabilities, tools: [descriptor, descriptor] }))
  } else {
    if (mode === 'stderr' || mode === 'tool-error') {
      process.stderr.write('fake diagnostic\n')
    }
    process.stdout.write(JSON.stringify({ protocolVersion: '1.0', capabilities, tools: [descriptor] }))
  }
} else {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => {
    const request = JSON.parse(input)
    if (mode === 'stderr') process.stderr.write('fake call diagnostic\n')
    if (mode === 'tool-error') {
      process.stdout.write(JSON.stringify({
        protocolVersion: '1.0',
        id: request.id,
        ok: false,
        error: {
          code: 'FAKE_TOOL_ERROR',
          message: 'intentional Tool failure',
          details: { source: 'fake-bridge' },
        },
      }))
      return
    }
    if (mode === 'input-validation-error' || mode === 'output-validation-error') {
      const code = mode === 'input-validation-error'
        ? 'INPUT_VALIDATION_FAILED'
        : 'OUTPUT_VALIDATION_FAILED'
      process.stdout.write(JSON.stringify({
        protocolVersion: '1.0',
        id: request.id,
        ok: false,
        error: { code, message: `intentional ${code}`, details: {} },
      }))
      return
    }
    if (mode === 'fabricated-id') {
      process.stdout.write(JSON.stringify({
        protocolVersion: '1.0',
        id: `${request.id}-fabricated`,
        ok: true,
        result: { fabricated: true },
      }))
      return
    }
    const respond = () => process.stdout.write(JSON.stringify({
      protocolVersion: '1.0',
      id: request.id,
      ok: true,
      result: {
        tool: request.tool,
        arguments: request.arguments,
        ...(mode === 'trusted-context' ? { trustedContext: request.trustedContext } : {}),
      },
    }))
    if (mode === 'call-hang') setInterval(() => {}, 1000)
    else if (mode === 'delay') setTimeout(respond, 100)
    else respond()
  })
}
