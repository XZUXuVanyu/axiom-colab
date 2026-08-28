import { assertSupportedJsonSchema, JsonSchemaDefinitionError } from './json-schema.js';
export const PROTOCOL_VERSION = '1.0';
export const REQUIRED_BRIDGE_CAPABILITIES = [
    'describe-tools',
    'tool-call',
    'input-schema-validation',
    'output-schema-validation'
];
export class ProtocolError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`);
        this.name = 'ProtocolError';
        this.code = code;
    }
}
export class BridgeToolError extends Error {
    code;
    details;
    constructor(payload){
        super(`[${payload.code}] ${payload.message}`);
        this.name = 'BridgeToolError';
        this.code = payload.code;
        this.details = payload.details;
    }
}
function parseJson(text, subject) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const diagnostic = error instanceof Error ? error.message : String(error);
        throw new ProtocolError('MALFORMED_STDOUT', `${subject} is not JSON: ${diagnostic}`);
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function expectRecord(value, path) {
    if (!isRecord(value)) {
        throw new ProtocolError('INVALID_PROTOCOL', `${path} must be an object`);
    }
    return value;
}
function expectExactKeys(object, path, keys) {
    const allowed = new Set(keys);
    for (const key of Object.keys(object)){
        if (!allowed.has(key)) {
            throw new ProtocolError('INVALID_PROTOCOL', `${path} contains unknown field ${key}`);
        }
    }
    for (const key of keys){
        if (!(key in object)) {
            throw new ProtocolError('INVALID_PROTOCOL', `${path} is missing field ${key}`);
        }
    }
}
function expectString(value, path, nonEmpty = true) {
    if (typeof value !== 'string' || nonEmpty && value.length === 0) {
        throw new ProtocolError('INVALID_PROTOCOL', `${path} must be ${nonEmpty ? 'a non-empty' : 'a'} string`);
    }
    return value;
}
function expectBoolean(value, path) {
    if (typeof value !== 'boolean') {
        throw new ProtocolError('INVALID_PROTOCOL', `${path} must be a boolean`);
    }
    return value;
}
function expectProtocolVersion(value) {
    if (value !== PROTOCOL_VERSION) {
        throw new ProtocolError('UNSUPPORTED_PROTOCOL_VERSION', `expected protocolVersion ${PROTOCOL_VERSION}, received ${JSON.stringify(value)}`);
    }
    return PROTOCOL_VERSION;
}
function parseCapabilities(value) {
    if (!Array.isArray(value)) {
        throw new ProtocolError('INVALID_PROTOCOL', '$.capabilities must be an array');
    }
    const capabilities = value.map((item, index)=>expectString(item, `$.capabilities[${index}]`));
    const seen = new Set();
    for (const capability of capabilities){
        if (seen.has(capability)) {
            throw new ProtocolError('INVALID_PROTOCOL', `$.capabilities contains duplicate capability ${capability}`);
        }
        seen.add(capability);
    }
    const missing = REQUIRED_BRIDGE_CAPABILITIES.filter((item)=>!seen.has(item));
    if (missing.length > 0) {
        throw new ProtocolError('MISSING_PROTOCOL_CAPABILITY', `Bridge is missing required capabilities: ${missing.join(', ')}`);
    }
    return capabilities;
}
function assertJsonValue(value, path) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new ProtocolError('INVALID_PROTOCOL', `${path} contains a non-finite number`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index)=>assertJsonValue(item, `${path}[${index}]`));
        return;
    }
    if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)){
            assertJsonValue(item, `${path}.${key}`);
        }
        return;
    }
    throw new ProtocolError('INVALID_PROTOCOL', `${path} is not lossless JSON`);
}
function expectSchema(value, path, objectOnly = false) {
    if (!objectOnly && typeof value === 'boolean') return value;
    if (!isRecord(value)) {
        throw new ProtocolError('INVALID_DESCRIPTOR', `${path} must be a JSON Schema object${objectOnly ? '' : ' or boolean'}`);
    }
    assertJsonValue(value, path);
    try {
        assertSupportedJsonSchema(value, path);
    } catch (error) {
        if (error instanceof JsonSchemaDefinitionError) {
            throw new ProtocolError('INVALID_DESCRIPTOR', error.message);
        }
        throw error;
    }
    return value;
}
function parseDescriptor(value, index) {
    const path = `$.tools[${index}]`;
    const object = expectRecord(value, path);
    expectExactKeys(object, path, [
        'name',
        'description',
        'whenToUse',
        'parameters',
        'output',
        'timeoutMs',
        'allowParallel',
        'sideEffect'
    ]);
    const name = expectString(object.name, `${path}.name`);
    if (!/^[a-z][a-z0-9_]{0,127}$/.test(name)) {
        throw new ProtocolError('INVALID_DESCRIPTOR', `${path}.name has an invalid tool name`);
    }
    const timeoutMs = object.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 3_600_000) {
        throw new ProtocolError('INVALID_DESCRIPTOR', `${path}.timeoutMs must be an integer in 1..3600000`);
    }
    return {
        name,
        description: expectString(object.description, `${path}.description`),
        whenToUse: expectString(object.whenToUse, `${path}.whenToUse`),
        parameters: expectSchema(object.parameters, `${path}.parameters`, true),
        output: expectSchema(object.output, `${path}.output`),
        timeoutMs: timeoutMs,
        allowParallel: expectBoolean(object.allowParallel, `${path}.allowParallel`),
        sideEffect: expectBoolean(object.sideEffect, `${path}.sideEffect`)
    };
}
export function assertToolDescriptor(value) {
    return parseDescriptor(value, 0);
}
export function parseDescribeToolsResponse(text) {
    const object = expectRecord(parseJson(text, 'describe-tools stdout'), '$');
    expectExactKeys(object, '$', [
        'protocolVersion',
        'capabilities',
        'tools'
    ]);
    expectProtocolVersion(object.protocolVersion);
    const capabilities = parseCapabilities(object.capabilities);
    if (!Array.isArray(object.tools)) {
        throw new ProtocolError('INVALID_DESCRIPTOR', '$.tools must be an array');
    }
    const tools = object.tools.map(parseDescriptor);
    const seen = new Set();
    for (const tool of tools){
        if (seen.has(tool.name)) {
            throw new ProtocolError('DUPLICATE_TOOL_NAME', `descriptor contains duplicate tool ${tool.name}`);
        }
        seen.add(tool.name);
    }
    return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities,
        tools
    };
}
function parseErrorPayload(value) {
    const object = expectRecord(value, '$.error');
    expectExactKeys(object, '$.error', [
        'code',
        'message',
        'details'
    ]);
    const details = expectRecord(object.details, '$.error.details');
    assertJsonValue(details, '$.error.details');
    return {
        code: expectString(object.code, '$.error.code'),
        message: expectString(object.message, '$.error.message'),
        details: details
    };
}
export function parseToolCallResponse(text, expectedId) {
    const object = expectRecord(parseJson(text, 'tool stdout'), '$');
    expectProtocolVersion(object.protocolVersion);
    if (object.ok === true) {
        expectExactKeys(object, '$', [
            'protocolVersion',
            'id',
            'ok',
            'result'
        ]);
        if (object.id !== expectedId) {
            throw new ProtocolError('CALL_ID_MISMATCH', `expected id ${expectedId}, received ${JSON.stringify(object.id)}`);
        }
        assertJsonValue(object.result, '$.result');
        return {
            protocolVersion: PROTOCOL_VERSION,
            id: expectedId,
            ok: true,
            result: object.result
        };
    }
    if (object.ok === false) {
        expectExactKeys(object, '$', [
            'protocolVersion',
            'id',
            'ok',
            'error'
        ]);
        if (object.id !== expectedId) {
            throw new ProtocolError('CALL_ID_MISMATCH', `expected id ${expectedId}, received ${JSON.stringify(object.id)}`);
        }
        throw new BridgeToolError(parseErrorPayload(object.error));
    }
    throw new ProtocolError('INVALID_PROTOCOL', '$.ok must be a boolean');
}
export function makeToolCallRequest(id, tool, args, trustedContext) {
    if (id.length === 0 || id.length > 256) {
        throw new ProtocolError('INVALID_REQUEST', 'call id must be 1..256 characters');
    }
    if (!/^[a-z][a-z0-9_]{0,127}$/.test(tool)) {
        throw new ProtocolError('INVALID_REQUEST', 'tool has an invalid name');
    }
    if (!isRecord(args)) {
        throw new ProtocolError('INVALID_ARGUMENTS', 'Harness Tool arguments must be an object');
    }
    assertJsonValue(args, '$.arguments');
    if (trustedContext !== undefined) {
        assertJsonValue(trustedContext, '$.trustedContext');
        if (trustedContext.protocolVersion !== PROTOCOL_VERSION || trustedContext.callId !== id || trustedContext.toolName !== tool || trustedContext.toolId.length === 0 || trustedContext.workspaceId.length === 0 || trustedContext.actorId.length === 0 || trustedContext.toolVersion.length === 0 || !Number.isSafeInteger(trustedContext.sessionGeneration) || trustedContext.sessionGeneration < 0) {
            throw new ProtocolError('INVALID_TRUSTED_CONTEXT', 'trusted invocation context must bind this Tool Call and contain valid host identities');
        }
    }
    return {
        protocolVersion: PROTOCOL_VERSION,
        id,
        tool,
        arguments: args,
        ...trustedContext === undefined ? {} : {
            trustedContext
        }
    };
}
export function errorCode(error) {
    if (error instanceof BridgeToolError || error instanceof ProtocolError) return error.code;
    if (isRecord(error) && typeof error.code === 'string') return error.code;
    return 'ADAPTER_ERROR';
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/protocol.ts