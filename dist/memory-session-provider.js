import { randomUUID } from 'node:crypto';
import { AuthenticatedMemoryService } from './authenticated-memory-service.js';
export class MemorySessionProvider {
    options;
    now;
    constructor(options){
        this.options = options;
        this.now = options.now ?? (()=>new Date());
        const endpoint = new URL(options.endpoint.invokeUrl);
        if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== '[::1]' && endpoint.hostname !== '::1') {
            throw new TypeError('memory endpoint must use HTTP on a numeric loopback address');
        }
    }
    create(toolName, callId) {
        const policy = this.options.policyForTool(toolName);
        if (policy === undefined) return undefined;
        if (!Number.isSafeInteger(policy.lifetimeMs) || policy.lifetimeMs <= 0) {
            throw new TypeError('memory grant lifetimeMs must be a positive safe integer');
        }
        const issuedAt = this.now();
        const grant = {
            protocolVersion: '1.0',
            capabilityId: `capability:${randomUUID()}`,
            workspaceId: this.options.scope.workspaceId,
            actorId: this.options.scope.actorId,
            toolId: policy.toolId,
            toolVersion: policy.toolVersion,
            callId: callId,
            operations: [
                ...policy.operations
            ],
            issuedAt: issuedAt.toISOString(),
            expiresAt: new Date(issuedAt.getTime() + policy.lifetimeMs).toISOString(),
            nonce: randomUUID(),
            sessionGeneration: this.options.scope.sessionGeneration,
            maxOperations: policy.maxOperations,
            maxRequestBytes: policy.maxRequestBytes
        };
        const issued = this.options.service.issueGrant(grant, this.options.scope.authority);
        let revoked = false;
        return {
            envelope: {
                protocolVersion: '1.0',
                workspaceId: grant.workspaceId,
                actorId: grant.actorId,
                toolId: grant.toolId,
                toolName,
                toolVersion: grant.toolVersion,
                callId,
                sessionGeneration: grant.sessionGeneration,
                memoryGrant: {
                    ...grant,
                    endpoint: this.options.endpoint.invokeUrl,
                    bearerToken: issued.bearerToken
                }
            },
            revoke: ()=>{
                if (revoked) return;
                revoked = true;
                this.options.service.revoke(grant.capabilityId);
            }
        };
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/memory-session-provider.ts