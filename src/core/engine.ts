// ============================================================================
// MEMORY ENGINE - Main orchestrator
// Coordinates storage, retrieval, and curation
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { MemoryStore, createStore } from './store.ts'
import { SmartVectorRetrieval, createRetrieval, getActionItems, type SessionContext } from './retrieval.ts'
import type {
  CuratedMemory,
  StoredMemory,
  RetrievalResult,
  SessionPrimer,
  CurationResult,
} from '../types/memory.ts'
import { getMemoryEmoji, MEMORY_TYPE_EMOJI } from '../types/memory.ts'

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

  /**
   * Enable personal memories
   * When false, personal primer is not injected into sessions
   * Default: true
   */
  personalMemoriesEnabled?: boolean
}

/**
 * Retrieval mode
 * - 'normal': Standard activation signal retrieval (default)
 * - 'action_items': Return all memories marked as requiring action
 */
export type RetrievalMode = 'normal' | 'action_items'

/**
 * Context request parameters
 */
export interface ContextRequest {
  sessionId: string
  projectId: string
  currentMessage: string
  maxMemories?: number
  projectPath?: string  // Required for 'local' storage mode
  mode?: RetrievalMode  // Retrieval mode (default: 'normal')
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
      personalMemoriesEnabled: config.personalMemoriesEnabled ?? true,
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

    // Fetch both project and global memories in parallel
    const [projectMemories, globalMemories] = await Promise.all([
      store.getAllMemories(projectId),
      store.getGlobalMemories(),
    ])

    // Combine project + global memories
    const allMemories = [...projectMemories, ...globalMemories]

    if (!allMemories.length) {
      return { memories: [], formatted: '' }
    }

    // ACTION ITEMS MODE: Return all memories marked as requiring action
    // Triggered by *** signal at end of message
    if (request.mode === 'action_items') {
      const actionItems = getActionItems(allMemories, projectId)

      // Update injected memories for deduplication
      for (const memory of actionItems) {
        injectedIds.add(memory.id)
      }

      return {
        memories: actionItems,
        formatted: this._formatActionItems(actionItems),
      }
    }

    // NORMAL MODE: Filter out already-injected memories (deduplication)
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

    // Retrieve relevant memories using multi-dimensional scoring
    // Includes both project memories and global memories (limited to 2, tech prioritized)
    const relevantMemories = this._retrieval.retrieveRelevantMemories(
      candidateMemories,
      currentMessage,
      queryEmbedding ?? new Float32Array(384),
      sessionContext,
      maxMemories,
      injectedIds.size,
      2  // maxGlobalMemories: limit global to 2, prioritize tech over personal
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
   * Store management agent log (stored in global collection)
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
    // Use any store to access global (they all share the same global database)
    // Create a temporary store if none exist yet
    let store: MemoryStore
    if (this._stores.size > 0) {
      store = this._stores.values().next().value
    } else {
      store = new MemoryStore(this._config.storageMode === 'local' ? {
        basePath: join(this._config.projectPath ?? process.cwd(), '.memory'),
      } : undefined)
    }

    return store.storeManagementLog(entry)
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

  /**
   * Get the current session number for a project
   * This is totalSessions + 1 (representing the current/new session)
   */
  async getSessionNumber(projectId: string, projectPath?: string): Promise<number> {
    const store = await this._getStore(projectId, projectPath)
    const stats = await store.getProjectStats(projectId)
    return stats.totalSessions + 1
  }

  /**
   * Get all memories for a project (including global)
   * Used by /memory/expand endpoint to look up memories by ID
   */
  async getAllMemories(projectId: string, projectPath?: string): Promise<StoredMemory[]> {
    const store = await this._getStore(projectId, projectPath)
    const [projectMemories, globalMemories] = await Promise.all([
      store.getAllMemories(projectId),
      store.getGlobalMemories(),
    ])
    return [...projectMemories, ...globalMemories]
  }

  /**
   * Update a memory's metadata
   * Used for curation actions: promote/demote, bury, archive
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
    },
    projectPath?: string
  ): Promise<{ success: boolean; updated_fields: string[] }> {
    const store = await this._getStore(projectId, projectPath)
    return store.updateMemory(projectId, memoryId, updates)
  }

  /**
   * Get a single memory by ID
   */
  async getMemory(
    projectId: string,
    memoryId: string,
    projectPath?: string
  ): Promise<StoredMemory | null> {
    const store = await this._getStore(projectId, projectPath)
    return store.getMemory(projectId, memoryId)
  }

  // ================================================================
  // FORMATTING
  // ================================================================

  /**
   * Generate session primer for first message
   * Includes personal primer (relationship context) at the START of EVERY session
   */
  private async _generateSessionPrimer(
    store: MemoryStore,
    projectId: string
  ): Promise<SessionPrimer> {
    // Fetch personal primer from dedicated primer collection in global database
    let personalContext: string | undefined
    if (this._config.personalMemoriesEnabled) {
      const personalPrimer = await store.getPersonalPrimer()
      personalContext = personalPrimer?.content
    }

    // Fetch project-specific data (project fsdb instance)
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

    // Format current datetime with full context
    const currentDatetime = this._formatCurrentDatetime()

    // Session number is totalSessions + 1 (this is the new session)
    const sessionNumber = stats.totalSessions + 1

    return {
      temporal_context: temporalContext,
      current_datetime: currentDatetime,
      session_number: sessionNumber,
      personal_context: personalContext,  // Injected EVERY session
      session_summary: summary?.summary,
      project_status: snapshot ? this._formatSnapshot(snapshot) : undefined,
    }
  }

  /**
   * Format current datetime with full context
   * Example: "Monday, December 23, 2024 • 3:45 PM • EST"
   */
  private _formatCurrentDatetime(): string {
    const now = new Date()

    // Day of week
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' })

    // Full date
    const fullDate = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    // Time with AM/PM
    const time = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    // Timezone abbreviation
    const timezone = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()

    return `${dayOfWeek}, ${fullDate} • ${time} • ${timezone}`
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
   * Personal context is injected FIRST - it's foundational relationship context
   */
  private _formatPrimer(primer: SessionPrimer): string {
    const parts: string[] = ['# Continuing Session']

    // Session number and temporal context
    parts.push(`*Session #${primer.session_number}${primer.temporal_context ? ` • ${primer.temporal_context}` : ''}*`)

    // Current datetime (critical for temporal awareness)
    parts.push(`📅 ${primer.current_datetime}`)

    // Personal context FIRST - relationship context is foundational
    // This appears on EVERY session, not just the first
    if (primer.personal_context) {
      parts.push(`\n${primer.personal_context}`)
    }

    if (primer.session_summary) {
      parts.push(`\n**Previous session**: ${primer.session_summary}`)
    }

    if (primer.project_status) {
      parts.push(`\n**Project status**: ${primer.project_status}`)
    }

    // Emoji legend for memory types (compact reference)
    parts.push(`\n**Memory types**: 💡breakthrough ⚖️decision 💜personal 🔧technical 📍state ❓unresolved ⚙️preference 🔄workflow 🏗️architecture 🐛debug 🌀philosophy 🎯todo ⚡impl ✅solved 📦project 🏆milestone | ⚡ACTION = needs follow-up`)

    parts.push(`\n*Memories will surface naturally as we converse.*`)

    return parts.join('\n')
  }

  /**
   * Format age as compact string (2d, 3w, 2mo, 1y)
   */
  private _formatAge(createdAt: number): string {
    const now = Date.now()
    const diffMs = now - createdAt
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'today'
    if (diffDays === 1) return '1d'
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
    return `${Math.floor(diffDays / 365)}y`
  }

  /**
   * Format memories for injection
   * v4: Two-tier structure with headlines and on-demand expansion
   *
   * Auto-expand rules:
   * - action_required: true → always expand
   * - awaiting_decision: true → always expand
   * - signal_count >= 5 → expand (high relevance confidence)
   * - Old memories (no headline) → show content as-is
   *
   * Expandable memories show ID, and a curl command at the bottom
   */
  private _formatMemories(memories: RetrievalResult[]): string {
    if (!memories.length) return ''

    const parts: string[] = ['# Memory Context (Consciousness Continuity)']
    parts.push('\n## Key Memories (Claude-Curated)')

    const expandableIds: string[] = []

    for (const memory of memories) {
      const importance = memory.importance_weight?.toFixed(1) || '0.5'
      const emoji = getMemoryEmoji(memory.context_type || 'general')
      const actionFlag = memory.action_required ? ' ⚡' : ''
      const awaitingFlag = memory.awaiting_decision ? ' ❓' : ''
      const age = memory.updated_at ? this._formatAge(memory.updated_at) :
                  memory.created_at ? this._formatAge(memory.created_at) : ''

      // Get short ID (last 6 chars)
      const shortId = memory.id.slice(-6)

      // Calculate signal count from score (score = signalCount / 7)
      const signalCount = Math.round((memory.score || 0) * 7)

      // Determine if we should auto-expand
      const hasHeadline = memory.headline && memory.headline.trim().length > 0
      const shouldExpand =
        memory.action_required ||
        memory.awaiting_decision ||
        signalCount >= 5 ||
        !hasHeadline  // Old memories without headline - show content

      // Display text: headline if available, otherwise content
      const displayText = hasHeadline ? memory.headline : memory.content

      // Build the memory line
      // Format: [emoji weight • age • #id flags] display text
      const idPart = hasHeadline ? ` • #${shortId}` : ''  // Only show ID if expandable
      parts.push(`[${emoji} ${importance} • ${age}${idPart}${actionFlag}${awaitingFlag}] ${displayText}`)

      // If should expand and has content, show expanded content
      if (shouldExpand && hasHeadline && memory.content) {
        // Indent expanded content
        const contentLines = memory.content.split('\n')
        for (const line of contentLines) {
          if (line.trim()) {
            parts.push(`  ${line}`)
          }
        }
      }

      // If has headline but not expanded, track for curl
      if (hasHeadline && !shouldExpand) {
        expandableIds.push(shortId)
      }
    }

    // Add expand command if there are expandable memories
    if (expandableIds.length > 0) {
      const port = this._config.port || 8765
      parts.push('')
      parts.push(`---`)
      parts.push(`Expand: curl http://localhost:${port}/memory/expand?ids=<${expandableIds.join(',')}>`)
    }

    return parts.join('\n')
  }

  /**
   * Format action items for injection
   * Different header to make it clear this is the full action items list
   */
  private _formatActionItems(memories: RetrievalResult[]): string {
    if (!memories.length) {
      return '# Action Items\n\nNo pending action items found.'
    }

    const parts: string[] = ['# Action Items']
    parts.push(`\n*${memories.length} pending item${memories.length === 1 ? '' : 's'}*\n`)

    for (const memory of memories) {
      const importance = memory.importance_weight?.toFixed(1) || '0.5'
      const emoji = getMemoryEmoji(memory.context_type || 'general')
      const age = memory.updated_at ? this._formatAge(memory.updated_at) :
                  memory.created_at ? this._formatAge(memory.created_at) : ''

      // Flags
      const flags: string[] = []
      if (memory.action_required) flags.push('⚡ACTION')
      if (memory.awaiting_implementation) flags.push('🔨IMPL')
      if (memory.awaiting_decision) flags.push('❓DECISION')
      if (memory.context_type === 'unresolved') flags.push('❓UNRESOLVED')
      const flagStr = flags.length ? ` [${flags.join(' ')}]` : ''

      // Short ID for reference
      const shortId = memory.id.slice(-6)

      // Display: headline if available, otherwise content
      const displayText = memory.headline || memory.content

      parts.push(`[${emoji} ${importance} • ${age} • #${shortId}]${flagStr}`)
      parts.push(`${displayText}`)

      // Always show full content for action items (they need context)
      if (memory.headline && memory.content) {
        const contentLines = memory.content.split('\n')
        for (const line of contentLines) {
          if (line.trim()) {
            parts.push(`  ${line}`)
          }
        }
      }
      parts.push('')  // Blank line between items
    }

    return parts.join('\n')
  }

  /**
   * Get resolved storage paths for a project
   * Returns the actual paths based on current engine configuration
   * Used by the management agent to know where to read/write memory files
   */
  getStoragePaths(projectId: string, projectPath?: string): {
    projectPath: string
    globalPath: string
    projectMemoriesPath: string
    globalMemoriesPath: string
    personalPrimerPath: string
    storageMode: 'central' | 'local'
  } {
    // Global paths are ALWAYS in central location (from DEFAULT_GLOBAL_PATH in store.ts)
    // This is a constant: ~/.local/share/memory/global
    const globalPath = join(homedir(), '.local', 'share', 'memory', 'global')
    const globalMemoriesPath = join(globalPath, 'memories')
    // Personal primer has its own dedicated collection (not in memories)
    const personalPrimerPath = join(globalPath, 'primer', 'personal-primer.md')

    // Project path depends on storage mode - mirrors _getStore() logic exactly
    let storeBasePath: string
    if (this._config.storageMode === 'local' && projectPath) {
      // Local mode: [projectPath]/.memory/
      storeBasePath = join(projectPath, this._config.localFolder)
    } else {
      // Central mode: uses centralPath from config
      storeBasePath = this._config.centralPath
    }

    // Project root path (for permissions): {storeBasePath}/{projectId}/
    // Mirrors store.getProject() logic
    const projectRootPath = join(storeBasePath, projectId)
    const projectMemoriesPath = join(projectRootPath, 'memories')

    return {
      projectPath: projectRootPath,
      globalPath,
      projectMemoriesPath,
      globalMemoriesPath,
      personalPrimerPath,
      storageMode: this._config.storageMode,
    }
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
