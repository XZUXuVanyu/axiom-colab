import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolWorkshop } from '../../dist/tool-workshop.js'

let nextId = 0
function workshop(): ToolWorkshop {
  return new ToolWorkshop({
    now: () => new Date('2026-08-28T02:00:00.000Z'),
    idFactory: () => `workshop-${++nextId}`,
  })
}

const model = {
  workspaceId: 'workspace:alpha' as const,
  actorId: 'actor:model' as const,
  authority: 'model' as const,
}

function specificationInput() {
  return {
    problem: 'Add two bounded numbers deterministically.',
    publicName: 'add_bounded_numbers',
    description: 'Adds two numbers after validating their bounds.',
    inputSchema: { type: 'object', properties: { left: { type: 'number' } } },
    outputSchema: { type: 'number' },
    requestedPermissions: [],
    acceptanceCriteria: ['Returns the mathematical sum.', 'Rejects out-of-range inputs.'],
    constraints: ['No network access.'],
  }
}

function descriptor() {
  return { name: 'add_bounded_numbers', inputSchema: { type: 'object' }, outputSchema: { type: 'number' } }
}

test('structured specifications and first candidate revisions capture caller-owned values', () => {
  const service = workshop()
  const input = specificationInput()
  const specification = service.defineSpecification(model, input)
  input.acceptanceCriteria[0] = 'claim success'
  ;(input.inputSchema.properties.left as { type: string }).type = 'string'

  const bytes = Buffer.from('int tool = 1;')
  const candidate = service.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    descriptor: descriptor(),
    sources: [{ path: 'src/tool.cpp', content: bytes }],
  })
  bytes.fill(0)
  const materialized = service.materializeRevision(model, candidate.revisionId)

  assert.equal(specification.acceptanceCriteria[0], 'Returns the mathematical sum.')
  assert.deepEqual(specification.inputSchema, { type: 'object', properties: { left: { type: 'number' } } })
  assert.equal(Buffer.from(materialized.sources[0]?.content as Uint8Array).toString(), 'int tool = 1;')
  assert.equal(Object.isFrozen(specification), true)
  assert.equal(Object.isFrozen(candidate.sources), true)
})

test('candidate changes create a hash chain and preserve superseded revisions', () => {
  const service = workshop()
  const specification = service.defineSpecification(model, specificationInput())
  const first = service.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    descriptor: descriptor(),
    sources: [{ path: 'src/tool.cpp', content: 'int tool = 1;' }],
  })
  const second = service.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    parentRevisionId: first.revisionId,
    descriptor: descriptor(),
    sources: [{ path: 'src/tool.cpp', content: 'int tool = 2;' }],
  })
  const history = service.listCandidateRevisions(model, first.candidateId)

  assert.equal(service.inspectRevision(model, first.revisionId).state, 'superseded')
  assert.equal(second.state, 'current')
  assert.equal(second.parentCandidateHash, first.candidateHash)
  assert.notEqual(second.candidateHash, first.candidateHash)
  assert.deepEqual(history.map((revision) => revision.state), ['superseded', 'current'])
  assert.throws(
    () => service.createCandidateRevision(model, {
      specificationId: specification.specificationId,
      parentRevisionId: second.revisionId,
      descriptor: descriptor(),
      sources: [{ path: 'src/tool.cpp', content: 'int tool = 2;' }],
    }),
    (error: unknown) => (error as { code?: string }).code === 'UNCHANGED_CANDIDATE',
  )
})

test('workshop rejects authority, workspace, descriptor, path, and stale-parent forgery', () => {
  const service = workshop()
  assert.throws(
    () => service.defineSpecification({ ...model, authority: 'user' }, specificationInput()),
    (error: unknown) => (error as { code?: string }).code === 'AUTHORITY_NOT_PERMITTED',
  )
  const specification = service.defineSpecification(model, specificationInput())
  assert.throws(
    () => service.createCandidateRevision(model, { specificationId: specification.specificationId, descriptor: { name: 'other' }, sources: [{ path: 'tool.cpp', content: '' }] }),
    (error: unknown) => (error as { code?: string }).code === 'DESCRIPTOR_NAME_MISMATCH',
  )
  assert.throws(
    () => service.createCandidateRevision(model, { specificationId: specification.specificationId, descriptor: descriptor(), sources: [{ path: '../tool.cpp', content: '' }] }),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_SNAPSHOT_PATH',
  )
  assert.throws(
    () => service.createCandidateRevision({ ...model, workspaceId: 'workspace:other' }, { specificationId: specification.specificationId, descriptor: descriptor(), sources: [{ path: 'tool.cpp', content: '' }] }),
    (error: unknown) => (error as { code?: string }).code === 'SPECIFICATION_NOT_FOUND',
  )
  const first = service.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    descriptor: descriptor(),
    sources: [{ path: 'tool.cpp', content: 'first' }],
  })
  service.createCandidateRevision(model, {
    specificationId: specification.specificationId,
    parentRevisionId: first.revisionId,
    descriptor: descriptor(),
    sources: [{ path: 'tool.cpp', content: 'second' }],
  })
  assert.throws(
    () => service.createCandidateRevision(model, { specificationId: specification.specificationId, parentRevisionId: first.revisionId, descriptor: descriptor(), sources: [{ path: 'tool.cpp', content: 'branch' }] }),
    (error: unknown) => (error as { code?: string }).code === 'STALE_CANDIDATE_REVISION',
  )
})
