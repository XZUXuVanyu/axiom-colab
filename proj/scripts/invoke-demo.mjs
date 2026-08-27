import { resolve } from 'node:path'

import {
  AdapterService,
  ProcessRunner,
  ToolObserver,
} from '../../dist/adapter-service.js'

const defaultBridge = process.platform === 'win32'
  ? 'build/windows/Release/cpp-tool-bridge.exe'
  : 'build/linux/cpp-tool-bridge'
const bridgePath = resolve(process.argv[2] ?? defaultBridge)
const common = {
  maxStdinBytes: 4 * 1024 * 1024,
  maxStdoutBytes: 8 * 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  killGraceMs: 250,
}
const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
}
const service = new AdapterService(
  new ProcessRunner(),
  new ToolObserver(logger, { maxLogChars: 2048 }),
  {
    bridge: { executable: bridgePath, prefixArgs: [] },
    descriptorLimits: { ...common, timeoutMs: 10_000 },
    callLimits: common,
  },
)

try {
  const descriptors = await service.initialize()
  console.log(`[demo] discovered=${descriptors.map((item) => item.name).join(',')}`)
  const signal = new AbortController().signal
  await service.invoke(
    'expression_patch',
    { expression: '( x + y ) * 2' },
    'demo-expression',
    signal,
  )
  await service.invoke(
    'calculate_uncertainty',
    {
      expression: 'x * y',
      variables: [
        { name: 'x', value: 2, standardUncertainty: 0.1 },
        { name: 'y', value: 3, standardUncertainty: 0.2 },
      ],
      coverageFactor: 2,
    },
    'demo-uncertainty',
    signal,
  )
} finally {
  service.dispose()
}
