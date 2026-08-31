import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InstalledExecutableLoader, installedExecutableEvidenceBinding } from './installed-executable-loader.js';
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash } from './laboratory-contract.js';
import { ProcessRunner } from './process-runner.js';
export class ShellFreeInstalledExecutableBuildBackend {
    options;
    runner;
    constructor(options){
        this.options = options;
        if (options.commands.length === 0) fail('INVALID_BUILD_PROFILE', 'executable build profile must contain commands');
        this.runner = options.runner ?? new ProcessRunner();
    }
    async build(registration) {
        const expand = (value)=>value.replaceAll('{publicName}', registration.publicName);
        for (const command of this.options.commands){
            if (!isAbsolute(command.executable)) fail('INVALID_BUILD_PROFILE', 'build command executable must be absolute');
            if (command.pathPrepend?.some((path)=>!isAbsolute(path))) fail('INVALID_BUILD_PROFILE', 'build PATH entries must be absolute');
            const cwd = resolve(registration.installedRoot, expand(command.cwd));
            if (isAbsolute(command.cwd) || !contained(registration.installedRoot, cwd)) fail('BUILD_PATH_ESCAPE', 'build working directory escaped the installation');
            const result = await this.runner.run(command.executable, {
                ...this.options.limits,
                args: command.args.map(expand),
                cwd,
                pathPrepend: command.pathPrepend
            });
            if (result.exitCode !== 0) fail('EXECUTABLE_BUILD_FAILED', `trusted build command exited with ${result.exitCode}`);
        }
        const output = resolve(registration.installedRoot, expand(this.options.outputPath));
        if (isAbsolute(this.options.outputPath) || !contained(registration.installedRoot, output)) fail('BUILD_PATH_ESCAPE', 'build output escaped the installation');
        let bytes;
        try {
            bytes = readFileSync(output);
        } catch  {
            fail('EXECUTABLE_BUILD_OUTPUT_MISSING', 'trusted build profile did not produce its configured output');
        }
        return {
            bytes,
            relativeExecutablePath: expand(this.options.installedPath)
        };
    }
}
export class InstalledExecutableAuthorityError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'InstalledExecutableAuthorityError';
    }
}
function fail(code, message) {
    throw new InstalledExecutableAuthorityError(code, message);
}
function contained(root, path) {
    const rel = relative(root, path);
    return rel === '' || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function bytesHash(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
export class LocalInstalledExecutableAuthority {
    backend;
    actorId;
    now;
    idFactory;
    database;
    loader;
    constructor(databasePath, backend, actorId, now = ()=>new Date(), idFactory = randomUUID){
        this.backend = backend;
        this.actorId = actorId;
        this.now = now;
        this.idFactory = idFactory;
        mkdirSync(dirname(resolve(databasePath)), {
            recursive: true
        });
        this.database = new DatabaseSync(resolve(databasePath));
        this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS installed_executables (
        executable_evidence_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        installation_id TEXT NOT NULL UNIQUE,
        evidence_hash TEXT NOT NULL UNIQUE,
        public_json TEXT NOT NULL
      ) STRICT;
    `);
        this.loader = new InstalledExecutableLoader(this);
    }
    async prepare(registration) {
        const existing = this.find(registration);
        if (existing !== null) return this.loader.load(registration, existing);
        const built = await this.backend.build(structuredClone(registration));
        if (!(built.bytes instanceof Uint8Array) || built.bytes.byteLength === 0) fail('INVALID_BUILD_OUTPUT', 'trusted build backend returned no executable bytes');
        if (isAbsolute(built.relativeExecutablePath)) fail('EXECUTABLE_PATH_ESCAPE', 'build output path must be relative to the installation');
        const executable = resolve(registration.installedRoot, built.relativeExecutablePath);
        if (!contained(registration.installedRoot, executable)) fail('EXECUTABLE_PATH_ESCAPE', 'build output escaped the exact installation');
        const staging = `${executable}.staging-${this.idFactory()}`;
        mkdirSync(dirname(executable), {
            recursive: true
        });
        let handle;
        try {
            handle = openSync(staging, 'wx');
            writeFileSync(handle, built.bytes);
            closeSync(handle);
            handle = undefined;
            renameSync(staging, executable);
        } catch (error) {
            if (handle !== undefined) closeSync(handle);
            rmSync(staging, {
                force: true
            });
            throw error;
        }
        const base = {
            protocolVersion: LABORATORY_PROTOCOL_VERSION,
            executableEvidenceId: `evidence:${this.idFactory()}`,
            workspaceId: registration.workspaceId,
            installationId: registration.installationId,
            installationEvidenceHash: registration.installationEvidenceHash,
            candidateId: registration.candidateId,
            candidateHash: registration.candidateHash,
            descriptorHash: registration.descriptorHash,
            sourceHash: registration.sourceHash,
            publicName: registration.publicName,
            relativeExecutablePath: built.relativeExecutablePath,
            executableHash: bytesHash(built.bytes),
            producedAt: this.now().toISOString(),
            producedBy: this.actorId
        };
        const evidence = {
            ...base,
            evidenceHash: contentHash(base)
        };
        try {
            this.database.prepare(`INSERT INTO installed_executables
        (executable_evidence_id, workspace_id, installation_id, evidence_hash, public_json)
        VALUES (?, ?, ?, ?, ?)`).run(evidence.executableEvidenceId, evidence.workspaceId, evidence.installationId, evidence.evidenceHash, canonicalJson(evidence));
        } catch (error) {
            rmSync(executable, {
                force: true
            });
            throw error;
        }
        return this.loader.load(registration, evidence);
    }
    isLoadEligible(evidence) {
        const row = this.database.prepare('SELECT public_json FROM installed_executables WHERE executable_evidence_id = ? AND evidence_hash = ?').get(evidence.executableEvidenceId, evidence.evidenceHash);
        if (row === undefined) return false;
        try {
            const stored = JSON.parse(row.public_json);
            return canonicalJson(stored) === canonicalJson(evidence) && evidence.evidenceHash === contentHash(installedExecutableEvidenceBinding(evidence));
        } catch  {
            return false;
        }
    }
    close() {
        this.database.close();
    }
    find(registration) {
        const row = this.database.prepare('SELECT public_json FROM installed_executables WHERE installation_id = ?').get(registration.installationId);
        if (row === undefined) return null;
        let evidence;
        try {
            evidence = JSON.parse(row.public_json);
        } catch  {
            fail('CORRUPT_EXECUTABLE_EVIDENCE', 'stored executable evidence is malformed');
        }
        if (evidence.workspaceId !== registration.workspaceId) fail('EXECUTABLE_BINDING_MISMATCH', 'stored executable evidence belongs to another workspace');
        return evidence;
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/installed-executable-authority.ts