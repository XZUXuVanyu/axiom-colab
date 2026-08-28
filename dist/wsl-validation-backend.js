import { win32 } from 'node:path';
import { CandidateValidationError } from './candidate-validation.js';
import { ProcessRunner } from './process-runner.js';
function invalid(message) {
    throw new CandidateValidationError('INVALID_WSL_VALIDATION_BACKEND', message);
}
function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) invalid(`${field} must be a positive safe integer`);
    return value;
}
export function windowsPathToWsl(path) {
    const absolute = win32.resolve(path);
    const parsed = win32.parse(absolute);
    if (!/^[A-Za-z]:\\$/.test(parsed.root)) invalid(`validation root must be an absolute local drive path: ${path}`);
    const drive = parsed.root[0]?.toLowerCase();
    if (drive === undefined) invalid(`validation root has no drive letter: ${path}`);
    const segments = absolute.slice(parsed.root.length).split('\\').filter((part)=>part.length > 0);
    if (segments.some((part)=>part === '.' || part === '..' || part.includes('\0'))) {
        invalid(`validation root contains an unsafe path segment: ${path}`);
    }
    return `/mnt/${drive}${segments.length === 0 ? '' : `/${segments.join('/')}`}`;
}
function sandboxCwd(value) {
    if (value === undefined || value === '.') return '/workspace';
    const segments = value.replaceAll('\\', '/').split('/');
    if (segments.some((part)=>part.length === 0 || part === '.' || part === '..')) {
        invalid(`validation cwd is not a safe relative path: ${value}`);
    }
    return `/workspace/${segments.join('/')}`;
}
export class WslValidationBackend {
    confinement = Object.freeze({
        backend: 'wsl2-bubblewrap-systemd-v1',
        filesystem: true,
        descendantProcesses: true,
        network: true,
        cpu: true,
        memory: true
    });
    runner;
    distribution;
    wslExecutable;
    startupGraceMs;
    constructor(options){
        if (!/^[A-Za-z0-9._-]+$/.test(options.distribution)) invalid('distribution contains unsupported characters');
        this.distribution = options.distribution;
        this.runner = options.runner ?? new ProcessRunner();
        this.wslExecutable = options.wslExecutable ?? 'wsl.exe';
        this.startupGraceMs = positiveInteger(options.startupGraceMs ?? 15_000, 'startupGraceMs');
    }
    validatePolicy(policy) {
        if (policy.resources === undefined) invalid('WSL validation requires explicit resource limits');
        for (const executable of policy.allowedExecutables){
            if (!executable.startsWith('/') || executable.includes('\0')) {
                invalid(`WSL validation executable must be an absolute Linux path: ${executable}`);
            }
        }
    }
    async run(command, root, limits, resources) {
        if (resources === undefined) invalid('WSL validation requires explicit resource limits');
        const linuxRoot = windowsPathToWsl(root);
        const cpuSeconds = Math.max(1, Math.ceil(limits.timeoutMs / 1000));
        const args = [
            '--distribution',
            this.distribution,
            '--user',
            'root',
            '--exec',
            '/usr/bin/systemd-run',
            '--quiet',
            '--wait',
            '--collect',
            '--pipe',
            `--property=MemoryMax=${resources.maxMemoryBytes}`,
            `--property=CPUQuota=${resources.cpuQuotaPercent}%`,
            `--property=TasksMax=${resources.maxProcesses}`,
            '--property=KillMode=control-group',
            `--property=RuntimeMaxSec=${limits.timeoutMs}ms`,
            '/usr/bin/bwrap',
            '--unshare-all',
            '--die-with-parent',
            '--new-session',
            '--ro-bind',
            '/usr',
            '/usr',
            '--symlink',
            'usr/bin',
            '/bin',
            '--symlink',
            'usr/sbin',
            '/sbin',
            '--symlink',
            'usr/lib',
            '/lib',
            '--symlink',
            'usr/lib64',
            '/lib64',
            '--dir',
            '/etc',
            '--ro-bind',
            '/etc/ld.so.cache',
            '/etc/ld.so.cache',
            '--ro-bind',
            '/etc/alternatives',
            '/etc/alternatives',
            '--proc',
            '/proc',
            '--dev',
            '/dev',
            '--tmpfs',
            '/tmp',
            '--dir',
            '/run',
            '--bind',
            linuxRoot,
            '/workspace',
            '--chdir',
            sandboxCwd(command.cwd),
            '--clearenv',
            '--setenv',
            'HOME',
            '/tmp',
            '--setenv',
            'PATH',
            '/usr/bin:/bin',
            '--setenv',
            'LANG',
            'C.UTF-8',
            '--uid',
            '65534',
            '--gid',
            '65534',
            '/usr/bin/prlimit',
            `--as=${resources.maxMemoryBytes}`,
            `--cpu=${cpuSeconds}`,
            `--nproc=${resources.maxProcesses}`,
            '--',
            command.executable,
            ...command.args ?? []
        ];
        return await this.runner.run(this.wslExecutable, {
            ...limits,
            timeoutMs: limits.timeoutMs + this.startupGraceMs,
            args,
            stdin: command.stdin
        });
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/wsl-validation-backend.ts