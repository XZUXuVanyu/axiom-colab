import type { JsonSchema } from './harness-types.js'

export const HARNESS_CONTRACT_VERSION = '0.1.0-rc.5' as const

function scalarType(value: unknown): string | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  return undefined
}

export class HarnessContractError extends Error {
  readonly code = 'UNSUPPORTED_HARNESS_OUTPUT_SCHEMA'

  constructor(path: string, message: string) {
    super(`[${path}] ${message}`)
    this.name = 'HarnessContractError'
  }
}

export function projectHarnessOutputSchema(
  schema: unknown,
  path = '$',
): JsonSchema {
  if (schema === true) return {}
  if (schema === false) {
    throw new HarnessContractError(
      path,
      `false schemas cannot be represented by Harness ${HARNESS_CONTRACT_VERSION}`,
    )
  }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new HarnessContractError(path, 'schema must be an object or boolean')
  }

  const source = schema as Record<string, unknown>
  for (const keyword of ['allOf', 'anyOf', 'not']) {
    if (Object.hasOwn(source, keyword)) {
      throw new HarnessContractError(
        `${path}.${keyword}`,
        `${keyword} cannot be represented by Harness ${HARNESS_CONTRACT_VERSION}`,
      )
    }
  }
  if (Array.isArray(source.type)) {
    throw new HarnessContractError(
      `${path}.type`,
      `type arrays cannot be represented by Harness ${HARNESS_CONTRACT_VERSION}; use oneOf`,
    )
  }

  const result: Record<string, unknown> = {}
  for (const keyword of ['title', 'description', 'default', 'examples']) {
    if (Object.hasOwn(source, keyword)) result[keyword] = source[keyword]
  }

  if (Array.isArray(source.oneOf) && source.oneOf.length >= 2) {
    result.oneOf = source.oneOf.map((child, index) =>
      projectHarnessOutputSchema(child, `${path}.oneOf[${index}]`))
    return result as JsonSchema
  }

  let type = typeof source.type === 'string' ? source.type : undefined
  if (type === undefined && Object.hasOwn(source, 'const')) {
    type = scalarType(source.const)
  }
  if (type === undefined && Array.isArray(source.enum) && source.enum.length > 0) {
    const types = new Set(source.enum.map(scalarType))
    if (types.size === 1 && !types.has(undefined)) type = [...types][0]
  }
  if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type ?? '')) {
    return result as JsonSchema
  }
  result.type = type

  if (type === 'object') {
    if (source.properties !== null && typeof source.properties === 'object'
        && !Array.isArray(source.properties)) {
      result.properties = Object.fromEntries(
        Object.entries(source.properties).map(([name, child]) => [
          name,
          projectHarnessOutputSchema(child, `${path}.properties.${name}`),
        ]),
      )
    }
    if (Array.isArray(source.required)) result.required = source.required
    if (typeof source.additionalProperties === 'boolean') {
      result.additionalProperties = source.additionalProperties
    }
  } else if (type === 'array') {
    if (Object.hasOwn(source, 'items')) {
      result.items = projectHarnessOutputSchema(source.items, `${path}.items`)
    }
  } else {
    if (Array.isArray(source.enum) && source.enum.length > 0
        && source.enum.every((value) => scalarType(value) === type
          || type === 'number' && scalarType(value) === 'integer')) {
      result.enum = source.enum
    }
    if (Object.hasOwn(source, 'const')
        && (scalarType(source.const) === type
          || type === 'number' && scalarType(source.const) === 'integer')) {
      result.const = source.const
    }
  }
  return result as JsonSchema
}
