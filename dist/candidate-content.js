import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
export class CandidateContentError extends Error {
    code;
    constructor(code, message){
        super(`[${code}] ${message}`), this.code = code;
        this.name = 'CandidateContentError';
    }
}
function fail(code, message) {
    throw new CandidateContentError(code, message);
}
function byteContent(content) {
    return typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
}
function byteHash(content) {
    return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
export function safeCandidateRelativePath(value, field) {
    if (value.length === 0 || isAbsolute(value) || value.includes('\0')) {
        fail('INVALID_SNAPSHOT_PATH', `${field} must be a non-empty relative path`);
    }
    const normalized = value.replaceAll('\\', '/');
    if (normalized.split('/').some((part)=>part === '' || part === '.' || part === '..')) {
        fail('INVALID_SNAPSHOT_PATH', `${field} must use canonical relative path segments`);
    }
    const resolved = resolve('snapshot-root', normalized);
    const rel = relative(resolve('snapshot-root'), resolved);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        fail('SNAPSHOT_PATH_ESCAPE', `${field} escapes the candidate snapshot`);
    }
    return normalized;
}
export function captureCandidateFiles(files, field) {
    const paths = new Set();
    return files.map((file, index)=>{
        const path = safeCandidateRelativePath(file.path, `${field}[${index}].path`);
        if (paths.has(path)) fail('DUPLICATE_SNAPSHOT_PATH', `${field} contains duplicate path ${path}`);
        paths.add(path);
        const bytes = Buffer.from(byteContent(file.content));
        return {
            path,
            bytes,
            binding: {
                path,
                size: bytes.byteLength,
                hash: byteHash(bytes)
            }
        };
    }).sort((left, right)=>left.path.localeCompare(right.path));
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/candidate-content.ts