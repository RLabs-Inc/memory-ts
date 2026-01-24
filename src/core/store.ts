// ============================================================================
// MEMORY STORE - fsDB-powered storage
// Per-project database management with reactive parallel arrays
// ============================================================================

import { createDatabase, type Database, type PersistentCollection } from '@rlabs-inc/fsdb'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from '../utils/logger.ts'
import {
  type CuratedMemory,
  type StoredMemory,
  type SessionSummary,
  type ProjectSnapshot,
  V2_DEFAULTS,
} from '../types/memory.ts'
import {
  memorySchema,
  sessionSummarySchema,
  projectSnapshotSchema,
  sessionSchema,
  managementLogSchema,
  personalPrimerSchema,
  MEMORY_SCHEMA_VERSION,
  type MemorySchema,
  type SessionSummarySchema,
  type ProjectSnapshotSchema,
  type SessionSchema,
  type ManagementLogSchema,
  type PersonalPrimerSchema,
} from '../types/schema.ts'

/**
 * Store configuration
 */
export interface StoreConfig {
  /**
   * Base path for memory storage
   * Default: ~/.local/share/memory
   * Each project gets its own subdirectory
   */
  basePath?: string

  /**
   * Path for global memories (shared across all projects)
   * Default: ~/.local/share/memory/global
   * Global memories are ALWAYS stored centrally, even in local mode
   */
  globalPath?: string

  /**
   * Whether to watch for file changes
   * Default: false
   */
  watchFiles?: boolean
}

/**
 * Project database with collections
 */
interface ProjectDB {
  db: Database
  memories: PersistentCollection<typeof memorySchema>
  summaries: PersistentCollection<typeof sessionSummarySchema>
  snapshots: PersistentCollection<typeof projectSnapshotSchema>
  sessions: PersistentCollection<typeof sessionSchema>
}

/**
 * Global database with collections (shared across all projects)
 */
interface GlobalDB {
  db: Database
  memories: PersistentCollection<typeof memorySchema>
  managementLogs: PersistentCollection<typeof managementLogSchema>
  primer: PersistentCollection<typeof personalPrimerSchema>
}

/**
 * Personal primer structure
 */
export interface PersonalPrimer {
  content: string
  updated: number // timestamp
}

/**
 * Special ID for the personal primer record
 */
const PERSONAL_PRIMER_ID = 'personal-primer'

/**
 * Default central path for global memories
 * Global memories are ALWAYS stored here, even in local mode
 */
const DEFAULT_GLOBAL_PATH = join(homedir(), '.local', 'share', 'memory', 'global')

/**
 * MemoryStore - Manages per-project fsDB instances
 */
export class MemoryStore {
  private _config: Required<StoreConfig>
  private _projects = new Map<string, ProjectDB>()
  private _global: GlobalDB | null = null

  constructor(config: StoreConfig = {}) {
    this._config = {
      basePath: config.basePath ?? join(homedir(), '.local', 'share', 'memory'),
      // Global path is ALWAYS central, never local
      globalPath: config.globalPath ?? DEFAULT_GLOBAL_PATH,
      watchFiles: config.watchFiles ?? false,
    }
  }

  // ================================================================
  // GLOBAL DATABASE OPERATIONS
  // ================================================================

  /**
   * Get or create the global database (shared across all projects)
   * Global is ALWAYS in central location, even when using local mode for projects
   */
  async getGlobal(): Promise<GlobalDB> {
    if (this._global) {
      return this._global
    }

    // Use the configured global path (always central)
    const globalPath = this._config.globalPath
    logger.debug(`Initializing global database at ${globalPath}`, 'store')

    const db = createDatabase({
      name: 'global',
      basePath: globalPath,
    })

    // Global memories collection (personal, philosophy, preferences, general breakthroughs)
    const memories = db.collection('memories', {
      schema: memorySchema,
      contentColumn: 'content',
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    // Management log collection (tracks management agent activity)
    const managementLogs = db.collection('management-logs', {
      schema: managementLogSchema,
      contentColumn: 'summary',
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    // Personal primer collection (singleton - relationship context for session start)
    const primer = db.collection('primer', {
      schema: personalPrimerSchema,
      contentColumn: 'content',
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    await Promise.all([memories.load(), managementLogs.load(), primer.load()])

    this._global = { db, memories, managementLogs, primer }
    return this._global
  }

  /**
   * Get all global memories
   */
  async getGlobalMemories(): Promise<StoredMemory[]> {
    const { memories } = await this.getGlobal()

    return memories.all().map(record => ({
      id: record.id,
      headline: record.headline ?? '',  // v4: may be empty for old memories
      content: record.content,
      reasoning: record.reasoning,
      importance_weight: record.importance_weight,
      confidence_score: record.confidence_score,
      context_type: record.context_type as StoredMemory['context_type'],
      temporal_class: record.temporal_class as StoredMemory['temporal_class'],
      action_required: record.action_required,
      problem_solution_pair: record.problem_solution_pair,
      semantic_tags: record.semantic_tags,
      trigger_phrases: record.trigger_phrases,
      question_types: record.question_types,
      session_id: record.session_id,
      project_id: 'global',
      embedding: record.embedding ?? undefined,
      created_at: record.created,
      updated_at: record.updated,
      stale: record.stale,
    }))
  }

  /**
   * Store a global memory (personal, philosophy, preference, etc.)
   * Global memories are ALWAYS scope: 'global' and have their own type defaults
   */
  async storeGlobalMemory(
    sessionId: string,
    memory: CuratedMemory,
    embedding?: Float32Array | number[],
    sessionNumber?: number
  ): Promise<string> {
    const { memories } = await this.getGlobal()

    // Get type-specific defaults (personal, philosophy, preference tend to be eternal)
    const contextType = memory.context_type ?? 'personal'
    const typeDefaults = V2_DEFAULTS.typeDefaults[contextType] ?? V2_DEFAULTS.typeDefaults.personal

    const id = memories.insert({
      // Core fields (v4: headline + content)
      headline: memory.headline ?? '',  // v4: 1-2 line summary
      content: memory.content,           // v4: Full structured template
      reasoning: memory.reasoning,
      importance_weight: memory.importance_weight,
      confidence_score: memory.confidence_score,
      context_type: memory.context_type,
      temporal_class: memory.temporal_class ?? typeDefaults?.temporal_class ?? 'eternal',
      action_required: memory.action_required,
      problem_solution_pair: memory.problem_solution_pair,
      semantic_tags: memory.semantic_tags,
      trigger_phrases: memory.trigger_phrases,
      question_types: memory.question_types,
      anti_triggers: memory.anti_triggers ?? [],
      session_id: sessionId,
      project_id: 'global',
      embedding: embedding
        ? (embedding instanceof Float32Array ? embedding : new Float32Array(embedding))
        : null,

      // Lifecycle fields - global memories are always scope: 'global'
      status: V2_DEFAULTS.fallback.status,
      scope: 'global',  // Always global for global memories
      fade_rate: typeDefaults?.fade_rate ?? 0,  // Global memories typically don't fade
      session_created: sessionNumber ?? 0,
      session_updated: sessionNumber ?? 0,
      sessions_since_surfaced: 0,
      domain: memory.domain ?? null,
      feature: memory.feature ?? null,
      related_files: memory.related_files ?? [],
      awaiting_implementation: memory.awaiting_implementation ?? false,
      awaiting_decision: memory.awaiting_decision ?? false,
      exclude_from_retrieval: false,
      schema_version: MEMORY_SCHEMA_VERSION,

      // Relationship fields
      supersedes: null,
      superseded_by: null,
      related_to: [],
      resolves: [],
      resolved_by: null,
      blocked_by: null,
      blocks: [],
    })

    return id
  }

  // ================================================================
  // PERSONAL PRIMER OPERATIONS
  // ================================================================

  /**
   * Get the personal primer content
   * Returns null if no primer exists yet (grows organically with personal memories)
   */
  async getPersonalPrimer(): Promise<PersonalPrimer | null> {
    const { primer } = await this.getGlobal()

    // Personal primer is stored in dedicated primer collection (singleton)
    const record = primer.get(PERSONAL_PRIMER_ID)
    if (!record) {
      return null
    }

    return {
      content: record.content,
      updated: record.updated,  // fsdb auto-manages this timestamp
    }
  }

  /**
   * Update the personal primer
   * Creates it if it doesn't exist
   * @param content - The markdown content for the primer
   * @param sessionNumber - Current session number (for tracking when updated)
   * @param updatedBy - Who made the update ('user' | 'manager' | 'curator')
   */
  async setPersonalPrimer(
    content: string,
    sessionNumber?: number,
    updatedBy: 'user' | 'manager' | 'curator' = 'user'
  ): Promise<void> {
    const { primer } = await this.getGlobal()

    const existing = primer.get(PERSONAL_PRIMER_ID)
    if (existing) {
      primer.update(PERSONAL_PRIMER_ID, {
        content,
        session_updated: sessionNumber ?? existing.session_updated,
        updated_by: updatedBy,
      })
    } else {
      // Create the primer record
      primer.insert({
        id: PERSONAL_PRIMER_ID,
        content,
        session_updated: sessionNumber ?? 0,
        updated_by: updatedBy,
      })
    }
  }

  /**
   * Check if personal memories are enabled
   * For now, always returns true. Later can be configured.
   */
  isPersonalMemoriesEnabled(): boolean {
    // TODO: Read from config file if needed
    return true
  }

  // ================================================================
  // MANAGEMENT LOG OPERATIONS
  // ================================================================

  /**
   * Store a management log entry
   * Stores complete data with no truncation
   */
  async storeManagementLog(entry: {
    projectId: string
    sessionNumber: number
    memoriesProcessed: number
    supersededCount: number
    resolvedCount: number
    linkedCount: number
    primerUpdated: boolean
    success: boolean
    durationMs: number
    summary: string
    fullReport?: string
    error?: string
    details?: Record<string, any>
  }): Promise<string> {
    const { managementLogs } = await this.getGlobal()

    const id = managementLogs.insert({
      project_id: entry.projectId,
      session_number: entry.sessionNumber,
      memories_processed: entry.memoriesProcessed,
      superseded_count: entry.supersededCount,
      resolved_count: entry.resolvedCount,
      linked_count: entry.linkedCount,
      primer_updated: entry.primerUpdated,
      success: entry.success,
      duration_ms: entry.durationMs,
      summary: entry.summary,
      full_report: entry.fullReport ?? '',
      error: entry.error ?? '',
      details: entry.details ? JSON.stringify(entry.details) : '',
    })

    return id
  }

  /**
   * Get recent management logs
   */
  async getManagementLogs(limit: number = 10): Promise<Array<{
    id: string
    projectId: string
    sessionNumber: number
    memoriesProcessed: number
    supersededCount: number
    resolvedCount: number
    linkedCount: number
    primerUpdated: boolean
    success: boolean
    durationMs: number
    summary: string
    createdAt: number
  }>> {
    const { managementLogs } = await this.getGlobal()

    return managementLogs
      .all()
      .sort((a, b) => b.created - a.created)
      .slice(0, limit)
      .map(record => ({
        id: record.id,
        projectId: record.project_id,
        sessionNumber: record.session_number,
        memoriesProcessed: record.memories_processed,
        supersededCount: record.superseded_count,
        resolvedCount: record.resolved_count,
        linkedCount: record.linked_count,
        primerUpdated: record.primer_updated,
        success: record.success,
        durationMs: record.duration_ms,
        summary: record.summary,
        createdAt: record.created,
      }))
  }

  /**
   * Get or create database for a project
   */
  async getProject(projectId: string): Promise<ProjectDB> {
    if (this._projects.has(projectId)) {
      logger.debug(`Returning cached databases for ${projectId}`, 'store')
      return this._projects.get(projectId)!
    }

    logger.debug(`Creating NEW databases for ${projectId}`, 'store')
    const projectPath = join(this._config.basePath, projectId)
    logger.debug(`Path: ${projectPath}`, 'store')

    // Create the database for this project
    const db = createDatabase({
      name: projectId,
      basePath: projectPath,
    })

    // Create all collections for this project
    const memories = db.collection('memories', {
      schema: memorySchema,
      contentColumn: 'content',
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    const summaries = db.collection('summaries', {
      schema: sessionSummarySchema,
      contentColumn: 'summary',
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    const snapshots = db.collection('snapshots', {
      schema: projectSnapshotSchema,
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    const sessions = db.collection('sessions', {
      schema: sessionSchema,
      autoSave: true,
      watchFiles: this._config.watchFiles,
    })

    // Load existing data
    await Promise.all([
      memories.load(),
      summaries.load(),
      snapshots.load(),
      sessions.load(),
    ])

    const projectDB: ProjectDB = { db, memories, summaries, snapshots, sessions }
    this._projects.set(projectId, projectDB)

    return projectDB
  }

  // ================================================================
  // MEMORY OPERATIONS
  // ================================================================

  /**
   * Store a curated memory with v2 lifecycle fields
   */
  async storeMemory(
    projectId: string,
    sessionId: string,
    memory: CuratedMemory,
    embedding?: Float32Array | number[],
    sessionNumber?: number
  ): Promise<string> {
    const { memories } = await this.getProject(projectId)

    // Get type-specific defaults
    const contextType = memory.context_type ?? 'general'
    const typeDefaults = V2_DEFAULTS.typeDefaults[contextType] ?? V2_DEFAULTS.typeDefaults.technical

    const id = memories.insert({
      // Core fields (v4: headline + content)
      headline: memory.headline ?? '',  // v4: 1-2 line summary
      content: memory.content,           // v4: Full structured template
      reasoning: memory.reasoning,
      importance_weight: memory.importance_weight,
      confidence_score: memory.confidence_score,
      context_type: memory.context_type,
      temporal_class: memory.temporal_class ?? typeDefaults?.temporal_class ?? V2_DEFAULTS.fallback.temporal_class,
      action_required: memory.action_required,
      problem_solution_pair: memory.problem_solution_pair,
      semantic_tags: memory.semantic_tags,
      trigger_phrases: memory.trigger_phrases,
      question_types: memory.question_types,
      anti_triggers: memory.anti_triggers ?? [],
      session_id: sessionId,
      project_id: projectId,
      embedding: embedding
        ? (embedding instanceof Float32Array ? embedding : new Float32Array(embedding))
        : null,

      // Lifecycle fields - use curator-provided values or smart defaults
      status: V2_DEFAULTS.fallback.status,
      scope: memory.scope ?? typeDefaults?.scope ?? V2_DEFAULTS.fallback.scope,
      fade_rate: typeDefaults?.fade_rate ?? V2_DEFAULTS.fallback.fade_rate,
      session_created: sessionNumber ?? 0,
      session_updated: sessionNumber ?? 0,
      sessions_since_surfaced: 0,
      domain: memory.domain ?? null,
      feature: memory.feature ?? null,
      related_files: memory.related_files ?? [],
      awaiting_implementation: memory.awaiting_implementation ?? false,
      awaiting_decision: memory.awaiting_decision ?? false,
      exclude_from_retrieval: false,
      schema_version: MEMORY_SCHEMA_VERSION,

      // Relationship fields
      supersedes: null,
      superseded_by: null,
      related_to: [],
      resolves: [],
      resolved_by: null,
      blocked_by: null,
      blocks: [],
    })

    return id
  }

  /**
   * Update a memory's metadata fields
   * Used for curation actions: promote/demote importance, bury, archive
   */
  async updateMemory(
    projectId: string,
    memoryId: string,
    updates: {
      importance_weight?: number
      confidence_score?: number
      exclude_from_retrieval?: boolean
      status?: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
      action_required?: boolean
      awaiting_implementation?: boolean
      awaiting_decision?: boolean
      semantic_tags?: string[]
      trigger_phrases?: string[]
    }
  ): Promise<{ success: boolean; updated_fields: string[] }> {
    const { memories } = await this.getProject(projectId)

    // Check memory exists
    const existing = memories.get(memoryId)
    if (!existing) {
      return { success: false, updated_fields: [] }
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {}
    const updatedFields: string[] = []

    if (updates.importance_weight !== undefined) {
      updateData.importance_weight = Math.max(0, Math.min(1, updates.importance_weight))
      updatedFields.push('importance_weight')
    }
    if (updates.confidence_score !== undefined) {
      updateData.confidence_score = Math.max(0, Math.min(1, updates.confidence_score))
      updatedFields.push('confidence_score')
    }
    if (updates.exclude_from_retrieval !== undefined) {
      updateData.exclude_from_retrieval = updates.exclude_from_retrieval
      updatedFields.push('exclude_from_retrieval')
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status
      updatedFields.push('status')
    }
    if (updates.action_required !== undefined) {
      updateData.action_required = updates.action_required
      updatedFields.push('action_required')
    }
    if (updates.awaiting_implementation !== undefined) {
      updateData.awaiting_implementation = updates.awaiting_implementation
      updatedFields.push('awaiting_implementation')
    }
    if (updates.awaiting_decision !== undefined) {
      updateData.awaiting_decision = updates.awaiting_decision
      updatedFields.push('awaiting_decision')
    }
    if (updates.semantic_tags !== undefined) {
      updateData.semantic_tags = updates.semantic_tags
      updatedFields.push('semantic_tags')
    }
    if (updates.trigger_phrases !== undefined) {
      updateData.trigger_phrases = updates.trigger_phrases
      updatedFields.push('trigger_phrases')
    }

    if (updatedFields.length === 0) {
      return { success: true, updated_fields: [] }
    }

    // Perform update
    memories.update(memoryId, updateData)

    return { success: true, updated_fields: updatedFields }
  }

  /**
   * Get a single memory by ID
   */
  async getMemory(projectId: string, memoryId: string): Promise<StoredMemory | null> {
    const { memories } = await this.getProject(projectId)
    const record = memories.get(memoryId)
    if (!record) return null

    return {
      id: record.id,
      headline: record.headline ?? '',
      content: record.content,
      reasoning: record.reasoning,
      importance_weight: record.importance_weight,
      confidence_score: record.confidence_score,
      context_type: record.context_type as StoredMemory['context_type'],
      status: record.status as StoredMemory['status'],
      exclude_from_retrieval: record.exclude_from_retrieval,
      action_required: record.action_required,
      awaiting_implementation: record.awaiting_implementation,
      awaiting_decision: record.awaiting_decision,
      semantic_tags: record.semantic_tags,
      trigger_phrases: record.trigger_phrases,
      project_id: record.project_id,
      created_at: record.created_at,
      updated_at: record.updated_at,
    } as StoredMemory
  }

  /**
   * Get all memories for a project
   */
  async getAllMemories(projectId: string): Promise<StoredMemory[]> {
    const { memories } = await this.getProject(projectId)

    return memories.all().map(record => ({
      id: record.id,
      headline: record.headline ?? '',  // v4: may be empty for old memories
      content: record.content,
      reasoning: record.reasoning,
      importance_weight: record.importance_weight,
      confidence_score: record.confidence_score,
      context_type: record.context_type as StoredMemory['context_type'],
      temporal_class: record.temporal_class as StoredMemory['temporal_class'],
      action_required: record.action_required,
      problem_solution_pair: record.problem_solution_pair,
      semantic_tags: record.semantic_tags,
      trigger_phrases: record.trigger_phrases,
      question_types: record.question_types,
      session_id: record.session_id,
      project_id: record.project_id,
      embedding: record.embedding ?? undefined,
      created_at: record.created,
      updated_at: record.updated,
      stale: record.stale,
    }))
  }

  /**
   * Search memories by vector similarity
   */
  async searchMemories(
    projectId: string,
    queryEmbedding: Float32Array | number[],
    options: { topK?: number; filter?: (m: StoredMemory) => boolean } = {}
  ): Promise<StoredMemory[]> {
    const { memories } = await this.getProject(projectId)
    const { topK = 10, filter } = options

    const results = memories.search('embedding', queryEmbedding, {
      topK,
      filter: filter ? (record, _idx) => {
        // Filter receives raw schema record - we need to adapt it
        // Note: filter doesn't have access to id/created/updated (those are in RecordWithMeta)
        const mem: StoredMemory = {
          id: '', // Not available in filter
          content: record.content,
          reasoning: record.reasoning,
          importance_weight: record.importance_weight,
          confidence_score: record.confidence_score,
          context_type: record.context_type as StoredMemory['context_type'],
          temporal_class: record.temporal_class as StoredMemory['temporal_class'],
          action_required: record.action_required,
          problem_solution_pair: record.problem_solution_pair,
          semantic_tags: record.semantic_tags,
          trigger_phrases: record.trigger_phrases,
          question_types: record.question_types,
          session_id: record.session_id,
          project_id: record.project_id,
          created_at: 0,
          updated_at: 0,
        }
        return filter(mem)
      } : undefined,
    })

    return results.map(result => ({
      id: result.record.id,
      content: result.record.content,
      reasoning: result.record.reasoning,
      importance_weight: result.record.importance_weight,
      confidence_score: result.record.confidence_score,
      context_type: result.record.context_type as StoredMemory['context_type'],
      temporal_class: result.record.temporal_class as StoredMemory['temporal_class'],
      action_required: result.record.action_required,
      problem_solution_pair: result.record.problem_solution_pair,
      semantic_tags: result.record.semantic_tags,
      trigger_phrases: result.record.trigger_phrases,
      question_types: result.record.question_types,
      session_id: result.record.session_id,
      project_id: result.record.project_id,
      embedding: result.record.embedding ?? undefined,
      created_at: result.record.created,
      updated_at: result.record.updated,
      stale: result.stale,
    }))
  }

  /**
   * Update a memory's embedding
   */
  async setMemoryEmbedding(
    projectId: string,
    memoryId: string,
    embedding: Float32Array | number[],
    content: string
  ): Promise<void> {
    const { memories } = await this.getProject(projectId)
    const vec = embedding instanceof Float32Array ? embedding : new Float32Array(embedding)
    memories.setEmbedding(memoryId, 'embedding', vec, content)
  }

  /**
   * Get stale memory IDs (embedding out of sync with content)
   */
  async getStaleMemoryIds(projectId: string): Promise<string[]> {
    const { memories } = await this.getProject(projectId)
    return memories.all().filter(r => r.stale).map(r => r.id)
  }

  // ================================================================
  // SESSION OPERATIONS
  // ================================================================

  /**
   * Get or create a session
   */
  async getOrCreateSession(
    projectId: string,
    sessionId: string
  ): Promise<{ isNew: boolean; messageCount: number; firstSessionCompleted: boolean }> {
    const { sessions } = await this.getProject(projectId)

    const existing = sessions.get(sessionId)
    if (existing) {
      return {
        isNew: false,
        messageCount: existing.message_count,
        firstSessionCompleted: existing.first_session_completed,
      }
    }

    // Check if this is the first session for the project
    const allSessions = sessions.all()
    const firstSessionCompleted = allSessions.some(s => s.first_session_completed)

    sessions.insert({
      id: sessionId,
      project_id: projectId,
      message_count: 0,
      first_session_completed: false,
      last_active: Date.now(),
      metadata: '{}',
    })

    return {
      isNew: true,
      messageCount: 0,
      firstSessionCompleted,
    }
  }

  /**
   * Increment message count for a session
   */
  async incrementMessageCount(projectId: string, sessionId: string): Promise<number> {
    const { sessions } = await this.getProject(projectId)

    const session = sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const newCount = session.message_count + 1
    sessions.update(sessionId, {
      message_count: newCount,
      last_active: Date.now(),
    })

    return newCount
  }

  /**
   * Mark first session as completed
   */
  async markFirstSessionCompleted(projectId: string, sessionId: string): Promise<void> {
    const { sessions } = await this.getProject(projectId)
    sessions.update(sessionId, { first_session_completed: true })
  }

  // ================================================================
  // SUMMARY OPERATIONS
  // ================================================================

  /**
   * Store a session summary
   */
  async storeSessionSummary(
    projectId: string,
    sessionId: string,
    summary: string,
    interactionTone: string = ''
  ): Promise<string> {
    const { summaries } = await this.getProject(projectId)

    logger.debug(`Storing summary for ${projectId}: ${summary.length} chars`, 'store')

    const id = summaries.insert({
      session_id: sessionId,
      project_id: projectId,
      summary,
      interaction_tone: interactionTone,
    })

    logger.debug(`Summary stored with ID: ${id}`, 'store')

    return id
  }

  /**
   * Get the latest session summary for a project
   */
  async getLatestSummary(projectId: string): Promise<SessionSummary | null> {
    const { summaries } = await this.getProject(projectId)

    logger.debug(`Getting latest summary for ${projectId}`, 'store')
    const all = summaries.all()

    if (!all.length) {
      logger.debug(`No summaries found for ${projectId}`, 'store')
      return null
    }
    logger.debug(`Found ${all.length} summaries for ${projectId}`, 'store')

    // Sort by created timestamp (most recent first)
    const sorted = [...all].sort((a, b) => b.created - a.created)

    const latest = sorted[0]!
    console.log(`   Latest summary: ${latest.summary.slice(0, 50)}...`)

    return {
      id: latest.id,
      session_id: latest.session_id,
      project_id: latest.project_id,
      summary: latest.summary,
      interaction_tone: latest.interaction_tone,
      created_at: latest.created,
    }
  }

  // ================================================================
  // SNAPSHOT OPERATIONS
  // ================================================================

  /**
   * Store a project snapshot
   */
  async storeProjectSnapshot(
    projectId: string,
    sessionId: string,
    snapshot: Omit<ProjectSnapshot, 'id' | 'session_id' | 'project_id' | 'created_at'>
  ): Promise<string> {
    const { snapshots } = await this.getProject(projectId)

    return snapshots.insert({
      session_id: sessionId,
      project_id: projectId,
      current_phase: snapshot.current_phase,
      recent_achievements: snapshot.recent_achievements,
      active_challenges: snapshot.active_challenges,
      next_steps: snapshot.next_steps,
    })
  }

  /**
   * Get the latest project snapshot
   */
  async getLatestSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
    const { snapshots } = await this.getProject(projectId)

    const all = snapshots.all()
    if (!all.length) return null

    // Sort by created timestamp (most recent first)
    const sorted = [...all].sort((a, b) => b.created - a.created)

    const latest = sorted[0]!
    return {
      id: latest.id,
      session_id: latest.session_id,
      project_id: latest.project_id,
      current_phase: latest.current_phase,
      recent_achievements: latest.recent_achievements,
      active_challenges: latest.active_challenges,
      next_steps: latest.next_steps,
      created_at: latest.created,
    }
  }

  // ================================================================
  // STATS & UTILITIES
  // ================================================================

  /**
   * Get statistics for a project
   */
  async getProjectStats(projectId: string): Promise<{
    totalMemories: number
    totalSessions: number
    staleMemories: number
    latestSession: string | null
  }> {
    const { memories, sessions } = await this.getProject(projectId)

    const allMemories = memories.all()
    const allSessions = sessions.all()
    const staleCount = allMemories.filter(r => r.stale).length

    // Find latest session
    let latestSession: string | null = null
    if (allSessions.length) {
      const sorted = [...allSessions].sort((a, b) => b.last_active - a.last_active)
      latestSession = sorted[0]!.id
    }

    return {
      totalMemories: allMemories.length,
      totalSessions: allSessions.length,
      staleMemories: staleCount,
      latestSession,
    }
  }

  /**
   * Close all project databases (including global)
   */
  close(): void {
    // Close project databases
    for (const projectDB of this._projects.values()) {
      projectDB.db.close()
    }
    this._projects.clear()

    // Close global database
    if (this._global) {
      this._global.db.close()
      this._global = null
    }
  }
}

/**
 * Create a new memory store
 */
export function createStore(config?: StoreConfig): MemoryStore {
  return new MemoryStore(config)
}
