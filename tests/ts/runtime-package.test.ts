import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { packageRuntime } from '../../proj/scripts/package-runtime.mjs'

test('runtime package is relocatable and binds every copied byte in a manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-runtime-package-'))
  const inputs = join(root, 'inputs')
  const qt = join(root, 'qt')
  const output = join(root, 'relocated', 'Axiom CoLab')
  await mkdir(inputs, { recursive: true }); await mkdir(qt)
  const gui = join(inputs, 'cpp-adapter-gui.exe')
  const bridge = join(inputs, 'cpp-tool-bridge.exe')
  const node = join(inputs, 'node.exe')
  await writeFile(gui, 'gui'); await writeFile(bridge, 'bridge'); await writeFile(node, 'node')
  await writeFile(join(qt, 'Qt6Core.dll'), 'qt')

  const manifest = await packageRuntime({ output, gui, bridge, node, qtRuntime: qt })
  const paths = manifest.files.map((entry) => entry.path)
  assert(paths.includes('bin/cpp-adapter-gui.exe'))
  assert(paths.includes('bin/cpp-tool-bridge.exe'))
  assert(paths.includes('bin/node.exe'))
  assert(paths.includes('bin/Qt6Core.dll'))
  assert(paths.includes('dist/index.js'))
  assert(paths.includes('proj/scripts/run-supervisory.mjs'))
  assert.equal(JSON.parse(await readFile(join(output, 'runtime-manifest.json'), 'utf8')).format,
    'axiom-colab-runtime')
  await assert.rejects(() => packageRuntime({ output, gui, bridge, node, qtRuntime: qt }),
    (error) => error.code === 'INVALID_PACKAGE_INPUT')
})
