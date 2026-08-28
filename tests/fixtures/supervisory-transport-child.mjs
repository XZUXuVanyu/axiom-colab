import { SupervisoryTransport, runSupervisoryTransportServer } from '../../dist/index.js'

const host = {
  workspaces() { return ['workspace:alpha', 'workspace:beta'] },
  async inspect(workspaceId, goalId) {
    if (workspaceId === 'workspace:missing') throw Object.assign(new Error('workspace is not visible'), { code: 'WORKSPACE_NOT_FOUND' })
    return {
      workspaceId, goalId, currentPlan: null, tools: [], candidates: [], timeline: [],
      resources: { workspaceId, usedBytes: 0, objectCount: 0, quota: { maxBytes: 10, maxObjects: 1 }, expiredObjects: 0, corruptObjects: 0 },
      controls: { canStopGoal: false, revocableCapabilityIds: [], canResumeGoal: false, recoveryRequired: false },
    }
  },
}

await runSupervisoryTransportServer(
  new SupervisoryTransport(host, 1024), process.stdin, process.stdout,
  { maxLineBytes: 1024, diagnostic: (message) => process.stderr.write(`${message}\n`) },
)
