import { readLocalSupervisoryProcessConfig, runLocalSupervisoryProcess } from '../../dist/index.js'

if (process.argv.length !== 3) {
  process.stderr.write('usage: node proj/scripts/run-supervisory.mjs <absolute-config.json>\n')
  process.exitCode = 2
} else {
  try {
    await runLocalSupervisoryProcess(readLocalSupervisoryProcessConfig(process.argv[2]))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
