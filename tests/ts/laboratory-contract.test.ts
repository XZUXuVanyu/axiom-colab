import assert from 'node:assert/strict'
import test from 'node:test'

import { assertApprovalBinding, authorize, canonicalJson, contentHash, ContractError } from '../../dist/laboratory-contract.js'

const context = { workspaceId: 'workspace:alpha' as const, actorId: 'actor:model' as const, callId: 'call:one' as const, toolId: 'tool:calculator' as const }
const grant = { protocolVersion: '1.0' as const, capabilityId: 'capability:one' as const, workspaceId: 'workspace:alpha' as const, actorId: 'actor:model' as const, toolId: 'tool:calculator' as const, callId: 'call:one' as const, operations: ['compute.read'] as const, issuedAt: '2026-08-27T00:00:00.000Z', expiresAt: '2026-08-27T00:05:00.000Z', nonce: 'host-value' }
const hasCode = (code: string) => (error: unknown) => error instanceof ContractError && error.code === code

test('canonical hashes are stable across object insertion order', () => {
  const left = { z: [3, { b: true, a: null }], a: -0 }
  const right = { a: 0, z: [3, { a: null, b: true }] }
  assert.equal(canonicalJson(left), '{"a":0,"z":[3,{"a":null,"b":true}]}')
  assert.equal(contentHash(left), contentHash(right))
  assert.throws(() => canonicalJson({ value: undefined }), hasCode('NON_CANONICAL_VALUE'))
})

test('capabilities fail closed across authority boundaries', () => {
  authorize(context, grant, 'compute.read', '2026-08-27T00:01:00.000Z')
  assert.throws(() => authorize({ ...context, workspaceId: 'workspace:other' }, grant, 'compute.read', '2026-08-27T00:01:00.000Z'), hasCode('CROSS_WORKSPACE_ACCESS'))
  assert.throws(() => authorize({ ...context, callId: 'call:replay' }, grant, 'compute.read', '2026-08-27T00:01:00.000Z'), hasCode('CALL_IDENTITY_MISMATCH'))
  assert.throws(() => authorize(context, grant, 'compute.update', '2026-08-27T00:01:00.000Z'), hasCode('OPERATION_NOT_PERMITTED'))
  assert.throws(() => authorize(context, grant, 'compute.read', grant.expiresAt), hasCode('CAPABILITY_EXPIRED'))
})

test('approvals bind exact workspace, proposal identity, and content hash', () => {
  const approval = { workspaceId: 'workspace:alpha', proposalId: 'proposal:one', proposalHash: contentHash({ revision: 1 }), decision: 'approved' }
  assertApprovalBinding('workspace:alpha', 'proposal:one', contentHash({ revision: 1 }), approval)
  assert.throws(() => assertApprovalBinding('workspace:alpha', 'proposal:one', contentHash({ revision: 2 }), approval), hasCode('STALE_APPROVAL'))
  assert.throws(() => assertApprovalBinding('workspace:other', 'proposal:one', approval.proposalHash, approval), hasCode('CROSS_WORKSPACE_ACCESS'))
})
