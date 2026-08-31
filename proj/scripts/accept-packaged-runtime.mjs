import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const runtimeRoot = fileURLToPath(new URL('../..', import.meta.url))
const configPath = process.argv[2]
if (process.argv.length !== 3 || !configPath || !resolve(configPath) || !existsSync(resolve(configPath))) {
  process.stderr.write('usage: node proj/scripts/accept-packaged-runtime.mjs <absolute-config.json>\n')
  process.exit(2)
}

const node = resolve(runtimeRoot, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
const runner = resolve(runtimeRoot, 'proj', 'scripts', 'run-supervisory.mjs')
for (const [name, path] of [['bundled Node', node], ['supervisory runner', runner]]) {
  if (!existsSync(path)) throw new Error(`${name} is missing from the packaged runtime: ${path}`)
}

const child = spawn(node, [runner, resolve(configPath)], {
  cwd: runtimeRoot, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
const pending = []
lines.on('line', (line) => pending.shift()?.(line))

let requestId = 0
async function request(operation, fields = {}) {
  const id = `acceptance:${++requestId}`
  const response = new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out`)), 180_000)
    pending.push((line) => { clearTimeout(timer); accept(JSON.parse(line)) })
  })
  child.stdin.write(`${JSON.stringify({ protocolVersion: '1.1', id, operation, ...fields })}\n`)
  const envelope = await response
  if (envelope.id !== id || envelope.ok !== true) {
    throw Object.assign(new Error(`${operation} failed: ${envelope.error?.code ?? 'INVALID_RESPONSE'} ${envelope.error?.message ?? ''}`), { response: envelope })
  }
  return envelope.result
}

function source(text) { return Buffer.from(text, 'utf8').toString('base64') }
function requireValue(value, message) { if (!value) throw new Error(message); return value }

const descriptor = {
  name: 'portable_sum', description: 'Add two integers in an installed candidate Tool.',
  whenToUse: 'Use to verify an exact validated installed candidate.',
  parameters: { type: 'object', additionalProperties: false, properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'] },
  output: { type: 'object', additionalProperties: false, properties: { result: { type: 'integer' } }, required: ['result'] },
  timeoutMs: 5000, allowParallel: true, sideEffect: false,
}
const toolSource = String.raw`#include <cstdlib>
#include <iostream>
#include <string>

std::string string_field(const std::string& value, const std::string& name) {
    const auto start = value.find("\"" + name + "\":\"");
    if (start == std::string::npos) return {};
    const auto first = start + name.size() + 4;
    const auto last = value.find('"', first);
    return value.substr(first, last - first);
}
long integer_field(const std::string& value, const std::string& name) {
    const auto start = value.find("\"" + name + "\":");
    if (start == std::string::npos) std::exit(3);
    return std::strtol(value.c_str() + start + name.size() + 3, nullptr, 10);
}
int main(int argc, char** argv) {
    if (argc == 2 && std::string(argv[1]) == "--self-test") return 0;
    if (argc == 2 && std::string(argv[1]) == "--describe-tools") {
        std::cout << R"({"protocolVersion":"1.0","capabilities":["describe-tools","tool-call","input-schema-validation","output-schema-validation"],"tools":[{"name":"portable_sum","description":"Add two integers in an installed candidate Tool.","whenToUse":"Use to verify an exact validated installed candidate.","parameters":{"type":"object","additionalProperties":false,"properties":{"a":{"type":"integer"},"b":{"type":"integer"}},"required":["a","b"]},"output":{"type":"object","additionalProperties":false,"properties":{"result":{"type":"integer"}},"required":["result"]},"timeoutMs":5000,"allowParallel":true,"sideEffect":false}]})";
        return 0;
    }
    std::string input((std::istreambuf_iterator<char>(std::cin)), {});
    const auto id = string_field(input, "id");
    const auto result = integer_field(input, "a") + integer_field(input, "b");
    std::cout << "{\"protocolVersion\":\"1.0\",\"id\":\"" << id
              << "\",\"ok\":true,\"result\":{\"result\":" << result << "}}";
}
`
const rootCmake = `cmake_minimum_required(VERSION 3.24)\nproject(portable_sum LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nadd_executable(portable_sum candidate/tool.cpp)\nif(MINGW)\n  target_link_options(portable_sum PRIVATE -static -static-libgcc -static-libstdc++)\nendif()\n`
const validationCmake = `cmake_minimum_required(VERSION 3.24)\nproject(portable_sum LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nadd_executable(portable_sum tool.cpp)\nenable_testing()\nadd_test(NAME candidate-self-test COMMAND portable_sum --self-test)\n`

try {
  const suffix = `${Date.now()}-${process.pid}`
  const workspaceId = `workspace:packaged-${suffix}`
  const goalId = `goal:packaged-${suffix}`
  await request('create-workspace', { workspaceId })
  const goal = await request('create-goal', { workspaceId, goalId, objective: 'Validate, approve, install, invoke, and distill an exact candidate.' })
  const authored = await request('create-candidate', {
    workspaceId,
    specification: { problem: 'Need a portable exact-candidate acceptance Tool.', publicName: 'portable_sum', description: descriptor.description,
      inputSchema: descriptor.parameters, outputSchema: descriptor.output, requestedPermissions: [],
      acceptanceCriteria: ['Candidate, standard, and hidden suites pass.', 'Installed Tool returns 42 for 19 + 23.'] },
    descriptor,
    sources: [
      { path: 'CMakeLists.txt', contentBase64: source(rootCmake) },
      { path: 'candidate/CMakeLists.txt', contentBase64: source(validationCmake) },
      { path: 'candidate/tool.cpp', contentBase64: source(toolSource) },
    ],
  })
  const revision = authored.candidate
  const validation = await request('submit-hidden-challenge', {
    workspaceId, revisionId: revision.revisionId, candidateHash: revision.candidateHash,
    fixtures: [{ path: 'candidate/private/challenge.txt', contentBase64: source('hidden acceptance bytes\n') }],
    commands: [{ commandId: 'hidden-self-test', executable: '/usr/bin/ctest', args: ['--test-dir', 'build', '--output-on-failure'], cwd: 'candidate' }],
  })
  if (!validation.promotable || validation.outcome !== 'passed') throw new Error('hidden challenge was not promotable')

  let inspection = await request('inspect', { workspaceId, goalId })
  const candidate = requireValue(inspection.candidates.find((item) => item.revisionId === revision.revisionId), 'candidate disappeared after validation')
  const proposal = requireValue(candidate.proposal, 'promotable validation did not create an installation proposal')
  await request('decide-installation', { workspaceId, proposalId: proposal.proposalId, proposalHash: proposal.proposalHash, decision: 'approved' })
  inspection = await request('inspect', { workspaceId, goalId })
  const approved = requireValue(inspection.candidates.find((item) => item.revisionId === revision.revisionId), 'approved candidate disappeared')
  const approval = requireValue(approved.approval, 'exact user approval was not projected')
  await request('install-candidate', { workspaceId, binding: {
    proposalId: approved.proposal.proposalId, proposalHash: approved.proposal.proposalHash,
    approvalId: approval.approvalId, approvalHash: approval.approvalHash,
    candidateHash: approved.candidateHash, validationId: approved.validation.validationId,
    validationRecordHash: approved.validation.recordHash,
    candidateSnapshotHash: approved.validation.snapshotHash,
    permissionsHash: approved.proposal.permissionsHash,
  } })
  const execution = await request('execute-tool', { workspaceId, goalId, tool: 'portable_sum', arguments: { a: 19, b: 23 } })
  if (execution.result?.result !== 42) throw new Error('installed candidate did not return 42')
  const closed = await request('close-goal', { workspaceId, goalId, planRevisionId: goal.planRevisionId, planHash: goal.planHash,
    drafts: [{ kind: 'experience', content: { summary: 'Exact confined candidate completed the packaged acceptance path.' }, evidenceArtifactIds: [execution.reportArtifactId] }] })
  const distilled = requireValue(closed.proposals[0], 'closure produced no distillation proposal')
  await request('decide-distillation', { workspaceId, proposalId: distilled.proposalId, proposalHash: distilled.proposalHash, decision: 'accepted' })
  const finalInspection = await request('inspect', { workspaceId, goalId })
  if (finalInspection.distillation?.proposals?.[0]?.active !== false) throw new Error('accepted distillation was presented as active')
  process.stdout.write(`${JSON.stringify({ workspaceId, goalId, validationId: validation.validationId,
    installationId: finalInspection.candidates.find((item) => item.revisionId === revision.revisionId)?.installation?.installationId,
    result: execution.result, closureId: closed.closure.closureId, distillation: 'accepted-inactive' })}\n`)
} finally {
  child.stdin.end()
  await new Promise((accept) => child.once('exit', accept))
}
