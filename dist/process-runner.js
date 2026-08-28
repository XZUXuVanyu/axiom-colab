import { spawn } from 'node:child_process';
export class ProcessExecutionError extends Error {
    code;
    exitCode;
    signalName;
    stderr;
    stdout;
    durationMs;
    constructor(code, message, options = {}){
        super(`[${code}] ${message}`);
        this.name = 'ProcessExecutionError';
        this.code = code;
        this.exitCode = options.exitCode ?? null;
        this.signalName = options.signalName ?? null;
        this.stderr = options.stderr ?? '';
        this.stdout = options.stdout ?? '';
        this.durationMs = options.durationMs ?? null;
    }
}
function bytes(chunks) {
    return Buffer.concat(chunks).toString('utf8');
}
export class ProcessRunner {
    active = new Map();
    disposed = false;
    get activeCount() {
        return this.active.size;
    }
    async run(executable, options) {
        if (this.disposed) {
            throw new ProcessExecutionError('DISPOSED', 'process runner is disposed');
        }
        if (options.signal?.aborted) {
            throw new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled before spawn');
        }
        const input = options.stdin ?? '';
        if (Buffer.byteLength(input) > options.maxStdinBytes) {
            throw new ProcessExecutionError('STDIN_LIMIT', `stdin exceeds ${options.maxStdinBytes} bytes`);
        }
        return await new Promise((resolve, reject)=>{
            const startedAt = performance.now();
            const child = spawn(executable, [
                ...options.args ?? []
            ], {
                shell: false,
                windowsHide: true,
                stdio: [
                    'pipe',
                    'pipe',
                    'pipe'
                ],
                cwd: options.cwd
            });
            const stdoutChunks = [];
            const stderrChunks = [];
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let pendingError;
            let settled = false;
            let killTimer;
            const terminate = ()=>{
                if (child.exitCode !== null || child.signalCode !== null) return;
                child.kill();
                killTimer = setTimeout(()=>{
                    if (this.active.has(child) && child.exitCode === null && child.signalCode === null) {
                        child.kill('SIGKILL');
                    }
                }, options.killGraceMs);
                killTimer.unref();
            };
            const fail = (error)=>{
                pendingError ??= error;
                terminate();
            };
            const cleanup = ()=>{
                if (killTimer !== undefined) clearTimeout(killTimer);
                clearTimeout(timeoutTimer);
                options.signal?.removeEventListener('abort', onAbort);
                this.active.delete(child);
            };
            const finish = (code, signalName)=>{
                if (settled) return;
                settled = true;
                cleanup();
                const stdout = bytes(stdoutChunks);
                const stderr = bytes(stderrChunks);
                if (pendingError !== undefined) {
                    reject(new ProcessExecutionError(pendingError.code, pendingError.message.replace(/^\[[^\]]+\]\s*/, ''), {
                        exitCode: code,
                        signalName,
                        stderr,
                        stdout,
                        durationMs: performance.now() - startedAt
                    }));
                    return;
                }
                if (signalName !== null) {
                    reject(new ProcessExecutionError('WORKER_TERMINATED', `Bridge was terminated by ${signalName}`, {
                        exitCode: code,
                        signalName,
                        stderr,
                        stdout,
                        durationMs: performance.now() - startedAt
                    }));
                    return;
                }
                if (code !== 0) {
                    reject(new ProcessExecutionError('NON_ZERO_EXIT', `Bridge exited with code ${String(code)}`, {
                        exitCode: code,
                        stderr,
                        stdout,
                        durationMs: performance.now() - startedAt
                    }));
                    return;
                }
                resolve({
                    stdout,
                    stderr,
                    exitCode: 0,
                    durationMs: performance.now() - startedAt
                });
            };
            const onAbort = ()=>{
                fail(new ProcessExecutionError('CANCELLED', 'Tool Call was cancelled'));
            };
            const timeoutTimer = setTimeout(()=>{
                fail(new ProcessExecutionError('TIMEOUT', `Bridge exceeded ${options.timeoutMs} ms`));
            }, options.timeoutMs);
            timeoutTimer.unref();
            this.active.set(child, {
                fail
            });
            options.signal?.addEventListener('abort', onAbort, {
                once: true
            });
            if (options.signal?.aborted === true) onAbort();
            child.stdout.on('data', (chunk)=>{
                stdoutBytes += chunk.length;
                if (stdoutBytes > options.maxStdoutBytes) {
                    fail(new ProcessExecutionError('STDOUT_LIMIT', `stdout exceeds ${options.maxStdoutBytes} bytes`));
                    return;
                }
                stdoutChunks.push(chunk);
            });
            child.stderr.on('data', (chunk)=>{
                stderrBytes += chunk.length;
                if (stderrBytes > options.maxStderrBytes) {
                    fail(new ProcessExecutionError('STDERR_LIMIT', `stderr exceeds ${options.maxStderrBytes} bytes`));
                    return;
                }
                stderrChunks.push(chunk);
            });
            child.on('error', (error)=>{
                fail(new ProcessExecutionError('SPAWN_FAILED', `could not start Bridge: ${error.message}`));
            });
            child.on('close', finish);
            child.stdin.on('error', (error)=>{
                if (error.code !== 'EPIPE') {
                    fail(new ProcessExecutionError('STDIN_WRITE_FAILED', error.message));
                }
            });
            child.stdin.end(input, 'utf8');
        });
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const process of this.active.values()){
            process.fail(new ProcessExecutionError('DISPOSED', 'Adapter disposed while Bridge was running'));
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/process-runner.ts