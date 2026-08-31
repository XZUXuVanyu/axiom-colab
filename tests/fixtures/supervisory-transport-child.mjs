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
    requestedPermissions: ['compute.read'], permissionsHash: hash('6'), state: 'proposed',
  },
  approval: null, installation: null,
}
let goalStopped = false
let capabilityRevoked = false
let recoveryRequired = true
const workspaces = ['workspace:alpha', 'workspace:beta']
const goals = new Map([['workspace:alpha', ['goal:one']], ['workspace:beta', []]])
const objectives = new Map([['goal:one', 'Inspect authoritative state.']])

const host = {
  workspaces() { return [...workspaces].sort() },
  goals(workspaceId) { return goals.get(workspaceId) ?? [] },
  createWorkspace(workspaceId) {
    if (workspaces.includes(workspaceId)) throw Object.assign(new Error('workspace exists'), { code: 'WORKSPACE_ALREADY_EXISTS' })
    workspaces.push(workspaceId); goals.set(workspaceId, []); return { workspaceId }
  },
  createGoal(workspaceId, goalId, objective) {
    const visible = goals.get(workspaceId)
    if (visible === undefined) throw Object.assign(new Error('workspace missing'), { code: 'WORKSPACE_NOT_FOUND' })
    if (visible.includes(goalId)) throw Object.assign(new Error('goal exists'), { code: 'GOAL_ALREADY_REGISTERED' })
    visible.push(goalId); objectives.set(goalId, objective)
    return { workspaceId, goalId, objective, planRevisionId: 'object:new-plan', planHash: hash('a') }
  },
  async executeTool(workspaceId, goalId, tool, args) {
    return { workspaceId, goalId, callId: 'call:fixture', tool, result: { sum: args.left + args.right }, reportArtifactId: 'object:report', reportHash: `sha256:${'7'.repeat(64)}` }
  },
  async decideInstallation(workspaceId, proposalId, proposalHash, decision) {
    if (proposalId !== candidate.proposal.proposalId || proposalHash !== candidate.proposal.proposalHash) throw Object.assign(new Error('stale proposal'), { code: 'STALE_INSTALLATION_PROPOSAL' })
    candidate.proposal.state = decision
    candidate.approval = decision === 'approved'
      ? { proposalId, proposalHash, approvalId: 'approval:fixture', approvalHash: hash('a'), decision }
      : { proposalId, proposalHash, approvalId: null, approvalHash: null, decision }
    return { workspaceId, proposalId, proposalHash, decision }
  },
  installCandidate(workspaceId, binding) {
    if (candidate.approval?.decision !== 'approved' || candidate.installation !== null
        || binding.proposalId !== candidate.proposal?.proposalId
        || binding.approvalId !== candidate.approval.approvalId
        || binding.candidateHash !== candidate.candidateHash) {
      throw Object.assign(new Error('stale installation binding'), { code: 'STALE_INSTALLATION_BINDING' })
    }
    candidate.installation = { installationId: 'evidence:installed', evidenceHash: hash('b'), outcome: 'installed' }
    return { workspaceId, installationId: 'evidence:installed', proposalId: binding.proposalId,
      approvalId: binding.approvalId, candidateHash: binding.candidateHash,
      evidenceHash: hash('b'), outcome: 'installed' }
  },
  async submitHiddenChallenge(workspaceId, revisionId, candidateHash, fixtures, commands) {
    if (revisionId !== candidate.revisionId || candidateHash !== candidate.candidateHash) throw Object.assign(new Error('stale candidate'), { code: 'STALE_CANDIDATE_REVISION' })
    if (fixtures[0]?.path !== 'tests/private.txt' || commands[0]?.commandId !== 'hidden-test') throw Object.assign(new Error('unexpected private challenge'), { code: 'INVALID_HIDDEN_CHALLENGE' })
    candidate.validation = { ...candidate.validation, validationId: 'validation:hidden', outcome: 'passed', promotable: true, snapshotHash: hash('0'), recordHash: hash('1'), suites: candidate.validation.suites.map((suite) => ({ ...suite, outcome: 'passed' })) }
    return {
      workspaceId, revisionId, candidateHash, validationId: 'validation:hidden',
      snapshotHash: hash('0'), recordHash: hash('1'), outcome: 'passed', promotable: true,
      suites: candidate.validation.suites.map(({ kind, outcome, definitionHash, commandCount, hidden }) => ({ kind, outcome, definitionHash, commandCount, hidden })),
    }
  },
  reviseCandidate(workspaceId, parentRevisionId, parentCandidateHash, descriptor, sources) {
    if (parentRevisionId !== candidate.revisionId || parentCandidateHash !== candidate.candidateHash) throw Object.assign(new Error('stale candidate'), { code: 'STALE_CANDIDATE_REVISION' })
    if (descriptor.name !== 'candidate_tool' || sources[0]?.path !== 'src/tool.cpp') throw Object.assign(new Error('invalid revision'), { code: 'INVALID_CANDIDATE_SOURCE' })
    const parentHash = candidate.candidateHash
    candidate.revisionId = 'evidence:revised'
    candidate.revision = 2
    candidate.candidateHash = hash('0')
    candidate.validation = null
    candidate.proposal = null
    candidate.approval = null
    candidate.installation = null
    return {
      protocolVersion: '1.0', revisionId: candidate.revisionId, candidateId: candidate.candidateId,
      workspaceId, specificationId: 'proposal:spec', specificationHash: hash('1'), revision: 2,
      parentRevisionId, parentCandidateHash: parentHash, descriptorHash: hash('2'), sourceHash: hash('3'),
      sources: [{ path: 'src/tool.cpp', size: 14, hash: hash('4') }], candidateHash: candidate.candidateHash,
      state: 'current', createdAt: '2026-08-30T08:00:00.000Z', createdBy: 'actor:host',
    }
  },
  createCandidate(workspaceId, specification, descriptor, sources) {
    if (specification.publicName !== 'new_tool' || descriptor.name !== 'new_tool'
        || sources[0]?.path !== 'src/new_tool.cpp') throw Object.assign(new Error('invalid initial candidate'), { code: 'INVALID_CANDIDATE_SOURCE' })
    candidate.revisionId = 'evidence:initial'
    candidate.candidateId = 'tool:new'
    candidate.revision = 1
    candidate.candidateHash = hash('9')
    candidate.validation = null
    candidate.proposal = null
    candidate.approval = null
    candidate.installation = null
    return {
      specification: {
        protocolVersion: '1.0', specificationId: 'proposal:new', workspaceId,
        createdAt: '2026-08-30T09:00:00.000Z', createdBy: 'actor:host',
        ...specification, constraints: specification.constraints ?? [], specificationHash: hash('6'),
      },
      candidate: {
        protocolVersion: '1.0', revisionId: candidate.revisionId, candidateId: candidate.candidateId,
        workspaceId, specificationId: 'proposal:new', specificationHash: hash('6'), revision: 1,
        parentRevisionId: null, parentCandidateHash: null, descriptorHash: hash('7'), sourceHash: hash('8'),
        sources: [{ path: 'src/new_tool.cpp', size: 14, hash: hash('5') }], candidateHash: candidate.candidateHash,
        state: 'current', createdAt: '2026-08-30T09:00:00.000Z', createdBy: 'actor:host',
      },
    }
  },
  async stopGoal(workspaceId, goalId, planRevisionId, planHash) {
    if (workspaceId !== 'workspace:alpha' || goalId !== 'goal:one'
        || planRevisionId !== 'object:plan' || planHash !== hash('1') || goalStopped) throw Object.assign(new Error('stale stop'), { code: 'ACTION_NOT_AVAILABLE' })
    goalStopped = true
  },
  async resumeGoal(workspaceId, goalId, planRevisionId, planHash) {
    if (workspaceId !== 'workspace:alpha' || goalId !== 'goal:one'
        || planRevisionId !== 'object:plan' || planHash !== hash('1') || !goalStopped) throw Object.assign(new Error('stale resume'), { code: 'ACTION_NOT_AVAILABLE' })
    goalStopped = false
  },
  async revokeCapability(workspaceId, goalId, capabilityId) {
    if (workspaceId !== 'workspace:alpha' || goalId !== 'goal:one'
        || capabilityId !== 'capability:active' || capabilityRevoked) throw Object.assign(new Error('stale capability'), { code: 'ACTION_NOT_AVAILABLE' })
    capabilityRevoked = true
  },
  async recoverWorkspace(workspaceId) {
    if (workspaceId !== 'workspace:alpha' || !recoveryRequired) throw Object.assign(new Error('stale recovery'), { code: 'ACTION_NOT_AVAILABLE' })
    recoveryRequired = false
  },
  async inspect(workspaceId, goalId) {
    if (workspaceId === 'workspace:missing') throw Object.assign(new Error('workspace is not visible'), { code: 'WORKSPACE_NOT_FOUND' })
    return {
      workspaceId, goalId,
      currentPlan: goalId === null ? null : {
        revisionId: 'object:plan', hash: `sha256:${'1'.repeat(64)}`,
        objective: objectives.get(goalId) ?? 'Inspect authoritative state.', approved: true,
      },
      progress: null, observations: [],
      memory: {
        compute: [{ objectId: 'object:compute', revision: 1, hash: `sha256:${'2'.repeat(64)}`, size: 2, state: 'active', expiresAt: null }],
        working: [{ revisionId: 'object:working', key: 'decision', revision: 1, hash: `sha256:${'3'.repeat(64)}`, proposalId: 'proposal:decision', committedAt: '2026-08-29T03:00:00.000Z' }],
        artifacts: [{ artifactId: 'object:artifact', hash: `sha256:${'4'.repeat(64)}`, size: 1, schemaHash: `sha256:${'5'.repeat(64)}`, parentIds: [], childIds: [], operation: 'seed', parametersHash: `sha256:${'6'.repeat(64)}`, softwareVersion: '1.0.0', validationId: null, createdAt: '2026-08-29T03:00:00.000Z' }],
      },
      tools: [
        { name: 'add_numbers', source: 'built-in', executable: true, installationEvidenceHash: null, descriptor: { name: 'add_numbers', description: 'Adds values.', whenToUse: 'For addition.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false } },
        ...(candidate.installation?.outcome === 'installed' ? [{ name: 'candidate_tool', source: 'installed', executable: false, installationEvidenceHash: candidate.installation.evidenceHash, descriptor: candidate.descriptor }] : []),
      ], candidates: [candidate], timeline: [],
      distillation: { closure: null, proposals: [] },
      resources: { workspaceId, usedBytes: 0, objectCount: 0, quota: { maxBytes: 10, maxObjects: 1 }, expiredObjects: 0, corruptObjects: 0 },
      controls: {
        canStopGoal: goalId === 'goal:one' && !goalStopped,
        revocableCapabilityIds: goalId === 'goal:one' && !capabilityRevoked ? ['capability:active'] : [],
        canResumeGoal: goalId === 'goal:one' && goalStopped,
        recoveryRequired,
      },
    }
  },
}

await runSupervisoryTransportServer(
  new SupervisoryTransport(host, 1024), process.stdin, process.stdout,
  { maxLineBytes: 1024, diagnostic: (message) => process.stderr.write(`${message}\n`) },
)
