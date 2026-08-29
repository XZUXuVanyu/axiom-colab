import { randomUUID } from 'node:crypto';
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
    async executeTool(workspaceId, goalId, toolName, args, signal = new AbortController().signal) {
        this.ensureReady();
        this.options.store.reopenWorkspace(workspaceId);
        const goal = this.options.lifecycle.inspectGoal(workspaceId, goalId);
        if (goal?.plan === null || goal === null) fail('GOAL_NOT_FOUND', 'selected goal has no authoritative approved plan');
        const descriptor = this.descriptors.find((item)=>item.name === toolName);
        if (descriptor === undefined) fail('TOOL_NOT_EXECUTABLE', 'Tool is not executable by the production Adapter');
        if (descriptor.sideEffect) fail('TOOL_REQUIRES_POLICY', 'side-effecting Tool execution requires an explicit host policy');
        const callId = `call:${randomUUID()}`;
        const ledgerStart = this.options.adapter.ledger.snapshot().length;
        const startedAt = new Date().toISOString();
        const result = await this.options.adapter.invoke(toolName, args, callId, signal);
        const completedAt = new Date().toISOString();
        const report = {
            goalId,
            planRevisionId: goal.plan.id,
            planHash: goal.plan.hash,
            startedAt,
            completedAt,
            calls: this.options.adapter.ledger.snapshot().slice(ledgerStart),
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