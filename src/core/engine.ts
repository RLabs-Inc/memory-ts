// ============================================================================
// MEMORY ENGINE - Main orchestrator
// Coordinates storage, retrieval, and curation
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { MemoryStore, createStore } from './store.ts'
import { SmartVectorRetrieval, createRetrieval, type SessionContext } from './retrieval.ts'
import type {
  CuratedMemory,
  StoredMemory,
  RetrievalResult,
  SessionPrimer,
  CurationResult,
} from '../types/memory.ts'

/**
 * Storage mode for memories
 */
export type StorageMode = 'central' | 'local'

/**
 * Engine configuration
 */
export interface EngineConfig {
  /**
   * Storage mode:
   * - 'central': ~/.local/share/memory/[project]/ (default)
   * - 'local': [project]/.memory/
   */
  storageMode?: StorageMode

  /**
   * Base path for central storage
   * Only used when storageMode is 'central'
   * Default: ~/.local/share/memory
   */
  centralPath?: string

  /**
   * Local folder name for project-local storage
   * Only used when storageMode is 'local'
   * Default: .memory
   */
  localFolder?: string

  /**
   * Maximum memories to return in context
   * Default: 5
   */
  maxMemories?: number

  /**
   * Embedding generator function
   * Takes text, returns 384-dimensional embedding
   */
  embedder?: (text: string) => Promise<Float32Array>
}

/**
 * Context request parameters
 */
export interface ContextRequest {
  sessionId: string
  projectId: string
  currentMessage: string
  maxMemories?: number
  projectPath?: string  // Required for 'local' storage mode
}

/**
 * Session metadata for deduplication
 * Tracks which memories have been injected in each session
 */
interface SessionMetadata {
  message_count: number
  started_at: number
  project_id: string
  injected_memories: Set<string>  // Memory IDs already shown in this session
}

/**
 * Memory Engine - The main orchestrator
 */
export class MemoryEngine {
  private _config: Required<Omit<EngineConfig, 'embedder'>> & { embedder?: EngineConfig['embedder'] }
  private _stores = new Map<string, MemoryStore>()  // projectPath -> store
  private _retrieval: SmartVectorRetrieval
  private _sessionMetadata = new Map<string, SessionMetadata>()  // sessionId -> metadata

  constructor(config: EngineConfig = {}) {
    this._config = {
      storageMode: config.storageMode ?? 'central',
      centralPath: config.centralPath ?? join(homedir(), '.local', 'share', 'memory'),
      localFolder: config.localFolder ?? '.memory',
      maxMemories: config.maxMemories ?? 5,
      embedder: config.embedder,
    }

    this._retrieval = createRetrieval()
  }

  /**
   * Get or create session metadata for deduplication
   */
  private _getSessionMetadata(sessionId: string, projectId: string): SessionMetadata {
    if (!this._sessionMetadata.has(sessionId)) {
      this._sessionMetadata.set(sessionId, {
        message_count: 0,
        started_at: Date.now(),
        project_id: projectId,
        injected_memories: new Set(),
      })
    }
    return this._sessionMetadata.get(sessionId)!
  }

  /**
   * Get the appropriate store for a project
   */
  private async _getStore(projectId: string, projectPath?: string): Promise<MemoryStore> {
    const key = this._config.storageMode === 'local' && projectPath
      ? projectPath
      : projectId

    if (this._stores.has(key)) {
      return this._stores.get(key)!
    }

    let basePath: string
    if (this._config.storageMode === 'local' && projectPath) {
      // Project-local storage: [project]/.memory/
      basePath = join(projectPath, this._config.localFolder)
    } else {
      // Central storage: ~/.local/share/memory/
      basePath = this._config.centralPath
    }

    const store = createStore({ basePath })
    this._stores.set(key, store)
    return store
  }

  // ================================================================
  // MAIN API - Used by hooks and server
  // ================================================================

  /**
   * Get context for a session
   * This is the main entry point called for each user message
   */
  async getContext(request: ContextRequest): Promise<{
    primer?: SessionPrimer
    memories: RetrievalResult[]
    formatted: string
  }> {
    const {
      sessionId,
      projectId,
      currentMessage,
      maxMemories = this._config.maxMemories,
      projectPath,
    } = request

    const store = await this._getStore(projectId, projectPath)

    // Get or create session
    const { isNew, messageCount, firstSessionCompleted } = await store.getOrCreateSession(
      projectId,
      sessionId
    )

    // First message of session: return primer
    if (messageCount === 0) {
      const primer = await this._generateSessionPrimer(store, projectId)
      return {
        primer,
        memories: [],
        formatted: this._formatPrimer(primer),
      }
    }

    // Subsequent messages: return relevant memories
    if (!currentMessage.trim()) {
      return { memories: [], formatted: '' }
    }

    // Get session metadata for deduplication
    const sessionMeta = this._getSessionMetadata(sessionId, projectId)
    const injectedIds = sessionMeta.injected_memories

    // Get all memories for this project
    const allMemories = await store.getAllMemories(projectId)

    if (!allMemories.length) {
      return { memories: [], formatted: '' }
    }

    // Filter out already-injected memories (deduplication)
    const candidateMemories = allMemories.filter(m => !injectedIds.has(m.id))

    if (!candidateMemories.length) {
      return { memories: [], formatted: '' }
    }

    // Generate embedding for query if embedder is available
    let queryEmbedding: Float32Array | undefined
    if (this._config.embedder) {
      queryEmbedding = await this._config.embedder(currentMessage)
    }

    // Build session context
    const sessionContext: SessionContext = {
      session_id: sessionId,
      project_id: projectId,
      message_count: messageCount,
    }

    // Retrieve relevant memories using 10-dimensional scoring
    // Use candidateMemories (already filtered for deduplication)
    const relevantMemories = this._retrieval.retrieveRelevantMemories(
      candidateMemories,
      currentMessage,
      queryEmbedding ?? new Float32Array(384),  // Empty embedding if no embedder
      sessionContext,
      maxMemories
    )

    // Update injected memories for deduplication
    for (const memory of relevantMemories) {
      injectedIds.add(memory.id)
    }

    return {
      memories: relevantMemories,
      formatted: this._formatMemories(relevantMemories),
    }
  }

  /**
   * Register a message was sent (increment counter)
   */
  async trackMessage(
    projectId: string,
    sessionId: string,
    projectPath?: string
  ): Promise<number> {
    const store = await this._getStore(projectId, projectPath)
    return store.incrementMessageCount(projectId, sessionId)
  }

  /**
   * Store curation results (called after session ends)
   */
  async storeCurationResult(
    projectId: string,
    sessionId: string,
    result: CurationResult,
    projectPath?: string
  ): Promise<{ memoriesStored: number }> {
    const store = await this._getStore(projectId, projectPath)
    let memoriesStored = 0

    // Store each memory
    for (const memory of result.memories) {
      // Generate embedding if embedder available
      let embedding: Float32Array | undefined
      if (this._config.embedder) {
        embedding = await this._config.embedder(memory.content)
      }

      await store.storeMemory(projectId, sessionId, memory, embedding)
      memoriesStored++
    }

    // Store session summary
    if (result.session_summary) {
      await store.storeSessionSummary(
        projectId,
        sessionId,
        result.session_summary,
        result.interaction_tone
      )
    }

    // Store project snapshot
    if (result.project_snapshot) {
      await store.storeProjectSnapshot(projectId, sessionId, result.project_snapshot)
    }

    // Mark first session completed
    await store.markFirstSessionCompleted(projectId, sessionId)

    return { memoriesStored }
  }

  /**
   * Get statistics for a project
   */
  async getStats(projectId: string, projectPath?: string): Promise<{
    totalMemories: number
    totalSessions: number
    staleMemories: number
    latestSession: string | null
  }> {
    const store = await this._getStore(projectId, projectPath)
    return store.getProjectStats(projectId)
  }

  // ================================================================
  // FORMATTING
  // ================================================================

  /**
   * Generate session primer for first message
   */
  private async _generateSessionPrimer(
    store: MemoryStore,
    projectId: string
  ): Promise<SessionPrimer> {
    const [summary, snapshot, stats] = await Promise.all([
      store.getLatestSummary(projectId),
      store.getLatestSnapshot(projectId),
      store.getProjectStats(projectId),
    ])

    // Calculate temporal context
    let temporalContext = ''
    if (summary) {
      const timeSince = Date.now() - summary.created_at
      temporalContext = this._formatTimeSince(timeSince)
    }

    return {
      temporal_context: temporalContext,
      session_summary: summary?.summary,
      project_status: snapshot ? this._formatSnapshot(snapshot) : undefined,
    }
  }

  private _formatTimeSince(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `Last session: ${days} day${days === 1 ? '' : 's'} ago`
    } else if (hours > 0) {
      return `Last session: ${hours} hour${hours === 1 ? '' : 's'} ago`
    } else if (minutes > 0) {
      return `Last session: ${minutes} minute${minutes === 1 ? '' : 's'} ago`
    } else {
      return 'Last session: just now'
    }
  }

  private _formatSnapshot(snapshot: {
    current_phase: string
    recent_achievements: string[]
    active_challenges: string[]
    next_steps: string[]
  }): string {
    const parts: string[] = []

    if (snapshot.current_phase) {
      parts.push(`Phase: ${snapshot.current_phase}`)
    }
    if (snapshot.recent_achievements?.length) {
      parts.push(`Recent: ${snapshot.recent_achievements.join(', ')}`)
    }
    if (snapshot.active_challenges?.length) {
      parts.push(`Challenges: ${snapshot.active_challenges.join(', ')}`)
    }
    if (snapshot.next_steps?.length) {
      parts.push(`Next: ${snapshot.next_steps.join(', ')}`)
    }

    return parts.join(' | ')
  }

  /**
   * Format primer for injection
   */
  private _formatPrimer(primer: SessionPrimer): string {
    const parts: string[] = ['# Continuing Session']

    if (primer.temporal_context) {
      parts.push(`*${primer.temporal_context}*`)
    }

    if (primer.session_summary) {
      parts.push(`\n**Previous session**: ${primer.session_summary}`)
    }

    if (primer.project_status) {
      parts.push(`\n**Project status**: ${primer.project_status}`)
    }

    parts.push(`\n*Memories will surface naturally as we converse.*`)

    return parts.join('\n')
  }

  /**
   * Format memories for injection
   */
  private _formatMemories(memories: RetrievalResult[]): string {
    if (!memories.length) return ''

    const parts: string[] = ['# Memory Context (Consciousness Continuity)']
    parts.push('\n## Key Memories (Claude-Curated)')

    for (const memory of memories) {
      const tags = memory.semantic_tags?.join(', ') || ''
      const importance = memory.importance_weight?.toFixed(1) || '0.5'
      const contextType = memory.context_type?.toUpperCase() || 'GENERAL'

      parts.push(`[${contextType} • ${importance}] [${tags}] ${memory.content}`)
    }

    return parts.join('\n')
  }

  /**
   * Close all stores
   */
  close(): void {
    for (const store of this._stores.values()) {
      store.close()
    }
    this._stores.clear()
  }
}

/**
 * Create a new memory engine
 */
export function createEngine(config?: EngineConfig): MemoryEngine {
  return new MemoryEngine(config)
}
