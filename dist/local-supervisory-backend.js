import { assertToolDescriptor } from './protocol.js';
export class LocalSupervisoryBackendError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'LocalSupervisoryBackendError';
    }
}
function fail(code, message) {
    throw new LocalSupervisoryBackendError(code, message);
}
function planProjection(goal) {
    if (goal?.plan === null || goal === null) return null;
    return {
        revisionId: goal.plan.id,
        hash: goal.plan.hash,
        objective: goal.plan.value.objective,
        approved: true
    };
}
function latestValidation(revision, validations) {
    const matching = validations.filter((item)=>item.snapshot.candidateId === revision.candidateId && item.snapshot.descriptorHash === revision.descriptorHash && item.snapshot.sourceHash === revision.sourceHash);
    return matching.sort((left, right)=>left.record.completedAt.localeCompare(right.record.completedAt)).at(-1) ?? null;
}
function proposalFor(revision, proposals) {
    return proposals.filter((item)=>item.revisionId === revision.revisionId && item.candidateHash === revision.candidateHash).sort((left, right)=>left.createdAt.localeCompare(right.createdAt)).at(-1) ?? null;
}
export class LocalSupervisoryBackend {
    store;
    workflows;
    candidates;
    validator;
    options;
    constructor(store, workflows, candidates, validator, options){
        this.store = store;
        this.workflows = workflows;
        this.candidates = candidates;
        this.validator = validator;
        this.options = options;
    }
    async inspect(workspaceId, goalId) {
        const resources = this.store.reopenWorkspace(workspaceId);
        const goal = goalId === null ? null : this.options.lifecycle.inspectGoal(workspaceId, goalId);
        if (goalId !== null && goal === null) fail('GOAL_NOT_FOUND', `goal is not visible in ${workspaceId}`);
        const revisions = this.candidates.listWorkspaceCandidateRevisions(workspaceId);
        const validations = this.candidates.listValidations(workspaceId);
        const proposals = this.candidates.listInstallationProposals(workspaceId);
        const installations = this.candidates.listInstallationEvidence(workspaceId);
        const projectedCandidates = revisions.map((revision)=>{
            const specification = this.candidates.readSpecification(workspaceId, revision.specificationId);
            const validation = latestValidation(revision, validations);
            const proposal = proposalFor(revision, proposals);
            const approval = proposal?.state === 'approved' ? this.candidates.inspectInstallationApproval(workspaceId, proposal.proposalId) : null;
            const installation = installations.find((item)=>item.revisionId === revision.revisionId && item.candidateHash === revision.candidateHash) ?? null;
            return {
                candidateId: revision.candidateId,
                revisionId: revision.revisionId,
                candidateHash: revision.candidateHash,
                state: revision.state,
                modelClaim: specification?.problem ?? null,
                validation: validation === null ? null : {
                    validationId: validation.record.validationId,
                    recordHash: validation.record.recordHash,
                    outcome: validation.record.outcome,
                    promotable: this.validator.isPromotionEligible(validation.snapshot.snapshotHash, validation.record)
                },
                approval: proposal === null || proposal.state === 'proposed' ? null : {
                    proposalId: proposal.proposalId,
                    proposalHash: proposal.proposalHash,
                    decision: approval === null ? 'rejected' : 'approved'
                },
                installation: installation === null ? null : {
                    installationId: installation.installationId,
                    evidenceHash: installation.evidenceHash,
                    outcome: installation.outcome
                }
            };
        });
        const tools = this.options.builtInTools().map((descriptor)=>({
                name: descriptor.name,
                descriptor,
                source: 'built-in',
                installationEvidenceHash: null
            }));
        const installedEvidence = new Map(this.candidates.listInstalledTools(workspaceId).map((item)=>[
                item.evidenceHash,
                item
            ]));
        for (const registration of this.options.rediscoveredTools(workspaceId)){
            const evidence = installedEvidence.get(registration.installationEvidenceHash);
            if (evidence === undefined || evidence.candidateHash !== registration.candidateHash || evidence.publicName !== registration.publicName) {
                fail('UNVERIFIED_INSTALLED_TOOL', 'rediscovered Tool does not bind stored successful installation evidence');
            }
            tools.push({
                name: registration.publicName,
                descriptor: assertToolDescriptor(registration.descriptor),
                source: 'installed',
                installationEvidenceHash: registration.installationEvidenceHash
            });
        }
        const goalState = goalId === null || this.options.goalProgress === undefined ? {
            progress: null,
            observations: []
        } : this.options.goalProgress(workspaceId, goalId);
        const memory = this.options.memory?.(workspaceId) ?? {
            compute: [],
            working: [],
            artifacts: []
        };
        const timeline = this.timeline(workspaceId, revisions, validations, proposals, installations);
        for (const observation of goalState.observations)timeline.push({
            id: `observation:${observation.reportArtifactId}:${observation.callId}`,
            occurredAt: observation.observedAt,
            kind: 'tool-observation',
            summary: `${observation.tool} returned an observed result`,
            subjectId: observation.callId,
            authoritativeHash: observation.reportHash,
            detail: observation.result
        });
        timeline.sort((left, right)=>left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
        return {
            workspaceId,
            goalId,
            currentPlan: planProjection(goal),
            progress: goalState.progress,
            observations: [
                ...goalState.observations
            ],
            memory,
            tools,
            resources,
            candidates: projectedCandidates,
            timeline,
            controls: {
                canStopGoal: goal?.canStop ?? false,
                revocableCapabilityIds: [
                    ...this.options.lifecycle.revocableCapabilities(workspaceId, goalId)
                ],
                canResumeGoal: goal?.canResume ?? false,
                recoveryRequired: this.options.lifecycle.recoveryRequired(workspaceId)
            }
        };
    }
    stopGoal(workspaceId, goalId) {
        return this.options.lifecycle.stopGoal(workspaceId, goalId);
    }
    revokeCapability(workspaceId, capabilityId) {
        return this.options.lifecycle.revokeCapability(workspaceId, capabilityId);
    }
    resumeGoal(workspaceId, goalId) {
        return this.options.lifecycle.resumeGoal(workspaceId, goalId);
    }
    recoverWorkspace(workspaceId) {
        return this.options.lifecycle.recoverWorkspace(workspaceId);
    }
    timeline(workspaceId, revisions, validations, proposals, installations) {
        const entries = this.workflows.auditEvents().filter((event)=>event.workspaceId === workspaceId).map((event)=>({
                id: event.eventId,
                occurredAt: event.occurredAt,
                kind: 'system-event',
                summary: `${event.operation} ${event.outcome}`,
                subjectId: event.targetId,
                authoritativeHash: event.inputHash,
                detail: {
                    outcome: event.outcome,
                    errorCode: event.errorCode
                }
            }));
        for (const revision of revisions)entries.push({
            id: `candidate:${revision.revisionId}`,
            occurredAt: revision.createdAt,
            kind: 'model-claim',
            summary: `Candidate revision ${revision.revision} created`,
            subjectId: revision.revisionId,
            authoritativeHash: null,
            detail: {
                candidateHash: revision.candidateHash
            }
        });
        for (const validation of validations)entries.push({
            id: `validation:${validation.record.validationId}`,
            occurredAt: validation.record.completedAt,
            kind: 'validation-evidence',
            summary: `Validation ${validation.record.outcome}`,
            subjectId: validation.record.validationId,
            authoritativeHash: validation.record.recordHash,
            detail: {
                outcome: validation.record.outcome
            }
        });
        for (const proposal of proposals)if (proposal.state !== 'proposed') entries.push({
            id: `decision:${proposal.proposalId}`,
            occurredAt: proposal.createdAt,
            kind: 'user-decision',
            summary: `Installation proposal ${proposal.state}`,
            subjectId: proposal.proposalId,
            authoritativeHash: proposal.proposalHash,
            detail: {
                decision: proposal.state
            }
        });
        for (const installation of installations)entries.push({
            id: `installation:${installation.installationId}`,
            occurredAt: installation.completedAt,
            kind: 'installed-state',
            summary: `Installation ${installation.outcome}`,
            subjectId: installation.installationId,
            authoritativeHash: installation.evidenceHash,
            detail: {
                outcome: installation.outcome,
                failureCode: installation.failureCode
            }
        });
        return entries.sort((left, right)=>left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/local-supervisory-backend.ts