import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const projectRoot = join(import.meta.dirname, '..', '..')

test('generic TypeScript contains no C++ business tool names', async () => {
  const toolRoot = join(projectRoot, 'source', 'cpp', 'tools')
  const toolSources = await Promise.all(
    (await readdir(toolRoot))
      .filter((name) => name.endsWith('.cpp'))
      .map((name) => readFile(join(toolRoot, name), 'utf8')),
  )
  const toolNames = new Set<string>()
  for (const source of toolSources) {
    for (const match of source.matchAll(/ToolDescriptorBuilder\(\s*"([a-z][a-z0-9_]*)"/g)) {
      toolNames.add(match[1])
    }
    for (const match of source.matchAll(/\.name\s*=\s*"([a-z][a-z0-9_]*)"/g)) {
      toolNames.add(match[1])
    }
  }
  assert.ok(toolNames.size > 0, 'guard must discover at least one C++ tool name')

  const tsSources = await Promise.all(
    (await readdir(join(projectRoot, 'source', 'ts')))
      .filter((name) => name.endsWith('.ts'))
      .map(async (name) => [name, await readFile(join(projectRoot, 'source', 'ts', name), 'utf8')] as const),
  )
  for (const toolName of toolNames) {
    for (const [file, source] of tsSources) {
      assert.equal(source.includes(toolName), false, `${file} embeds business tool name ${toolName}`)
    }
  }
})
