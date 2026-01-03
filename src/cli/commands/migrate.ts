// ============================================================================
// MIGRATE COMMAND - Upgrade memory files to latest schema version
// ============================================================================

import { join } from 'path'
import { homedir } from 'os'
import { Glob } from 'bun'
import { c, symbols, fmt } from '../colors.ts'
import { MEMORY_SCHEMA_VERSION } from '../../types/schema.ts'
import { V2_DEFAULTS } from '../../types/memory.ts'
import { EmbeddingGenerator } from '../../core/embeddings.ts'

interface MigrateOptions {
  dryRun?: boolean
  verbose?: boolean
  path?: string  // Custom path to migrate
  embeddings?: boolean  // Regenerate embeddings for all memories
}

// Module-level embedder for reuse across files
let embedder: ((text: string) => Promise<Float32Array>) | null = null

async function initEmbedder(): Promise<void> {
  if (embedder) return
  console.log(c.muted(`  ${symbols.gear} Loading embedding model...`))
  const generator = new EmbeddingGenerator()
  await generator.initialize()
  embedder = generator.createEmbedder()
  console.log(c.success(`  ${symbols.tick} Embedding model ready`))
  console.log()
}

interface MigrationResult {
  total: number
  migrated: number
  skipped: number
  embeddingsGenerated: number
  errors: string[]
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null

  const yamlContent = match[1]
  const body = match[2] ?? ''

  // Simple YAML parser for our known structure
  const frontmatter: Record<string, any> = {}

  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // Handle arrays (simple case: ["a", "b"])
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        frontmatter[key] = JSON.parse(value)
      } catch {
        frontmatter[key] = value
      }
    }
    // Handle booleans
    else if (value === 'true') frontmatter[key] = true
    else if (value === 'false') frontmatter[key] = false
    // Handle null
    else if (value === 'null' || value === '') frontmatter[key] = null
    // Handle numbers
    else if (!isNaN(Number(value)) && value !== '') frontmatter[key] = Number(value)
    // Handle quoted strings
    else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      frontmatter[key] = value.slice(1, -1)
    }
    // Plain string
    else frontmatter[key] = value
  }

  return { frontmatter, body }
}

/**
 * Serialize frontmatter back to YAML
 */
function serializeFrontmatter(frontmatter: Record<string, any>, body: string): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`)
    } else if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`)
    } else {
      // String - quote if contains special characters
      const needsQuotes = /[:#\[\]{}'",]/.test(value) || value.includes('\n')
      lines.push(`${key}: ${needsQuotes ? JSON.stringify(value) : value}`)
    }
  }

  lines.push('---')
  if (body.trim()) {
    lines.push('')
    lines.push(body.trim())
  }

  return lines.join('\n') + '\n'
}

/**
 * Apply v2 defaults to frontmatter
 */
function applyMigration(frontmatter: Record<string, any>): Record<string, any> {
  const contextType = frontmatter.context_type ?? 'general'
  const typeDefaults = V2_DEFAULTS.typeDefaults[contextType] ?? V2_DEFAULTS.typeDefaults.technical

  return {
    ...frontmatter,

    // Lifecycle status
    status: frontmatter.status ?? 'active',
    scope: frontmatter.scope ?? typeDefaults?.scope ?? 'project',

    // Temporal class & decay
    temporal_class: frontmatter.temporal_class ?? typeDefaults?.temporal_class ?? 'medium_term',
    fade_rate: frontmatter.fade_rate ?? typeDefaults?.fade_rate ?? 0.03,

    // Temporal tracking (initialize with 0 since we don't know the session numbers)
    sessions_since_surfaced: frontmatter.sessions_since_surfaced ?? 0,

    // Lifecycle triggers
    awaiting_implementation: frontmatter.awaiting_implementation ?? false,
    awaiting_decision: frontmatter.awaiting_decision ?? false,
    exclude_from_retrieval: frontmatter.exclude_from_retrieval ?? false,

    // Retrieval weight
    retrieval_weight: frontmatter.retrieval_weight ?? frontmatter.importance_weight ?? 0.5,

    // Initialize empty arrays
    related_to: frontmatter.related_to ?? [],
    resolves: frontmatter.resolves ?? [],
    child_ids: frontmatter.child_ids ?? [],
    blocks: frontmatter.blocks ?? [],
    related_files: frontmatter.related_files ?? [],

    // Mark as migrated
    schema_version: MEMORY_SCHEMA_VERSION,
  }
}

/**
 * Check if file needs migration
 */
function needsMigration(frontmatter: Record<string, any>): boolean {
  return !frontmatter.schema_version || frontmatter.schema_version < MEMORY_SCHEMA_VERSION
}

/**
 * Migrate a single memory file
 */
async function migrateFile(filePath: string, options: MigrateOptions): Promise<{ migrated: boolean; embeddingGenerated: boolean; error?: string }> {
  try {
    const file = Bun.file(filePath)
    const content = await file.text()
    const parsed = parseFrontmatter(content)

    if (!parsed) {
      return { migrated: false, embeddingGenerated: false, error: 'Could not parse frontmatter' }
    }

    const needsSchema = needsMigration(parsed.frontmatter)
    const needsEmbedding = options.embeddings && (
      parsed.frontmatter.embedding === null ||
      parsed.frontmatter.embedding === undefined ||
      (Array.isArray(parsed.frontmatter.embedding) && parsed.frontmatter.embedding.length === 0)
    )

    // Nothing to do
    if (!needsSchema && !needsEmbedding) {
      return { migrated: false, embeddingGenerated: false }
    }

    let newFrontmatter = parsed.frontmatter

    // Apply schema migration if needed
    if (needsSchema) {
      newFrontmatter = applyMigration(parsed.frontmatter)
    }

    // Generate embedding if needed
    let embeddingGenerated = false
    if (needsEmbedding && parsed.body.trim()) {
      await initEmbedder()
      const embedding = await embedder!(parsed.body.trim())
      newFrontmatter.embedding = Array.from(embedding)
      embeddingGenerated = true
    }

    const newContent = serializeFrontmatter(newFrontmatter, parsed.body)

    if (!options.dryRun) {
      await Bun.write(filePath, newContent)
    }

    return { migrated: needsSchema, embeddingGenerated }
  } catch (error: any) {
    return { migrated: false, embeddingGenerated: false, error: error.message }
  }
}

/**
 * Find all memory directories to migrate
 * Handles both central and local storage modes
 * Global memories are ALWAYS in central location, even in local mode
 */
async function findMemoryPaths(customPath?: string): Promise<{ path: string; label: string }[]> {
  const paths: { path: string; label: string }[] = []

  if (customPath) {
    // Custom path specified - just use it
    paths.push({ path: customPath, label: customPath })
    return paths
  }

  const storageMode = process.env.MEMORY_STORAGE_MODE ?? 'central'
  const centralPath = process.env.MEMORY_CENTRAL_PATH ?? join(homedir(), '.local', 'share', 'memory')

  // ALWAYS check global memories (even in local mode, global is central)
  const globalMemoriesPath = join(centralPath, 'global', 'memories')
  try {
    const globalGlob = new Glob('*.md')
    let hasGlobalFiles = false
    for await (const _ of globalGlob.scan({ cwd: globalMemoriesPath })) {
      hasGlobalFiles = true
      break
    }
    if (hasGlobalFiles) {
      paths.push({ path: globalMemoriesPath, label: 'Global (shared across projects)' })
    }
  } catch {
    // Global directory doesn't exist yet
  }

  if (storageMode === 'local') {
    // Local mode: check current directory for project memories
    const localFolder = '.memory'
    const cwd = process.cwd()
    const localMemoriesPath = join(cwd, localFolder, 'memories')

    try {
      const localGlob = new Glob('*.md')
      let hasLocalFiles = false
      for await (const _ of localGlob.scan({ cwd: localMemoriesPath })) {
        hasLocalFiles = true
        break
      }
      if (hasLocalFiles) {
        paths.push({ path: localMemoriesPath, label: `Local project: ${cwd}` })
      }
    } catch {
      // Local directory doesn't exist
    }
  } else {
    // Central mode: check ~/.local/share/memory/[projects]/
    try {
      const projectGlob = new Glob('*/memories')
      for await (const match of projectGlob.scan({ cwd: centralPath, onlyFiles: false })) {
        // Skip global, we already handled it
        if (match.startsWith('global/')) continue

        const fullPath = join(centralPath, match)
        const projectId = match.split('/')[0]

        // Check if directory has any .md files
        try {
          const mdGlob = new Glob('*.md')
          let hasFiles = false
          for await (const _ of mdGlob.scan({ cwd: fullPath })) {
            hasFiles = true
            break
          }
          if (hasFiles) {
            paths.push({ path: fullPath, label: `Project: ${projectId}` })
          }
        } catch {
          // Skip if we can't read
        }
      }
    } catch {
      // Central storage doesn't exist
    }
  }

  return paths
}

/**
 * Migrate all memory files in a directory using Bun's Glob
 */
async function migrateDirectory(dir: string, options: MigrateOptions): Promise<MigrationResult> {
  const result: MigrationResult = { total: 0, migrated: 0, skipped: 0, embeddingsGenerated: 0, errors: [] }

  try {
    const glob = new Glob('*.md')

    for await (const file of glob.scan({ cwd: dir })) {
      result.total++
      const filePath = join(dir, file)

      const { migrated, embeddingGenerated, error } = await migrateFile(filePath, options)

      if (error) {
        result.errors.push(`${file}: ${error}`)
        if (options.verbose) {
          console.log(`  ${c.error(symbols.cross)} ${file}: ${error}`)
        }
      } else if (migrated || embeddingGenerated) {
        if (migrated) result.migrated++
        if (embeddingGenerated) result.embeddingsGenerated++
        if (options.verbose) {
          const actions = []
          if (migrated) actions.push('schema')
          if (embeddingGenerated) actions.push('embedding')
          console.log(`  ${c.success(symbols.tick)} ${file} (${actions.join(', ')})`)
        }
      } else {
        result.skipped++
        if (options.verbose) {
          console.log(`  ${c.muted(symbols.bullet)} ${file} (up to date)`)
        }
      }
    }
  } catch (error: any) {
    result.errors.push(`Directory error: ${error.message}`)
  }

  return result
}

export async function migrate(options: MigrateOptions) {
  console.log()
  console.log(c.header(`${symbols.gear} Memory Migration`))
  console.log()
  console.log(`  ${fmt.kv('Target Version', `v${MEMORY_SCHEMA_VERSION}`)}`)
  console.log(`  ${fmt.kv('Storage Mode', process.env.MEMORY_STORAGE_MODE ?? 'central')}`)
  console.log(`  ${fmt.kv('Embeddings', options.embeddings ? c.success('Regenerate') : c.muted('Skip'))}`)
  console.log(`  ${fmt.kv('Mode', options.dryRun ? c.warn('Dry Run') : c.success('Live'))}`)
  console.log()

  const memoryPaths = await findMemoryPaths(options.path)

  if (memoryPaths.length === 0) {
    console.log(c.warn(`  ${symbols.warning} No memory directories found`))
    console.log()
    console.log(c.muted(`  Expected locations:`))
    console.log(c.muted(`    Central: ~/.local/share/memory/[project]/memories/`))
    console.log(c.muted(`    Local:   ./.memory/memories/`))
    console.log()
    return
  }

  const totals: MigrationResult = { total: 0, migrated: 0, skipped: 0, embeddingsGenerated: 0, errors: [] }

  for (const { path, label } of memoryPaths) {
    console.log(fmt.section(label))
    console.log(c.muted(`  ${path}`))
    console.log()

    const result = await migrateDirectory(path, options)

    totals.total += result.total
    totals.migrated += result.migrated
    totals.skipped += result.skipped
    totals.embeddingsGenerated += result.embeddingsGenerated
    totals.errors.push(...result.errors)

    if (!options.verbose) {
      console.log(`  ${fmt.kv('Files', result.total.toString())}`)
      console.log(`  ${fmt.kv('Schema Migrated', c.success(result.migrated.toString()))}`)
      if (options.embeddings) {
        console.log(`  ${fmt.kv('Embeddings Generated', c.success(result.embeddingsGenerated.toString()))}`)
      }
      console.log(`  ${fmt.kv('Skipped', c.muted(result.skipped.toString()))}`)
      if (result.errors.length > 0) {
        console.log(`  ${fmt.kv('Errors', c.error(result.errors.length.toString()))}`)
      }
    }
    console.log()
  }

  // Summary
  console.log(fmt.section('Summary'))
  console.log()
  console.log(`  ${fmt.kv('Total Files', totals.total.toString())}`)
  console.log(`  ${fmt.kv('Schema Migrated', c.success(totals.migrated.toString()))}`)
  if (options.embeddings) {
    console.log(`  ${fmt.kv('Embeddings Generated', c.success(totals.embeddingsGenerated.toString()))}`)
  }
  console.log(`  ${fmt.kv('Already Current', c.muted(totals.skipped.toString()))}`)

  if (totals.errors.length > 0) {
    console.log(`  ${fmt.kv('Errors', c.error(totals.errors.length.toString()))}`)
    console.log()
    for (const error of totals.errors) {
      console.log(`    ${c.error(symbols.cross)} ${error}`)
    }
  }

  console.log()

  if (options.dryRun && totals.migrated > 0) {
    console.log(c.warn(`  ${symbols.warning} This was a dry run. Run without --dry-run to apply changes.`))
    console.log()
  }
}
