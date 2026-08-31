import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  LocalApplicationHost, LocalApplicationHostError, LocalCandidateRepository,
  InvocationLedger, LocalGoalLifecycle, LocalMemoryStore, MemoryWorkflows,
  contentHash, installationProposalBinding,
  createLocalApprovedPlanReader,
} from '../../dist/index.js'
import { ToolWorkshop } from '../../dist/tool-workshop.js'

const roots: string[] = []
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = join(tmpdir(), `axiom-host-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(join(root, 'memory'))
  store.createWorkspace('workspace:beta'); store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const candidates = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const lifecycle = new LocalGoalLifecycle(join(root, 'lifecycle.sqlite3'), {
    approvedPlan: () => null, async stopGoal() {}, async resumeGoal() {},
    async revokeCapability() {}, async recoverWorkspace() {},
  })
  let disposed = false
  const adapter = {
    async initialize() { return [{
      name: 'add_numbers', description: 'Adds values.', whenToUse: 'For addition.',
      parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000,
      allowParallel: true, sideEffect: false,
    }] },
    dispose() { disposed = true },
  }
  return { root, store, workflows, candidates, lifecycle, adapter, disposed: () => disposed }
}

test('application host initializes discovery, enumerates workspaces, and owns shutdown', async () => {
  const value = fixture()
  const rediscovered: string[] = []
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover(context) { rediscovered.push(context.workspaceId); return [] } }),
  } as any)
  assert.throws(
    () => host.workspaces(),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_NOT_INITIALIZED',
  )
  await host.initialize()
  assert.deepEqual(host.workspaces(), ['workspace:alpha', 'workspace:beta'])
  assert.deepEqual(host.goals('workspace:alpha'), [])
  assert.deepEqual(rediscovered, ['workspace:alpha', 'workspace:beta'])
  const snapshot = await host.model.selectWorkspace('workspace:alpha')
  assert.equal(snapshot.tools[0]?.name, 'add_numbers')
  host.close()
  assert.equal(value.disposed(), true)
  assert.throws(
    () => host.workspaces(),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_CLOSED',
  )
})

test('application host creates workspaces and registers goals only after exact user plan approval', async () => {
  const value = fixture()
  value.lifecycle.close()
  const approvedPlan = createLocalApprovedPlanReader(value.workflows, 'actor:host')
  const lifecycle = new LocalGoalLifecycle(join(value.root, 'creation-lifecycle.sqlite3'), {
    approvedPlan, async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  const host = new LocalApplicationHost({
    ...value, lifecycle, validator: { isPromotionEligible: () => false },
    hostActorId: 'actor:host', userActorId: 'actor:local-user',
    createInstallation: () => ({ rediscover: () => [] }),
  } as any)
  await host.initialize()
  assert.deepEqual(host.createWorkspace('workspace:new'), { workspaceId: 'workspace:new' })
  const created = host.createGoal('workspace:new', 'goal:new', 'Inspect exact evidence.')
  assert.equal(created.objective, 'Inspect exact evidence.')
  assert.match(created.planRevisionId, /^object:/)
  assert.match(created.planHash, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(host.goals('workspace:new'), ['goal:new'])
  const plan = approvedPlan('workspace:new', 'goal:new')
  assert.equal(plan?.value.objective, 'Inspect exact evidence.')
  assert.equal(plan?.id, created.planRevisionId)
  assert.throws(() => host.createGoal('workspace:new', 'goal:new', 'Changed objective.'), (error: unknown) => (error as any).code === 'GOAL_ALREADY_REGISTERED')
  host.close()
})

test('application host rolls back startup registration when rediscovery fails', async () => {
  const value = fixture()
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: (registry: any) => ({
      rediscover(context: any) {
        registry.register({
          workspaceId: context.workspaceId, installationId: `evidence:${context.workspaceId}`,
          candidateId: 'tool:candidate', candidateHash: `sha256:${'1'.repeat(64)}`,
          publicName: 'candidate', descriptor: {}, requestedPermissions: [],
          installationEvidenceHash: `sha256:${'2'.repeat(64)}`, installedRoot: 'installed',
        })
        if (context.workspaceId === 'workspace:beta') throw new Error('rediscovery failed')
        return []
      },
    }),
  } as any)
  await assert.rejects(host.initialize(), /rediscovery failed/)
  assert.throws(
    () => host.installedRegistrations('workspace:alpha'),
    (error: unknown) => error instanceof LocalApplicationHostError && error.code === 'HOST_NOT_INITIALIZED',
  )
  host.close()
})

test('application host executes only discovered pure Tools and seals the observation', async () => {
  const root = join(tmpdir(), `axiom-host-execute-${crypto.randomUUID()}`); mkdirSync(root); roots.push(root)
  const store = new LocalMemoryStore(join(root, 'memory')); store.createWorkspace('workspace:alpha')
  const workflows = new MemoryWorkflows(store)
  const candidates = new LocalCandidateRepository(join(root, 'candidates.sqlite3'))
  const plan = {
    id: 'object:plan', key: 'goal:one:plan', revision: 1,
    value: { goalId: 'goal:one', objective: 'Run a pure Tool.' }, hash: `sha256:${'1'.repeat(64)}`,
    proposalId: 'proposal:plan', committedAt: '2026-08-29T04:00:00.000Z',
  } as const
  const lifecycle = new LocalGoalLifecycle(join(root, 'lifecycle.sqlite3'), {
    approvedPlan: (workspaceId, goalId) => workspaceId === 'workspace:alpha' && goalId === 'goal:one' ? plan : null,
    async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  const ledger = new InvocationLedger()
  const adapter = {
    ledger,
    async initialize() { return [
      { name: 'add_numbers', description: 'Adds.', whenToUse: 'For addition.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false },
      { name: 'mutate_state', description: 'Mutates.', whenToUse: 'Never here.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: false, sideEffect: true },
    ] },
    async invoke(tool: string, args: unknown, callId: string) {
      ledger.start('call:overlapping', 'unrelated_tool'); ledger.succeed('call:overlapping', 1)
      ledger.start(callId, tool); ledger.succeed(callId, 1)
      return { tool, arguments: args }
    },
    dispose() {},
  }
  const host = new LocalApplicationHost({
    store, workflows, candidates, lifecycle, adapter, validator: { isPromotionEligible: () => false },
    hostActorId: 'actor:host', createInstallation: () => ({ rediscover: () => [] }),
  } as any)
  await host.initialize()
  const execution = await host.executeTool('workspace:alpha', 'goal:one', 'add_numbers', { left: 2, right: 3 })
  assert.equal(execution.tool, 'add_numbers')
  assert.deepEqual(execution.result, { tool: 'add_numbers', arguments: { left: 2, right: 3 } })
  const artifacts = workflows.listArtifacts({
    authority: 'trusted-host', context: { workspaceId: 'workspace:alpha', actorId: 'actor:test', callId: 'call:read', toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: 'capability:read', workspaceId: 'workspace:alpha', actorId: 'actor:test', toolId: 'tool:test', callId: 'call:read', operations: ['artifact.read'], issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'read' },
  } as any)
  assert.equal(artifacts[0]?.id, execution.reportArtifactId)
  const report = JSON.parse(Buffer.from(workflows.readArtifact({
    authority: 'trusted-host', context: { workspaceId: 'workspace:alpha', actorId: 'actor:test', callId: 'call:read', toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: 'capability:read-report', workspaceId: 'workspace:alpha', actorId: 'actor:test', toolId: 'tool:test', callId: 'call:read', operations: ['artifact.read'], issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'read-report' },
  } as any, execution.reportArtifactId)).toString('utf8'))
  assert.deepEqual(report.calls.map((record: any) => record.callId), [execution.callId])
  await assert.rejects(host.executeTool('workspace:alpha', 'goal:one', 'mutate_state', {}), (error: unknown) => (error as any).code === 'TOOL_REQUIRES_POLICY')
  host.close()
})

test('application host executes a side-effecting built-in only with a call-scoped memory session', async () => {
  const value = fixture()
  const plan = {
    id: 'object:plan', key: 'goal:one:plan', revision: 1,
    value: { goalId: 'goal:one', objective: 'Use scoped memory.' }, hash: `sha256:${'1'.repeat(64)}`,
    proposalId: 'proposal:plan', committedAt: '2026-08-29T05:00:00.000Z',
  } as const
  value.lifecycle.close()
  const lifecycle = new LocalGoalLifecycle(join(value.root, 'memory-lifecycle.sqlite3'), {
    approvedPlan: () => plan, async stopGoal() {}, async resumeGoal() {},
    async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  const ledger = new InvocationLedger()
  let receivedWorkspace = ''
  let revoked = false
  const adapter = {
    ledger,
    async initialize() { return [{
      name: 'memory_tool', description: 'Uses memory.', whenToUse: 'For memory.',
      parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000,
      allowParallel: false, sideEffect: true,
    }] },
    async invoke(tool: string, _args: unknown, callId: string, _signal: AbortSignal, session: any) {
      assert.equal(session.envelope.workspaceId, 'workspace:alpha')
      assert.equal(session.envelope.callId, callId)
      ledger.start(callId, tool); ledger.succeed(callId, 1); session.revoke()
      return { stored: true }
    },
    dispose() {},
  }
  const host = new LocalApplicationHost({
    ...value, lifecycle, adapter, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover: () => [] }),
    memorySession(workspaceId: string, toolName: string, callId: string) {
      receivedWorkspace = workspaceId
      assert.equal(toolName, 'memory_tool')
      return { envelope: { workspaceId, callId }, revoke() { revoked = true } }
    },
    memoryPolicyAvailable: (toolName: string) => toolName === 'memory_tool',
  } as any)
  await host.initialize()
  const projected = await host.inspect('workspace:alpha', 'goal:one')
  assert.equal(projected.tools.find((tool: any) => tool.name === 'memory_tool')?.executable, true)
  const result = await host.executeTool('workspace:alpha', 'goal:one', 'memory_tool', {})
  assert.deepEqual(result.result, { stored: true })
  assert.equal(receivedWorkspace, 'workspace:alpha')
  assert.equal(revoked, true)
  host.close()
})

test('application host executes an installed Tool in its own Adapter and seals executable bindings', async () => {
  const value = fixture()
  value.lifecycle.close()
  const plan = { id: 'object:installed-plan', key: 'goal:installed:plan', revision: 1,
    value: { goalId: 'goal:installed', objective: 'Run installed Tool.' }, hash: `sha256:${'a'.repeat(64)}`,
    proposalId: 'proposal:installed-plan', committedAt: '2026-08-31T00:00:00.000Z' } as const
  const lifecycle = new LocalGoalLifecycle(join(value.root, 'installed-lifecycle.sqlite3'), {
    approvedPlan: () => plan, async stopGoal() {}, async resumeGoal() {}, async revokeCapability() {}, async recoverWorkspace() {},
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:installed')
  const descriptor = { name: 'installed_tool', description: 'Installed.', whenToUse: 'For testing.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false }
  const registration = { workspaceId: 'workspace:alpha', installationId: 'evidence:installation', candidateId: 'tool:candidate',
    candidateHash: `sha256:${'1'.repeat(64)}`, descriptorHash: contentHash(descriptor), sourceHash: `sha256:${'2'.repeat(64)}`,
    sources: [], publicName: 'installed_tool', descriptor, requestedPermissions: [], installationEvidenceHash: `sha256:${'3'.repeat(64)}`,
    installedRoot: join(value.root, 'installed') }
  const binding = { executable: join(value.root, 'installed', 'bin', 'tool.exe'), workspaceId: 'workspace:alpha',
    installationId: registration.installationId, installationEvidenceHash: registration.installationEvidenceHash,
    executableEvidenceId: 'evidence:executable', executableEvidenceHash: `sha256:${'4'.repeat(64)}`,
    candidateId: registration.candidateId, candidateHash: registration.candidateHash, descriptorHash: registration.descriptorHash,
    sourceHash: registration.sourceHash, executableHash: `sha256:${'5'.repeat(64)}`, publicName: registration.publicName }
  const ledger = new InvocationLedger()
  let installedInvocations = 0
  const installedAdapter = { ledger, async initialize() { return [descriptor] }, async invoke(tool: string, args: unknown, callId: string) {
    installedInvocations += 1; ledger.start(callId, tool); ledger.succeed(callId, 1); return { args }
  }, dispose() {} }
  const host = new LocalApplicationHost({ ...value, lifecycle, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: (registry: any) => ({ rediscover(context: any) { if (context.workspaceId === registration.workspaceId) registry.register(registration); return [] } }),
    installedExecutables: { async prepare() { return binding }, close() {} }, createInstalledAdapter: () => installedAdapter,
  } as any)
  await host.initialize()
  const result = await host.executeTool('workspace:alpha', 'goal:installed', 'installed_tool', { exact: true })
  assert.equal(installedInvocations, 1)
  const report = JSON.parse(Buffer.from(value.workflows.readArtifact({ authority: 'trusted-host',
    context: { workspaceId: 'workspace:alpha', actorId: 'actor:test', callId: 'call:read-installed', toolId: 'tool:test' },
    capability: { protocolVersion: '1.0', capabilityId: 'capability:read-installed', workspaceId: 'workspace:alpha', actorId: 'actor:test', toolId: 'tool:test', callId: 'call:read-installed', operations: ['artifact.read'], issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'read-installed' },
  } as any, result.reportArtifactId)).toString('utf8'))
  assert.equal(report.installedExecutable.executableEvidenceHash, binding.executableEvidenceHash)
  assert.equal(report.installedExecutable.candidateHash, binding.candidateHash)
  assert.equal(report.installedExecutable.executable, undefined)
  host.close()
})

test('application host binds a user decision to the exact visible proposal hash', async () => {
  const value = fixture()
  const proposalBase = {
    protocolVersion: '1.0', proposalId: 'proposal:one', workspaceId: 'workspace:alpha',
    candidateId: 'tool:candidate', revisionId: 'evidence:revision', candidateHash: `sha256:${'1'.repeat(64)}`,
    specificationId: 'proposal:specification', specificationHash: `sha256:${'2'.repeat(64)}`,
    validationId: 'validation:one', validationRecordHash: `sha256:${'3'.repeat(64)}`,
    candidateSnapshotHash: `sha256:${'4'.repeat(64)}`, requestedPermissions: ['artifact.read'],
    permissionsHash: contentHash(['artifact.read']), state: 'proposed',
    createdAt: '2026-08-29T06:00:00.000Z', createdBy: 'actor:model',
  } as any
  const proposal = { ...proposalBase, proposalHash: contentHash(installationProposalBinding(proposalBase)) }
  value.candidates.saveInstallationProposal(proposal)
  const decisions: string[] = []
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover: () => [] }), userActorId: 'actor:local-user',
    proposalService: {
      approve() { decisions.push('approved') },
      reject(context: any, proposalId: string) { decisions.push(`${context.actorId}:${proposalId}:rejected`) },
    },
  } as any)
  await host.initialize()
  await assert.rejects(
    host.decideInstallation('workspace:alpha', 'proposal:one', `sha256:${'f'.repeat(64)}`, 'rejected'),
    (error: unknown) => (error as any).code === 'STALE_INSTALLATION_PROPOSAL',
  )
  const decided = await host.decideInstallation('workspace:alpha', 'proposal:one', proposal.proposalHash, 'rejected')
  assert.equal(decided.decision, 'rejected')
  assert.deepEqual(decisions, ['actor:local-user:proposal:one:rejected'])
  host.close()
})

test('application host installs only the exact visible approval and evidence binding', async () => {
  const value = fixture()
  const proposal = {
    proposalId: 'proposal:install', proposalHash: `sha256:${'1'.repeat(64)}`, state: 'approved',
    candidateHash: `sha256:${'2'.repeat(64)}`, validationId: 'validation:install',
    validationRecordHash: `sha256:${'3'.repeat(64)}`, candidateSnapshotHash: `sha256:${'4'.repeat(64)}`,
    permissionsHash: `sha256:${'5'.repeat(64)}`,
  }
  const approval = { approvalId: 'approval:install', approvalHash: `sha256:${'6'.repeat(64)}` }
  const candidates = new Proxy(value.candidates as any, {
    get(target, property) {
      if (property === 'inspectInstallationProposal') return () => proposal
      if (property === 'inspectInstallationApproval') return () => approval
      const member = Reflect.get(target, property)
      return typeof member === 'function' ? member.bind(target) : member
    },
  })
  const installs: string[] = []
  const host = new LocalApplicationHost({
    ...value, candidates, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({
      rediscover: () => [],
      install(context: any, proposalId: string) {
        installs.push(`${context.authority}:${proposalId}`)
        return { workspaceId: context.workspaceId, installationId: 'evidence:installed', proposalId,
          approvalId: approval.approvalId, candidateHash: proposal.candidateHash,
          evidenceHash: `sha256:${'7'.repeat(64)}`, outcome: 'installed' }
      },
    }),
  } as any)
  await host.initialize()
  const binding = { proposalId: proposal.proposalId, proposalHash: proposal.proposalHash,
    approvalId: approval.approvalId, approvalHash: approval.approvalHash,
    candidateHash: proposal.candidateHash, validationId: proposal.validationId,
    validationRecordHash: proposal.validationRecordHash, candidateSnapshotHash: proposal.candidateSnapshotHash,
    permissionsHash: proposal.permissionsHash }
  await assert.rejects(host.installCandidate('workspace:alpha', { ...binding, approvalHash: `sha256:${'f'.repeat(64)}` } as any), (error: unknown) => (error as any).code === 'STALE_INSTALLATION_BINDING')
  const result = await host.installCandidate('workspace:alpha', binding as any)
  assert.equal(result.installationId, 'evidence:installed')
  assert.deepEqual(installs, ['trusted-host:proposal:install'])
  assert.doesNotMatch(JSON.stringify(result), /relativeLocation|installedRoot|descriptor|source/)
  host.close()
})

test('application host binds lifecycle actions to exact projected authority', async () => {
  const value = fixture()
  value.lifecycle.close()
  const plan = {
    id: 'object:plan', key: 'goal:one:plan', revision: 1,
    value: { goalId: 'goal:one', objective: 'Supervise lifecycle.' }, hash: `sha256:${'1'.repeat(64)}`,
    proposalId: 'proposal:plan', committedAt: '2026-08-30T10:00:00.000Z',
  } as const
  const actions: string[] = []
  const lifecycle = new LocalGoalLifecycle(join(value.root, 'action-lifecycle.sqlite3'), {
    approvedPlan: (workspaceId, goalId) => workspaceId === 'workspace:alpha' && goalId === 'goal:one' ? plan : null,
    async stopGoal() { actions.push('stop') }, async resumeGoal() { actions.push('resume') },
    async revokeCapability(_workspaceId, capabilityId) { actions.push(`revoke:${capabilityId}`) },
    async recoverWorkspace() { actions.push('recover') },
  })
  lifecycle.registerGoal('workspace:alpha', 'goal:one')
  lifecycle.trackCapability('workspace:alpha', 'goal:one', 'capability:active')
  lifecycle.requireRecovery('workspace:alpha')
  const host = new LocalApplicationHost({
    ...value, lifecycle, validator: { isPromotionEligible: () => false }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover: () => [] }),
  } as any)
  await host.initialize()
  await assert.rejects(
    host.stopGoal('workspace:alpha', 'goal:one', 'object:plan', `sha256:${'f'.repeat(64)}`),
    (error: unknown) => (error as any).code === 'STALE_APPROVED_PLAN',
  )
  await host.stopGoal('workspace:alpha', 'goal:one', plan.id, plan.hash)
  await assert.rejects(
    host.executeTool('workspace:alpha', 'goal:one', 'add_numbers', {}),
    (error: unknown) => (error as any).code === 'GOAL_NOT_ACTIVE',
  )
  await host.revokeCapability('workspace:alpha', 'goal:one', 'capability:active')
  await host.resumeGoal('workspace:alpha', 'goal:one', plan.id, plan.hash)
  await host.recoverWorkspace('workspace:alpha')
  assert.deepEqual(actions, ['stop', 'revoke:capability:active', 'resume', 'recover'])
  host.close()
})

test('application host binds hidden challenges to the exact current candidate and returns redacted evidence', async () => {
  const value = fixture()
  const workshop = new ToolWorkshop({ repository: value.candidates, idFactory: () => crypto.randomUUID() })
  const model = { workspaceId: 'workspace:alpha', actorId: 'actor:model', authority: 'model' } as const
  const specification = workshop.defineSpecification(model, {
    problem: 'Provide a deterministic candidate.', publicName: 'candidate_tool', description: 'Candidate.',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, requestedPermissions: [],
    acceptanceCriteria: ['Pass the hidden user challenge.'],
  })
  const revision = workshop.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    descriptor: { name: 'candidate_tool' },
    sources: [{ path: 'src/tool.cpp', content: 'candidate source' }],
  })
  let captured: any
  const record = {
    validationId: 'validation:hidden', recordHash: `sha256:${'4'.repeat(64)}`, outcome: 'passed',
    suites: [
      { kind: 'candidate', outcome: 'passed', definitionHash: `sha256:${'5'.repeat(64)}`, commandCount: 1, hidden: false },
      { kind: 'standard', outcome: 'passed', definitionHash: `sha256:${'6'.repeat(64)}`, commandCount: 1, hidden: false },
      { kind: 'challenge', outcome: 'passed', definitionHash: `sha256:${'7'.repeat(64)}`, commandCount: 1, hidden: true },
    ],
  }
  const challengeValidator = { async validate(request: any) {
    captured = request
    return { snapshot: { snapshotHash: `sha256:${'3'.repeat(64)}` }, record }
  } }
  const validationProfile = {
    toolchain: { name: 'cmake', version: 'system', target: 'linux-x86_64' },
    wslDistribution: 'Ubuntu-24.04', stagingRoot: join(value.root, 'staging'),
    policy: { allowedExecutables: ['/usr/bin/cmake', '/usr/bin/ctest'], process: { timeoutMs: 1, maxStdinBytes: 1, maxStdoutBytes: 1, maxStderrBytes: 1, killGraceMs: 1 }, resources: { maxMemoryBytes: 1, cpuQuotaPercent: 1, maxProcesses: 1 }, maxCommands: 3 },
    candidateSuite: { suiteId: 'candidate', kind: 'candidate', commands: [{ commandId: 'build', executable: '/usr/bin/cmake', args: [], cwd: 'candidate' }] },
    standardSuite: { suiteId: 'standard', kind: 'standard', commands: [{ commandId: 'standard', executable: '/usr/bin/ctest', args: [], cwd: 'candidate' }] },
  } as const
  const host = new LocalApplicationHost({
    ...value, validator: { isPromotionEligible: () => true }, hostActorId: 'actor:host',
    createInstallation: () => ({ rediscover: () => [] }), challengeValidator,
    validationProfile, validatorActorId: 'actor:validator', workshop,
    workshopActorId: 'actor:host',
  } as any)
  await host.initialize()
  const created = host.createCandidate('workspace:alpha', {
    problem: 'Add a new candidate.', publicName: 'new_tool', description: 'New Tool.',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
    requestedPermissions: [], acceptanceCriteria: ['Returns a deterministic value.'],
  }, { name: 'new_tool' }, [{ path: 'src/tool.cpp', content: 'initial source' }])
  assert.equal(created.candidate.revision, 1)
  assert.equal(created.candidate.specificationId, created.specification.specificationId)
  assert.equal(value.candidates.materializeRevision('workspace:alpha', created.candidate.revisionId)?.sources[0]?.content.toString(), 'initial source')
  await assert.rejects(
    host.submitHiddenChallenge('workspace:alpha', revision.revisionId, `sha256:${'f'.repeat(64)}`, [{ path: 'private/input.txt', content: 'secret' }], [{ commandId: 'hidden', executable: '/usr/bin/ctest', args: [], cwd: 'candidate' }]),
    (error: unknown) => (error as any).code === 'STALE_CANDIDATE_REVISION',
  )
  const result = await host.submitHiddenChallenge(
    'workspace:alpha', revision.revisionId, revision.candidateHash,
    [{ path: 'private/input.txt', content: 'secret' }],
    [{ commandId: 'hidden', executable: '/usr/bin/ctest', args: [], cwd: 'candidate' }],
  )
  assert.equal(captured.descriptor.name, 'candidate_tool')
  assert.equal(captured.suites[2].kind, 'challenge')
  assert.equal(captured.fixtures[0].content, 'secret')
  assert.equal(result.promotable, true)
  assert.deepEqual(result.suites.map((suite) => suite.hidden), [false, false, true])
  assert.doesNotMatch(JSON.stringify(result), /secret|stdout|stderr|fixtures|commands/)
  const revised = host.reviseCandidate(
    'workspace:alpha', revision.revisionId, revision.candidateHash,
    { name: 'candidate_tool' }, [{ path: 'src/tool.cpp', content: 'revised source' }],
  )
  assert.equal(revised.revision, 2)
  assert.equal(revised.parentCandidateHash, revision.candidateHash)
  assert.equal(value.candidates.inspectRevision('workspace:alpha', revision.revisionId)?.state, 'superseded')
  await assert.rejects(
    host.submitHiddenChallenge('workspace:alpha', revision.revisionId, revision.candidateHash, [{ path: 'private/input.txt', content: 'secret' }], [{ commandId: 'hidden', executable: '/usr/bin/ctest', args: [], cwd: 'candidate' }]),
    (error: unknown) => (error as any).code === 'STALE_CANDIDATE_REVISION',
  )
  host.close()
})
