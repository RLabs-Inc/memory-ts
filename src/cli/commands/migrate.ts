// ============================================================================
// MIGRATE COMMAND - Upgrade memory files to latest schema version
// Supports: v1→v3, v2→v3 migrations
// ============================================================================

import { join } from 'path'
import { homedir } from 'os'
import { Glob } from 'bun'
import { c, symbols, fmt } from '../colors.ts'
import { EmbeddingGenerator } from '../../core/embeddings.ts'
import {
  V3_SCHEMA_VERSION,
  CONTEXT_TYPE_MIGRATION_MAP,
  V3_TYPE_DEFAULTS,
  V3_DELETED_FIELDS,
  CANONICAL_CONTEXT_TYPES,
  migrateContextType,
  isKnownContextType,
  migrateTemporalRelevance,
  type CanonicalContextType,
} from '../../migrations/v3-schema.ts'

// Custom mapping loaded from file
let customMapping: Record<string, string> | null = null

interface MigrateOptions {
  dryRun?: boolean
  verbose?: boolean
  path?: string  // Custom path to migrate
  embeddings?: boolean  // Regenerate embeddings for all memories
  analyze?: boolean  // Analyze fragmentation, show what would change
  generateMapping?: string  // Generate a mapping file for customization
  mapping?: string  // Path to custom mapping file
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
  contextTypesMigrated: number
  fieldsDeleted: number
  errors: string[]
  // Tracking what changed
  contextTypeChanges: Map<string, string>  // old → new
  unknownTypes: Map<string, number>  // types not in our mapping
  nullEmbeddings: number  // count of null embeddings found
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
 * Get the migrated context type, using custom mapping if available
 */
function getMigratedContextType(oldType: string): CanonicalContextType {
  // Check custom mapping first
  if (customMapping && oldType in customMapping) {
    const mapped = customMapping[oldType]
    // Validate it's a canonical type
    if (CANONICAL_CONTEXT_TYPES.includes(mapped as CanonicalContextType)) {
      return mapped as CanonicalContextType
    }
  }

  // Fall back to default migration
  return migrateContextType(oldType) ?? 'technical'
}

/**
 * Apply v3 migration to frontmatter
 * Handles both v1→v3 and v2→v3
 */
function applyV3Migration(frontmatter: Record<string, any>): {
  migrated: Record<string, any>
  contextTypeChanged: boolean
  oldContextType: string
  newContextType: string
  deletedFieldsCount: number
  isUnknownType: boolean
} {
  const oldContextType = frontmatter.context_type ?? 'general'
  const newContextType = getMigratedContextType(oldContextType)
  const isUnknownType = !isKnownContextType(oldContextType) && !CANONICAL_CONTEXT_TYPES.includes(oldContextType as CanonicalContextType)
  const contextTypeChanged = oldContextType !== newContextType

  // Get type-specific defaults for the NEW context type
  const typeDefaults = V3_TYPE_DEFAULTS[newContextType]

  // Start with migrated frontmatter
  const migrated: Record<string, any> = { ...frontmatter }

  // 1. Migrate context_type to canonical
  migrated.context_type = newContextType

  // 2. Apply v3 defaults (also handles v1→v3 by filling in missing v2 fields)
  migrated.status = migrated.status ?? 'active'
  migrated.scope = migrated.scope ?? typeDefaults.scope

  // Migrate temporal_relevance → temporal_class (if temporal_class not already set)
  if (!migrated.temporal_class && migrated.temporal_relevance) {
    const migratedTemporal = migrateTemporalRelevance(migrated.temporal_relevance)
    if (migratedTemporal) {
      migrated.temporal_class = migratedTemporal
    }
  }
  migrated.temporal_class = migrated.temporal_class ?? typeDefaults.temporal_class
  migrated.fade_rate = migrated.fade_rate ?? typeDefaults.fade_rate
  migrated.sessions_since_surfaced = migrated.sessions_since_surfaced ?? 0
  migrated.awaiting_implementation = migrated.awaiting_implementation ?? false
  migrated.awaiting_decision = migrated.awaiting_decision ?? false
  migrated.exclude_from_retrieval = migrated.exclude_from_retrieval ?? false

  // Initialize arrays if missing
  migrated.related_to = migrated.related_to ?? []
  migrated.resolves = migrated.resolves ?? []
  migrated.blocks = migrated.blocks ?? []
  migrated.related_files = migrated.related_files ?? []
  migrated.anti_triggers = migrated.anti_triggers ?? []

  // 3. DELETE obsolete fields
  let deletedFieldsCount = 0
  for (const field of V3_DELETED_FIELDS) {
    if (field in migrated) {
      delete migrated[field]
      deletedFieldsCount++
    }
  }

  // 4. Mark as v3
  migrated.schema_version = V3_SCHEMA_VERSION

  return { migrated, contextTypeChanged, oldContextType, newContextType, deletedFieldsCount, isUnknownType }
}

/**
 * Check if file needs v3 migration
 */
function needsV3Migration(frontmatter: Record<string, any>): boolean {
  // Needs migration if:
  // 1. Schema version < 3
  // 2. context_type is not canonical
  // 3. Has deleted fields
  if (!frontmatter.schema_version || frontmatter.schema_version < V3_SCHEMA_VERSION) {
    return true
  }

  // Check if context_type needs migration even if already v3
  const contextType = frontmatter.context_type ?? ''
  if (!(contextType in V3_TYPE_DEFAULTS)) {
    return true
  }

  // Check for deleted fields that shouldn't exist
  for (const field of V3_DELETED_FIELDS) {
    if (field in frontmatter) {
      return true
    }
  }

  return false
}

/**
 * Migrate a single memory file
 */
async function migrateFile(
  filePath: string,
  options: MigrateOptions
): Promise<{
  migrated: boolean
  embeddingGenerated: boolean
  contextTypeChanged: boolean
  oldContextType?: string
  newContextType?: string
  deletedFieldsCount: number
  isUnknownType: boolean
  hasNullEmbedding: boolean
  error?: string
}> {
  try {
    const file = Bun.file(filePath)
    const content = await file.text()
    const parsed = parseFrontmatter(content)

    if (!parsed) {
      return { migrated: false, embeddingGenerated: false, contextTypeChanged: false, deletedFieldsCount: 0, isUnknownType: false, hasNullEmbedding: false, error: 'Could not parse frontmatter' }
    }

    const hasNullEmbedding = !parsed.frontmatter.embedding || parsed.frontmatter.embedding === null
    const hasWrongDimensions = !hasNullEmbedding && Array.isArray(parsed.frontmatter.embedding) && parsed.frontmatter.embedding.length !== 384
    const needsSchema = needsV3Migration(parsed.frontmatter)
    const needsEmbedding = options.embeddings && (hasNullEmbedding || hasWrongDimensions)

    // Nothing to do
    if (!needsSchema && !needsEmbedding) {
      return { migrated: false, embeddingGenerated: false, contextTypeChanged: false, deletedFieldsCount: 0, isUnknownType: false, hasNullEmbedding }
    }

    let newFrontmatter = parsed.frontmatter
    let contextTypeChanged = false
    let oldContextType: string | undefined
    let newContextType: string | undefined
    let deletedFieldsCount = 0
    let isUnknownType = false

    // Apply schema migration if needed
    if (needsSchema) {
      const result = applyV3Migration(parsed.frontmatter)
      newFrontmatter = result.migrated
      contextTypeChanged = result.contextTypeChanged
      oldContextType = result.oldContextType
      newContextType = result.newContextType
      deletedFieldsCount = result.deletedFieldsCount
      isUnknownType = result.isUnknownType
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

    return {
      migrated: needsSchema,
      embeddingGenerated,
      contextTypeChanged,
      oldContextType,
      newContextType,
      deletedFieldsCount,
      isUnknownType,
      hasNullEmbedding
    }
  } catch (error: any) {
    return { migrated: false, embeddingGenerated: false, contextTypeChanged: false, deletedFieldsCount: 0, isUnknownType: false, hasNullEmbedding: false, error: error.message }
  }
}

/**
 * Find all memory directories to migrate
 */
async function findMemoryPaths(customPath?: string): Promise<{ path: string; label: string }[]> {
  const paths: { path: string; label: string }[] = []

  if (customPath) {
    paths.push({ path: customPath, label: customPath })
    return paths
  }

  const storageMode = process.env.MEMORY_STORAGE_MODE ?? 'central'
  const centralPath = process.env.MEMORY_CENTRAL_PATH ?? join(homedir(), '.local', 'share', 'memory')

  // ALWAYS check global memories
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
    // Central mode: check all project directories
    try {
      const projectGlob = new Glob('*/memories')
      for await (const match of projectGlob.scan({ cwd: centralPath, onlyFiles: false })) {
        if (match.startsWith('global/')) continue

        const fullPath = join(centralPath, match)
        const projectId = match.split('/')[0]

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
 * Migrate all memory files in a directory
 */
async function migrateDirectory(dir: string, options: MigrateOptions): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    embeddingsGenerated: 0,
    contextTypesMigrated: 0,
    fieldsDeleted: 0,
    errors: [],
    contextTypeChanges: new Map(),
    unknownTypes: new Map(),
    nullEmbeddings: 0
  }

  try {
    const glob = new Glob('*.md')

    for await (const file of glob.scan({ cwd: dir })) {
      result.total++
      const filePath = join(dir, file)

      const migrationResult = await migrateFile(filePath, options)

      // Track null embeddings
      if (migrationResult.hasNullEmbedding) {
        result.nullEmbeddings++
      }

      if (migrationResult.error) {
        result.errors.push(`${file}: ${migrationResult.error}`)
        if (options.verbose) {
          console.log(`  ${c.error(symbols.cross)} ${file}: ${migrationResult.error}`)
        }
      } else if (migrationResult.migrated || migrationResult.embeddingGenerated) {
        if (migrationResult.migrated) result.migrated++
        if (migrationResult.embeddingGenerated) result.embeddingsGenerated++
        if (migrationResult.contextTypeChanged) {
          result.contextTypesMigrated++
          // Track the change
          const key = `${migrationResult.oldContextType} → ${migrationResult.newContextType}`
          result.contextTypeChanges.set(key, (result.contextTypeChanges.get(key) ?? '') + '.')

          // Track unknown types
          if (migrationResult.isUnknownType && migrationResult.oldContextType) {
            result.unknownTypes.set(
              migrationResult.oldContextType,
              (result.unknownTypes.get(migrationResult.oldContextType) ?? 0) + 1
            )
          }
        }
        result.fieldsDeleted += migrationResult.deletedFieldsCount

        if (options.verbose) {
          const actions = []
          if (migrationResult.migrated) actions.push('v3')
          if (migrationResult.embeddingGenerated) actions.push('embedding')
          if (migrationResult.contextTypeChanged) {
            const prefix = migrationResult.isUnknownType ? '⚠️' : ''
            actions.push(`${prefix}${migrationResult.oldContextType}→${migrationResult.newContextType}`)
          }
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

/**
 * Analyze all memories and report on fragmentation
 */
async function analyzeMemories(memoryPaths: { path: string; label: string }[]): Promise<{
  contextTypes: Map<string, number>
  nullEmbeddings: number
  totalMemories: number
  deletedFieldsFound: Map<string, number>
}> {
  const contextTypes = new Map<string, number>()
  const deletedFieldsFound = new Map<string, number>()
  let nullEmbeddings = 0
  let totalMemories = 0

  for (const { path: dir } of memoryPaths) {
    try {
      const glob = new Glob('*.md')
      for await (const file of glob.scan({ cwd: dir })) {
        totalMemories++
        const filePath = join(dir, file)
        const content = await Bun.file(filePath).text()
        const parsed = parseFrontmatter(content)

        if (!parsed) continue

        // Count context types
        const ct = parsed.frontmatter.context_type ?? 'unknown'
        contextTypes.set(ct, (contextTypes.get(ct) ?? 0) + 1)

        // Count null embeddings
        if (!parsed.frontmatter.embedding || parsed.frontmatter.embedding === null) {
          nullEmbeddings++
        }

        // Count deleted fields that still exist
        for (const field of V3_DELETED_FIELDS) {
          if (field in parsed.frontmatter) {
            deletedFieldsFound.set(field, (deletedFieldsFound.get(field) ?? 0) + 1)
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  return { contextTypes, nullEmbeddings, totalMemories, deletedFieldsFound }
}

/**
 * Show analysis of what migration would do
 */
async function showAnalysis(options: MigrateOptions) {
  console.log()
  console.log(c.header(`${symbols.search} Memory Migration Analysis`))
  console.log()

  const memoryPaths = await findMemoryPaths(options.path)

  if (memoryPaths.length === 0) {
    console.log(c.warn(`  ${symbols.warning} No memory directories found`))
    return
  }

  console.log(c.muted('  Scanning memories...'))
  console.log()

  const { contextTypes, nullEmbeddings, totalMemories, deletedFieldsFound } = await analyzeMemories(memoryPaths)

  console.log(fmt.section('Overview'))
  console.log(`  ${fmt.kv('Total Memories', totalMemories.toString())}`)
  console.log(`  ${fmt.kv('Unique context_types', contextTypes.size.toString())}`)
  console.log(`  ${fmt.kv('Null Embeddings', nullEmbeddings > 0 ? c.warn(nullEmbeddings.toString()) : c.success('0'))}`)
  console.log()

  // Show context_type breakdown
  console.log(fmt.section('Context Type Analysis'))
  console.log()

  const sorted = [...contextTypes.entries()].sort((a, b) => b[1] - a[1])

  // Categorize types
  const canonical: [string, number][] = []
  const willMigrate: [string, number, string][] = []
  const unknown: [string, number, string][] = []

  for (const [type, count] of sorted) {
    if (CANONICAL_CONTEXT_TYPES.includes(type as CanonicalContextType)) {
      canonical.push([type, count])
    } else {
      const migrated = migrateContextType(type)
      if (isKnownContextType(type)) {
        willMigrate.push([type, count, migrated!])
      } else {
        unknown.push([type, count, migrated!])
      }
    }
  }

  // Show canonical (already good)
  if (canonical.length > 0) {
    console.log(c.success('  Already Canonical (no change needed):'))
    for (const [type, count] of canonical) {
      console.log(c.muted(`    ${type}: ${count}`))
    }
    console.log()
  }

  // Show known migrations
  if (willMigrate.length > 0) {
    console.log(c.warn('  Known Fragmented Types (will be migrated):'))
    for (const [oldType, count, newType] of willMigrate.slice(0, 30)) {
      console.log(`    ${c.muted(oldType)} → ${c.success(newType)} (${count})`)
    }
    if (willMigrate.length > 30) {
      console.log(c.muted(`    ... and ${willMigrate.length - 30} more`))
    }
    console.log()
  }

  // Show unknown (will use fuzzy matching or fallback)
  if (unknown.length > 0) {
    console.log(c.error('  Unknown Types (will use fuzzy matching → fallback):'))
    for (const [oldType, count, newType] of unknown.slice(0, 20)) {
      console.log(`    ${c.error(oldType)} → ${c.warn(newType)} (${count})`)
    }
    if (unknown.length > 20) {
      console.log(c.muted(`    ... and ${unknown.length - 20} more`))
    }
    console.log()
    console.log(c.muted('  To customize unknown type mappings:'))
    console.log(c.muted('    1. Run: memory migrate --generate-mapping mapping.json'))
    console.log(c.muted('    2. Edit mapping.json with your preferred mappings'))
    console.log(c.muted('    3. Run: memory migrate --mapping mapping.json'))
    console.log()
  }

  // Show deleted fields
  if (deletedFieldsFound.size > 0) {
    console.log(fmt.section('Fields to be Removed'))
    for (const [field, count] of deletedFieldsFound.entries()) {
      console.log(`  ${c.muted(field)}: ${count} memories`)
    }
    console.log()
  }

  // Summary
  console.log(fmt.section('Migration Summary'))
  console.log(`  ${fmt.kv('Types already canonical', c.success(canonical.length.toString()))}`)
  console.log(`  ${fmt.kv('Types to migrate (known)', c.warn(willMigrate.length.toString()))}`)
  console.log(`  ${fmt.kv('Types to migrate (unknown)', unknown.length > 0 ? c.error(unknown.length.toString()) : '0')}`)
  console.log(`  ${fmt.kv('Fields to remove', deletedFieldsFound.size.toString())}`)
  console.log()

  if (willMigrate.length > 0 || unknown.length > 0) {
    console.log(c.muted('  To run migration:'))
    console.log(c.muted('    memory migrate --dry-run  # Preview changes'))
    console.log(c.muted('    memory migrate            # Apply changes'))
  } else {
    console.log(c.success('  All context_types are already canonical!'))
  }
  console.log()
}

/**
 * Generate a mapping file for customization
 */
async function generateMappingFile(outputPath: string, options: MigrateOptions) {
  console.log()
  console.log(c.header(`${symbols.gear} Generate Custom Mapping File`))
  console.log()

  const memoryPaths = await findMemoryPaths(options.path)

  if (memoryPaths.length === 0) {
    console.log(c.warn(`  ${symbols.warning} No memory directories found`))
    return
  }

  console.log(c.muted('  Scanning memories...'))

  const { contextTypes } = await analyzeMemories(memoryPaths)

  // Build mapping with our defaults, user can customize
  const mapping: Record<string, string> = {}

  for (const [type] of contextTypes.entries()) {
    if (CANONICAL_CONTEXT_TYPES.includes(type as CanonicalContextType)) {
      // Already canonical, map to itself
      mapping[type] = type
    } else {
      // Use our migration logic
      const migrated = migrateContextType(type) ?? 'technical'
      mapping[type] = migrated
    }
  }

  const output = {
    _comment: 'Edit the values to customize how context_types are migrated',
    _canonical_types: CANONICAL_CONTEXT_TYPES,
    _generated: new Date().toISOString(),
    mapping
  }

  await Bun.write(outputPath, JSON.stringify(output, null, 2))

  console.log()
  console.log(c.success(`  ${symbols.tick} Generated: ${outputPath}`))
  console.log()
  console.log(c.muted('  Edit the file to customize mappings, then run:'))
  console.log(c.muted(`    memory migrate --mapping ${outputPath} --dry-run`))
  console.log(c.muted(`    memory migrate --mapping ${outputPath}`))
  console.log()
}

/**
 * Load custom mapping from file
 */
async function loadCustomMapping(mappingPath: string): Promise<Record<string, string>> {
  try {
    const content = await Bun.file(mappingPath).text()
    const parsed = JSON.parse(content)
    return parsed.mapping ?? parsed
  } catch (error: any) {
    throw new Error(`Could not load mapping file: ${error.message}`)
  }
}

export async function migrate(options: MigrateOptions) {
  // Handle analyze mode
  if (options.analyze) {
    return showAnalysis(options)
  }

  // Handle generate-mapping mode
  if (options.generateMapping) {
    return generateMappingFile(options.generateMapping, options)
  }

  // Load custom mapping if provided
  if (options.mapping) {
    try {
      customMapping = await loadCustomMapping(options.mapping)
      console.log(c.success(`  ${symbols.tick} Loaded custom mapping from ${options.mapping}`))
    } catch (error: any) {
      console.log(c.error(`  ${symbols.cross} ${error.message}`))
      return
    }
  }
  console.log()
  console.log(c.header(`${symbols.gear} Memory Migration to v${V3_SCHEMA_VERSION}`))
  console.log()
  console.log(`  ${fmt.kv('Target Version', `v${V3_SCHEMA_VERSION}`)}`)
  console.log(`  ${fmt.kv('Storage Mode', process.env.MEMORY_STORAGE_MODE ?? 'central')}`)
  console.log(`  ${fmt.kv('Embeddings', options.embeddings ? c.success('Regenerate null') : c.muted('Skip'))}`)
  console.log(`  ${fmt.kv('Mode', options.dryRun ? c.warn('DRY RUN') : c.success('LIVE'))}`)
  console.log()

  console.log(c.muted('  v3 Changes:'))
  console.log(c.muted('    • Consolidates 170+ context_types → 11 canonical'))
  console.log(c.muted('    • Removes 10 unused fields'))
  console.log(c.muted('    • Applies type-specific defaults'))
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

  const totals: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    embeddingsGenerated: 0,
    contextTypesMigrated: 0,
    fieldsDeleted: 0,
    errors: [],
    contextTypeChanges: new Map(),
    unknownTypes: new Map(),
    nullEmbeddings: 0
  }

  for (const { path, label } of memoryPaths) {
    console.log(fmt.section(label))
    console.log(c.muted(`  ${path}`))
    console.log()

    const result = await migrateDirectory(path, options)

    totals.total += result.total
    totals.migrated += result.migrated
    totals.skipped += result.skipped
    totals.embeddingsGenerated += result.embeddingsGenerated
    totals.contextTypesMigrated += result.contextTypesMigrated
    totals.fieldsDeleted += result.fieldsDeleted
    totals.errors.push(...result.errors)

    // Merge context type changes
    for (const [key, value] of result.contextTypeChanges) {
      const existing = totals.contextTypeChanges.get(key) ?? ''
      totals.contextTypeChanges.set(key, existing + value)
    }

    // Merge unknown types
    for (const [key, value] of result.unknownTypes) {
      totals.unknownTypes.set(key, (totals.unknownTypes.get(key) ?? 0) + value)
    }

    // Track null embeddings
    totals.nullEmbeddings += result.nullEmbeddings

    if (!options.verbose) {
      console.log(`  ${fmt.kv('Files', result.total.toString())}`)
      console.log(`  ${fmt.kv('Migrated to v3', c.success(result.migrated.toString()))}`)
      if (result.contextTypesMigrated > 0) {
        console.log(`  ${fmt.kv('Context Types Fixed', c.success(result.contextTypesMigrated.toString()))}`)
      }
      if (result.fieldsDeleted > 0) {
        console.log(`  ${fmt.kv('Dead Fields Removed', c.success(result.fieldsDeleted.toString()))}`)
      }
      if (options.embeddings) {
        console.log(`  ${fmt.kv('Embeddings Generated', c.success(result.embeddingsGenerated.toString()))}`)
      }
      console.log(`  ${fmt.kv('Already v3', c.muted(result.skipped.toString()))}`)
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
  console.log(`  ${fmt.kv('Migrated to v3', c.success(totals.migrated.toString()))}`)
  console.log(`  ${fmt.kv('Context Types Fixed', c.success(totals.contextTypesMigrated.toString()))}`)
  console.log(`  ${fmt.kv('Dead Fields Removed', c.success(totals.fieldsDeleted.toString()))}`)
  if (options.embeddings) {
    console.log(`  ${fmt.kv('Embeddings Generated', c.success(totals.embeddingsGenerated.toString()))}`)
  }
  console.log(`  ${fmt.kv('Already v3', c.muted(totals.skipped.toString()))}`)

  // Show unknown types warning
  if (totals.unknownTypes.size > 0) {
    console.log()
    console.log(c.warn('  Unknown Types (used fuzzy matching):'))
    const sorted = [...totals.unknownTypes.entries()].sort((a, b) => b[1] - a[1])
    for (const [type, count] of sorted.slice(0, 10)) {
      console.log(`    ${c.warn(type)}: ${count}`)
    }
    if (sorted.length > 10) {
      console.log(c.muted(`    ... and ${sorted.length - 10} more`))
    }
    console.log()
    console.log(c.muted('  To customize these mappings:'))
    console.log(c.muted('    memory migrate --generate-mapping mapping.json'))
  }

  // Show context type migration breakdown
  if (totals.contextTypeChanges.size > 0) {
    console.log()
    console.log(c.muted('  Context Type Migrations:'))
    const sorted = [...totals.contextTypeChanges.entries()]
      .map(([key, dots]) => ({ key, count: dots.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    for (const { key, count } of sorted) {
      console.log(c.muted(`    ${key}: ${count}`))
    }
    if (totals.contextTypeChanges.size > 15) {
      console.log(c.muted(`    ... and ${totals.contextTypeChanges.size - 15} more`))
    }
  }

  // Show null embeddings warning
  if (totals.nullEmbeddings > 0 && !options.embeddings) {
    console.log()
    console.log(c.warn(`  ${symbols.warning} ${totals.nullEmbeddings} memories have null embeddings`))
    console.log(c.muted('    Run with --embeddings to regenerate them'))
  }

  if (totals.errors.length > 0) {
    console.log()
    console.log(`  ${fmt.kv('Errors', c.error(totals.errors.length.toString()))}`)
    for (const error of totals.errors.slice(0, 10)) {
      console.log(`    ${c.error(symbols.cross)} ${error}`)
    }
    if (totals.errors.length > 10) {
      console.log(`    ... and ${totals.errors.length - 10} more errors`)
    }
  }

  console.log()

  if (options.dryRun && totals.migrated > 0) {
    console.log(c.warn(`  ${symbols.warning} This was a DRY RUN. No files were modified.`))
    console.log(c.muted(`  Run without --dry-run to apply changes.`))
    console.log()
  } else if (totals.migrated > 0) {
    console.log(c.success(`  ${symbols.tick} Migration complete!`))
    console.log()
  }
}
