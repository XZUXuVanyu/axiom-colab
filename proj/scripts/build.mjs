import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = join(projectRoot, 'source', 'ts')
const outputRoot = join(projectRoot, 'dist')

async function sourceFiles(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await sourceFiles(path))
    else if (entry.isFile() && extname(entry.name) === '.ts') result.push(path)
  }
  return result
}

await rm(outputRoot, { recursive: true, force: true })
for (const input of await sourceFiles(sourceRoot)) {
  const output = join(outputRoot, relative(sourceRoot, input)).replace(/\.ts$/, '.js')
  await mkdir(dirname(output), { recursive: true })
  const transformed = stripTypeScriptTypes(await readFile(input, 'utf8'), {
    mode: 'transform',
    sourceMap: false,
    sourceUrl: pathToFileURL(input).href,
  })
  await writeFile(output, transformed, 'utf8')
}

console.log(`built ${relative(projectRoot, outputRoot)}`)
