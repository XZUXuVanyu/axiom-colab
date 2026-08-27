import { createServer } from 'node:http';
import { AuthenticatedMemoryService, memoryServiceErrorCode } from './authenticated-memory-service.js';
function json(response, status, body) {
    const encoded = JSON.stringify(body);
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(encoded),
        'cache-control': 'no-store'
    });
    response.end(encoded);
}
export class AuthenticatedMemoryHttpServer {
    service;
    server;
    host;
    maxRequestBytes;
    endpointValue;
    constructor(service, options = {}){
        this.service = service;
        this.host = options.host ?? '127.0.0.1';
        this.maxRequestBytes = options.maxRequestBytes ?? 1024 * 1024;
        if (!Number.isSafeInteger(this.maxRequestBytes) || this.maxRequestBytes <= 0) {
            throw new TypeError('maxRequestBytes must be a positive safe integer');
        }
        this.server = createServer((request, response)=>{
            void this.handle(request, response);
        });
    }
    get endpoint() {
        if (this.endpointValue === undefined) throw new Error('memory HTTP service is not listening');
        return this.endpointValue;
    }
    async listen() {
        if (this.endpointValue !== undefined) return this.endpointValue;
        await new Promise((resolve, reject)=>{
            const onError = (error)=>reject(error);
            this.server.once('error', onError);
            this.server.listen(0, this.host, ()=>{
                this.server.off('error', onError);
                resolve();
            });
        });
        const address = this.server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('memory HTTP service did not receive a TCP address');
        }
        const authority = this.host === '::1' ? `[${this.host}]` : this.host;
        const origin = `http://${authority}:${address.port}`;
        this.endpointValue = {
            origin,
            invokeUrl: `${origin}/v1/memory/invoke`
        };
        return this.endpointValue;
    }
    async close() {
        if (!this.server.listening) {
            this.endpointValue = undefined;
            return;
        }
        await new Promise((resolve, reject)=>{
            this.server.close((error)=>error === undefined ? resolve() : reject(error));
        });
        this.endpointValue = undefined;
    }
    async handle(request, response) {
        if (request.method !== 'POST' || request.url !== '/v1/memory/invoke') {
            json(response, 404, {
                ok: false,
                error: {
                    code: 'MEMORY_ROUTE_NOT_FOUND',
                    message: 'route not found'
                }
            });
            return;
        }
        const authorization = request.headers.authorization;
        if (authorization === undefined || !authorization.startsWith('Bearer ') || authorization.length === 'Bearer '.length) {
            json(response, 401, {
                ok: false,
                error: {
                    code: 'MEMORY_AUTHENTICATION_FAILED',
                    message: 'Bearer authentication is required'
                }
            });
            return;
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const value of request){
                const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
                size += chunk.length;
                if (size > this.maxRequestBytes) {
                    json(response, 413, {
                        ok: false,
                        error: {
                            code: 'MEMORY_REQUEST_TOO_LARGE',
                            message: 'HTTP request exceeds the service limit'
                        }
                    });
                    request.destroy();
                    return;
                }
                chunks.push(chunk);
            }
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const result = this.service.invoke({
                ...parsed,
                bearerToken: authorization.slice('Bearer '.length)
            });
            json(response, 200, {
                ok: true,
                result
            });
        } catch (error) {
            const code = memoryServiceErrorCode(error);
            const status = code === 'MEMORY_AUTHENTICATION_FAILED' ? 401 : 400;
            json(response, status, {
                ok: false,
                error: {
                    code,
                    message: error instanceof Error ? error.message.replace(/^\[[^\]]+\]\s*/, '') : 'memory service failed'
                }
            });
        }
    }
}


//# sourceURL=file:///D:/Dev/axiom-colab/source/ts/authenticated-memory-http.ts