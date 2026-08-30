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
    for (const item of copy.memory.compute)Object.freeze(item);
    Object.freeze(copy.memory.compute);
    for (const item of copy.memory.working)Object.freeze(item);
    Object.freeze(copy.memory.working);
    for (const item of copy.memory.artifacts){
        Object.freeze(item.parentIds);
        Object.freeze(item.childIds);
        Object.freeze(item);
    }
    Object.freeze(copy.memory.artifacts);
    Object.freeze(copy.memory);
    for (const tool of copy.tools)Object.freeze(tool);
    Object.freeze(copy.tools);
    for (const candidate of copy.candidates){
        for (const source of candidate.sources)Object.freeze(source);
        Object.freeze(candidate.sources);
        Object.freeze(candidate.descriptor);
        if (candidate.proposal !== null) Object.freeze(candidate.proposal.requestedPermissions);
        Object.freeze(candidate.proposal);
        if (candidate.validation !== null) {
            Object.freeze(candidate.validation.toolchain);
            Object.freeze(candidate.validation.confinement);
            for (const suite of candidate.validation.suites){
                for (const process of suite.processes)Object.freeze(process);
                Object.freeze(suite.processes);
                Object.freeze(suite);
            }
            Object.freeze(candidate.validation.suites);
        }
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
        const artifactIds = new Set(snapshot.memory.artifacts.map((item)=>item.artifactId));
        if (artifactIds.size !== snapshot.memory.artifacts.length) {
            fail('INVALID_ARTIFACT_LINEAGE', 'artifact projection contains duplicate identities');
        }
        const artifactsById = new Map(snapshot.memory.artifacts.map((item)=>[
                item.artifactId,
                item
            ]));
        for (const artifact of snapshot.memory.artifacts){
            if (artifact.parentIds.includes(artifact.artifactId) || artifact.childIds.includes(artifact.artifactId)) {
                fail('INVALID_ARTIFACT_LINEAGE', 'artifact lineage cannot contain a self edge');
            }
            for (const parentId of artifact.parentIds)if (!artifactIds.has(parentId)) {
                fail('INVALID_ARTIFACT_LINEAGE', `artifact parent ${parentId} is not projected`);
            } else if (!artifactsById.get(parentId)?.childIds.includes(artifact.artifactId)) {
                fail('INVALID_ARTIFACT_LINEAGE', 'artifact parent and child edges disagree');
            }
            for (const childId of artifact.childIds)if (!artifactIds.has(childId)) {
                fail('INVALID_ARTIFACT_LINEAGE', `artifact child ${childId} is not projected`);
            } else if (!artifactsById.get(childId)?.parentIds.includes(artifact.artifactId)) {
                fail('INVALID_ARTIFACT_LINEAGE', 'artifact child and parent edges disagree');
            }
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
            const sourcePaths = new Set(candidate.sources.map((source)=>source.path));
            if (sourcePaths.size !== candidate.sources.length) fail('INVALID_CANDIDATE_SOURCE', 'candidate source manifest contains duplicate paths');
            if (candidate.approval !== null && candidate.validation === null) fail('MISLEADING_AUTHORITY', 'approval must retain its validation projection');
            if (candidate.approval !== null && candidate.proposal === null) fail('MISLEADING_AUTHORITY', 'approval must retain its exact proposal projection');
            if (candidate.proposal?.state === 'proposed' && candidate.approval !== null) fail('MISLEADING_AUTHORITY', 'pending proposal cannot carry a user decision');
            if (candidate.approval?.decision === 'approved' && (candidate.proposal?.state !== 'approved' || typeof candidate.approval.approvalId !== 'string' || typeof candidate.approval.approvalHash !== 'string')) {
                fail('MISLEADING_AUTHORITY', 'approved candidate must retain exact approval authority hashes');
            }
            if (candidate.approval?.decision === 'rejected' && (candidate.approval.approvalId !== null || candidate.approval.approvalHash !== null)) {
                fail('MISLEADING_AUTHORITY', 'rejected candidate cannot carry approval authority hashes');
            }
            if (candidate.installation !== null && candidate.approval === null) fail('MISLEADING_AUTHORITY', 'installation must retain its approval projection');
            if (candidate.validation !== null) {
                const suiteKinds = new Set(candidate.validation.suites.map((suite)=>suite.kind));
                if (suiteKinds.size !== 3 || !suiteKinds.has('candidate') || !suiteKinds.has('standard') || !suiteKinds.has('challenge')) {
                    fail('INVALID_VALIDATION_EVIDENCE', 'validation projection must retain all three independent suites');
                }
                for (const suite of candidate.validation.suites){
                    if (suite.processes.length !== suite.commandCount) fail('INVALID_VALIDATION_EVIDENCE', 'validation suite command count does not match observed processes');
                    if (suite.hidden && suite.processes.some((process)=>process.stdout !== null || process.stderr !== null)) {
                        fail('MISLEADING_AUTHORITY', 'hidden challenge output must remain redacted');
                    }
                }
            }
        }
        for (const tool of snapshot.tools){
            if (tool.source === 'installed' && tool.installationEvidenceHash === null) fail('MISLEADING_AUTHORITY', 'installed Tools require verified installation evidence');
            if (tool.source === 'built-in' && tool.installationEvidenceHash !== null) fail('MISLEADING_AUTHORITY', 'built-ins cannot claim installation evidence');
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/supervisory-application.ts