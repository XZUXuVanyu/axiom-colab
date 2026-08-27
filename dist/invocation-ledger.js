function validationForFailure(code) {
    if (code === 'INPUT_VALIDATION_FAILED') return {
        inputValidated: false,
        outputValidated: null
    };
    if (code === 'OUTPUT_VALIDATION_FAILED') return {
        inputValidated: true,
        outputValidated: false
    };
    return {
        inputValidated: null,
        outputValidated: null
    };
}
export class InvocationLedger {
    recordsById = new Map();
    start(callId, tool) {
        if (this.recordsById.has(callId)) throw new Error(`duplicate call ID: ${callId}`);
        this.recordsById.set(callId, {
            callId,
            tool,
            status: 'running',
            startedAt: new Date().toISOString(),
            inputValidated: null,
            outputValidated: null
        });
    }
    succeed(callId, durationMs) {
        this.finish(callId, {
            status: 'succeeded',
            durationMs,
            inputValidated: true,
            outputValidated: true
        });
    }
    fail(callId, durationMs, errorCode, rejected = false) {
        this.finish(callId, {
            status: rejected ? 'rejected' : 'failed',
            durationMs,
            errorCode,
            ...validationForFailure(errorCode)
        });
    }
    snapshot() {
        return [
            ...this.recordsById.values()
        ].map((record)=>({
                ...record
            }));
    }
    verify(policy) {
        const records = this.snapshot();
        const violations = [];
        const permitted = policy.permittedTools === undefined ? undefined : new Set(policy.permittedTools);
        for (const record of records){
            if (permitted !== undefined && !permitted.has(record.tool)) {
                violations.push({
                    code: 'UNEXPECTED_TOOL',
                    message: `Tool ${record.tool} is not permitted`,
                    callId: record.callId,
                    tool: record.tool
                });
            }
            if (policy.allowRunning !== true && record.status === 'running') {
                violations.push({
                    code: 'CALL_STILL_RUNNING',
                    message: `Call ${record.callId} is still running`,
                    callId: record.callId,
                    tool: record.tool
                });
            }
            if (policy.requireSuccessfulCompletion === true && record.status !== 'succeeded') {
                violations.push({
                    code: 'CALL_NOT_SUCCESSFUL',
                    message: `Call ${record.callId} did not succeed`,
                    callId: record.callId,
                    tool: record.tool
                });
            }
            if (policy.requireValidation === true && (record.inputValidated !== true || record.outputValidated !== true)) {
                violations.push({
                    code: 'VALIDATION_NOT_PROVEN',
                    message: `Call ${record.callId} did not complete both validations`,
                    callId: record.callId,
                    tool: record.tool
                });
            }
        }
        for (const [tool, bounds] of Object.entries(policy.calls ?? {})){
            const count = records.filter((record)=>record.tool === tool).length;
            if (bounds.min !== undefined && count < bounds.min) {
                violations.push({
                    code: 'TOO_FEW_CALLS',
                    message: `Tool ${tool} was called ${count} times; minimum is ${bounds.min}`,
                    tool
                });
            }
            if (bounds.max !== undefined && count > bounds.max) {
                violations.push({
                    code: 'TOO_MANY_CALLS',
                    message: `Tool ${tool} was called ${count} times; maximum is ${bounds.max}`,
                    tool
                });
            }
        }
        return {
            ok: violations.length === 0,
            records,
            violations
        };
    }
    finish(callId, update) {
        const current = this.recordsById.get(callId);
        if (current === undefined) throw new Error(`unknown call ID: ${callId}`);
        if (current.status !== 'running') throw new Error(`call already completed: ${callId}`);
        this.recordsById.set(callId, {
            ...current,
            ...update,
            finishedAt: new Date().toISOString()
        });
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/invocation-ledger.ts