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