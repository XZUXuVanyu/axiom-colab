import { randomUUID } from 'node:crypto';
import { captureCandidateFiles } from './candidate-content.js';
import { contentHash } from './laboratory-contract.js';
import { LocalSupervisoryBackend } from './local-supervisory-backend.js';
import { SupervisoryApplicationModel } from './supervisory-application.js';
export class LocalApplicationHostError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'LocalApplicationHostError';
    }
}
function fail(code, message) {
    throw new LocalApplicationHostError(code, message);
}
class VerifiedInstalledRegistry {
    registrations = new Map();
    register(registration) {
        const key = `${registration.workspaceId}\0${registration.installationId}`;
        if (this.registrations.has(key)) fail('DUPLICATE_INSTALLED_REGISTRATION', 'installed Tool is already registered');
        const captured = structuredClone(registration);
        this.registrations.set(key, captured);
        return ()=>{
            this.registrations.delete(key);
        };
    }
    list(workspaceId) {
        return [
            ...this.registrations.values()
        ].filter((item)=>item.workspaceId === workspaceId).map((item)=>structuredClone(item));
    }
    clear() {
        this.registrations.clear();
    }
}
export class LocalApplicationHost {
    options;
    model;
    backend;
    registry = new VerifiedInstalledRegistry();
    installation;
    descriptors = [];
    initialized = false;
    closed = false;
    constructor(options){
        this.options = options;
        this.installation = options.createInstallation(this.registry);
        this.backend = new LocalSupervisoryBackend(options.store, options.workflows, options.candidates, options.validator, {
            builtInTools: ()=>this.descriptors,
            rediscoveredTools: (workspaceId)=>this.registry.list(workspaceId),
            executableBuiltIn: (_workspaceId, descriptor)=>!descriptor.sideEffect || (options.memoryPolicyAvailable?.(descriptor.name) ?? false),
            lifecycle: options.lifecycle,
            ...options.goalProgress === undefined ? {} : {
                goalProgress: options.goalProgress
            },
            ...options.memory === undefined ? {} : {
                memory: options.memory
            }
        });
        this.model = new SupervisoryApplicationModel(this.backend);
    }
    workspaces() {
        this.ensureReady();
        return this.options.store.listWorkspaces();
    }
    goals(workspaceId) {
        this.ensureReady();
        this.options.store.reopenWorkspace(workspaceId);
        return this.options.lifecycle.listGoals(workspaceId);
    }
    installedRegistrations(workspaceId) {
        this.ensureReady();
        return this.registry.list(workspaceId);
    }
    inspect(workspaceId, goalId) {
        this.ensureReady();
        return this.backend.inspect(workspaceId, goalId);
    }
    async stopGoal(workspaceId, goalId, planRevisionId, planHash) {
        const snapshot = await this.inspect(workspaceId, goalId);
        if (snapshot.currentPlan?.revisionId !== planRevisionId || snapshot.currentPlan.hash !== planHash) {
            fail('STALE_APPROVED_PLAN', 'stop request does not bind the exact visible approved plan');
        }
        if (!snapshot.controls.canStopGoal) fail('ACTION_NOT_AVAILABLE', 'selected goal cannot be stopped');
        await this.backend.stopGoal(workspaceId, goalId);
    }
    async resumeGoal(workspaceId, goalId, planRevisionId, planHash) {
        const snapshot = await this.inspect(workspaceId, goalId);
        if (snapshot.currentPlan?.revisionId !== planRevisionId || snapshot.currentPlan.hash !== planHash) {
            fail('STALE_APPROVED_PLAN', 'resume request does not bind the exact visible approved plan');
        }
        if (!snapshot.controls.canResumeGoal) fail('ACTION_NOT_AVAILABLE', 'selected goal cannot be resumed');
        await this.backend.resumeGoal(workspaceId, goalId);
    }
    async revokeCapability(workspaceId, goalId, capabilityId) {
        const snapshot = await this.inspect(workspaceId, goalId);
        if (!snapshot.controls.revocableCapabilityIds.includes(capabilityId)) {
            fail('ACTION_NOT_AVAILABLE', 'capability is not revocable in the exact visible selection');
        }
        await this.backend.revokeCapability(workspaceId, capabilityId);
    }
    async recoverWorkspace(workspaceId) {
        const snapshot = await this.inspect(workspaceId, null);
        if (!snapshot.controls.recoveryRequired) fail('ACTION_NOT_AVAILABLE', 'workspace recovery is not required');
        await this.backend.recoverWorkspace(workspaceId);
    }
    async decideInstallation(workspaceId, proposalId, proposalHash, decision) {
        this.ensureReady();
        if (this.options.proposalService === undefined || this.options.userActorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'installation decisions are not composed');
        const proposal = this.options.candidates.inspectInstallationProposal(workspaceId, proposalId);
        if (proposal === null || proposal.proposalHash !== proposalHash) fail('STALE_INSTALLATION_PROPOSAL', 'proposal identity and hash do not match visible state');
        const context = {
            workspaceId,
            actorId: this.options.userActorId,
            authority: 'user'
        };
        if (decision === 'approved') this.options.proposalService.approve(context, proposalId);
        else this.options.proposalService.reject(context, proposalId);
        return {
            workspaceId,
            proposalId,
            proposalHash,
            decision
        };
    }
    async submitHiddenChallenge(workspaceId, revisionId, candidateHash, fixtures, commands) {
        this.ensureReady();
        const runner = this.options.challengeValidator;
        const profile = this.options.validationProfile;
        const validatorActorId = this.options.validatorActorId;
        if (runner === undefined || profile === undefined || validatorActorId === undefined) {
            fail('OPERATION_NOT_AVAILABLE', 'hidden challenge validation is not composed');
        }
        const materialized = this.options.candidates.materializeRevision(workspaceId, revisionId);
        if (materialized === null) fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace');
        if (materialized.revision.state !== 'current' || materialized.revision.candidateHash !== candidateHash) {
            fail('STALE_CANDIDATE_REVISION', 'hidden challenge must bind the exact current candidate revision');
        }
        if (commands.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge must contain at least one command');
        const request = {
            workspaceId,
            candidateId: materialized.revision.candidateId,
            validatorActorId,
            descriptor: materialized.descriptor,
            sources: materialized.sources,
            fixtures,
            toolchain: profile.toolchain,
            policy: profile.policy,
            suites: [
                profile.candidateSuite,
                profile.standardSuite,
                {
                    suiteId: 'user-hidden-challenge',
                    kind: 'challenge',
                    commands
                }
            ]
        };
        const result = await runner.validate(request);
        return {
            workspaceId,
            revisionId,
            candidateHash,
            validationId: result.record.validationId,
            snapshotHash: result.snapshot.snapshotHash,
            recordHash: result.record.recordHash,
            outcome: result.record.outcome,
            promotable: this.options.validator.isPromotionEligible(result.snapshot.snapshotHash, result.record),
            suites: result.record.suites.map((suite)=>({
                    kind: suite.kind,
                    outcome: suite.outcome,
                    definitionHash: suite.definitionHash,
                    commandCount: suite.commandCount,
                    hidden: suite.hidden
                }))
        };
    }
    reviseCandidate(workspaceId, parentRevisionId, parentCandidateHash, descriptor, sources) {
        this.ensureReady();
        const workshop = this.options.workshop;
        const actorId = this.options.workshopActorId;
        if (workshop === undefined || actorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'candidate authoring is not composed');
        const parent = this.options.candidates.inspectRevision(workspaceId, parentRevisionId);
        if (parent === null || parent.state !== 'current' || parent.candidateHash !== parentCandidateHash) {
            fail('STALE_CANDIDATE_REVISION', 'candidate revision must bind the exact current parent');
        }
        return workshop.createCandidateRevision({
            workspaceId,
            actorId,
            authority: 'trusted-host'
        }, {
            specificationId: parent.specificationId,
            parentRevisionId,
            descriptor,
            sources
        });
    }
    createCandidate(workspaceId, specificationInput, descriptor, sources) {
        this.ensureReady();
        this.options.store.reopenWorkspace(workspaceId);
        const workshop = this.options.workshop;
        const actorId = this.options.workshopActorId;
        if (workshop === undefined || actorId === undefined) fail('OPERATION_NOT_AVAILABLE', 'candidate authoring is not composed');
        if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor) || descriptor.name !== specificationInput.publicName) {
            fail('DESCRIPTOR_NAME_MISMATCH', 'candidate descriptor name must match the new specification public name');
        }
        captureCandidateFiles(sources);
        const context = {
            workspaceId,
            actorId,
            authority: 'trusted-host'
        };
        const specification = workshop.defineSpecification(context, specificationInput);
        const candidate = workshop.createCandidateRevision(context, {
            specificationId: specification.specificationId,
            descriptor,
            sources
        });
        return {
            specification,
            candidate
        };
    }
    async executeTool(workspaceId, goalId, toolName, args, signal = new AbortController().signal) {
        this.ensureReady();
        this.options.store.reopenWorkspace(workspaceId);
        const goal = this.options.lifecycle.inspectGoal(workspaceId, goalId);
        if (goal?.plan === null || goal === null) fail('GOAL_NOT_FOUND', 'selected goal has no authoritative approved plan');
        if (!goal.canStop) fail('GOAL_NOT_ACTIVE', 'selected goal is not active');
        const descriptor = this.descriptors.find((item)=>item.name === toolName);
        if (descriptor === undefined) fail('TOOL_NOT_EXECUTABLE', 'Tool is not executable by the production Adapter');
        const callId = `call:${randomUUID()}`;
        const memorySession = this.options.memorySession?.(workspaceId, toolName, callId);
        if (descriptor.sideEffect && memorySession === undefined) {
            fail('TOOL_REQUIRES_POLICY', 'side-effecting Tool execution requires an explicit host policy');
        }
        const startedAt = new Date().toISOString();
        const result = await this.options.adapter.invoke(toolName, args, callId, signal, memorySession);
        const completedAt = new Date().toISOString();
        const calls = this.options.adapter.ledger.snapshot().filter((record)=>record.callId === callId);
        if (calls.length !== 1 || calls[0]?.tool !== toolName || calls[0].status !== 'succeeded') {
            fail('INVALID_TOOL_EVIDENCE', 'Adapter ledger does not contain one successful record for the exact host-issued call');
        }
        const report = {
            goalId,
            planRevisionId: goal.plan.id,
            planHash: goal.plan.hash,
            startedAt,
            completedAt,
            calls,
            observations: [
                {
                    callId,
                    tool: toolName,
                    result
                }
            ],
            resultingArtifactIds: []
        };
        const issued = new Date();
        const reportArtifact = this.options.workflows.createArtifact({
            authority: 'trusted-host',
            context: {
                workspaceId,
                actorId: this.options.hostActorId,
                callId,
                toolId: 'tool:supervisory-host'
            },
            capability: {
                protocolVersion: '1.0',
                capabilityId: `capability:${randomUUID()}`,
                workspaceId,
                actorId: this.options.hostActorId,
                toolId: 'tool:supervisory-host',
                callId,
                operations: [
                    'artifact.create'
                ],
                issuedAt: issued.toISOString(),
                expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
                nonce: randomUUID()
            }
        }, Buffer.from(JSON.stringify(report), 'utf8'), {
            type: 'object',
            title: 'Axiom goal session report',
            protocolVersion: '1.0'
        }, {
            operation: 'goal.tool.execution',
            parametersHash: contentHash({
                goalId,
                planHash: goal.plan.hash,
                toolName,
                args
            }),
            softwareVersion: '1.0.0',
            validationId: null
        });
        return {
            workspaceId,
            goalId,
            callId,
            tool: toolName,
            result,
            reportArtifactId: reportArtifact.id,
            reportHash: reportArtifact.hash
        };
    }
    async initialize(signal) {
        if (this.closed) fail('HOST_CLOSED', 'application host is closed');
        if (this.initialized) fail('HOST_ALREADY_INITIALIZED', 'application host is already initialized');
        try {
            this.descriptors = Object.freeze([
                ...await this.options.adapter.initialize(signal)
            ]);
            for (const workspaceId of this.options.store.listWorkspaces()){
                this.installation.rediscover({
                    workspaceId,
                    actorId: this.options.hostActorId,
                    authority: 'trusted-host'
                });
            }
            this.initialized = true;
        } catch (error) {
            this.registry.clear();
            this.descriptors = [];
            throw error;
        }
    }
    close() {
        if (this.closed) return;
        this.closed = true;
        this.registry.clear();
        this.options.adapter.dispose();
        this.options.lifecycle.close();
        this.options.workflows.close();
        this.options.candidates.close();
        this.options.store.close();
    }
    ensureReady() {
        if (this.closed) fail('HOST_CLOSED', 'application host is closed');
        if (!this.initialized) fail('HOST_NOT_INITIALIZED', 'application host is not initialized');
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/local-application-host.ts