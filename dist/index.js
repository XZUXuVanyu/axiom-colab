import { fileURLToPath } from 'node:url';
import { AdapterService, ProcessRunner, ToolObserver } from './adapter-service.js';
import { registerDynamicTools } from './dynamic-tool-registry.js';
import { registerRuntimeSkill } from './skill.js';
export * from './laboratory-contract.js';
export * from './local-memory-store.js';
export * from './memory-workflows.js';
export * from './authenticated-memory-service.js';
export * from './authenticated-memory-http.js';
export * from './memory-session-provider.js';
export * from './goal-coordinator.js';
export * from './candidate-validation.js';
export * from './wsl-validation-backend.js';
export * from './tool-workshop.js';
export * from './tool-installation-proposal.js';
export * from './tool-installation.js';
export * from './candidate-repository.js';
export const name = 'general-ts-cpp-adapter';
export const inject = [
    'tools',
    'skills'
];
const ledgersByContext = new WeakMap();
export function getInvocationLedger(ctx) {
    return ledgersByContext.get(ctx);
}
function defaultBridgePath() {
    const relative = process.platform === 'win32' ? '../build/windows/Release/cpp-tool-bridge.exe' : '../build/linux/cpp-tool-bridge';
    return fileURLToPath(new URL(relative, import.meta.url));
}
function positiveInteger(value, fallback, field) {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved <= 0) {
        throw new TypeError(`${field} must be a positive integer`);
    }
    return resolved;
}
export function resolveConfig(value) {
    if (value === undefined) value = {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('plugin config must be an object');
    }
    const config = value;
    if (config.bridgePath !== undefined && typeof config.bridgePath !== 'string') {
        throw new TypeError('bridgePath must be a string');
    }
    if (config.workingDirectory !== undefined && typeof config.workingDirectory !== 'string') {
        throw new TypeError('workingDirectory must be a string');
    }
    if (config.bridgeArgs !== undefined && (!Array.isArray(config.bridgeArgs) || !config.bridgeArgs.every((item)=>typeof item === 'string'))) {
        throw new TypeError('bridgeArgs must be an array of strings');
    }
    if (config.verificationMode !== undefined && config.verificationMode !== 'normal' && config.verificationMode !== 'tool-only') {
        throw new TypeError('verificationMode must be normal or tool-only');
    }
    return {
        bridgePath: config.bridgePath ?? defaultBridgePath(),
        bridgeArgs: [
            ...config.bridgeArgs ?? []
        ],
        ...config.workingDirectory === undefined ? {} : {
            workingDirectory: config.workingDirectory
        },
        descriptorTimeoutMs: positiveInteger(config.descriptorTimeoutMs, 10_000, 'descriptorTimeoutMs'),
        maxStdinBytes: positiveInteger(config.maxStdinBytes, 4 * 1024 * 1024, 'maxStdinBytes'),
        maxStdoutBytes: positiveInteger(config.maxStdoutBytes, 8 * 1024 * 1024, 'maxStdoutBytes'),
        maxStderrBytes: positiveInteger(config.maxStderrBytes, 1024 * 1024, 'maxStderrBytes'),
        killGraceMs: positiveInteger(config.killGraceMs, 250, 'killGraceMs'),
        maxLogChars: positiveInteger(config.maxLogChars, 2048, 'maxLogChars'),
        verificationMode: config.verificationMode ?? 'normal',
        maxConcurrentCalls: positiveInteger(config.maxConcurrentCalls, 4, 'maxConcurrentCalls'),
        maxQueuedCalls: positiveInteger(config.maxQueuedCalls, 32, 'maxQueuedCalls')
    };
}
export const Config = {
    '~standard': {
        version: 1,
        vendor: name,
        validate (value) {
            try {
                return {
                    value: resolveConfig(value)
                };
            } catch (error) {
                return {
                    issues: [
                        {
                            message: error instanceof Error ? error.message : String(error)
                        }
                    ]
                };
            }
        }
    }
};
export async function apply(ctx, rawConfig = {}) {
    const config = resolveConfig(rawConfig);
    const runner = new ProcessRunner();
    const observer = new ToolObserver(ctx.logger, {
        maxLogChars: config.maxLogChars
    });
    const commonLimits = {
        maxStdinBytes: config.maxStdinBytes,
        maxStdoutBytes: config.maxStdoutBytes,
        maxStderrBytes: config.maxStderrBytes,
        killGraceMs: config.killGraceMs
    };
    const service = new AdapterService(runner, observer, {
        bridge: {
            executable: config.bridgePath,
            prefixArgs: config.bridgeArgs,
            ...config.workingDirectory === undefined ? {} : {
                cwd: config.workingDirectory
            }
        },
        descriptorLimits: {
            ...commonLimits,
            timeoutMs: config.descriptorTimeoutMs
        },
        callLimits: commonLimits,
        maxConcurrentCalls: config.maxConcurrentCalls,
        maxQueuedCalls: config.maxQueuedCalls
    });
    ledgersByContext.set(ctx, service.ledger);
    ctx.effect(()=>()=>{
            ledgersByContext.delete(ctx);
            service.dispose();
        });
    try {
        const descriptors = await service.initialize();
        const count = registerDynamicTools(ctx.tools, descriptors, service);
        await registerRuntimeSkill(ctx.skills, import.meta.url);
        ctx.logger.info(`[cpp-tool:ready] tools=${count} bridge=${config.bridgePath} verificationMode=${config.verificationMode}`);
    } catch (error) {
        ledgersByContext.delete(ctx);
        service.dispose();
        throw error;
    }
}
export { SupervisoryApplicationError, SupervisoryApplicationModel } from './supervisory-application.js';
export { InvocationLedger } from './invocation-ledger.js';


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/index.ts