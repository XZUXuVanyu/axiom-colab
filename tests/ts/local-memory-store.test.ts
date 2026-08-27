import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LocalMemoryStore, MemoryStoreError } from '../../dist/local-memory-store.js'

const roots: string[] = []
function root(): string { const value = join(tmpdir(), `axiom-memory-${crypto.randomUUID()}`); mkdirSync(value); roots.push(value); return value }
test.afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }) })
const hasCode = (code: string) => (error: unknown) => error instanceof MemoryStoreError && error.code === code

test('workspaces reopen after restart with intact payloads and resource accounting', () => {
  const directory = root(); const bytes = new TextEncoder().encode('restart-safe')
  let store = new LocalMemoryStore(directory)
  store.createWorkspace('workspace:alpha', { maxBytes: 100, maxObjects: 2 })
  const saved = store.putPayload('workspace:alpha', bytes); store.close()
  store = new LocalMemoryStore(directory)
  assert.deepEqual(store.readPayload('workspace:alpha', saved.hash), bytes)
  assert.deepEqual(store.reopenWorkspace('workspace:alpha'), { workspaceId: 'workspace:alpha', usedBytes: bytes.length, objectCount: 1, quota: { maxBytes: 100, maxObjects: 2 }, expiredObjects: 0, corruptObjects: 0 })
  store.close()
})

test('a crash after promotion cannot make an uncommitted payload visible', () => {
  const directory = root(); let fail = true
  let store = new LocalMemoryStore(directory, { faultInjector(point) { if (fail && point === 'after-payload-promotion') throw new Error('simulated crash') } })
  store.createWorkspace('workspace:alpha')
  assert.throws(() => store.putPayload('workspace:alpha', new Uint8Array([1, 2, 3])), /simulated crash/)
  store.close(); fail = false; store = new LocalMemoryStore(directory)
  assert.equal(store.resources('workspace:alpha').objectCount, 0)
  assert.deepEqual(readdirSync(join(directory, 'staging')), [])
  const promoted = readdirSync(join(directory, 'payloads'), { recursive: true }).filter((entry) => String(entry).length === 64)
  assert.deepEqual(promoted, [])
  store.close()
})

test('corruption is detected on restart and bytes are never returned', () => {
  const directory = root(); let store = new LocalMemoryStore(directory)
  store.createWorkspace('workspace:alpha'); const saved = store.putPayload('workspace:alpha', new Uint8Array([4, 5, 6])); store.close()
  const hex = saved.hash.slice(7); writeFileSync(join(directory, 'payloads', hex.slice(0, 2), hex), new Uint8Array([9, 9, 9]))
  store = new LocalMemoryStore(directory)
  assert.equal(store.inspectPayload('workspace:alpha', saved.hash).status, 'corrupt')
  assert.throws(() => store.readPayload('workspace:alpha', saved.hash), hasCode('CORRUPT_PAYLOAD'))
  assert.equal(store.resources('workspace:alpha').corruptObjects, 1); store.close()
})

test('quotas are enforced without partial metadata and expired objects stop consuming quota', () => {
  const directory = root(); let now = new Date('2026-08-27T00:00:00.000Z')
  const store = new LocalMemoryStore(directory, { now: () => now })
  store.createWorkspace('workspace:alpha', { maxBytes: 3, maxObjects: 1 })
  const saved = store.putPayload('workspace:alpha', new Uint8Array([1, 2, 3]), '2026-08-27T00:01:00.000Z')
  assert.throws(() => store.putPayload('workspace:alpha', new Uint8Array([4])), hasCode('QUOTA_EXCEEDED'))
  now = new Date('2026-08-27T00:02:00.000Z')
  assert.equal(store.inspectPayload('workspace:alpha', saved.hash).status, 'expired')
  store.putPayload('workspace:alpha', new Uint8Array([4])); assert.equal(store.resources('workspace:alpha').objectCount, 1)
  store.close()
})

test('workspace scope prevents cross-workspace discovery and malformed path identities', () => {
  const store = new LocalMemoryStore(root()); store.createWorkspace('workspace:alpha'); store.createWorkspace('workspace:beta')
  const saved = store.putPayload('workspace:alpha', new TextEncoder().encode('private'))
  assert.throws(() => store.inspectPayload('workspace:beta', saved.hash), hasCode('OBJECT_NOT_FOUND'))
  assert.throws(() => store.readPayload('workspace:../escape', saved.hash), hasCode('INVALID_WORKSPACE_ID'))
  store.close()
})
