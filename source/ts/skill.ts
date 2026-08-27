import { readFile } from 'node:fs/promises'
import type { HarnessSkillRegistry, RuntimeSkillDefinition } from './harness-types.js'

function parseFrontmatter(source: string): { metadata: Record<string, string>; content: string } {
  const normalized = source.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error('SKILL.md is missing YAML frontmatter')
  }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) throw new Error('SKILL.md frontmatter is not closed')
  const metadata: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    metadata[key] = value
  }
  return { metadata, content: normalized.slice(end + 5).trim() }
}

export async function loadRuntimeSkill(moduleUrl: string): Promise<RuntimeSkillDefinition> {
  const skillUrl = new URL('../skill/SKILL.md', moduleUrl)
  const parsed = parseFrontmatter(await readFile(skillUrl, 'utf8'))
  const name = parsed.metadata.name
  const description = parsed.metadata.description
  if (!name || !description) {
    throw new Error('SKILL.md requires name and description frontmatter')
  }
  return {
    name,
    description,
    whenToUse: parsed.metadata.whenToUse,
    source: 'runtime',
    invocation: { modelInvocable: true, userInvocable: true },
    content: parsed.content,
  }
}

export async function registerRuntimeSkill(
  registry: HarnessSkillRegistry,
  moduleUrl: string,
): Promise<void> {
  registry.register(await loadRuntimeSkill(moduleUrl))
}
