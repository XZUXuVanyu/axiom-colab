import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { captureCandidateFiles, safeCandidateRelativePath } from './candidate-content.js';
import { LABORATORY_PROTOCOL_VERSION, canonicalJson, contentHash } from './laboratory-contract.js';
export class InstalledExecutableLoadError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'InstalledExecutableLoadError';
    }
}
function fail(code, message) {
    throw new InstalledExecutableLoadError(code, message);
}
function contained(root, path) {
    const rel = relative(root, path);
    return rel === '' || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function byteHash(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
export function installedExecutableEvidenceBinding(value) {
    const { evidenceHash: _hash, ...binding } = value;
    return binding;
}
export class InstalledExecutableLoader {
    authority;
    constructor(authority){
        this.authority = authority;
    }
    load(registration, evidence) {
        if (evidence.evidenceHash !== contentHash(installedExecutableEvidenceBinding(evidence)) || !this.authority.isLoadEligible(evidence)) {
            fail('UNAUTHENTICATED_EXECUTABLE_EVIDENCE', 'executable evidence is not authenticated by the trusted build boundary');
        }
        if (evidence.workspaceId !== registration.workspaceId || evidence.installationId !== registration.installationId || evidence.installationEvidenceHash !== registration.installationEvidenceHash || evidence.candidateId !== registration.candidateId || evidence.candidateHash !== registration.candidateHash || evidence.descriptorHash !== registration.descriptorHash || evidence.sourceHash !== registration.sourceHash || evidence.publicName !== registration.publicName) {
            fail('EXECUTABLE_BINDING_MISMATCH', 'executable evidence does not bind the exact installed candidate');
        }
        this.verifyInstalledCandidate(registration);
        const executable = resolve(registration.installedRoot, evidence.relativeExecutablePath);
        if (isAbsolute(evidence.relativeExecutablePath) || !contained(registration.installedRoot, executable)) {
            fail('EXECUTABLE_PATH_ESCAPE', 'executable path escaped the exact installed candidate root');
        }
        let executableBytes;
        try {
            executableBytes = readFileSync(executable);
        } catch  {
            fail('EXECUTABLE_NOT_FOUND', 'bound executable bytes are unavailable');
        }
        if (byteHash(executableBytes) !== evidence.executableHash) {
            fail('EXECUTABLE_BYTES_CHANGED', 'executable bytes no longer match authenticated build evidence');
        }
        return Object.freeze({
            executable,
            workspaceId: evidence.workspaceId,
            installationId: evidence.installationId,
            installationEvidenceHash: evidence.installationEvidenceHash,
            executableEvidenceId: evidence.executableEvidenceId,
            executableEvidenceHash: evidence.evidenceHash,
            candidateId: evidence.candidateId,
            candidateHash: evidence.candidateHash,
            descriptorHash: evidence.descriptorHash,
            sourceHash: evidence.sourceHash,
            executableHash: evidence.executableHash,
            publicName: evidence.publicName
        });
    }
    verifyInstalledCandidate(registration) {
        let descriptor;
        try {
            descriptor = JSON.parse(readFileSync(resolve(registration.installedRoot, 'descriptor.json'), 'utf8'));
        } catch  {
            fail('INSTALLED_CANDIDATE_CHANGED', 'installed descriptor is missing or malformed');
        }
        const sources = registration.sources.map((source)=>{
            const path = safeCandidateRelativePath(source.path, 'installed executable source path');
            try {
                return {
                    path,
                    content: readFileSync(resolve(registration.installedRoot, 'source', path))
                };
            } catch  {
                fail('INSTALLED_CANDIDATE_CHANGED', 'installed source bytes are missing');
            }
        });
        const bindings = captureCandidateFiles(sources, 'installed executable sources').map((file)=>file.binding);
        if (contentHash(descriptor) !== registration.descriptorHash || contentHash(bindings) !== registration.sourceHash || canonicalJson(bindings) !== canonicalJson(registration.sources)) {
            fail('INSTALLED_CANDIDATE_CHANGED', 'installed candidate bytes changed after installation');
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/installed-executable-loader.ts