import { SupervisoryTransport, runSupervisoryTransportServer } from '../../dist/index.js'

const host = {
  workspaces() { return ['workspace:alpha', 'workspace:beta'] },
  goals(workspaceId) { return workspaceId === 'workspace:alpha' ? ['goal:one'] : [] },
  async executeTool(workspaceId, goalId, tool, args) {
    return { workspaceId, goalId, callId: 'call:fixture', tool, result: { sum: args.left + args.right }, reportArtifactId: 'object:report', reportHash: `sha256:${'7'.repeat(64)}` }
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
      tools: [{ name: 'add_numbers', source: 'built-in', installationEvidenceHash: null, descriptor: { name: 'add_numbers', description: 'Adds values.', whenToUse: 'For addition.', parameters: { type: 'object' }, output: { type: 'object' }, timeoutMs: 1000, allowParallel: true, sideEffect: false } }], candidates: [], timeline: [],
      resources: { workspaceId, usedBytes: 0, objectCount: 0, quota: { maxBytes: 10, maxObjects: 1 }, expiredObjects: 0, corruptObjects: 0 },
      controls: { canStopGoal: false, revocableCapabilityIds: [], canResumeGoal: false, recoveryRequired: false },
    }
  },
}

await runSupervisoryTransportServer(
  new SupervisoryTransport(host, 1024), process.stdin, process.stdout,
  { maxLineBytes: 1024, diagnostic: (message) => process.stderr.write(`${message}\n`) },
)
