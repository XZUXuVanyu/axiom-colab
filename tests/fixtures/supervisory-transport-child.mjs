import { SupervisoryTransport, runSupervisoryTransportServer } from '../../dist/index.js'

const hash = (value) => `sha256:${value.repeat(64)}`
const candidate = {
  candidateId: 'tool:candidate', revisionId: 'evidence:revision', revision: 1,
  candidateHash: hash('8'), state: 'current', modelClaim: 'Candidate should pass.',
  descriptor: { name: 'candidate_tool' }, descriptorHash: hash('9'), sourceHash: hash('a'),
  sources: [{ path: 'src/tool.cpp', size: 12, hash: hash('b') }],
  validation: {
    validationId: 'validation:fixture', snapshotHash: hash('c'), recordHash: hash('d'),
    outcome: 'failed', promotable: false, completedAt: '2026-08-29T04:00:00.000Z',
    toolchain: { name: 'MSVC', version: '19.51', target: 'x64' },
    toolchainHash: hash('e'), policyHash: hash('f'),
    confinement: { backend: 'wsl', filesystem: true, descendantProcesses: true, network: true, cpu: true, memory: true },
    suites: ['candidate', 'standard', 'challenge'].map((kind) => ({
      suiteId: `${kind}-suite`, kind, definitionHash: hash(kind === 'candidate' ? '1' : kind === 'standard' ? '2' : '3'),
      hidden: kind === 'challenge', commandCount: 1, outcome: kind === 'standard' ? 'failed' : 'passed',
      processes: [{ commandId: `${kind}-command`, commandHash: hash('4'), outcome: kind === 'standard' ? 'failed' : 'passed', exitCode: kind === 'standard' ? 1 : 0, signalName: null, errorCode: null, durationMs: 5, stdoutBytes: 0, stderrBytes: 0, stdoutHash: hash('5'), stderrHash: hash('6'), stdout: kind === 'challenge' ? null : '', stderr: kind === 'challenge' ? null : '' }],
    })),
  },
  proposal: {
    proposalId: 'proposal:fixture', proposalHash: hash('7'), validationId: 'validation:fixture',
    validationRecordHash: hash('d'), candidateSnapshotHash: hash('c'),
    requestedPermissions: ['compute.read'], state: 'proposed',
  },
  approval: null, installation: null,
}

const host = {
  workspaces() { return ['workspace:alpha', 'workspace:beta'] },
  goals(workspaceId) { return workspaceId === 'workspace:alpha' ? ['goal:one'] : [] },
  async executeTool(workspaceId, goalId, tool, args) {
    return { workspaceId, goalId, callId: 'call:fixture', tool, result: { sum: args.left + args.right }, reportArtifactId: 'object:report', reportHash: `sha256:${'7'.repeat(64)}` }
  },
  async decideInstallation(workspaceId, proposalId, proposalHash, decision) {
    if (proposalId !== candidate.proposal.proposalId || proposalHash !== candidate.proposal.proposalHash) throw Object.assign(new Error('stale proposal'), { code: 'STALE_INSTALLATION_PROPOSAL' })
    candidate.proposal.state = decision
    return { workspaceId, proposalId, proposalHash, decision }
  },
  async inspect(workspaceId, goalId) {
    if (workspaceId === 'workspace:missing') throw Object.assign(new Error('workspace is not visible'), { code: 'WORKSPACE_NOT_FOUND' })
    return {
      workspaceId, goalId,
      currentPlan: goalId === null ? null : {
        revisionId: 'object:plan', hash: `sha256:${'1'.repeat(64)}`,
        objective: 'Inspect authoritative state.', approved: true,
      },
      progress: null, observations: [],
      memory: {
        compute: [{ objectId: 'object:compute', revision: 1, hash: `sha256:${'2'.repeat(64)}`, size: 2, state: 'active', expiresAt: null }],
        working: [{ revisionId: 'object:working', key: 'decision', revision: 1, hash: `sha256:${'3'.repeat(64)}`, proposalId: 'proposal:decision', committedAt: '2026-08-29T03:00:00.000Z' }],
        artifacts: [{ artifactId: 'object:artifact', hash: `sha256:${'4'.repeat(64)}`, size: 1, schemaHash: `sha256:${'5'.repeat(64)}`, parentIds: [], childIds: [], operation: 'seed', parametersHash: `sha256:${'6'.repeat(64)}`, softwareVersion: '1.0.0', validationId: null, createdAt: '2026-08-29T03:00:00.000Z' }],
      },
      tools: [{ name: 'add_numbers', source: 'built-in', executable: true, installationEvidenceHash: null, descriptor: { name: 'add_numbers', description: 'Adds values.', whenToUse: 'For addition.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false } }], candidates: [candidate], timeline: [],
      resources: { workspaceId, usedBytes: 0, objectCount: 0, quota: { maxBytes: 10, maxObjects: 1 }, expiredObjects: 0, corruptObjects: 0 },
      controls: { canStopGoal: false, revocableCapabilityIds: [], canResumeGoal: false, recoveryRequired: false },
    }
  },
}

await runSupervisoryTransportServer(
  new SupervisoryTransport(host, 1024), process.stdin, process.stdout,
  { maxLineBytes: 1024, diagnostic: (message) => process.stderr.write(`${message}\n`) },
)
