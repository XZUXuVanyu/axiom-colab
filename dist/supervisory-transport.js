export const SUPERVISORY_TRANSPORT_VERSION = '1.1';
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
function parseHiddenFixtures(value) {
    if (!Array.isArray(value) || value.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge fixtures must not be empty');
    return value.map((item, index)=>{
        if (!record(item)) fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} must be an object`);
        exact(item, [
            'path',
            'contentBase64'
        ]);
        if (typeof item.path !== 'string' || typeof item.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.contentBase64)) {
            fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} is malformed`);
        }
        const content = Buffer.from(item.contentBase64, 'base64');
        if (content.toString('base64') !== item.contentBase64) fail('INVALID_HIDDEN_CHALLENGE', `fixture ${index} is not canonical base64`);
        return {
            path: item.path,
            content
        };
    });
}
function parseHiddenCommands(value) {
    if (!Array.isArray(value) || value.length === 0) fail('INVALID_HIDDEN_CHALLENGE', 'hidden challenge commands must not be empty');
    return value.map((item, index)=>{
        if (!record(item)) fail('INVALID_HIDDEN_CHALLENGE', `challenge command ${index} must be an object`);
        exact(item, [
            'commandId',
            'executable',
            'args',
            'cwd'
        ]);
        if (typeof item.commandId !== 'string' || typeof item.executable !== 'string' || !Array.isArray(item.args) || !item.args.every((arg)=>typeof arg === 'string') || typeof item.cwd !== 'string') fail('INVALID_HIDDEN_CHALLENGE', `challenge command ${index} is malformed`);
        return {
            commandId: item.commandId,
            executable: item.executable,
            args: [
                ...item.args
            ],
            cwd: item.cwd
        };
    });
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
    if (value.operation === 'list-goals') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation',
            'workspaceId'
        ]);
        if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed');
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
    if (value.operation === 'execute-tool') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation',
            'workspaceId',
            'goalId',
            'tool',
            'arguments'
        ]);
        if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed');
        if (typeof value.goalId !== 'string' || !/^goal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.goalId)) fail('INVALID_GOAL_ID', 'goal identity is malformed');
        if (typeof value.tool !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/.test(value.tool)) fail('INVALID_TOOL_NAME', 'Tool name is malformed');
        if (!record(value.arguments)) fail('INVALID_TOOL_ARGUMENTS', 'Tool arguments must be an object');
        return value;
    }
    if (value.operation === 'decide-installation') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation',
            'workspaceId',
            'proposalId',
            'proposalHash',
            'decision'
        ]);
        if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed');
        if (typeof value.proposalId !== 'string' || !/^proposal:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.proposalId)) fail('INVALID_PROPOSAL_ID', 'proposal identity is malformed');
        if (typeof value.proposalHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.proposalHash)) fail('INVALID_PROPOSAL_HASH', 'proposal hash is malformed');
        if (value.decision !== 'approved' && value.decision !== 'rejected') fail('INVALID_DECISION', 'decision must be approved or rejected');
        return value;
    }
    if (value.operation === 'submit-hidden-challenge') {
        exact(value, [
            'protocolVersion',
            'id',
            'operation',
            'workspaceId',
            'revisionId',
            'candidateHash',
            'fixtures',
            'commands'
        ]);
        if (typeof value.workspaceId !== 'string' || !/^workspace:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.workspaceId)) fail('INVALID_WORKSPACE_ID', 'workspace identity is malformed');
        if (typeof value.revisionId !== 'string' || !/^evidence:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.revisionId)) fail('INVALID_REVISION_ID', 'candidate revision identity is malformed');
        if (typeof value.candidateHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.candidateHash)) fail('INVALID_CANDIDATE_HASH', 'candidate hash is malformed');
        return {
            ...value,
            fixtures: parseHiddenFixtures(value.fixtures),
            commands: parseHiddenCommands(value.commands)
        };
    }
    fail('UNKNOWN_OPERATION', 'supervisory operation is unknown');
}
function code(error) {
    return typeof error === 'object' && error !== null && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
}
function recoverRequestId(text) {
    try {
        const value = JSON.parse(text);
        return record(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128 ? value.id : null;
    } catch  {
        return null;
    }
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
            return JSON.stringify(this.failure(recoverRequestId(text), code(error), error instanceof Error ? error.message : String(error)));
        }
        try {
            const result = request.operation === 'list-workspaces' ? {
                workspaces: [
                    ...this.host.workspaces()
                ]
            } : request.operation === 'list-goals' ? {
                workspaceId: request.workspaceId,
                goals: [
                    ...this.host.goals(request.workspaceId)
                ]
            } : request.operation === 'inspect' ? await this.host.inspect(request.workspaceId, request.goalId) : request.operation === 'execute-tool' ? await this.host.executeTool(request.workspaceId, request.goalId, request.tool, request.arguments) : request.operation === 'decide-installation' ? await this.host.decideInstallation(request.workspaceId, request.proposalId, request.proposalHash, request.decision) : await this.host.submitHiddenChallenge(request.workspaceId, request.revisionId, request.candidateHash, request.fixtures, request.commands);
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