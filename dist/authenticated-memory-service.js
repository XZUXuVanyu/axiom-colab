import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { authorize, ContractError } from './laboratory-contract.js';
import { MemoryWorkflowError, MemoryWorkflows } from './memory-workflows.js';
import { MemoryStoreError } from './local-memory-store.js';
const MEMORY_OPERATIONS = new Set([
    'compute.create',
    'compute.read',
    'compute.update',
    'compute.snapshot',
    'compute.release',
    'working.read',
    'working.propose',
    'artifact.read',
    'artifact.create',
    'artifact.derive'
]);
export class AuthenticatedMemoryServiceError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'AuthenticatedMemoryServiceError';
    }
}
function fail(code, message) {
    throw new AuthenticatedMemoryServiceError(code, message);
}
function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        fail('INVALID_CAPABILITY', `${field} must be a positive safe integer`);
    }
}
function tokenHash(token) {
    return createHash('sha256').update(token, 'utf8').digest();
}
function authenticate(expected, token) {
    const actual = tokenHash(token);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        fail('MEMORY_AUTHENTICATION_FAILED', 'memory-service bearer token is invalid');
    }
}
function record(value, field = 'request') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail('INVALID_MEMORY_REQUEST', `${field} must be an object`);
    }
    return value;
}
function string(value, field) {
    if (typeof value !== 'string' || value.length === 0) {
        fail('INVALID_MEMORY_REQUEST', `${field} must be a non-empty string`);
    }
    return value;
}
function bytes(value, field) {
    const encoded = string(value, field);
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) {
        fail('INVALID_MEMORY_REQUEST', `${field} must be canonical base64`);
    }
    return decoded;
}
function payload(value) {
    return {
        base64: Buffer.from(value).toString('base64')
    };
}
export class AuthenticatedMemoryService {
    workflows;
    clock;
    grants = new Map();
    constructor(workflows, clock = ()=>new Date()){
        this.workflows = workflows;
        this.clock = clock;
    }
    issueGrant(grant, authority, bearerToken = randomBytes(32).toString('base64url')) {
        if (this.grants.has(grant.capabilityId)) {
            fail('DUPLICATE_CAPABILITY', 'capability identity has already been issued');
        }
        if (!grant.toolVersion) fail('INVALID_CAPABILITY', 'toolVersion must not be empty');
        if (!Number.isSafeInteger(grant.sessionGeneration) || grant.sessionGeneration < 0) {
            fail('INVALID_CAPABILITY', 'sessionGeneration must be a non-negative safe integer');
        }
        positiveInteger(grant.maxOperations, 'maxOperations');
        positiveInteger(grant.maxRequestBytes, 'maxRequestBytes');
        if (grant.operations.length === 0 || grant.operations.some((operation)=>!MEMORY_OPERATIONS.has(operation))) {
            fail('INVALID_CAPABILITY', 'grant contains no operations or a non-Tool memory operation');
        }
        authorize({
            workspaceId: grant.workspaceId,
            actorId: grant.actorId,
            toolId: grant.toolId,
            callId: grant.callId
        }, grant, grant.operations[0], this.clock().toISOString());
        this.grants.set(grant.capabilityId, {
            grant,
            authority,
            tokenHash: tokenHash(bearerToken),
            operationsUsed: 0,
            revoked: false
        });
        return {
            grant,
            bearerToken
        };
    }
    revoke(capabilityId) {
        const state = this.grants.get(capabilityId);
        if (state === undefined) fail('CAPABILITY_NOT_FOUND', 'capability is unknown');
        state.revoked = true;
    }
    invoke(input) {
        const state = this.grants.get(input.capabilityId);
        if (state === undefined) fail('CAPABILITY_NOT_FOUND', 'capability is unknown');
        authenticate(state.tokenHash, input.bearerToken);
        if (state.revoked) fail('CAPABILITY_REVOKED', 'capability has been revoked');
        if (input.toolVersion !== state.grant.toolVersion) {
            fail('TOOL_IDENTITY_MISMATCH', 'capability belongs to another Tool version');
        }
        if (input.sessionGeneration !== state.grant.sessionGeneration) {
            fail('STALE_CAPABILITY', 'capability belongs to a stale session generation');
        }
        if (!MEMORY_OPERATIONS.has(input.operation)) {
            fail('OPERATION_NOT_PERMITTED', 'operation is not available to C++ Tools');
        }
        const requestBytes = Buffer.byteLength(JSON.stringify(input.request), 'utf8');
        if (requestBytes > state.grant.maxRequestBytes) {
            fail('MEMORY_REQUEST_TOO_LARGE', 'request exceeds the grant byte quota');
        }
        if (state.operationsUsed >= state.grant.maxOperations) {
            fail('MEMORY_OPERATION_QUOTA_EXCEEDED', 'operation quota is exhausted');
        }
        authorize(input.context, state.grant, input.operation, this.clock().toISOString());
        state.operationsUsed += 1;
        const invocation = {
            context: input.context,
            capability: state.grant,
            authority: state.authority
        };
        return this.dispatch(invocation, input.operation, record(input.request));
    }
    dispatch(invocation, operation, request) {
        switch(operation){
            case 'compute.create':
                return this.workflows.createCompute(invocation, bytes(request.base64, 'request.base64'), request.expiresAt === null || request.expiresAt === undefined ? null : string(request.expiresAt, 'request.expiresAt'));
            case 'compute.read':
                return payload(this.workflows.readCompute(invocation, string(request.id, 'request.id')));
            case 'compute.update':
                return this.workflows.updateCompute(invocation, string(request.id, 'request.id'), bytes(request.base64, 'request.base64'));
            case 'compute.snapshot':
                return this.workflows.snapshotCompute(invocation, string(request.id, 'request.id'));
            case 'compute.release':
                return this.workflows.releaseCompute(invocation, string(request.id, 'request.id'));
            case 'working.read':
                return this.workflows.readWorking(invocation, string(request.key, 'request.key'));
            case 'working.propose':
                return this.workflows.proposeWorking(invocation, string(request.key, 'request.key'), request.value);
            case 'artifact.read':
                return payload(this.workflows.readArtifact(invocation, string(request.id, 'request.id')));
            case 'artifact.create':
                return this.workflows.createArtifact(invocation, bytes(request.base64, 'request.base64'), request.schema, record(request.provenance, 'request.provenance'));
            case 'artifact.derive':
                {
                    if (!Array.isArray(request.parentIds)) {
                        fail('INVALID_MEMORY_REQUEST', 'request.parentIds must be an array');
                    }
                    const parentIds = request.parentIds.map((id, index)=>string(id, `request.parentIds[${index}]`));
                    return this.workflows.deriveArtifact(invocation, parentIds, bytes(request.base64, 'request.base64'), request.schema, record(request.provenance, 'request.provenance'));
                }
            default:
                fail('OPERATION_NOT_PERMITTED', `operation ${operation} is not available`);
        }
    }
}
export function memoryServiceErrorCode(error) {
    if (error instanceof AuthenticatedMemoryServiceError || error instanceof ContractError || error instanceof MemoryWorkflowError || error instanceof MemoryStoreError) return error.code;
    return 'INTERNAL_ERROR';
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/authenticated-memory-service.ts