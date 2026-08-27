import assert from 'node:assert/strict'
import test from 'node:test'

import { assertApprovalBinding, assertAuthority, assertEnvelope, assertTransition, authorize, canonicalJson, contentHash, ContractError, createAuditEvent, OPERATION_RULES } from '../../dist/laboratory-contract.js'

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

test('operation matrix separates model claims from user and validator authority', () => {
  assertAuthority('working.propose', 'model')
  assertAuthority('proposal.approve', 'user')
  assertAuthority('validation.run', 'validator')
  assert.throws(() => assertAuthority('proposal.approve', 'model'), hasCode('AUTHORITY_NOT_PERMITTED'))
  assert.throws(() => assertAuthority('validation.run', 'model'), hasCode('AUTHORITY_NOT_PERMITTED'))
  assert.equal(Object.keys(OPERATION_RULES).length, 14)
  assert.ok(Object.values(OPERATION_RULES).every((rule) => rule.auditRequired))
})

test('lifecycle transitions reject replay and terminal-state mutation', () => {
  assertTransition('draft', 'proposed')
  assertTransition('proposed', 'approved')
  assert.throws(() => assertTransition('draft', 'approved'), hasCode('ILLEGAL_STATE_TRANSITION'))
  assert.throws(() => assertTransition('approved', 'approved'), hasCode('ILLEGAL_STATE_TRANSITION'))
  assert.throws(() => assertTransition('completed', 'active'), hasCode('ILLEGAL_STATE_TRANSITION'))
})

test('envelopes reject forged authority and identity-kind mismatches', () => {
  const envelope = { protocolVersion: '1.0' as const, kind: 'validation' as const, id: 'validation:run-one' as const, workspaceId: 'workspace:alpha' as const, revision: 1, state: 'completed' as const, authority: 'validator' as const, createdAt: '2026-08-27T00:02:00.000Z', createdBy: 'actor:validator' as const, payload: { candidateHash: 'sha256:abc' } }
  assertEnvelope(envelope, 'validation', 'validator')
  assert.throws(() => assertEnvelope({ ...envelope, authority: 'model' }, 'validation', 'validator'), hasCode('UNTRUSTED_AUTHORITY_FIELD'))
  assert.throws(() => assertEnvelope({ ...envelope, id: 'proposal:run-one' }, 'validation', 'validator'), hasCode('IDENTITY_KIND_MISMATCH'))
})

test('audit events hash inputs and attribute deterministic rejection codes', () => {
  const event = createAuditEvent({ eventId: 'event:one', workspaceId: 'workspace:alpha', actorId: 'actor:model', callId: 'call:one', operation: 'proposal.approve', targetId: 'proposal:one', capabilityId: 'capability:one', occurredAt: '2026-08-27T00:03:00.000Z', outcome: 'rejected', errorCode: 'AUTHORITY_NOT_PERMITTED', input: { proposalId: 'proposal:one' } })
  assert.equal(event.protocolVersion, '1.0')
  assert.equal(event.inputHash, contentHash({ proposalId: 'proposal:one' }))
  assert.equal(event.errorCode, 'AUTHORITY_NOT_PERMITTED')
})
