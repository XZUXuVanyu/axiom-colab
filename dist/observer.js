const sensitiveKey = /(?:password|passwd|token|secret|api[-_]?key|authorization|credential)/i;
function sanitize(value, maxChars) {
    const seen = new WeakSet();
    const text = JSON.stringify(value, (key, candidate)=>{
        if (sensitiveKey.test(key)) return '[REDACTED]';
        if (typeof candidate === 'object' && candidate !== null) {
            if (seen.has(candidate)) return '[CIRCULAR]';
            seen.add(candidate);
        }
        return candidate;
    }) ?? String(value);
    return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`;
}
export class ToolObserver {
    logger;
    config;
    constructor(logger, config){
        this.logger = logger;
        this.config = config;
    }
    start(callId, tool, args) {
        this.logger.info(`[cpp-tool:start] callId=${callId} tool=${tool} arguments=${sanitize(args, this.config.maxLogChars)}`);
    }
    success(callId, tool, durationMs, exitCode, result) {
        this.logger.info(`[cpp-tool:success] callId=${callId} tool=${tool} durationMs=${durationMs.toFixed(1)} exitCode=${exitCode} result=${sanitize(result, this.config.maxLogChars)}`);
    }
    error(callId, tool, durationMs, exitCode, code, message) {
        this.logger.error(`[cpp-tool:error] callId=${callId} tool=${tool} durationMs=${durationMs.toFixed(1)} exitCode=${exitCode === null ? 'null' : exitCode} errorCode=${code} message=${sanitize(message, this.config.maxLogChars)}`);
    }
    diagnostic(subject, stderr) {
        const trimmed = stderr.trim();
        if (trimmed.length > 0) {
            this.logger.warn(`[cpp-tool:stderr] subject=${subject} diagnostic=${sanitize(trimmed, this.config.maxLogChars)}`);
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/observer.ts