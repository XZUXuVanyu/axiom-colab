import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import {
  AuthenticatedMemoryService,
  memoryServiceErrorCode,
  type MemoryServiceRequest,
} from './authenticated-memory-service.js'

export interface MemoryServiceEndpoint {
  readonly origin: string
  readonly invokeUrl: string
}

export interface MemoryServiceHttpOptions {
  readonly host?: '127.0.0.1' | '::1'
  readonly maxRequestBytes?: number
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(encoded),
    'cache-control': 'no-store',
  })
  response.end(encoded)
}

export class AuthenticatedMemoryHttpServer {
  private readonly server: Server
  private readonly host: '127.0.0.1' | '::1'
  private readonly maxRequestBytes: number
  private endpointValue: MemoryServiceEndpoint | undefined

  constructor(
    private readonly service: AuthenticatedMemoryService,
    options: MemoryServiceHttpOptions = {},
  ) {
    this.host = options.host ?? '127.0.0.1'
    this.maxRequestBytes = options.maxRequestBytes ?? 1024 * 1024
    if (!Number.isSafeInteger(this.maxRequestBytes) || this.maxRequestBytes <= 0) {
      throw new TypeError('maxRequestBytes must be a positive safe integer')
    }
    this.server = createServer((request, response) => {
      void this.handle(request, response)
    })
  }

  get endpoint(): MemoryServiceEndpoint {
    if (this.endpointValue === undefined) throw new Error('memory HTTP service is not listening')
    return this.endpointValue
  }

  async listen(): Promise<MemoryServiceEndpoint> {
    if (this.endpointValue !== undefined) return this.endpointValue
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      this.server.once('error', onError)
      this.server.listen(0, this.host, () => {
        this.server.off('error', onError)
        resolve()
      })
    })
    const address = this.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('memory HTTP service did not receive a TCP address')
    }
    const authority = this.host === '::1' ? `[${this.host}]` : this.host
    const origin = `http://${authority}:${address.port}`
    this.endpointValue = { origin, invokeUrl: `${origin}/v1/memory/invoke` }
    return this.endpointValue
  }

  async close(): Promise<void> {
    if (!this.server.listening) { this.endpointValue = undefined; return }
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error === undefined ? resolve() : reject(error))
    })
    this.endpointValue = undefined
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/v1/memory/invoke') {
      json(response, 404, { ok: false, error: { code: 'MEMORY_ROUTE_NOT_FOUND', message: 'route not found' } })
      return
    }
    const authorization = request.headers.authorization
    if (authorization === undefined || !authorization.startsWith('Bearer ')
      || authorization.length === 'Bearer '.length) {
      json(response, 401, { ok: false, error: { code: 'MEMORY_AUTHENTICATION_FAILED', message: 'Bearer authentication is required' } })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const value of request) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
        size += chunk.length
        if (size > this.maxRequestBytes) {
          json(response, 413, { ok: false, error: { code: 'MEMORY_REQUEST_TOO_LARGE', message: 'HTTP request exceeds the service limit' } })
          request.destroy()
          return
        }
        chunks.push(chunk)
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Omit<MemoryServiceRequest, 'bearerToken'>
      const result = this.service.invoke({
        ...parsed,
        bearerToken: authorization.slice('Bearer '.length),
      })
      json(response, 200, { ok: true, result })
    } catch (error) {
      const code = memoryServiceErrorCode(error)
      const status = code === 'MEMORY_AUTHENTICATION_FAILED' ? 401 : 400
      json(response, status, {
        ok: false,
        error: {
          code,
          message: error instanceof Error ? error.message.replace(/^\[[^\]]+\]\s*/, '') : 'memory service failed',
        },
      })
    }
  }
}
