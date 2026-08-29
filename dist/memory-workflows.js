import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assertApprovalBinding, assertAuthority, authorize, canonicalJson, contentHash, ContractError, createAuditEvent } from './laboratory-contract.js';
import { LocalMemoryStore } from './local-memory-store.js';
export class MemoryWorkflowError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'MemoryWorkflowError';
    }
}
function fail(code, message) {
    throw new MemoryWorkflowError(code, message);
}
function positive(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_COMPUTE_LIMIT', `${name} must be a positive safe integer`);
}
export class MemoryWorkflows {
    store;
    database;
    clock;
    limits;
    closed = false;
    constructor(store, options = {}){
        this.store = store;
        this.clock = options.now ?? (()=>new Date());
        this.limits = options.computeLimits ?? {
            maxBytes: 16 * 1024 * 1024,
            maxObjectBytes: 1024 * 1024,
            maxObjects: 128
        };
        positive(this.limits.maxBytes, 'maxBytes');
        positive(this.limits.maxObjectBytes, 'maxObjectBytes');
        positive(this.limits.maxObjects, 'maxObjects');
        if (this.limits.maxObjectBytes > this.limits.maxBytes) fail('INVALID_COMPUTE_LIMIT', 'maxObjectBytes cannot exceed maxBytes');
        this.database = new DatabaseSync(join(store.root, 'workflows.sqlite3'));
        this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        this.migrate();
    }
    migrate() {
        const version = this.database.prepare('PRAGMA user_version').get().user_version;
        if (version > 1) fail('UNSUPPORTED_WORKFLOW_VERSION', `workflow schema version ${version} is unsupported`);
        if (version === 0) this.database.exec(`BEGIN IMMEDIATE;
      CREATE TABLE compute_objects (workspace_id TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','released')), expires_at TEXT, PRIMARY KEY(workspace_id,id));
      CREATE TABLE compute_snapshots (workspace_id TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, source_revision INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
      CREATE TABLE working_proposals (workspace_id TEXT NOT NULL, id TEXT NOT NULL, key TEXT NOT NULL, base_revision INTEGER NOT NULL, value_json TEXT NOT NULL, hash TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('proposed','approved','rejected','superseded')), created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, PRIMARY KEY(workspace_id,id));
      CREATE TABLE working_revisions (workspace_id TEXT NOT NULL, id TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value_json TEXT NOT NULL, hash TEXT NOT NULL, proposal_id TEXT NOT NULL, committed_at TEXT NOT NULL, PRIMARY KEY(workspace_id,key,revision), UNIQUE(workspace_id,id));
      CREATE TABLE artifacts (workspace_id TEXT NOT NULL, id TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, schema_json TEXT NOT NULL, schema_hash TEXT NOT NULL, parents_json TEXT NOT NULL, provenance_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
      CREATE TABLE workflow_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_json TEXT NOT NULL);
      PRAGMA user_version = 1; COMMIT;`);
    }
    now() {
        return this.clock().toISOString();
    }
    ensureOpen() {
        if (this.closed) fail('WORKFLOWS_CLOSED', 'memory workflows are closed');
    }
    audit(invocation, operation, targetId, input, outcome, errorCode) {
        const event = createAuditEvent({
            eventId: `event:${randomUUID()}`,
            workspaceId: invocation.context.workspaceId,
            actorId: invocation.context.actorId,
            callId: invocation.context.callId,
            operation,
            targetId,
            capabilityId: invocation.capability.capabilityId,
            occurredAt: this.now(),
            outcome,
            errorCode,
            input
        });
        this.database.prepare('INSERT INTO workflow_audit(event_json) VALUES (?)').run(canonicalJson(event));
    }
    perform(invocation, operation, targetId, input, action) {
        this.ensureOpen();
        try {
            assertAuthority(operation, invocation.authority);
            authorize(invocation.context, invocation.capability, operation, this.now());
            const result = action();
            this.audit(invocation, operation, targetId, input, 'succeeded', null);
            return result;
        } catch (error) {
            const code = error instanceof ContractError || error instanceof MemoryWorkflowError ? error.code : 'INTERNAL_ERROR';
            this.audit(invocation, operation, targetId, input, code === 'INTERNAL_ERROR' ? 'failed' : 'rejected', code);
            throw error;
        }
    }
    workspace(invocation) {
        this.store.reopenWorkspace(invocation.context.workspaceId);
        return invocation.context.workspaceId;
    }
    computeRow(workspaceId, id) {
        const row = this.database.prepare('SELECT id,revision,hash,size,state,expires_at FROM compute_objects WHERE workspace_id=? AND id=?').get(workspaceId, id);
        if (!row) fail('COMPUTE_NOT_FOUND', 'compute object is not visible in this workspace');
        return row;
    }
    computeResult(row) {
        return {
            id: row.id,
            revision: row.revision,
            hash: row.hash,
            size: row.size,
            state: row.state,
            expiresAt: row.expires_at
        };
    }
    activeComputeUsage(workspaceId) {
        return this.database.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes FROM compute_objects WHERE workspace_id=? AND state='active'").get(workspaceId);
    }
    createCompute(invocation, bytes, expiresAt = null) {
        return this.perform(invocation, 'compute.create', null, {
            size: bytes.byteLength,
            expiresAt
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            if (bytes.byteLength > this.limits.maxObjectBytes) fail('COMPUTE_OBJECT_TOO_LARGE', 'compute object exceeds its per-object byte limit');
            const usage = this.activeComputeUsage(workspaceId);
            if (usage.count >= this.limits.maxObjects) fail('COMPUTE_OBJECT_LIMIT', 'compute object quota is exhausted');
            if (usage.bytes + bytes.byteLength > this.limits.maxBytes) fail('COMPUTE_BYTE_LIMIT', 'active compute byte quota would be exceeded');
            const payload = this.store.putPayload(workspaceId, bytes, expiresAt);
            const id = `object:${randomUUID()}`;
            this.database.prepare('INSERT INTO compute_objects VALUES (?,?,?,?,?,?,?)').run(workspaceId, id, 1, payload.hash, payload.size, 'active', expiresAt);
            return {
                id,
                revision: 1,
                hash: payload.hash,
                size: payload.size,
                state: 'active',
                expiresAt
            };
        });
    }
    readCompute(invocation, id) {
        return this.perform(invocation, 'compute.read', id, {
            id
        }, ()=>{
            const row = this.computeRow(this.workspace(invocation), id);
            if (row.state !== 'active') fail('COMPUTE_RELEASED', 'compute object has been released');
            return this.store.readPayload(invocation.context.workspaceId, row.hash);
        });
    }
    listComputeObjects(invocation) {
        return this.perform(invocation, 'compute.read', null, {
            list: true
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const rows = this.database.prepare('SELECT id,revision,hash,size,state,expires_at FROM compute_objects WHERE workspace_id=? ORDER BY id').all(workspaceId);
            return rows.map((row)=>this.computeResult(row));
        });
    }
    updateCompute(invocation, id, bytes) {
        return this.perform(invocation, 'compute.update', id, {
            id,
            size: bytes.byteLength
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const row = this.computeRow(workspaceId, id);
            if (row.state !== 'active') fail('COMPUTE_RELEASED', 'compute object has been released');
            if (bytes.byteLength > this.limits.maxObjectBytes) fail('COMPUTE_OBJECT_TOO_LARGE', 'compute object exceeds its per-object byte limit');
            const usage = this.activeComputeUsage(workspaceId);
            if (usage.bytes - row.size + bytes.byteLength > this.limits.maxBytes) fail('COMPUTE_BYTE_LIMIT', 'active compute byte quota would be exceeded');
            const payload = this.store.putPayload(workspaceId, bytes, row.expires_at);
            this.database.prepare('UPDATE compute_objects SET revision=?,hash=?,size=? WHERE workspace_id=? AND id=?').run(row.revision + 1, payload.hash, payload.size, workspaceId, id);
            return {
                ...this.computeResult(row),
                revision: row.revision + 1,
                hash: payload.hash,
                size: payload.size
            };
        });
    }
    snapshotCompute(invocation, id) {
        return this.perform(invocation, 'compute.snapshot', id, {
            id
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const row = this.computeRow(workspaceId, id);
            if (row.state !== 'active') fail('COMPUTE_RELEASED', 'compute object has been released');
            const snapshotId = `object:${randomUUID()}`;
            const createdAt = this.now();
            this.database.prepare('INSERT INTO compute_snapshots VALUES (?,?,?,?,?,?,?)').run(workspaceId, snapshotId, id, row.revision, row.hash, row.size, createdAt);
            return {
                id: snapshotId,
                sourceId: id,
                sourceRevision: row.revision,
                hash: row.hash,
                size: row.size,
                createdAt
            };
        });
    }
    releaseCompute(invocation, id) {
        return this.perform(invocation, 'compute.release', id, {
            id
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const row = this.computeRow(workspaceId, id);
            if (row.state !== 'active') fail('COMPUTE_RELEASED', 'compute object has already been released');
            this.database.prepare("UPDATE compute_objects SET state='released' WHERE workspace_id=? AND id=?").run(workspaceId, id);
            return {
                ...this.computeResult(row),
                state: 'released'
            };
        });
    }
    proposeWorking(invocation, key, value) {
        return this.perform(invocation, 'working.propose', null, {
            key,
            value
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            if (!key) fail('INVALID_WORKING_KEY', 'working key must not be empty');
            const current = this.database.prepare('SELECT COALESCE(MAX(revision),0) AS revision FROM working_revisions WHERE workspace_id=? AND key=?').get(workspaceId, key).revision;
            const id = `proposal:${randomUUID()}`;
            const createdAt = this.now();
            const proposalValue = {
                key,
                baseRevision: current,
                value
            };
            const hash = contentHash(proposalValue);
            this.database.prepare('INSERT INTO working_proposals(workspace_id,id,key,base_revision,value_json,hash,state,created_at) VALUES (?,?,?,?,?,?,?,?)').run(workspaceId, id, key, current, canonicalJson(value), hash, 'proposed', createdAt);
            return {
                id,
                key,
                baseRevision: current,
                value,
                hash,
                state: 'proposed',
                createdAt
            };
        });
    }
    readWorking(invocation, key) {
        return this.perform(invocation, 'working.read', null, {
            key
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const row = this.database.prepare('SELECT id,key,revision,value_json,hash,proposal_id,committed_at FROM working_revisions WHERE workspace_id=? AND key=? ORDER BY revision DESC LIMIT 1').get(workspaceId, key);
            return row ? this.revisionResult(row) : null;
        });
    }
    workingHistory(invocation, key) {
        return this.perform(invocation, 'working.read', null, {
            key,
            history: true
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const rows = this.database.prepare('SELECT id,key,revision,value_json,hash,proposal_id,committed_at FROM working_revisions WHERE workspace_id=? AND key=? ORDER BY revision').all(workspaceId, key);
            return rows.map((row)=>this.revisionResult(row));
        });
    }
    listWorkingRevisions(invocation) {
        return this.perform(invocation, 'working.read', null, {
            list: true
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const rows = this.database.prepare('SELECT id,key,revision,value_json,hash,proposal_id,committed_at FROM working_revisions WHERE workspace_id=? ORDER BY key,revision').all(workspaceId);
            return rows.map((row)=>this.revisionResult(row));
        });
    }
    approveWorking(invocation, proposalId, approval) {
        return this.perform(invocation, 'working.approve', proposalId, {
            proposalId,
            approval
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const proposal = this.proposalRow(workspaceId, proposalId);
            if (proposal.state !== 'proposed') fail('PROPOSAL_NOT_PENDING', 'proposal is no longer pending');
            assertApprovalBinding(workspaceId, proposalId, proposal.hash, approval);
            const current = this.database.prepare('SELECT COALESCE(MAX(revision),0) AS revision FROM working_revisions WHERE workspace_id=? AND key=?').get(workspaceId, proposal.key).revision;
            if (current !== proposal.base_revision) fail('STALE_PROPOSAL', 'working state changed after this proposal was created');
            const committedAt = this.now();
            const id = `object:${randomUUID()}`;
            this.database.exec('BEGIN IMMEDIATE');
            try {
                this.database.prepare('INSERT INTO working_revisions VALUES (?,?,?,?,?,?,?,?)').run(workspaceId, id, proposal.key, current + 1, proposal.value_json, proposal.hash, proposalId, committedAt);
                this.database.prepare("UPDATE working_proposals SET state='approved',decided_at=?,decided_by=? WHERE workspace_id=? AND id=?").run(committedAt, invocation.context.actorId, workspaceId, proposalId);
                this.database.exec('COMMIT');
            } catch (error) {
                this.database.exec('ROLLBACK');
                throw error;
            }
            return {
                id,
                key: proposal.key,
                revision: current + 1,
                value: JSON.parse(proposal.value_json),
                hash: proposal.hash,
                proposalId,
                committedAt
            };
        });
    }
    rejectWorking(invocation, proposalId) {
        return this.decideProposal(invocation, proposalId, 'working.reject', 'rejected');
    }
    supersedeWorking(invocation, proposalId) {
        return this.decideProposal(invocation, proposalId, 'working.supersede', 'superseded');
    }
    decideProposal(invocation, proposalId, operation, state) {
        return this.perform(invocation, operation, proposalId, {
            proposalId
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const row = this.proposalRow(workspaceId, proposalId);
            if (row.state !== 'proposed') fail('PROPOSAL_NOT_PENDING', 'proposal is no longer pending');
            this.database.prepare('UPDATE working_proposals SET state=?,decided_at=?,decided_by=? WHERE workspace_id=? AND id=?').run(state, this.now(), invocation.context.actorId, workspaceId, proposalId);
            return this.proposalResult(row, state);
        });
    }
    proposalRow(workspaceId, id) {
        const row = this.database.prepare('SELECT id,key,base_revision,value_json,hash,state,created_at FROM working_proposals WHERE workspace_id=? AND id=?').get(workspaceId, id);
        if (!row) fail('PROPOSAL_NOT_FOUND', 'proposal is not visible in this workspace');
        return row;
    }
    proposalResult(row, state = row.state) {
        return {
            id: row.id,
            key: row.key,
            baseRevision: row.base_revision,
            value: JSON.parse(row.value_json),
            hash: row.hash,
            state,
            createdAt: row.created_at
        };
    }
    revisionResult(row) {
        return {
            id: row.id,
            key: row.key,
            revision: row.revision,
            value: JSON.parse(row.value_json),
            hash: row.hash,
            proposalId: row.proposal_id,
            committedAt: row.committed_at
        };
    }
    createArtifact(invocation, bytes, schema, provenance) {
        return this.saveArtifact(invocation, 'artifact.create', [], bytes, schema, provenance);
    }
    deriveArtifact(invocation, parentIds, bytes, schema, provenance) {
        if (parentIds.length === 0) fail('ARTIFACT_PARENT_REQUIRED', 'a derivation requires at least one parent');
        return this.saveArtifact(invocation, 'artifact.derive', parentIds, bytes, schema, provenance);
    }
    saveArtifact(invocation, operation, parentIds, bytes, schema, provenance) {
        return this.perform(invocation, operation, parentIds[0] ?? null, {
            parentIds,
            size: bytes.byteLength,
            schema,
            provenance
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            for (const parent of parentIds)this.artifactRow(workspaceId, parent);
            const payload = this.store.putPayload(workspaceId, bytes);
            const id = `object:${randomUUID()}`;
            const createdAt = this.now();
            const schemaHash = contentHash(schema);
            this.database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?)').run(workspaceId, id, payload.hash, payload.size, canonicalJson(schema), schemaHash, canonicalJson(parentIds), canonicalJson(provenance), createdAt);
            return {
                id,
                hash: payload.hash,
                size: payload.size,
                schema,
                schemaHash,
                parentIds: [
                    ...parentIds
                ],
                provenance,
                createdAt
            };
        });
    }
    readArtifact(invocation, id) {
        return this.perform(invocation, 'artifact.read', id, {
            id
        }, ()=>{
            const row = this.artifactRow(this.workspace(invocation), id);
            return this.store.readPayload(invocation.context.workspaceId, row.hash);
        });
    }
    inspectArtifact(invocation, id) {
        return this.perform(invocation, 'artifact.read', id, {
            id,
            metadataOnly: true
        }, ()=>this.artifactResult(this.artifactRow(this.workspace(invocation), id)));
    }
    listArtifacts(invocation) {
        return this.perform(invocation, 'artifact.read', null, {
            list: true
        }, ()=>{
            const workspaceId = this.workspace(invocation);
            const rows = this.database.prepare('SELECT id,hash,size,schema_json,schema_hash,parents_json,provenance_json,created_at FROM artifacts WHERE workspace_id=? ORDER BY created_at,id').all(workspaceId);
            return rows.map((row)=>this.artifactResult(row));
        });
    }
    artifactRow(workspaceId, id) {
        const row = this.database.prepare('SELECT id,hash,size,schema_json,schema_hash,parents_json,provenance_json,created_at FROM artifacts WHERE workspace_id=? AND id=?').get(workspaceId, id);
        if (!row) fail('ARTIFACT_NOT_FOUND', 'artifact is not visible in this workspace');
        return row;
    }
    artifactResult(row) {
        return {
            id: row.id,
            hash: row.hash,
            size: row.size,
            schema: JSON.parse(row.schema_json),
            schemaHash: row.schema_hash,
            parentIds: JSON.parse(row.parents_json),
            provenance: JSON.parse(row.provenance_json),
            createdAt: row.created_at
        };
    }
    auditEvents() {
        this.ensureOpen();
        return this.database.prepare('SELECT event_json FROM workflow_audit ORDER BY sequence').all().map((row)=>JSON.parse(row.event_json));
    }
    close() {
        if (!this.closed) {
            this.database.close();
            this.closed = true;
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/memory-workflows.ts