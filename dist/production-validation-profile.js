import { isAbsolute, resolve, win32 } from 'node:path';
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value, fields, name) {
    const allowed = new Set(fields);
    for (const key of Object.keys(value))if (!allowed.has(key)) throw new TypeError(`${name} contains unknown field ${key}`);
    for (const key of fields)if (!(key in value)) throw new TypeError(`${name} is missing field ${key}`);
}
function positive(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
    return value;
}
function nonempty(value, name) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must not be empty`);
    return value;
}
function command(value, name, allowlist, ids) {
    if (!record(value)) throw new TypeError(`${name} must be an object`);
    exact(value, [
        'commandId',
        'executable',
        'args',
        'cwd'
    ], name);
    const commandId = nonempty(value.commandId, `${name}.commandId`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(commandId) || ids.has(commandId)) throw new TypeError(`${name}.commandId is malformed or duplicated`);
    ids.add(commandId);
    const executable = nonempty(value.executable, `${name}.executable`);
    if (!allowlist.has(executable)) throw new TypeError(`${name}.executable is not allowlisted`);
    if (!Array.isArray(value.args) || !value.args.every((item)=>typeof item === 'string')) throw new TypeError(`${name}.args must be an array of strings`);
    const cwd = nonempty(value.cwd, `${name}.cwd`);
    if (cwd === '.' || cwd.startsWith('/') || cwd.startsWith('\\') || cwd.split(/[\\/]/).some((part)=>part === '' || part === '.' || part === '..')) throw new TypeError(`${name}.cwd must be a safe candidate-relative directory`);
    return {
        commandId,
        executable,
        args: [
            ...value.args
        ],
        cwd
    };
}
export function parseProductionValidationProfile(value) {
    if (!record(value)) throw new TypeError('validationProfile must be an object');
    exact(value, [
        'toolchain',
        'wslDistribution',
        'stagingRoot',
        'allowedExecutables',
        'process',
        'resources',
        'maxCommands',
        'candidateCommands',
        'standardCommands'
    ], 'validationProfile');
    if (!record(value.toolchain)) throw new TypeError('validationProfile.toolchain must be an object');
    exact(value.toolchain, [
        'name',
        'version',
        'target'
    ], 'validationProfile.toolchain');
    const toolchain = {
        name: nonempty(value.toolchain.name, 'validationProfile.toolchain.name'),
        version: nonempty(value.toolchain.version, 'validationProfile.toolchain.version'),
        target: nonempty(value.toolchain.target, 'validationProfile.toolchain.target')
    };
    const wslDistribution = nonempty(value.wslDistribution, 'validationProfile.wslDistribution');
    if (!/^[A-Za-z0-9._-]+$/.test(wslDistribution)) throw new TypeError('validationProfile.wslDistribution is malformed');
    if (typeof value.stagingRoot !== 'string' || !isAbsolute(value.stagingRoot) || !/^[A-Za-z]:[\\/]/.test(value.stagingRoot)) throw new TypeError('validationProfile.stagingRoot must be an absolute local-drive path');
    const stagingRoot = win32.resolve(value.stagingRoot);
    if (!Array.isArray(value.allowedExecutables) || value.allowedExecutables.length === 0 || !value.allowedExecutables.every((item)=>typeof item === 'string' && /^\/[A-Za-z0-9_./+-]+$/.test(item))) {
        throw new TypeError('validationProfile.allowedExecutables must contain absolute Linux executable paths');
    }
    const allowedExecutables = [
        ...new Set(value.allowedExecutables)
    ];
    if (allowedExecutables.length !== value.allowedExecutables.length) throw new TypeError('validationProfile.allowedExecutables contains duplicates');
    if (!record(value.process)) throw new TypeError('validationProfile.process must be an object');
    exact(value.process, [
        'timeoutMs',
        'maxStdinBytes',
        'maxStdoutBytes',
        'maxStderrBytes',
        'killGraceMs'
    ], 'validationProfile.process');
    if (!record(value.resources)) throw new TypeError('validationProfile.resources must be an object');
    exact(value.resources, [
        'maxMemoryBytes',
        'cpuQuotaPercent',
        'maxProcesses'
    ], 'validationProfile.resources');
    const policy = {
        allowedExecutables,
        process: {
            timeoutMs: positive(value.process.timeoutMs, 'validationProfile.process.timeoutMs'),
            maxStdinBytes: positive(value.process.maxStdinBytes, 'validationProfile.process.maxStdinBytes'),
            maxStdoutBytes: positive(value.process.maxStdoutBytes, 'validationProfile.process.maxStdoutBytes'),
            maxStderrBytes: positive(value.process.maxStderrBytes, 'validationProfile.process.maxStderrBytes'),
            killGraceMs: positive(value.process.killGraceMs, 'validationProfile.process.killGraceMs')
        },
        resources: {
            maxMemoryBytes: positive(value.resources.maxMemoryBytes, 'validationProfile.resources.maxMemoryBytes'),
            cpuQuotaPercent: positive(value.resources.cpuQuotaPercent, 'validationProfile.resources.cpuQuotaPercent'),
            maxProcesses: positive(value.resources.maxProcesses, 'validationProfile.resources.maxProcesses')
        },
        maxCommands: positive(value.maxCommands, 'validationProfile.maxCommands')
    };
    const ids = new Set();
    const allowlist = new Set(allowedExecutables);
    const suite = (raw, kind, suiteId)=>{
        if (!Array.isArray(raw) || raw.length === 0) throw new TypeError(`validationProfile.${kind}Commands must not be empty`);
        return {
            suiteId,
            kind,
            commands: raw.map((item, index)=>command(item, `validationProfile.${kind}Commands[${index}]`, allowlist, ids))
        };
    };
    const candidateSuite = suite(value.candidateCommands, 'candidate', 'production-candidate');
    const standardSuite = suite(value.standardCommands, 'standard', 'laboratory-standard');
    if (candidateSuite.commands.length + standardSuite.commands.length > policy.maxCommands) throw new TypeError('validationProfile commands exceed maxCommands');
    return {
        toolchain,
        wslDistribution,
        stagingRoot: resolve(stagingRoot),
        policy,
        candidateSuite,
        standardSuite
    };
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/production-validation-profile.ts