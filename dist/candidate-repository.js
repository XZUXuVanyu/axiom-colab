import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { captureCandidateFiles } from './candidate-content.js';
import { installationProposalBinding } from './tool-installation-proposal.js';
import { installationClaimBinding, installationEvidenceBinding } from './tool-installation.js';
import { canonicalJson, contentHash } from './laboratory-contract.js';
export class CandidateRepositoryError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'CandidateRepositoryError';
    }
}
function fail(code, message) {
    throw new CandidateRepositoryError(code, message);
}
function digest(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function bytesHash(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function candidateBinding(revision) {
    return {
        workspaceId: revision.workspaceId,
        candidateId: revision.candidateId,
        specificationId: revision.specificationId,
        specificationHash: revision.specificationHash,
        revision: revision.revision,
        parentCandidateHash: revision.parentCandidateHash,
        descriptorHash: revision.descriptorHash,
        sourceHash: revision.sourceHash,
        sources: revision.sources
    };
}
function specificationBinding(specification) {
    return {
        workspaceId: specification.workspaceId,
        createdBy: specification.createdBy,
        problem: specification.problem,
        publicName: specification.publicName,
        description: specification.description,
        inputSchema: specification.inputSchema,
        outputSchema: specification.outputSchema,
        requestedPermissions: specification.requestedPermissions,
        acceptanceCriteria: specification.acceptanceCriteria,
        constraints: specification.constraints ?? []
    };
}
function snapshotBinding(snapshot) {
    const { protocolVersion: _protocol, snapshotId: _id, createdAt: _created, snapshotHash: _hash, ...binding } = snapshot;
    return binding;
}
function validRecord(record) {
    const { recordHash, ...binding } = record;
    return recordHash === contentHash(binding);
}
function approvalBinding(value) {
    return {
        protocolVersion: value.protocolVersion,
        approvalId: value.approvalId,
        workspaceId: value.workspaceId,
        proposalId: value.proposalId,
        proposalHash: value.proposalHash,
        decision: value.decision,
        approvedAt: value.approvedAt,
        approvedBy: value.approvedBy
    };
}
function parsed(value, code) {
    try {
        return JSON.parse(value);
    } catch  {
        fail(code, 'stored canonical JSON is malformed');
    }
}
function sourceJson(files) {
    return canonicalJson(files.map((file)=>({
            path: file.path,
            contentBase64: Buffer.from(typeof file.content === 'string' ? Buffer.from(file.content) : file.content).toString('base64')
        })));
}
function sourceFiles(value) {
    const rows = parsed(value, 'CORRUPT_CANDIDATE_PAYLOAD');
    if (!Array.isArray(rows) || !rows.every((row)=>typeof row?.path === 'string' && typeof row?.contentBase64 === 'string')) {
        fail('CORRUPT_CANDIDATE_PAYLOAD', 'stored candidate source manifest is invalid');
    }
    return rows.map((row)=>({
            path: row.path,
            content: Buffer.from(row.contentBase64, 'base64')
        }));
}
function encodedFiles(value, field) {
    if (!Array.isArray(value) || !value.every((row)=>typeof row === 'object' && row !== null && typeof row.path === 'string' && typeof row.contentBase64 === 'string')) {
        fail('INVALID_VALIDATION_EVIDENCE', `${field} payload is malformed`);
    }
    return value.map((row)=>{
        const item = row;
        return {
            path: item.path,
            content: Buffer.from(item.contentBase64, 'base64')
        };
    });
}
function suiteDefinitionHash(commands, salt) {
    const definition = commands.map((value)=>{
        if (typeof value !== 'object' || value === null) fail('INVALID_VALIDATION_EVIDENCE', 'private suite command is malformed');
        const command = value;
        if (typeof command.commandId !== 'string' || typeof command.executable !== 'string' || command.args !== undefined && (!Array.isArray(command.args) || !command.args.every((item)=>typeof item === 'string')) || command.stdin !== undefined && typeof command.stdin !== 'string' || command.cwd !== undefined && typeof command.cwd !== 'string') {
            fail('INVALID_VALIDATION_EVIDENCE', 'private suite command is malformed');
        }
        return {
            commandId: command.commandId,
            executable: command.executable,
            args: command.args ?? [],
            stdinHash: contentHash(command.stdin ?? ''),
            cwd: command.cwd ?? '.'
        };
    });
    return salt === null ? contentHash(definition) : contentHash({
        salt,
        definition
    });
}
function assertPrivateValidationBinding(snapshot, value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('INVALID_VALIDATION_EVIDENCE', 'private validation payload is malformed');
    const payload = value;
    const challengeSalt = payload.challengeCommitmentSalt;
    if (typeof challengeSalt !== 'string' || !/^[a-f0-9]{64}$/.test(challengeSalt)) {
        fail('INVALID_VALIDATION_EVIDENCE', 'private challenge commitment salt is malformed');
    }
    const sources = captureCandidateFiles(encodedFiles(payload.sources, 'sources'), 'sources').map((file)=>file.binding);
    const fixtures = captureCandidateFiles(encodedFiles(payload.fixtures, 'fixtures'), 'fixtures').map((file)=>file.binding);
    if (contentHash(payload.descriptor) !== snapshot.descriptorHash || contentHash(sources) !== snapshot.sourceHash || contentHash(fixtures) !== snapshot.fixtureHash || canonicalJson(sources) !== canonicalJson(snapshot.sources) || canonicalJson(fixtures) !== canonicalJson(snapshot.fixtures) || contentHash(payload.toolchain) !== snapshot.toolchainHash || contentHash(payload.policy) !== snapshot.policyHash || !Array.isArray(payload.suites)) {
        fail('INVALID_VALIDATION_EVIDENCE', 'private payload does not match the public validation snapshot');
    }
    for (const binding of snapshot.suites){
        const suite = payload.suites.find((item)=>typeof item === 'object' && item !== null && item.suiteId === binding.suiteId && item.kind === binding.kind);
        const expectedCommitment = binding.kind === 'challenge' ? 'salted-sha256' : 'plain-sha256';
        const salt = binding.kind === 'challenge' ? challengeSalt : null;
        if (binding.commitment !== expectedCommitment || suite === undefined || !Array.isArray(suite.commands) || suite.commands.length !== binding.commandCount || suiteDefinitionHash(suite.commands, salt) !== binding.definitionHash) {
            fail('INVALID_VALIDATION_EVIDENCE', 'private suite definitions do not match the public validation snapshot');
        }
    }
}
export class LocalCandidateRepository {
    databasePath;
    database;
    closed = false;
    constructor(path){
        this.databasePath = resolve(path);
        mkdirSync(dirname(this.databasePath), {
            recursive: true
        });
        this.database = new DatabaseSync(this.databasePath);
        this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        this.migrate();
    }
    migrate() {
        let version = this.database.prepare('PRAGMA user_version').get().user_version;
        if (version > 3) fail('UNSUPPORTED_CANDIDATE_STORE_VERSION', `candidate schema version ${version} is newer than supported version 3`);
        if (version === 0) this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE specifications (
        workspace_id TEXT NOT NULL,
        specification_id TEXT NOT NULL,
        specification_hash TEXT NOT NULL,
        public_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id, specification_id)
      ) STRICT;
      CREATE TABLE candidate_revisions (
        workspace_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        specification_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK(revision > 0),
        candidate_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('current','superseded')),
        public_json TEXT NOT NULL,
        descriptor_json TEXT NOT NULL,
        sources_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id, revision_id),
        UNIQUE(workspace_id, candidate_id, revision),
        UNIQUE(workspace_id, candidate_hash)
      ) STRICT;
      CREATE INDEX candidate_history ON candidate_revisions(workspace_id, candidate_id, revision);
      CREATE TABLE validator_credentials (
        token_digest TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        revoked INTEGER NOT NULL CHECK(revoked IN (0,1)) DEFAULT 0
      ) STRICT;
      CREATE TABLE validations (
        workspace_id TEXT NOT NULL,
        validation_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        record_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        record_json TEXT NOT NULL,
        private_payload_json TEXT NOT NULL,
        private_payload_hash TEXT NOT NULL,
        PRIMARY KEY(workspace_id, validation_id),
        UNIQUE(workspace_id, record_hash)
      ) STRICT;
      PRAGMA user_version = 1;
      COMMIT;
    `);
        if (version === 0) version = 1;
        if (version === 1) this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE installation_proposals (
        workspace_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        proposal_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('proposed','approved','rejected')),
        public_json TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        PRIMARY KEY(workspace_id,proposal_id),
        UNIQUE(workspace_id,proposal_hash)
      ) STRICT;
      CREATE TABLE installation_approvals (
        workspace_id TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        approval_hash TEXT NOT NULL,
        public_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id,approval_id),
        UNIQUE(workspace_id,proposal_id),
        UNIQUE(workspace_id,approval_hash),
        FOREIGN KEY(workspace_id,proposal_id) REFERENCES installation_proposals(workspace_id,proposal_id)
      ) STRICT;
      PRAGMA user_version = 2;
      COMMIT;
    `);
        if (version <= 1) version = 2;
        if (version === 2) this.database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE installation_claims (
        workspace_id TEXT NOT NULL,
        installation_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        candidate_hash TEXT NOT NULL,
        claim_hash TEXT NOT NULL,
        public_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id,installation_id),
        UNIQUE(workspace_id,proposal_id),
        UNIQUE(workspace_id,approval_id),
        UNIQUE(workspace_id,claim_hash),
        FOREIGN KEY(workspace_id,proposal_id) REFERENCES installation_proposals(workspace_id,proposal_id)
      ) STRICT;
      CREATE TABLE installation_evidence (
        workspace_id TEXT NOT NULL,
        installation_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('installed','failed')),
        evidence_hash TEXT NOT NULL,
        public_json TEXT NOT NULL,
        PRIMARY KEY(workspace_id,installation_id),
        UNIQUE(workspace_id,evidence_hash),
        FOREIGN KEY(workspace_id,installation_id) REFERENCES installation_claims(workspace_id,installation_id)
      ) STRICT;
      CREATE INDEX installed_tool_discovery ON installation_evidence(workspace_id,outcome,installation_id);
      PRAGMA user_version = 3;
      COMMIT;
    `);
    }
    ensureOpen() {
        if (this.closed) fail('CANDIDATE_STORE_CLOSED', 'candidate repository is closed');
    }
    saveSpecification(specification) {
        this.ensureOpen();
        if (specification.specificationHash !== contentHash(specificationBinding(specification))) {
            fail('SPECIFICATION_HASH_MISMATCH', 'specification does not match its content hash');
        }
        const existing = this.database.prepare('SELECT public_json FROM specifications WHERE workspace_id=? AND specification_id=?').get(specification.workspaceId, specification.specificationId);
        const value = canonicalJson(specification);
        if (existing !== undefined) {
            if (existing.public_json !== value) fail('IMMUTABLE_SPECIFICATION', 'stored specification cannot be replaced');
            return;
        }
        this.database.prepare('INSERT INTO specifications VALUES (?,?,?,?)').run(specification.workspaceId, specification.specificationId, specification.specificationHash, value);
    }
    readSpecification(workspaceId, specificationId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT public_json FROM specifications WHERE workspace_id=? AND specification_id=?').get(workspaceId, specificationId);
        if (row === undefined) return null;
        const specification = parsed(row.public_json, 'CORRUPT_SPECIFICATION');
        if (specification.workspaceId !== workspaceId || specification.specificationId !== specificationId || specification.specificationHash !== contentHash(specificationBinding(specification))) {
            fail('CORRUPT_SPECIFICATION', 'stored specification failed its identity or hash binding');
        }
        return specification;
    }
    saveRevision(revision, descriptor, sources) {
        this.ensureOpen();
        if (revision.state !== 'current') fail('INVALID_CANDIDATE_STATE', 'a new stored revision must be current');
        if (contentHash(descriptor) !== revision.descriptorHash) fail('CANDIDATE_HASH_MISMATCH', 'descriptor does not match candidate revision');
        const captured = captureCandidateFiles(sources, 'sources');
        const bindings = captured.map((file)=>file.binding);
        if (canonicalJson(bindings) !== canonicalJson(revision.sources) || contentHash(bindings) !== revision.sourceHash || contentHash(candidateBinding(revision)) !== revision.candidateHash) {
            fail('CANDIDATE_HASH_MISMATCH', 'source payload does not match candidate revision');
        }
        const specification = this.readSpecification(revision.workspaceId, revision.specificationId);
        if (specification === null || specification.specificationHash !== revision.specificationHash) {
            fail('SPECIFICATION_NOT_FOUND', 'bound specification is not stored in this workspace');
        }
        this.database.exec('BEGIN IMMEDIATE');
        try {
            if (revision.parentRevisionId !== null) {
                const parent = this.database.prepare("SELECT candidate_id,specification_id,revision,state,candidate_hash FROM candidate_revisions WHERE workspace_id=? AND revision_id=?").get(revision.workspaceId, revision.parentRevisionId);
                if (parent === undefined || parent.candidate_id !== revision.candidateId || parent.candidate_hash !== revision.parentCandidateHash) fail('CANDIDATE_REVISION_NOT_FOUND', 'parent revision does not match the candidate chain');
                if (parent.specification_id !== revision.specificationId || revision.revision !== parent.revision + 1) fail('INVALID_CANDIDATE_REVISION', 'candidate revision does not continue its specification and sequence');
                if (parent.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current stored revision can be revised');
                this.database.prepare("UPDATE candidate_revisions SET state='superseded' WHERE workspace_id=? AND revision_id=?").run(revision.workspaceId, revision.parentRevisionId);
            } else {
                const count = this.database.prepare('SELECT COUNT(*) AS count FROM candidate_revisions WHERE workspace_id=? AND (candidate_id=? OR specification_id=?)').get(revision.workspaceId, revision.candidateId, revision.specificationId);
                if (count.count !== 0 || revision.revision !== 1 || revision.parentCandidateHash !== null) fail('INVALID_CANDIDATE_ROOT', 'candidate root revision is invalid');
            }
            this.database.prepare('INSERT INTO candidate_revisions VALUES (?,?,?,?,?,?,?,?,?,?)').run(revision.workspaceId, revision.revisionId, revision.candidateId, revision.specificationId, revision.revision, revision.candidateHash, revision.state, canonicalJson(revision), canonicalJson(descriptor), sourceJson(sources));
            this.database.exec('COMMIT');
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }
    inspectRevision(workspaceId, revisionId) {
        const row = this.revisionRow(workspaceId, revisionId);
        if (row === null) return null;
        const revision = parsed(row.public_json, 'CORRUPT_CANDIDATE_REVISION');
        if (contentHash(candidateBinding(revision)) !== revision.candidateHash) fail('CORRUPT_CANDIDATE_REVISION', 'stored candidate binding is corrupt');
        return {
            ...revision,
            state: row.state
        };
    }
    listCandidateRevisions(workspaceId, candidateId) {
        this.ensureOpen();
        const rows = this.database.prepare('SELECT revision_id FROM candidate_revisions WHERE workspace_id=? AND candidate_id=? ORDER BY revision').all(workspaceId, candidateId);
        return rows.map((row)=>this.inspectRevision(workspaceId, row.revision_id)).filter((item)=>item !== null);
    }
    listSpecificationRevisions(workspaceId, specificationId) {
        this.ensureOpen();
        const rows = this.database.prepare('SELECT revision_id FROM candidate_revisions WHERE workspace_id=? AND specification_id=? ORDER BY revision').all(workspaceId, specificationId);
        return rows.map((row)=>this.inspectRevision(workspaceId, row.revision_id)).filter((item)=>item !== null);
    }
    materializeRevision(workspaceId, revisionId) {
        const row = this.revisionRow(workspaceId, revisionId);
        if (row === null) return null;
        const revision = this.inspectRevision(workspaceId, revisionId);
        if (revision === null) return null;
        const descriptor = parsed(row.descriptor_json, 'CORRUPT_CANDIDATE_PAYLOAD');
        const sources = sourceFiles(row.sources_json);
        const captured = captureCandidateFiles(sources, 'sources');
        if (contentHash(descriptor) !== revision.descriptorHash || contentHash(captured.map((file)=>file.binding)) !== revision.sourceHash) {
            fail('CORRUPT_CANDIDATE_PAYLOAD', 'stored descriptor or source bytes do not match the revision');
        }
        return {
            revision,
            descriptor,
            sources
        };
    }
    issueValidatorCredential(actorId) {
        this.ensureOpen();
        const token = randomBytes(32).toString('hex');
        this.database.prepare('INSERT INTO validator_credentials(token_digest,actor_id,revoked) VALUES (?,?,0)').run(digest(token), actorId);
        return token;
    }
    revokeValidatorCredential(token) {
        this.ensureOpen();
        this.database.prepare('UPDATE validator_credentials SET revoked=1 WHERE token_digest=?').run(digest(token));
    }
    recordValidation(token, result, privatePayload) {
        this.ensureOpen();
        const credential = this.database.prepare('SELECT actor_id,revoked FROM validator_credentials WHERE token_digest=?').get(digest(token));
        if (credential === undefined || credential.revoked !== 0) fail('VALIDATOR_NOT_AUTHENTICATED', 'validator credential is invalid or revoked');
        if (credential.actor_id !== result.record.validatorActorId) fail('VALIDATOR_ACTOR_MISMATCH', 'validator credential belongs to another actor');
        if (result.snapshot.workspaceId !== result.record.workspaceId || result.snapshot.candidateId !== result.record.candidateId || result.snapshot.snapshotHash !== result.record.candidateSnapshotHash || result.snapshot.snapshotHash !== contentHash(snapshotBinding(result.snapshot)) || !validRecord(result.record)) {
            fail('INVALID_VALIDATION_EVIDENCE', 'validation snapshot and record bindings are invalid');
        }
        assertPrivateValidationBinding(result.snapshot, privatePayload);
        const privateJson = canonicalJson(privatePayload);
        try {
            this.database.prepare('INSERT INTO validations VALUES (?,?,?,?,?,?,?,?,?)').run(result.record.workspaceId, result.record.validationId, result.record.candidateId, result.snapshot.snapshotHash, result.record.recordHash, canonicalJson(result.snapshot), canonicalJson(result.record), privateJson, bytesHash(Buffer.from(privateJson)));
        } catch (error) {
            if (String(error).includes('UNIQUE constraint failed')) fail('IMMUTABLE_VALIDATION_RECORD', 'validation record identity or hash is already stored');
            throw error;
        }
    }
    inspectValidation(workspaceId, validationId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT snapshot_json,record_json,private_payload_json,private_payload_hash FROM validations WHERE workspace_id=? AND validation_id=?').get(workspaceId, validationId);
        if (row === undefined) return null;
        const snapshot = parsed(row.snapshot_json, 'CORRUPT_VALIDATION_EVIDENCE');
        const record = parsed(row.record_json, 'CORRUPT_VALIDATION_EVIDENCE');
        if (snapshot.snapshotHash !== contentHash(snapshotBinding(snapshot)) || !validRecord(record) || record.candidateSnapshotHash !== snapshot.snapshotHash || bytesHash(Buffer.from(row.private_payload_json)) !== row.private_payload_hash) {
            fail('CORRUPT_VALIDATION_EVIDENCE', 'stored validation evidence failed integrity checks');
        }
        return {
            snapshot,
            record,
            privatePayloadHash: row.private_payload_hash
        };
    }
    isValidationAuthentic(snapshotHash, record) {
        try {
            const stored = this.inspectValidation(record.workspaceId, record.validationId);
            return stored !== null && stored.record.outcome === 'passed' && stored.snapshot.snapshotHash === snapshotHash && canonicalJson(stored.record) === canonicalJson(record);
        } catch  {
            return false;
        }
    }
    saveInstallationProposal(proposal) {
        this.ensureOpen();
        if (proposal.state !== 'proposed' || proposal.proposalHash !== contentHash(installationProposalBinding(proposal)) || proposal.permissionsHash !== contentHash(proposal.requestedPermissions)) fail('INVALID_INSTALLATION_PROPOSAL', 'installation proposal binding is invalid');
        this.database.prepare('INSERT INTO installation_proposals(workspace_id,proposal_id,proposal_hash,state,public_json) VALUES (?,?,?,?,?)').run(proposal.workspaceId, proposal.proposalId, proposal.proposalHash, proposal.state, canonicalJson(proposal));
    }
    inspectInstallationProposal(workspaceId, proposalId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT public_json,state FROM installation_proposals WHERE workspace_id=? AND proposal_id=?').get(workspaceId, proposalId);
        if (row === undefined) return null;
        const proposal = parsed(row.public_json, 'CORRUPT_INSTALLATION_PROPOSAL');
        if (proposal.workspaceId !== workspaceId || proposal.proposalId !== proposalId || proposal.proposalHash !== contentHash(installationProposalBinding(proposal)) || proposal.permissionsHash !== contentHash(proposal.requestedPermissions)) fail('CORRUPT_INSTALLATION_PROPOSAL', 'stored installation proposal failed its binding');
        return {
            ...proposal,
            state: row.state
        };
    }
    approveInstallationProposal(proposal, approval) {
        this.ensureOpen();
        if (approval.workspaceId !== proposal.workspaceId || approval.proposalId !== proposal.proposalId || approval.proposalHash !== proposal.proposalHash || approval.decision !== 'approved' || approval.approvalHash !== contentHash(approvalBinding(approval))) fail('INVALID_INSTALLATION_APPROVAL', 'approval does not bind the exact installation proposal');
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const changed = this.database.prepare("UPDATE installation_proposals SET state='approved',decided_at=?,decided_by=? WHERE workspace_id=? AND proposal_id=? AND state='proposed'").run(approval.approvedAt, approval.approvedBy, proposal.workspaceId, proposal.proposalId);
            if (changed.changes !== 1) fail('PROPOSAL_NOT_PENDING', 'installation proposal is no longer pending');
            this.database.prepare('INSERT INTO installation_approvals VALUES (?,?,?,?,?)').run(approval.workspaceId, approval.approvalId, approval.proposalId, approval.approvalHash, canonicalJson(approval));
            this.database.exec('COMMIT');
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }
    inspectInstallationApproval(workspaceId, proposalId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT public_json FROM installation_approvals WHERE workspace_id=? AND proposal_id=?').get(workspaceId, proposalId);
        if (row === undefined) return null;
        const approval = parsed(row.public_json, 'CORRUPT_INSTALLATION_APPROVAL');
        if (approval.workspaceId !== workspaceId || approval.proposalId !== proposalId || approval.decision !== 'approved' || approval.approvalHash !== contentHash(approvalBinding(approval))) fail('CORRUPT_INSTALLATION_APPROVAL', 'stored installation approval failed its binding');
        return approval;
    }
    rejectInstallationProposal(proposal, actorId, decidedAt) {
        this.ensureOpen();
        const changed = this.database.prepare("UPDATE installation_proposals SET state='rejected',decided_at=?,decided_by=? WHERE workspace_id=? AND proposal_id=? AND state='proposed'").run(decidedAt, actorId, proposal.workspaceId, proposal.proposalId);
        if (changed.changes !== 1) fail('PROPOSAL_NOT_PENDING', 'installation proposal is no longer pending');
    }
    claimInstallation(claim) {
        this.ensureOpen();
        if (claim.claimHash !== contentHash(installationClaimBinding(claim))) fail('INVALID_INSTALLATION_CLAIM', 'installation claim binding is invalid');
        const proposal = this.inspectInstallationProposal(claim.workspaceId, claim.proposalId);
        const approval = this.inspectInstallationApproval(claim.workspaceId, claim.proposalId);
        if (proposal === null || approval === null || proposal.state !== 'approved' || proposal.proposalHash !== claim.proposalHash || approval.approvalId !== claim.approvalId || approval.approvalHash !== claim.approvalHash || proposal.candidateId !== claim.candidateId || proposal.candidateHash !== claim.candidateHash) {
            fail('INVALID_INSTALLATION_CLAIM', 'installation claim does not consume the exact stored approval');
        }
        try {
            this.database.prepare('INSERT INTO installation_claims VALUES (?,?,?,?,?,?,?)').run(claim.workspaceId, claim.installationId, claim.proposalId, claim.approvalId, claim.candidateHash, claim.claimHash, canonicalJson(claim));
        } catch (error) {
            if (String(error).includes('UNIQUE constraint failed')) fail('INSTALLATION_APPROVAL_ALREADY_CONSUMED', 'installation approval or identity has already been consumed');
            throw error;
        }
    }
    recordInstallationEvidence(evidence) {
        this.ensureOpen();
        if (evidence.evidenceHash !== contentHash(installationEvidenceBinding(evidence)) || evidence.outcome === 'installed' === (evidence.failureCode !== null) || evidence.permissionsHash !== contentHash(evidence.requestedPermissions)) {
            fail('INVALID_INSTALLATION_EVIDENCE', 'installation evidence binding is invalid');
        }
        const row = this.database.prepare('SELECT public_json FROM installation_claims WHERE workspace_id=? AND installation_id=?').get(evidence.workspaceId, evidence.installationId);
        if (row === undefined) fail('INSTALLATION_CLAIM_NOT_FOUND', 'installation claim is not stored in this workspace');
        const claim = parsed(row.public_json, 'CORRUPT_INSTALLATION_CLAIM');
        if (claim.claimHash !== contentHash(installationClaimBinding(claim)) || claim.proposalId !== evidence.proposalId || claim.proposalHash !== evidence.proposalHash || claim.approvalId !== evidence.approvalId || claim.approvalHash !== evidence.approvalHash || claim.candidateId !== evidence.candidateId || claim.candidateHash !== evidence.candidateHash || claim.claimedBy !== evidence.completedBy) {
            fail('INVALID_INSTALLATION_EVIDENCE', 'installation evidence does not bind its exact claim');
        }
        try {
            this.database.prepare('INSERT INTO installation_evidence VALUES (?,?,?,?,?)').run(evidence.workspaceId, evidence.installationId, evidence.outcome, evidence.evidenceHash, canonicalJson(evidence));
        } catch (error) {
            if (String(error).includes('UNIQUE constraint failed')) fail('IMMUTABLE_INSTALLATION_EVIDENCE', 'installation evidence is already stored');
            throw error;
        }
    }
    inspectInstallationEvidence(workspaceId, installationId) {
        this.ensureOpen();
        const row = this.database.prepare('SELECT public_json FROM installation_evidence WHERE workspace_id=? AND installation_id=?').get(workspaceId, installationId);
        if (row === undefined) return null;
        const evidence = parsed(row.public_json, 'CORRUPT_INSTALLATION_EVIDENCE');
        if (evidence.workspaceId !== workspaceId || evidence.installationId !== installationId || evidence.evidenceHash !== contentHash(installationEvidenceBinding(evidence)) || evidence.outcome === 'installed' === (evidence.failureCode !== null) || evidence.permissionsHash !== contentHash(evidence.requestedPermissions)) {
            fail('CORRUPT_INSTALLATION_EVIDENCE', 'stored installation evidence failed its binding');
        }
        return evidence;
    }
    listInstalledTools(workspaceId) {
        this.ensureOpen();
        const rows = this.database.prepare("SELECT installation_id FROM installation_evidence WHERE workspace_id=? AND outcome='installed' ORDER BY installation_id").all(workspaceId);
        return rows.map((row)=>this.inspectInstallationEvidence(workspaceId, row.installation_id)).filter((value)=>value !== null);
    }
    revisionRow(workspaceId, revisionId) {
        this.ensureOpen();
        return this.database.prepare('SELECT public_json,state,descriptor_json,sources_json FROM candidate_revisions WHERE workspace_id=? AND revision_id=?').get(workspaceId, revisionId) ?? null;
    }
    close() {
        if (!this.closed) {
            this.database.close();
            this.closed = true;
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/candidate-repository.ts