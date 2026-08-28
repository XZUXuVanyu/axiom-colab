import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { CandidateContentError, captureCandidateFiles, safeCandidateRelativePath } from './candidate-content.js';
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash } from './laboratory-contract.js';
import { ProcessExecutionError, ProcessRunner } from './process-runner.js';
export class CandidateValidationError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'CandidateValidationError';
    }
}
const suiteOrder = {
    candidate: 0,
    standard: 1,
    challenge: 2
};
function fail(code, message) {
    throw new CandidateValidationError(code, message);
}
function captureSuites(suites) {
    return suites.map((suite)=>({
            suiteId: suite.suiteId,
            kind: suite.kind,
            commands: suite.commands.map((command)=>({
                    commandId: command.commandId,
                    executable: command.executable,
                    args: [
                        ...command.args ?? []
                    ],
                    ...command.stdin === undefined ? {} : {
                        stdin: command.stdin
                    },
                    ...command.cwd === undefined ? {} : {
                        cwd: command.cwd
                    }
                }))
        }));
}
function publicCommandBinding(command) {
    return {
        commandId: command.commandId,
        executable: command.executable,
        args: [
            ...command.args ?? []
        ],
        stdinHash: contentHash(command.stdin ?? ''),
        cwd: command.cwd ?? '.'
    };
}
function commandHash(command) {
    return contentHash(publicCommandBinding(command));
}
function bindSuites(suites, challengeSalt) {
    const seenKinds = new Set();
    const seenIds = new Set();
    const seenCommandIds = new Set();
    const bound = suites.map((suite)=>{
        if (seenKinds.has(suite.kind)) fail('DUPLICATE_SUITE_KIND', `validation suite kind ${suite.kind} is duplicated`);
        if (seenIds.has(suite.suiteId)) fail('DUPLICATE_SUITE_ID', `validation suite ${suite.suiteId} is duplicated`);
        if (suite.commands.length === 0) fail('EMPTY_VALIDATION_SUITE', `validation suite ${suite.suiteId} has no commands`);
        seenKinds.add(suite.kind);
        seenIds.add(suite.suiteId);
        for (const command of suite.commands){
            if (seenCommandIds.has(command.commandId)) fail('DUPLICATE_COMMAND_ID', `validation command ${command.commandId} is duplicated`);
            seenCommandIds.add(command.commandId);
        }
        const definition = suite.commands.map(publicCommandBinding);
        return {
            suiteId: suite.suiteId,
            kind: suite.kind,
            definitionHash: suite.kind === 'challenge' ? contentHash({
                salt: challengeSalt,
                definition
            }) : contentHash(definition),
            commandCount: suite.commands.length,
            hidden: suite.kind === 'challenge',
            commitment: suite.kind === 'challenge' ? 'salted-sha256' : 'plain-sha256'
        };
    }).sort((left, right)=>suiteOrder[left.kind] - suiteOrder[right.kind]);
    for (const kind of Object.keys(suiteOrder)){
        if (!seenKinds.has(kind)) fail('MISSING_VALIDATION_SUITE', `validation suite kind ${kind} is required`);
    }
    return bound;
}
function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value))deepFreeze(item);
    return value;
}
function overallOutcome(outcomes) {
    return outcomes.includes('limited') ? 'limited' : outcomes.includes('failed') ? 'failed' : 'passed';
}
function isLimitError(code) {
    return code === 'TIMEOUT' || code === 'STDIN_LIMIT' || code === 'STDOUT_LIMIT' || code === 'STDERR_LIMIT';
}
function validatePolicy(policy) {
    if (!Number.isSafeInteger(policy.maxCommands) || policy.maxCommands < 3) {
        fail('INVALID_VALIDATION_POLICY', 'maxCommands must be a safe integer of at least three');
    }
    if (policy.allowedExecutables.length === 0) fail('INVALID_VALIDATION_POLICY', 'allowedExecutables cannot be empty');
    for (const [field, value] of Object.entries(policy.process)){
        if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_VALIDATION_POLICY', `process.${field} must be a positive safe integer`);
    }
    if (policy.resources !== undefined) {
        for (const [field, value] of Object.entries(policy.resources)){
            if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_VALIDATION_POLICY', `resources.${field} must be a positive safe integer`);
        }
    }
}
function assertAllowedCommand(command, policy) {
    if (!policy.allowedExecutables.includes(command.executable)) {
        fail('EXECUTABLE_NOT_ALLOWED', `command ${command.commandId} uses an executable outside the validation policy`);
    }
    if (command.cwd !== undefined) {
        try {
            safeCandidateRelativePath(command.cwd, `command ${command.commandId} cwd`);
        } catch (error) {
            if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2));
            throw error;
        }
    }
}
class DirectValidationBackend {
    runner;
    confinement = {
        backend: 'none',
        filesystem: false,
        descendantProcesses: false,
        network: false,
        cpu: false,
        memory: false
    };
    constructor(runner){
        this.runner = runner;
    }
    validatePolicy(_policy) {}
    async run(command, root, limits) {
        return await this.runner.run(command.executable, {
            ...limits,
            args: command.args,
            stdin: command.stdin,
            cwd: resolve(root, command.cwd ?? '.')
        });
    }
}
export class CandidateValidationRunner {
    executionBackend;
    temporaryRoot;
    now;
    idFactory;
    evidenceRepository;
    validatorCredential;
    challengeSaltFactory;
    issuedRecords = new WeakSet();
    constructor(options = {}){
        if (options.runner !== undefined && options.executionBackend !== undefined) {
            fail('INVALID_VALIDATION_BACKEND', 'runner and executionBackend cannot both be configured');
        }
        const runner = options.runner ?? new ProcessRunner();
        this.executionBackend = options.executionBackend ?? new DirectValidationBackend(runner);
        this.temporaryRoot = options.temporaryRoot ?? tmpdir();
        this.now = options.now ?? (()=>new Date());
        this.idFactory = options.idFactory ?? randomUUID;
        this.evidenceRepository = options.evidenceRepository;
        this.validatorCredential = options.validatorCredential;
        this.challengeSaltFactory = options.challengeSaltFactory ?? (()=>randomBytes(32).toString('hex'));
        if (this.evidenceRepository === undefined !== (this.validatorCredential === undefined)) {
            fail('INVALID_VALIDATION_REPOSITORY', 'evidenceRepository and validatorCredential must be configured together');
        }
    }
    async validate(request) {
        validatePolicy(request.policy);
        this.executionBackend.validatePolicy(request.policy);
        const totalCommands = request.suites.reduce((sum, suite)=>sum + suite.commands.length, 0);
        if (totalCommands > request.policy.maxCommands) fail('COMMAND_LIMIT', `validation requests ${totalCommands} commands but policy allows ${request.policy.maxCommands}`);
        const prepared = await this.prepare(request);
        const startedAt = this.now().toISOString();
        try {
            const suiteRuns = [];
            const orderedSuites = [
                ...prepared.suites
            ].sort((left, right)=>suiteOrder[left.kind] - suiteOrder[right.kind]);
            for (const suite of orderedSuites){
                const binding = prepared.snapshot.suites.find((item)=>item.kind === suite.kind);
                if (binding === undefined) fail('INVALID_VALIDATION_STATE', `missing snapshot binding for ${suite.kind}`);
                const processes = [];
                for (const command of suite.commands){
                    assertAllowedCommand(command, prepared.policy);
                    processes.push(await this.execute(command, prepared.root, binding.hidden, prepared.policy.process, prepared.policy.resources));
                }
                suiteRuns.push({
                    ...binding,
                    outcome: overallOutcome(processes.map((process)=>process.outcome)),
                    processes
                });
            }
            const completedAt = this.now().toISOString();
            const recordWithoutHash = {
                protocolVersion: LABORATORY_PROTOCOL_VERSION,
                validationId: `validation:${this.idFactory()}`,
                workspaceId: request.workspaceId,
                candidateId: request.candidateId,
                validatorActorId: request.validatorActorId,
                candidateSnapshotHash: prepared.snapshot.snapshotHash,
                authority: 'validator',
                startedAt,
                completedAt,
                outcome: overallOutcome(suiteRuns.map((suite)=>suite.outcome)),
                confinement: {
                    ...this.executionBackend.confinement
                },
                suites: suiteRuns
            };
            const record = deepFreeze({
                ...recordWithoutHash,
                recordHash: contentHash(recordWithoutHash)
            });
            const result = deepFreeze({
                snapshot: prepared.snapshot,
                record
            });
            if (this.evidenceRepository !== undefined && this.validatorCredential !== undefined) {
                this.evidenceRepository.recordValidation(this.validatorCredential, result, prepared.privatePayload);
            }
            this.issuedRecords.add(record);
            return result;
        } finally{
            await rm(prepared.root, {
                recursive: true,
                force: true
            });
        }
    }
    isPromotionEligible(snapshotHash, record) {
        return record.outcome === 'passed' && confinementSatisfied(record.confinement) && this.isValidationAuthentic(snapshotHash, record);
    }
    isValidationAuthentic(snapshotHash, record) {
        if (this.evidenceRepository !== undefined) {
            return this.evidenceRepository.isValidationAuthentic(snapshotHash, record);
        }
        if (!this.issuedRecords.has(record)) return false;
        const { recordHash, ...recordWithoutHash } = record;
        return record.candidateSnapshotHash === snapshotHash && recordHash === contentHash(recordWithoutHash);
    }
    async prepare(request) {
        let capturedSources;
        let capturedFixtures;
        try {
            capturedSources = captureCandidateFiles(request.sources, 'sources');
            capturedFixtures = captureCandidateFiles(request.fixtures, 'fixtures');
        } catch (error) {
            if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2));
            throw error;
        }
        const sources = capturedSources.map((file)=>file.binding);
        const fixtures = capturedFixtures.map((file)=>file.binding);
        const capturedSuites = captureSuites(request.suites);
        const capturedPolicy = {
            allowedExecutables: [
                ...request.policy.allowedExecutables
            ],
            process: {
                ...request.policy.process
            },
            ...request.policy.resources === undefined ? {} : {
                resources: {
                    ...request.policy.resources
                }
            },
            maxCommands: request.policy.maxCommands
        };
        const allPaths = new Set(sources.map((file)=>file.path));
        for (const fixture of fixtures){
            if (allPaths.has(fixture.path)) fail('DUPLICATE_SNAPSHOT_PATH', `fixture path ${fixture.path} collides with a source`);
            allPaths.add(fixture.path);
        }
        const challengeSalt = this.challengeSaltFactory();
        if (!/^[a-f0-9]{64}$/.test(challengeSalt)) fail('INVALID_CHALLENGE_SALT', 'challenge commitment salt must be 32 lowercase hexadecimal bytes');
        const suites = bindSuites(capturedSuites, challengeSalt);
        const binding = {
            workspaceId: request.workspaceId,
            candidateId: request.candidateId,
            descriptorHash: contentHash(request.descriptor),
            sourceHash: contentHash(sources),
            sources,
            fixtureHash: contentHash(fixtures),
            fixtures,
            toolchain: request.toolchain,
            toolchainHash: contentHash(request.toolchain),
            policyHash: contentHash(capturedPolicy),
            suites
        };
        const snapshot = deepFreeze({
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            snapshotId: `evidence:${this.idFactory()}`,
            ...binding,
            createdAt: this.now().toISOString(),
            snapshotHash: contentHash(binding)
        });
        await mkdir(this.temporaryRoot, {
            recursive: true
        });
        const root = await mkdtemp(resolve(this.temporaryRoot, 'axiom-validation-'));
        try {
            for (const file of [
                ...capturedSources,
                ...capturedFixtures
            ]){
                const path = resolve(root, file.path);
                await mkdir(dirname(path), {
                    recursive: true
                });
                await writeFile(path, file.bytes, {
                    flag: 'wx'
                });
            }
            const privatePayload = {
                descriptor: request.descriptor,
                sources: capturedSources.map((file)=>({
                        path: file.path,
                        contentBase64: Buffer.from(file.bytes).toString('base64')
                    })),
                fixtures: capturedFixtures.map((file)=>({
                        path: file.path,
                        contentBase64: Buffer.from(file.bytes).toString('base64')
                    })),
                toolchain: request.toolchain,
                policy: capturedPolicy,
                suites: capturedSuites,
                challengeCommitmentSalt: challengeSalt
            };
            return {
                snapshot,
                root,
                policy: capturedPolicy,
                suites: capturedSuites,
                privatePayload
            };
        } catch (error) {
            await rm(root, {
                recursive: true,
                force: true
            });
            throw error;
        }
    }
    async execute(command, root, hidden, limits, resources) {
        const startedAt = performance.now();
        const bindingHash = commandHash(command);
        try {
            const result = await this.executionBackend.run(command, root, limits, resources);
            return {
                commandId: command.commandId,
                commandHash: bindingHash,
                outcome: 'passed',
                exitCode: result.exitCode,
                signalName: null,
                errorCode: null,
                durationMs: result.durationMs,
                stdoutBytes: Buffer.byteLength(result.stdout),
                stderrBytes: Buffer.byteLength(result.stderr),
                stdoutHash: contentHash(result.stdout),
                stderrHash: contentHash(result.stderr),
                stdout: hidden ? null : result.stdout,
                stderr: hidden ? null : result.stderr
            };
        } catch (error) {
            if (!(error instanceof ProcessExecutionError)) throw error;
            const stdout = error.stdout;
            const stderr = error.stderr;
            return {
                commandId: command.commandId,
                commandHash: bindingHash,
                outcome: isLimitError(error.code) ? 'limited' : 'failed',
                exitCode: error.exitCode,
                signalName: error.signalName,
                errorCode: error.code,
                durationMs: error.durationMs ?? performance.now() - startedAt,
                stdoutBytes: Buffer.byteLength(stdout),
                stderrBytes: Buffer.byteLength(stderr),
                stdoutHash: contentHash(stdout),
                stderrHash: contentHash(stderr),
                stdout: hidden ? null : stdout,
                stderr: hidden ? null : stderr
            };
        }
    }
}
function confinementSatisfied(confinement) {
    return confinement.filesystem && confinement.descendantProcesses && confinement.network && confinement.cpu && confinement.memory;
}
export function validationRecordJson(record) {
    return canonicalJson(record);
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/candidate-validation.ts