import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { AdapterService } from './adapter-service.js';
import { AuthenticatedMemoryHttpServer } from './authenticated-memory-http.js';
import { AuthenticatedMemoryService } from './authenticated-memory-service.js';
import { CandidateValidationRunner } from './candidate-validation.js';
import { LocalCandidateRepository } from './candidate-repository.js';
import { LocalApplicationHost } from './local-application-host.js';
import { LocalGoalLifecycle } from './local-goal-lifecycle.js';
import { LocalMemoryStore } from './local-memory-store.js';
import { MemoryWorkflows } from './memory-workflows.js';
import { MemorySessionProvider } from './memory-session-provider.js';
import { ToolObserver } from './observer.js';
import { ProcessRunner } from './process-runner.js';
import { parseProductionValidationProfile } from './production-validation-profile.js';
import { SupervisoryTransport } from './supervisory-transport.js';
import { runSupervisoryTransportServer } from './supervisory-transport-server.js';
import { ToolInstallationService } from './tool-installation.js';
import { ToolInstallationProposalService } from './tool-installation-proposal.js';
import { ToolWorkshop } from './tool-workshop.js';
import { WslValidationBackend } from './wsl-validation-backend.js';
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const TOOL_MEMORY_OPERATIONS = new Set([
    'compute.create',
    'compute.read',
    'compute.update',
    'compute.snapshot',
    'compute.release',
    'working.read',
    'working.propose',
    'artifact.read',
    'artifact.create',
    'artifact.derive'
]);
function absolute(value, field) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new TypeError(`${field} must be an absolute path`);
    return resolve(value);
}
function approvedPlanValue(value, goalId) {
    return record(value) && value.goalId === goalId && typeof value.objective === 'string' && value.objective.length > 0;
}
export function createLocalApprovedPlanReader(workflows, hostActorId, now = ()=>new Date()) {
    return (workspaceId, goalId)=>{
        const issued = now();
        const callId = `call:${randomUUID()}`;
        const toolId = 'tool:supervisory-host';
        const revision = workflows.readWorking({
            authority: 'trusted-host',
            context: {
                workspaceId,
                actorId: hostActorId,
                callId,
                toolId
            },
            capability: {
                protocolVersion: '1.0',
                capabilityId: 'capability:supervisory-plan-read',
                workspaceId,
                actorId: hostActorId,
                toolId,
                callId,
                operations: [
                    'working.read'
                ],
                issuedAt: issued.toISOString(),
                expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
                nonce: randomUUID()
            }
        }, `${goalId}:plan`);
        if (revision === null) return null;
        if (revision.key !== `${goalId}:plan` || !approvedPlanValue(revision.value, goalId)) {
            throw Object.assign(new Error('approved goal plan is malformed or bound to another goal'), {
                code: 'INVALID_APPROVED_PLAN'
            });
        }
        return revision;
    };
}
function goalProgressValue(value, goalId) {
    if (!record(value)) return false;
    const allowed = new Set([
        'goalId',
        'planRevisionId',
        'planHash',
        'status',
        'summary',
        'completedCalls',
        'totalCalls'
    ]);
    if (Object.keys(value).some((key)=>!allowed.has(key))) return false;
    return value.goalId === goalId && typeof value.planRevisionId === 'string' && value.planRevisionId.startsWith('object:') && typeof value.planHash === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.planHash) && (value.status === 'pending' || value.status === 'running' || value.status === 'blocked' || value.status === 'completed') && typeof value.summary === 'string' && value.summary.length > 0 && Number.isSafeInteger(value.completedCalls) && value.completedCalls >= 0 && Number.isSafeInteger(value.totalCalls) && value.totalCalls >= value.completedCalls;
}
function sessionReport(value, goalId) {
    if (!record(value) || value.goalId !== goalId || !Array.isArray(value.observations) || typeof value.completedAt !== 'string' || typeof value.planRevisionId !== 'string' || typeof value.planHash !== 'string') return false;
    return value.observations.every((item)=>record(item) && typeof item.callId === 'string' && item.callId.startsWith('call:') && typeof item.tool === 'string' && item.tool.length > 0 && 'result' in item);
}
export function createLocalGoalProgressReader(workflows, hostActorId, approvedPlan, now = ()=>new Date()) {
    return (workspaceId, goalId)=>{
        const issued = now();
        const callId = `call:${randomUUID()}`;
        const toolId = 'tool:supervisory-host';
        const invocation = {
            authority: 'trusted-host',
            context: {
                workspaceId,
                actorId: hostActorId,
                callId,
                toolId
            },
            capability: {
                protocolVersion: '1.0',
                capabilityId: 'capability:supervisory-progress-read',
                workspaceId,
                actorId: hostActorId,
                toolId,
                callId,
                operations: [
                    'working.read',
                    'artifact.read'
                ],
                issuedAt: issued.toISOString(),
                expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
                nonce: randomUUID()
            }
        };
        const plan = approvedPlan(workspaceId, goalId);
        if (plan === null) throw Object.assign(new Error('goal progress has no authoritative approved plan'), {
            code: 'INVALID_GOAL_PROGRESS'
        });
        const revision = workflows.readWorking(invocation, `${goalId}:progress`);
        let progress = null;
        if (revision !== null) {
            if (revision.key !== `${goalId}:progress` || !goalProgressValue(revision.value, goalId) || revision.value.planRevisionId !== plan.id || revision.value.planHash !== plan.hash) {
                throw Object.assign(new Error('goal progress is malformed or bound to another approved plan'), {
                    code: 'INVALID_GOAL_PROGRESS'
                });
            }
            progress = {
                revisionId: revision.id,
                hash: revision.hash,
                status: revision.value.status,
                summary: revision.value.summary,
                completedCalls: revision.value.completedCalls,
                totalCalls: revision.value.totalCalls
            };
        }
        const observations = [];
        for (const artifact of workflows.listArtifacts(invocation)){
            if (!record(artifact.schema) || artifact.schema.title !== 'Axiom goal session report') continue;
            let parsed;
            try {
                parsed = JSON.parse(Buffer.from(workflows.readArtifact(invocation, artifact.id)).toString('utf8'));
            } catch  {
                throw Object.assign(new Error('goal session report artifact is malformed'), {
                    code: 'INVALID_GOAL_REPORT'
                });
            }
            if (!sessionReport(parsed, goalId)) continue;
            if (parsed.planRevisionId !== plan.id || parsed.planHash !== plan.hash) {
                throw Object.assign(new Error('goal session report is bound to another approved plan'), {
                    code: 'INVALID_GOAL_REPORT'
                });
            }
            for (const observation of parsed.observations)observations.push({
                reportArtifactId: artifact.id,
                reportHash: artifact.hash,
                callId: observation.callId,
                tool: observation.tool,
                result: observation.result,
                observedAt: parsed.completedAt
            });
        }
        return {
            progress,
            observations
        };
    };
}
export function createLocalMemoryProjectionReader(workflows, hostActorId, now = ()=>new Date()) {
    return (workspaceId)=>{
        const issued = now();
        const callId = `call:${randomUUID()}`;
        const toolId = 'tool:supervisory-host';
        const invocation = {
            authority: 'trusted-host',
            context: {
                workspaceId,
                actorId: hostActorId,
                callId,
                toolId
            },
            capability: {
                protocolVersion: '1.0',
                capabilityId: 'capability:supervisory-memory-read',
                workspaceId,
                actorId: hostActorId,
                toolId,
                callId,
                operations: [
                    'compute.read',
                    'working.read',
                    'artifact.read'
                ],
                issuedAt: issued.toISOString(),
                expiresAt: new Date(issued.getTime() + 60_000).toISOString(),
                nonce: randomUUID()
            }
        };
        const artifacts = workflows.listArtifacts(invocation);
        const artifactIds = new Set(artifacts.map((artifact)=>artifact.id));
        if (artifactIds.size !== artifacts.length) {
            throw Object.assign(new Error('artifact projection contains duplicate identities'), {
                code: 'INVALID_ARTIFACT_LINEAGE'
            });
        }
        const children = new Map();
        for (const artifact of artifacts){
            for (const parentId of artifact.parentIds){
                if (parentId === artifact.id || !artifactIds.has(parentId)) {
                    throw Object.assign(new Error('artifact lineage contains an invalid parent edge'), {
                        code: 'INVALID_ARTIFACT_LINEAGE'
                    });
                }
                const current = children.get(parentId) ?? [];
                if (current.includes(artifact.id)) {
                    throw Object.assign(new Error('artifact lineage contains a duplicate edge'), {
                        code: 'INVALID_ARTIFACT_LINEAGE'
                    });
                }
                current.push(artifact.id);
                children.set(parentId, current);
            }
        }
        return {
            compute: workflows.listComputeObjects(invocation).map((item)=>({
                    objectId: item.id,
                    revision: item.revision,
                    hash: item.hash,
                    size: item.size,
                    state: item.state,
                    expiresAt: item.expiresAt
                })),
            working: workflows.listWorkingRevisions(invocation).map((item)=>({
                    revisionId: item.id,
                    key: item.key,
                    revision: item.revision,
                    hash: item.hash,
                    proposalId: item.proposalId,
                    committedAt: item.committedAt
                })),
            artifacts: artifacts.map((item)=>({
                    artifactId: item.id,
                    hash: item.hash,
                    size: item.size,
                    schemaHash: item.schemaHash,
                    parentIds: [
                        ...item.parentIds
                    ],
                    childIds: [
                        ...children.get(item.id) ?? []
                    ].sort(),
                    operation: item.provenance.operation,
                    parametersHash: item.provenance.parametersHash,
                    softwareVersion: item.provenance.softwareVersion,
                    validationId: item.provenance.validationId,
                    createdAt: item.createdAt
                }))
        };
    };
}
export function parseLocalSupervisoryProcessConfig(value) {
    if (!record(value)) throw new TypeError('supervisory process config must be an object');
    const allowed = new Set([
        'stateRoot',
        'bridgePath',
        'bridgeArgs',
        'bridgeWorkingDirectory',
        'hostActorId',
        'userActorId',
        'maxLineBytes',
        'memoryToolPolicies',
        'validationProfile'
    ]);
    for (const key of Object.keys(value))if (!allowed.has(key)) throw new TypeError(`supervisory process config contains unknown field ${key}`);
    const bridgeArgs = value.bridgeArgs ?? [];
    if (!Array.isArray(bridgeArgs) || !bridgeArgs.every((item)=>typeof item === 'string')) throw new TypeError('bridgeArgs must be an array of strings');
    const hostActorId = value.hostActorId ?? 'actor:local-host';
    if (typeof hostActorId !== 'string' || !/^actor:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(hostActorId)) throw new TypeError('hostActorId is malformed');
    const userActorId = value.userActorId ?? 'actor:local-user';
    if (typeof userActorId !== 'string' || !/^actor:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(userActorId)) throw new TypeError('userActorId is malformed');
    const maxLineBytes = value.maxLineBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 256) throw new TypeError('maxLineBytes must be a safe integer of at least 256');
    const rawPolicies = value.memoryToolPolicies ?? [];
    if (!Array.isArray(rawPolicies)) throw new TypeError('memoryToolPolicies must be an array');
    const memoryToolPolicies = new Map();
    for (const [index, item] of rawPolicies.entries()){
        if (!record(item)) throw new TypeError(`memoryToolPolicies[${index}] must be an object`);
        const policyFields = new Set([
            'toolName',
            'toolId',
            'toolVersion',
            'operations',
            'maxOperations',
            'maxRequestBytes',
            'lifetimeMs'
        ]);
        for (const key of Object.keys(item))if (!policyFields.has(key)) throw new TypeError(`memoryToolPolicies[${index}] contains unknown field ${key}`);
        if (typeof item.toolName !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(item.toolName)) throw new TypeError(`memoryToolPolicies[${index}].toolName is malformed`);
        if (memoryToolPolicies.has(item.toolName)) throw new TypeError(`memoryToolPolicies contains duplicate Tool ${item.toolName}`);
        if (typeof item.toolId !== 'string' || !/^tool:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.toolId)) throw new TypeError(`memoryToolPolicies[${index}].toolId is malformed`);
        if (typeof item.toolVersion !== 'string' || item.toolVersion.length === 0) throw new TypeError(`memoryToolPolicies[${index}].toolVersion must not be empty`);
        if (!Array.isArray(item.operations) || item.operations.length === 0 || !item.operations.every((operation)=>typeof operation === 'string' && TOOL_MEMORY_OPERATIONS.has(operation))) throw new TypeError(`memoryToolPolicies[${index}].operations must contain only Tool memory operations`);
        const positive = (field)=>{
            const number = item[field];
            if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`memoryToolPolicies[${index}].${field} must be a positive safe integer`);
            return number;
        };
        memoryToolPolicies.set(item.toolName, {
            toolId: item.toolId,
            toolVersion: item.toolVersion,
            operations: [
                ...item.operations
            ],
            maxOperations: positive('maxOperations'),
            maxRequestBytes: positive('maxRequestBytes'),
            lifetimeMs: positive('lifetimeMs')
        });
    }
    const stateRoot = absolute(value.stateRoot, 'stateRoot');
    const validationProfile = parseProductionValidationProfile(value.validationProfile);
    const state = stateRoot.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
    const staging = validationProfile.stagingRoot.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
    if (state === staging || state.startsWith(`${staging}/`) || staging.startsWith(`${state}/`)) {
        throw new TypeError('validationProfile.stagingRoot must not overlap the authoritative stateRoot');
    }
    return {
        stateRoot,
        bridgePath: absolute(value.bridgePath, 'bridgePath'),
        bridgeArgs: [
            ...bridgeArgs
        ],
        ...value.bridgeWorkingDirectory === undefined ? {} : {
            bridgeWorkingDirectory: absolute(value.bridgeWorkingDirectory, 'bridgeWorkingDirectory')
        },
        hostActorId: hostActorId,
        userActorId: userActorId,
        maxLineBytes: maxLineBytes,
        memoryToolPolicies,
        validationProfile
    };
}
export async function runLocalSupervisoryProcess(configValue) {
    const config = parseLocalSupervisoryProcessConfig(configValue);
    const store = new LocalMemoryStore(join(config.stateRoot, 'memory'));
    const workflows = new MemoryWorkflows(store);
    const memoryService = new AuthenticatedMemoryService(workflows);
    const memoryServer = new AuthenticatedMemoryHttpServer(memoryService);
    const memoryEndpoint = await memoryServer.listen();
    const candidates = new LocalCandidateRepository(join(config.stateRoot, 'candidates.sqlite3'));
    const validatorActorId = 'actor:local-validator';
    const validatorCredential = candidates.issueValidatorCredential(validatorActorId);
    const validator = new CandidateValidationRunner({
        executionBackend: new WslValidationBackend({
            distribution: config.validationProfile.wslDistribution
        }),
        temporaryRoot: config.validationProfile.stagingRoot,
        evidenceRepository: candidates,
        validatorCredential
    });
    const approvedPlan = createLocalApprovedPlanReader(workflows, config.hostActorId);
    const lifecycle = new LocalGoalLifecycle(join(config.stateRoot, 'lifecycle.sqlite3'), {
        approvedPlan,
        revokeCapability: async (_workspaceId, capabilityId)=>{
            memoryService.revoke(capabilityId);
        },
        stopGoal: async ()=>{},
        resumeGoal: async ()=>{},
        recoverWorkspace: async (workspaceId)=>{
            store.reopenWorkspace(workspaceId);
        }
    });
    const observer = new ToolObserver({
        info: (message)=>process.stderr.write(`${message}\n`),
        warn: (message)=>process.stderr.write(`${message}\n`),
        error: (message)=>process.stderr.write(`${message}\n`)
    }, {
        maxLogChars: 2048
    });
    const limits = {
        timeoutMs: 10_000,
        maxStdinBytes: 4 * 1024 * 1024,
        maxStdoutBytes: 8 * 1024 * 1024,
        maxStderrBytes: 1024 * 1024,
        killGraceMs: 250
    };
    const adapter = new AdapterService(new ProcessRunner(), observer, {
        bridge: {
            executable: config.bridgePath,
            prefixArgs: [
                ...config.bridgeArgs
            ],
            ...config.bridgeWorkingDirectory === undefined ? {} : {
                cwd: config.bridgeWorkingDirectory
            }
        },
        descriptorLimits: limits,
        callLimits: limits
    });
    const host = new LocalApplicationHost({
        store,
        workflows,
        candidates,
        lifecycle,
        adapter,
        validator,
        hostActorId: config.hostActorId,
        goalProgress: createLocalGoalProgressReader(workflows, config.hostActorId, approvedPlan),
        memory: createLocalMemoryProjectionReader(workflows, config.hostActorId),
        memorySession: (workspaceId, toolName, callId)=>new MemorySessionProvider({
                service: memoryService,
                endpoint: memoryEndpoint,
                scope: {
                    workspaceId,
                    actorId: config.hostActorId,
                    authority: 'trusted-host',
                    sessionGeneration: 1
                },
                policyForTool: (name)=>config.memoryToolPolicies.get(name)
            }).create(toolName, callId),
        memoryPolicyAvailable: (toolName)=>config.memoryToolPolicies.has(toolName),
        proposalService: new ToolInstallationProposalService(candidates, validator),
        userActorId: config.userActorId,
        challengeValidator: validator,
        validationProfile: config.validationProfile,
        validatorActorId,
        workshop: new ToolWorkshop({
            repository: candidates
        }),
        workshopActorId: config.hostActorId,
        createInstallation: (registry)=>new ToolInstallationService(candidates, validator, {
                installationRoot: join(config.stateRoot, 'installed'),
                registry
            })
    });
    let closed = false;
    const close = ()=>{
        if (closed) return;
        closed = true;
        candidates.revokeValidatorCredential(validatorCredential);
        host.close();
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    try {
        await host.initialize();
        await runSupervisoryTransportServer(new SupervisoryTransport(host, config.maxLineBytes), process.stdin, process.stdout, {
            maxLineBytes: config.maxLineBytes,
            diagnostic: (message)=>process.stderr.write(`${message}\n`)
        });
    } finally{
        process.off('SIGINT', close);
        process.off('SIGTERM', close);
        host.close();
        await memoryServer.close();
    }
}
export function readLocalSupervisoryProcessConfig(path) {
    return JSON.parse(readFileSync(resolve(path), 'utf8'));
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/local-supervisory-process.ts