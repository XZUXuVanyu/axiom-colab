import { randomUUID } from 'node:crypto'

import {
  CandidateContentError,
  captureCandidateFiles,
  type BoundFile,
  type CandidateFile,
  type CapturedCandidateFile,
} from './candidate-content.js'
import {
  LABORATORY_PROTOCOL_VERSION,
  contentHash,
  type Authority,
  type LaboratoryId,
} from './laboratory-contract.js'

export interface WorkshopContext {
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly actorId: LaboratoryId<'actor'>
  readonly authority: Authority
}

export interface ToolSpecificationInput {
  readonly problem: string
  readonly publicName: string
  readonly description: string
  readonly inputSchema: unknown
  readonly outputSchema: unknown
  readonly requestedPermissions: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly constraints?: readonly string[]
}

export interface ToolSpecification extends ToolSpecificationInput {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly specificationId: LaboratoryId<'proposal'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly createdAt: string
  readonly createdBy: LaboratoryId<'actor'>
  readonly specificationHash: `sha256:${string}`
}

export type CandidateRevisionState = 'current' | 'superseded'

export interface CandidateRevision {
  readonly protocolVersion: typeof LABORATORY_PROTOCOL_VERSION
  readonly revisionId: LaboratoryId<'evidence'>
  readonly candidateId: LaboratoryId<'tool'>
  readonly workspaceId: LaboratoryId<'workspace'>
  readonly specificationId: LaboratoryId<'proposal'>
  readonly specificationHash: `sha256:${string}`
  readonly revision: number
  readonly parentRevisionId: LaboratoryId<'evidence'> | null
  readonly parentCandidateHash: `sha256:${string}` | null
  readonly descriptorHash: `sha256:${string}`
  readonly sourceHash: `sha256:${string}`
  readonly sources: readonly BoundFile[]
  readonly candidateHash: `sha256:${string}`
  readonly state: CandidateRevisionState
  readonly createdAt: string
  readonly createdBy: LaboratoryId<'actor'>
}

export interface CandidateRevisionInput {
  readonly specificationId: LaboratoryId<'proposal'>
  readonly descriptor: unknown
  readonly sources: readonly CandidateFile[]
  readonly parentRevisionId?: LaboratoryId<'evidence'>
}

export interface MaterializedCandidateRevision {
  readonly revision: CandidateRevision
  readonly descriptor: unknown
  readonly sources: readonly CandidateFile[]
}

export interface ToolWorkshopOptions {
  readonly now?: () => Date
  readonly idFactory?: () => string
}

interface StoredRevision {
  public: CandidateRevision
  readonly descriptor: unknown
  readonly files: readonly CapturedCandidateFile[]
}

export class ToolWorkshopError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ToolWorkshopError'
  }
}

function fail(code: string, message: string): never {
  throw new ToolWorkshopError(code, message)
}

function requiredText(value: string, field: string): void {
  if (value.trim().length === 0) fail('INVALID_TOOL_SPECIFICATION', `${field} must not be empty`)
}

function validateSpecification(input: ToolSpecificationInput): void {
  requiredText(input.problem, 'problem')
  requiredText(input.publicName, 'publicName')
  requiredText(input.description, 'description')
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(input.publicName)) {
    fail('INVALID_TOOL_NAME', 'publicName must be a snake_case identifier')
  }
  if (input.acceptanceCriteria.length === 0) {
    fail('INVALID_TOOL_SPECIFICATION', 'acceptanceCriteria must not be empty')
  }
  for (const [index, criterion] of input.acceptanceCriteria.entries()) {
    requiredText(criterion, `acceptanceCriteria[${index}]`)
  }
  for (const [index, permission] of input.requestedPermissions.entries()) {
    requiredText(permission, `requestedPermissions[${index}]`)
  }
  for (const [index, constraint] of (input.constraints ?? []).entries()) {
    requiredText(constraint, `constraints[${index}]`)
  }
  if (new Set(input.requestedPermissions).size !== input.requestedPermissions.length) {
    fail('INVALID_TOOL_SPECIFICATION', 'requestedPermissions must not contain duplicates')
  }
  contentHash(input.inputSchema)
  contentHash(input.outputSchema)
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item)
  return value
}

function assertAuthor(context: WorkshopContext): void {
  if (context.authority !== 'model' && context.authority !== 'trusted-host') {
    fail('AUTHORITY_NOT_PERMITTED', `${context.authority} cannot author Tool workshop content`)
  }
}

function descriptorName(descriptor: unknown): string | null {
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) return null
  const name = (descriptor as Record<string, unknown>).name
  return typeof name === 'string' ? name : null
}

export class ToolWorkshop {
  private readonly now: () => Date
  private readonly idFactory: () => string
  private readonly specifications = new Map<string, ToolSpecification>()
  private readonly revisions = new Map<string, StoredRevision>()
  private readonly candidateRevisions = new Map<string, string[]>()

  constructor(options: ToolWorkshopOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? randomUUID
  }

  defineSpecification(context: WorkshopContext, input: ToolSpecificationInput): ToolSpecification {
    assertAuthor(context)
    validateSpecification(input)
    const captured = deepCopy({
      problem: input.problem,
      publicName: input.publicName,
      description: input.description,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      requestedPermissions: [...input.requestedPermissions],
      acceptanceCriteria: [...input.acceptanceCriteria],
      constraints: [...(input.constraints ?? [])],
    })
    const binding = {
      workspaceId: context.workspaceId,
      createdBy: context.actorId,
      ...captured,
    }
    const specification = deepFreeze({
      protocolVersion: LABORATORY_PROTOCOL_VERSION,
      specificationId: `proposal:${this.idFactory()}` as LaboratoryId<'proposal'>,
      workspaceId: context.workspaceId,
      createdAt: this.now().toISOString(),
      createdBy: context.actorId,
      ...captured,
      specificationHash: contentHash(binding),
    })
    this.specifications.set(specification.specificationId, specification)
    return specification
  }

  createCandidateRevision(context: WorkshopContext, input: CandidateRevisionInput): CandidateRevision {
    assertAuthor(context)
    const specification = this.specifications.get(input.specificationId)
    if (specification === undefined || specification.workspaceId !== context.workspaceId) {
      fail('SPECIFICATION_NOT_FOUND', 'specification is not visible in this workspace')
    }
    if (descriptorName(input.descriptor) !== specification.publicName) {
      fail('DESCRIPTOR_NAME_MISMATCH', 'candidate descriptor does not implement the specified public name')
    }
    if (input.sources.length === 0) fail('EMPTY_CANDIDATE_SOURCE', 'candidate must contain at least one source file')
    let files: readonly CapturedCandidateFile[]
    try {
      files = captureCandidateFiles(input.sources, 'sources')
    } catch (error) {
      if (error instanceof CandidateContentError) fail(error.code, error.message.slice(error.message.indexOf(']') + 2))
      throw error
    }
    contentHash(input.descriptor)
    const descriptor = deepCopy(input.descriptor)
    const bindings = files.map((file) => file.binding)
    const priorIds = this.candidateIdsForSpecification(specification.specificationId)
    let candidateId: LaboratoryId<'tool'>
    let parent: StoredRevision | undefined
    if (input.parentRevisionId === undefined) {
      if (priorIds.length !== 0) fail('PARENT_REVISION_REQUIRED', 'an existing candidate must be revised from its current revision')
      candidateId = `tool:${this.idFactory()}` as LaboratoryId<'tool'>
    } else {
      parent = this.revisions.get(input.parentRevisionId)
      if (parent === undefined || parent.public.workspaceId !== context.workspaceId) {
        fail('CANDIDATE_REVISION_NOT_FOUND', 'parent revision is not visible in this workspace')
      }
      if (parent.public.specificationId !== specification.specificationId) {
        fail('SPECIFICATION_MISMATCH', 'parent revision belongs to another specification')
      }
      if (parent.public.state !== 'current') fail('STALE_CANDIDATE_REVISION', 'only the current revision can be revised')
      candidateId = parent.public.candidateId
    }
    const revision = (parent?.public.revision ?? 0) + 1
    const descriptorHash = contentHash(descriptor)
    const sourceHash = contentHash(bindings)
    if (parent !== undefined
        && parent.public.descriptorHash === descriptorHash
        && parent.public.sourceHash === sourceHash) {
      fail('UNCHANGED_CANDIDATE', 'a revision must change candidate content')
    }
    const binding = {
      workspaceId: context.workspaceId,
      candidateId,
      specificationId: specification.specificationId,
      specificationHash: specification.specificationHash,
      revision,
      parentCandidateHash: parent?.public.candidateHash ?? null,
      descriptorHash,
      sourceHash,
      sources: bindings,
    }
    const candidateHash = contentHash(binding)
    const publicRevision = deepFreeze({
      protocolVersion: LABORATORY_PROTOCOL_VERSION,
      revisionId: `evidence:${this.idFactory()}` as LaboratoryId<'evidence'>,
      ...binding,
      parentRevisionId: parent?.public.revisionId ?? null,
      candidateHash,
      state: 'current' as const,
      createdAt: this.now().toISOString(),
      createdBy: context.actorId,
    })
    if (parent !== undefined) {
      parent.public = deepFreeze({ ...parent.public, state: 'superseded' as const })
    }
    this.revisions.set(publicRevision.revisionId, { public: publicRevision, descriptor, files })
    this.candidateRevisions.set(candidateId, [...(this.candidateRevisions.get(candidateId) ?? []), publicRevision.revisionId])
    return publicRevision
  }

  inspectRevision(context: WorkshopContext, revisionId: LaboratoryId<'evidence'>): CandidateRevision {
    const revision = this.visibleRevision(context, revisionId)
    return revision.public
  }

  listCandidateRevisions(context: WorkshopContext, candidateId: LaboratoryId<'tool'>): readonly CandidateRevision[] {
    return (this.candidateRevisions.get(candidateId) ?? [])
      .map((revisionId) => this.revisions.get(revisionId))
      .filter((revision): revision is StoredRevision => revision !== undefined && revision.public.workspaceId === context.workspaceId)
      .map((revision) => revision.public)
  }

  materializeRevision(context: WorkshopContext, revisionId: LaboratoryId<'evidence'>): MaterializedCandidateRevision {
    const stored = this.visibleRevision(context, revisionId)
    return {
      revision: stored.public,
      descriptor: deepCopy(stored.descriptor),
      sources: stored.files.map((file) => ({ path: file.path, content: Buffer.from(file.bytes) })),
    }
  }

  private candidateIdsForSpecification(specificationId: LaboratoryId<'proposal'>): readonly string[] {
    return [...this.revisions.values()]
      .filter((revision) => revision.public.specificationId === specificationId)
      .map((revision) => revision.public.revisionId)
  }

  private visibleRevision(context: WorkshopContext, revisionId: LaboratoryId<'evidence'>): StoredRevision {
    const revision = this.revisions.get(revisionId)
    if (revision === undefined || revision.public.workspaceId !== context.workspaceId) {
      fail('CANDIDATE_REVISION_NOT_FOUND', 'candidate revision is not visible in this workspace')
    }
    return revision
  }
}
