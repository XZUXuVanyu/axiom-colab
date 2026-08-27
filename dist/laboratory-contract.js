import { createHash } from 'node:crypto';
export const LABORATORY_PROTOCOL_VERSION = '1.0';
export class ContractError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'ContractError';
    }
}
function fail(code, message) {
    throw new ContractError(code, message);
}
function canonicalize(value, path) {
    if (value === null) return 'null';
    if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('NON_CANONICAL_VALUE', `${path} contains a non-finite number`);
        return Object.is(value, -0) ? '0' : JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map((item, index)=>canonicalize(item, `${path}[${index}]`)).join(',')}]`;
    if (typeof value === 'object' && value !== null) {
        const object = value;
        return `{${Object.keys(object).sort().map((key)=>{
            const item = object[key];
            if (item === undefined) fail('NON_CANONICAL_VALUE', `${path}.${key} is undefined`);
            return `${JSON.stringify(key)}:${canonicalize(item, `${path}.${key}`)}`;
        }).join(',')}}`;
    }
    fail('NON_CANONICAL_VALUE', `${path} is not JSON`);
}
export function canonicalJson(value) {
    return canonicalize(value, '$');
}
export function contentHash(value) {
    return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}
function timestamp(value, field) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIMESTAMP', `${field} must be a canonical UTC timestamp`);
    return parsed;
}
export function authorize(context, grant, operation, now) {
    if (grant.protocolVersion !== LABORATORY_PROTOCOL_VERSION) fail('UNSUPPORTED_PROTOCOL_VERSION', 'capability protocol version is unsupported');
    if (grant.workspaceId !== context.workspaceId) fail('CROSS_WORKSPACE_ACCESS', 'capability belongs to another workspace');
    if (grant.actorId !== context.actorId) fail('ACTOR_MISMATCH', 'capability belongs to another actor');
    if (grant.toolId !== null && grant.toolId !== context.toolId) fail('TOOL_IDENTITY_MISMATCH', 'capability belongs to another tool');
    if (grant.callId !== null && grant.callId !== context.callId) fail('CALL_IDENTITY_MISMATCH', 'capability belongs to another call');
    if (!grant.operations.includes(operation)) fail('OPERATION_NOT_PERMITTED', `capability does not permit ${operation}`);
    const current = timestamp(now, 'now');
    const issued = timestamp(grant.issuedAt, 'issuedAt');
    const expires = timestamp(grant.expiresAt, 'expiresAt');
    if (expires <= issued) fail('INVALID_CAPABILITY', 'capability expiry must follow issuance');
    if (current < issued) fail('CAPABILITY_NOT_YET_VALID', 'capability is not yet valid');
    if (current >= expires) fail('CAPABILITY_EXPIRED', 'capability has expired');
}
export function assertApprovalBinding(expectedWorkspace, expectedProposal, expectedHash, approval) {
    if (approval.decision !== 'approved') fail('PROPOSAL_NOT_APPROVED', 'record does not approve the proposal');
    if (approval.workspaceId !== expectedWorkspace) fail('CROSS_WORKSPACE_ACCESS', 'approval belongs to another workspace');
    if (approval.proposalId !== expectedProposal || approval.proposalHash !== expectedHash) fail('STALE_APPROVAL', 'approval does not bind the exact proposal');
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/laboratory-contract.ts