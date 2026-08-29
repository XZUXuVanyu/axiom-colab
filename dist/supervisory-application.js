export class SupervisoryApplicationError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'SupervisoryApplicationError';
    }
}
function fail(code, message) {
    throw new SupervisoryApplicationError(code, message);
}
function clone(value) {
    return structuredClone(value);
}
function freezeSnapshot(snapshot) {
    const copy = clone(snapshot);
    Object.freeze(copy.currentPlan);
    Object.freeze(copy.progress);
    for (const observation of copy.observations)Object.freeze(observation);
    Object.freeze(copy.observations);
    for (const tool of copy.tools)Object.freeze(tool);
    Object.freeze(copy.tools);
    for (const candidate of copy.candidates){
        Object.freeze(candidate.validation);
        Object.freeze(candidate.approval);
        Object.freeze(candidate.installation);
        Object.freeze(candidate);
    }
    Object.freeze(copy.candidates);
    for (const entry of copy.timeline)Object.freeze(entry);
    Object.freeze(copy.timeline);
    Object.freeze(copy.controls.revocableCapabilityIds);
    Object.freeze(copy.controls);
    Object.freeze(copy.resources.quota);
    Object.freeze(copy.resources);
    return Object.freeze(copy);
}
export class SupervisoryApplicationModel {
    backend;
    selectedWorkspaceId = null;
    selectedGoalId = null;
    currentSnapshot = null;
    constructor(backend){
        this.backend = backend;
    }
    snapshot() {
        return this.currentSnapshot === null ? null : freezeSnapshot(this.currentSnapshot);
    }
    async selectWorkspace(workspaceId) {
        this.selectedWorkspaceId = workspaceId;
        this.selectedGoalId = null;
        return this.refresh();
    }
    async selectGoal(goalId) {
        this.requireWorkspace();
        this.selectedGoalId = goalId;
        return this.refresh();
    }
    async refresh() {
        const workspaceId = this.requireWorkspace();
        const inspected = await this.backend.inspect(workspaceId, this.selectedGoalId);
        if (inspected.workspaceId !== workspaceId || inspected.goalId !== this.selectedGoalId) {
            fail('BACKEND_SELECTION_MISMATCH', 'backend snapshot does not match the selected workspace and goal');
        }
        this.assertProjection(inspected);
        this.currentSnapshot = freezeSnapshot(inspected);
        return this.snapshot();
    }
    async stopGoal() {
        const [workspaceId, goalId, snapshot] = this.requireGoalSnapshot();
        if (!snapshot.controls.canStopGoal) fail('ACTION_NOT_AVAILABLE', 'the selected goal cannot be stopped');
        await this.backend.stopGoal(workspaceId, goalId);
        return this.refresh();
    }
    async revokeCapability(capabilityId) {
        const workspaceId = this.requireWorkspace();
        const snapshot = this.requireSnapshot();
        if (!snapshot.controls.revocableCapabilityIds.includes(capabilityId)) fail('ACTION_NOT_AVAILABLE', 'capability is not revocable in the current snapshot');
        await this.backend.revokeCapability(workspaceId, capabilityId);
        return this.refresh();
    }
    async resumeGoal() {
        const [workspaceId, goalId, snapshot] = this.requireGoalSnapshot();
        if (!snapshot.controls.canResumeGoal) fail('ACTION_NOT_AVAILABLE', 'the selected goal cannot be resumed');
        await this.backend.resumeGoal(workspaceId, goalId);
        return this.refresh();
    }
    async recoverWorkspace() {
        const workspaceId = this.requireWorkspace();
        if (!this.requireSnapshot().controls.recoveryRequired) fail('ACTION_NOT_AVAILABLE', 'workspace recovery is not required');
        await this.backend.recoverWorkspace(workspaceId);
        return this.refresh();
    }
    requireWorkspace() {
        if (this.selectedWorkspaceId === null) fail('WORKSPACE_NOT_SELECTED', 'select a workspace first');
        return this.selectedWorkspaceId;
    }
    requireSnapshot() {
        if (this.currentSnapshot === null) fail('SNAPSHOT_NOT_LOADED', 'load the selected workspace first');
        return this.currentSnapshot;
    }
    requireGoalSnapshot() {
        const workspaceId = this.requireWorkspace();
        if (this.selectedGoalId === null) fail('GOAL_NOT_SELECTED', 'select a goal first');
        return [
            workspaceId,
            this.selectedGoalId,
            this.requireSnapshot()
        ];
    }
    assertProjection(snapshot) {
        if (snapshot.goalId === null && (snapshot.progress !== null || snapshot.observations.length > 0)) {
            fail('BACKEND_SELECTION_MISMATCH', 'workspace overview cannot contain goal progress or observations');
        }
        if (snapshot.progress !== null && snapshot.currentPlan === null) {
            fail('MISLEADING_AUTHORITY', 'goal progress requires its approved plan projection');
        }
        if (snapshot.progress !== null && snapshot.progress.completedCalls > snapshot.progress.totalCalls) {
            fail('INVALID_PROGRESS', 'completed calls cannot exceed total calls');
        }
        const observationIds = new Set();
        for (const observation of snapshot.observations){
            const id = `${observation.reportArtifactId}\0${observation.callId}`;
            if (observationIds.has(id)) fail('INVALID_OBSERVATIONS', 'duplicate Tool observation identity');
            observationIds.add(id);
        }
        const timelineIds = new Set();
        for (const entry of snapshot.timeline){
            if (timelineIds.has(entry.id)) fail('INVALID_TIMELINE', `duplicate timeline entry ${entry.id}`);
            timelineIds.add(entry.id);
            if (entry.kind === 'model-claim' && entry.authoritativeHash !== null) {
                fail('MISLEADING_AUTHORITY', 'model claims cannot carry an authoritative evidence hash');
            }
        }
        for (const candidate of snapshot.candidates){
            if (candidate.approval !== null && candidate.validation === null) fail('MISLEADING_AUTHORITY', 'approval must retain its validation projection');
            if (candidate.installation !== null && candidate.approval === null) fail('MISLEADING_AUTHORITY', 'installation must retain its approval projection');
        }
        for (const tool of snapshot.tools){
            if (tool.source === 'installed' && tool.installationEvidenceHash === null) fail('MISLEADING_AUTHORITY', 'installed Tools require verified installation evidence');
            if (tool.source === 'built-in' && tool.installationEvidenceHash !== null) fail('MISLEADING_AUTHORITY', 'built-ins cannot claim installation evidence');
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/supervisory-application.ts