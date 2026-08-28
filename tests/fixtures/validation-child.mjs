import { readFile } from 'node:fs/promises'

const mode = process.argv[2]

if (mode === 'pass') {
  await readFile('src/tool.cpp', 'utf8')
  process.stdout.write('observed pass\n')
} else if (mode === 'fake-pass') {
  process.stdout.write('{"passed":true,"claimedBy":"candidate"}\n')
  process.exitCode = 9
} else if (mode === 'challenge') {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  if (input.length === 0) process.exitCode = 2
} else if (mode === 'hang') {
  setInterval(() => {}, 1000)
} else {
  process.stderr.write(`unknown mode ${String(mode)}\n`)
  process.exitCode = 3
}
