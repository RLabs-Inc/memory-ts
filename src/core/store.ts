// ============================================================================
// MEMORY STORE - fsDB-powered storage
// Per-project database management with reactive parallel arrays
// ============================================================================

import { createDatabase, type Database, type PersistentCollection } from '@rlabs-inc/fsdb'
import { homedir } from 'os'
import { join } from 'path'
import type {
  CuratedMemory,
  StoredMemory,
  SessionSummary,
  ProjectSnapshot,
} from '../types/memory.ts'
import {
  memorySchema,
  sessionSummarySchema,
  projectSnapshotSchema,
  sessionSchema,
  type MemorySchema,
  type SessionSummarySchema,
  type ProjectSnapshotSchema,
  type SessionSchema,
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
 * MemoryStore - Manages per-project fsDB instances
 */
export class MemoryStore {
  private _config: Required<StoreConfig>
  private _projects = new Map<string, ProjectDB>()

  constructor(config: StoreConfig = {}) {
    this._config = {
      basePath: config.basePath ?? join(homedir(), '.local', 'share', 'memory'),
      watchFiles: config.watchFiles ?? false,
    }
  }

  /**
   * Get or create database for a project
   */
  async getProject(projectId: string): Promise<ProjectDB> {
    if (this._projects.has(projectId)) {
      console.log(`🔄 [DEBUG] Returning cached databases for ${projectId}`)
      return this._projects.get(projectId)!
    }

    console.log(`🆕 [DEBUG] Creating NEW databases for ${projectId}`)
    const projectPath = join(this._config.basePath, projectId)
    console.log(`   Path: ${projectPath}`)

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
   * Store a curated memory
   */
  async storeMemory(
    projectId: string,
    sessionId: string,
    memory: CuratedMemory,
    embedding?: Float32Array | number[]
  ): Promise<string> {
    const { memories } = await this.getProject(projectId)

    const id = memories.insert({
      content: memory.content,
      reasoning: memory.reasoning,
      importance_weight: memory.importance_weight,
      confidence_score: memory.confidence_score,
      context_type: memory.context_type,
      temporal_relevance: memory.temporal_relevance,
      knowledge_domain: memory.knowledge_domain,
      emotional_resonance: memory.emotional_resonance,
      action_required: memory.action_required,
      problem_solution_pair: memory.problem_solution_pair,
      semantic_tags: memory.semantic_tags,
      trigger_phrases: memory.trigger_phrases,
      question_types: memory.question_types,
      session_id: sessionId,
      project_id: projectId,
      embedding: embedding
        ? (embedding instanceof Float32Array ? embedding : new Float32Array(embedding))
        : null,
    })

    return id
  }

  /**
   * Get all memories for a project
   */
  async getAllMemories(projectId: string): Promise<StoredMemory[]> {
    const { memories } = await this.getProject(projectId)

    return memories.all().map(record => ({
      id: record.id,
      content: record.content,
      reasoning: record.reasoning,
      importance_weight: record.importance_weight,
      confidence_score: record.confidence_score,
      context_type: record.context_type as StoredMemory['context_type'],
      temporal_relevance: record.temporal_relevance as StoredMemory['temporal_relevance'],
      knowledge_domain: record.knowledge_domain as StoredMemory['knowledge_domain'],
      emotional_resonance: record.emotional_resonance as StoredMemory['emotional_resonance'],
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
          temporal_relevance: record.temporal_relevance as StoredMemory['temporal_relevance'],
          knowledge_domain: record.knowledge_domain as StoredMemory['knowledge_domain'],
          emotional_resonance: record.emotional_resonance as StoredMemory['emotional_resonance'],
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
      temporal_relevance: result.record.temporal_relevance as StoredMemory['temporal_relevance'],
      knowledge_domain: result.record.knowledge_domain as StoredMemory['knowledge_domain'],
      emotional_resonance: result.record.emotional_resonance as StoredMemory['emotional_resonance'],
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

    console.log(`📝 [DEBUG] Storing summary for ${projectId}:`)
    console.log(`   Summary length: ${summary.length} chars`)
    console.log(`   Summaries count before: ${summaries.all().length}`)

    const id = summaries.insert({
      session_id: sessionId,
      project_id: projectId,
      summary,
      interaction_tone: interactionTone,
    })

    console.log(`   Summaries count after: ${summaries.all().length}`)
    console.log(`   Inserted ID: ${id}`)

    return id
  }

  /**
   * Get the latest session summary for a project
   */
  async getLatestSummary(projectId: string): Promise<SessionSummary | null> {
    const { summaries } = await this.getProject(projectId)

    console.log(`📖 [DEBUG] Getting latest summary for ${projectId}:`)
    const all = summaries.all()
    console.log(`   Summaries found: ${all.length}`)

    if (!all.length) {
      console.log(`   No summaries found!`)
      return null
    }

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
   * Close all project databases
   */
  close(): void {
    for (const projectDB of this._projects.values()) {
      projectDB.db.close()
    }
    this._projects.clear()
  }
}

/**
 * Create a new memory store
 */
export function createStore(config?: StoreConfig): MemoryStore {
  return new MemoryStore(config)
}
