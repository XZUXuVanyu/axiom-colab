export const SUPERVISORY_TRANSPORT_VERSION = '1.0';
export class SupervisoryTransportError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'SupervisoryTransportError';
    }
}
function fail(code, message) {
    throw new SupervisoryTransportError(code, message);
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value, fields) {
    const allowed = new Set(fields);
    for (const key of Object.keys(value))if (!allowed.has(key)) fail('INVALID_REQUEST', `request contains unknown field ${key}`);
    for (const key of fields)if (!(key in value)) fail('INVALID_REQUEST', `request is missing field ${key}`);
}
function parseRequest(text, maxBytes) {
    if (Buffer.byteLength(text, 'utf8') > maxBytes) fail('REQUEST_TOO_LARGE', `request exceeds ${maxBytes} bytes`);
    let value;
    try {
        value = JSON.parse(text);
    } catch  {
        fail('MALFORMED_REQUEST', 'request is not valid JSON');
    }
    if (!record(value)) fail('INVALID_REQUEST', 'request must be an object');
    if (value.protocolVersion !== SUPERVISORY_TRANSPORT_VERSION) fail('UNSUPPORTED_PROTOCOL_VERSION', 'supervisory protocol version is unsupported');
    if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 128) fail('INVALID_REQUEST_ID', 'request id must contain 1..128 characters');
    if (value.operation === 'list-workspaces') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation'
        ]);
        return value;
    }
    if (value.operation === 'inspect') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation',
            'workspaceId',
            'goalId'
        ]);
        if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed');
        if (value.goalId !== null && (typeof value.goalId !== 'string' || !/^goal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.goalId))) fail('INVALID_GOAL_ID', 'goal identity is malformed');
        return value;
    }
    fail('UNKNOWN_OPERATION', 'supervisory operation is unknown');
}
function code(error) {
    return typeof error === 'object' && error !== null && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
}
export class SupervisoryTransport {
    host;
    maxRequestBytes;
    constructor(host, maxRequestBytes = 64 * 1024){
        this.host = host;
        this.maxRequestBytes = maxRequestBytes;
        if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 256) fail('INVALID_TRANSPORT_LIMIT', 'maxRequestBytes must be a safe integer of at least 256');
    }
    async handle(text) {
        let request;
        try {
            request = parseRequest(text, this.maxRequestBytes);
        } catch (error) {
            return JSON.stringify(this.failure(null, code(error), error instanceof Error ? error.message : String(error)));
        }
        try {
            const result = request.operation === 'list-workspaces' ? {
                workspaces: [
                    ...this.host.workspaces()
                ]
            } : await this.host.inspect(request.workspaceId, request.goalId);
            const response = {
                protocolVersion: SUPERVISORY_TRANSPORT_VERSION,
                id: request.id,
                ok: true,
                result: result
            };
            return JSON.stringify(response);
        } catch (error) {
            return JSON.stringify(this.failure(request.id, code(error), error instanceof Error ? error.message : String(error)));
        }
    }
    failure(id, errorCode, message) {
        return {
            protocolVersion: SUPERVISORY_TRANSPORT_VERSION,
            id,
            ok: false,
            error: {
                code: errorCode,
                message
            }
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/supervisory-transport.ts