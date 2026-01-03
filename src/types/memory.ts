// ============================================================================
// MEMORY TYPES - Exact match to Python CuratedMemory
// Preserving the working schema for consciousness continuity
// ============================================================================

/**
 * Context types for memories - what kind of insight is this?
 */
export type ContextType =
  | 'breakthrough'      // Major discovery or insight
  | 'decision'          // Important decision made
  | 'personal'          // Personal/relationship information
  | 'technical'         // Technical knowledge
  | 'technical_state'   // Current technical state
  | 'unresolved'        // Open question or problem
  | 'preference'        // User preference
  | 'workflow'          // How user likes to work
  | 'architectural'     // System design decisions
  | 'debugging'         // Debug insights
  | 'philosophy'        // Philosophical discussions
  | string              // Allow custom types

/**
 * Temporal relevance - how long should this memory persist?
 */
export type TemporalRelevance =
  | 'persistent'        // Always relevant (0.8 score)
  | 'session'           // Session-specific (0.6 score)
  | 'temporary'         // Short-term (0.3 score)
  | 'archived'          // Historical (0.1 score)

/**
 * Emotional resonance - the emotional context of the memory
 */
export type EmotionalResonance =
  | 'joy'
  | 'frustration'
  | 'discovery'
  | 'gratitude'
  | 'curiosity'
  | 'determination'
  | 'satisfaction'
  | 'neutral'
  | string              // Allow custom emotions

/**
 * Knowledge domains - what area does this memory relate to?
 */
export type KnowledgeDomain =
  | 'architecture'
  | 'debugging'
  | 'philosophy'
  | 'workflow'
  | 'personal'
  | 'project'
  | 'tooling'
  | 'testing'
  | 'deployment'
  | 'security'
  | string              // Allow custom domains

/**
 * Trigger types for memory curation
 */
export type CurationTrigger =
  | 'session_end'       // Normal session end
  | 'pre_compact'       // Before context compression
  | 'context_full'      // Context window nearly full
  | 'manual'            // Manual trigger

/**
 * A memory curated by Claude with semantic understanding
 * EXACT MATCH to Python CuratedMemory dataclass
 */
export interface CuratedMemory {
  // Core content
  content: string                           // The memory content itself
  importance_weight: number                 // 0.0 to 1.0 (curator's assessment)
  semantic_tags: string[]                   // Concepts this relates to
  reasoning: string                         // Why Claude thinks this is important

  // Classification
  context_type: ContextType                 // breakthrough, decision, technical, etc.
  temporal_relevance: TemporalRelevance     // persistent, session, temporary
  knowledge_domain: KnowledgeDomain         // architecture, debugging, philosophy, etc.

  // Flags
  action_required: boolean                  // Does this need follow-up?
  confidence_score: number                  // 0.0 to 1.0 (Claude's confidence)
  problem_solution_pair: boolean            // Is this a problem→solution pattern?

  // Retrieval optimization (the secret sauce)
  trigger_phrases: string[]                 // Phrases that should trigger this memory
  question_types: string[]                  // Types of questions this answers
  emotional_resonance: EmotionalResonance   // joy, frustration, discovery, gratitude

  // Optional extended metadata (from Python, may not always be present)
  anti_triggers?: string[]                  // Phrases where this memory is NOT relevant
  prerequisite_understanding?: string[]     // Concepts user should know first
  follow_up_context?: string[]              // What might come next
  dependency_context?: string[]             // Other memories this relates to

  // ========== V2 CURATOR FIELDS (optional - get smart defaults if not provided) ==========
  scope?: 'global' | 'project'              // Shared across projects or project-specific
  temporal_class?: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
  domain?: string                           // Specific area (embeddings, auth, family)
  feature?: string                          // Specific feature within domain
  related_files?: string[]                  // Source files for technical memories
  awaiting_implementation?: boolean         // Planned feature not yet built
  awaiting_decision?: boolean               // Decision point needing resolution
}

/**
 * A stored memory with database metadata
 * Includes v2 lifecycle management fields (optional for backwards compat)
 */
export interface StoredMemory extends CuratedMemory {
  id: string                                // Unique identifier
  session_id: string                        // Session that created this memory
  project_id: string                        // Project this belongs to
  created_at: number                        // Timestamp (ms since epoch)
  updated_at: number                        // Last update timestamp
  embedding?: Float32Array                  // Vector embedding (384 dimensions)
  stale?: boolean                           // Is embedding out of sync with content?

  // ========== V2 LIFECYCLE FIELDS (optional for backwards compat) ==========
  status?: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
  scope?: 'global' | 'project'

  // Temporal tracking
  session_created?: number
  session_updated?: number
  last_surfaced?: number
  sessions_since_surfaced?: number

  // Temporal class & decay
  temporal_class?: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
  fade_rate?: number
  expires_after_sessions?: number

  // Categorization
  domain?: string
  feature?: string
  component?: string

  // Relationships
  supersedes?: string
  superseded_by?: string
  related_to?: string[]
  resolves?: string[]
  resolved_by?: string
  parent_id?: string
  child_ids?: string[]

  // Lifecycle triggers
  awaiting_implementation?: boolean
  awaiting_decision?: boolean
  blocked_by?: string
  blocks?: string[]
  related_files?: string[]

  // Retrieval control
  retrieval_weight?: number
  exclude_from_retrieval?: boolean

  // Schema version
  schema_version?: number
}

/**
 * Default values for v2 fields based on context_type
 * Used for backwards compatibility with v1 memories
 */
export const V2_DEFAULTS = {
  // Type-specific defaults
  typeDefaults: {
    personal: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
    philosophy: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
    preference: { scope: 'global', temporal_class: 'long_term', fade_rate: 0.01 },
    breakthrough: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
    decision: { scope: 'project', temporal_class: 'long_term', fade_rate: 0 },
    milestone: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
    technical: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
    architectural: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.01 },
    debugging: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
    unresolved: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.05 },
    todo: { scope: 'project', temporal_class: 'short_term', fade_rate: 0.1 },
    technical_state: { scope: 'project', temporal_class: 'short_term', fade_rate: 0.1 },
    workflow: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.02 },
    project_context: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
  } as Record<string, { scope: string; temporal_class: string; fade_rate: number }>,

  // Fallback defaults
  fallback: {
    status: 'active' as const,
    scope: 'project' as const,
    temporal_class: 'medium_term' as const,
    fade_rate: 0.03,
    sessions_since_surfaced: 0,
    awaiting_implementation: false,
    awaiting_decision: false,
    exclude_from_retrieval: false,
  },
}

/**
 * Apply v2 defaults to a memory (for backwards compatibility)
 * Uses context_type to determine appropriate defaults
 */
export function applyV2Defaults(memory: Partial<StoredMemory>): StoredMemory {
  const contextType = memory.context_type ?? 'general'
  const typeDefaults = V2_DEFAULTS.typeDefaults[contextType] ?? V2_DEFAULTS.typeDefaults.technical

  return {
    // Spread existing memory
    ...memory,

    // Apply status default
    status: memory.status ?? V2_DEFAULTS.fallback.status,

    // Apply scope from type defaults
    scope: memory.scope ?? typeDefaults?.scope ?? V2_DEFAULTS.fallback.scope,

    // Apply temporal class from type defaults
    temporal_class: memory.temporal_class ?? typeDefaults?.temporal_class ?? V2_DEFAULTS.fallback.temporal_class,

    // Apply fade rate from type defaults
    fade_rate: memory.fade_rate ?? typeDefaults?.fade_rate ?? V2_DEFAULTS.fallback.fade_rate,

    // Apply other defaults
    sessions_since_surfaced: memory.sessions_since_surfaced ?? V2_DEFAULTS.fallback.sessions_since_surfaced,
    awaiting_implementation: memory.awaiting_implementation ?? V2_DEFAULTS.fallback.awaiting_implementation,
    awaiting_decision: memory.awaiting_decision ?? V2_DEFAULTS.fallback.awaiting_decision,
    exclude_from_retrieval: memory.exclude_from_retrieval ?? V2_DEFAULTS.fallback.exclude_from_retrieval,

    // Retrieval weight defaults to importance_weight
    retrieval_weight: memory.retrieval_weight ?? memory.importance_weight ?? 0.5,

    // Initialize empty arrays if not present
    related_to: memory.related_to ?? [],
    resolves: memory.resolves ?? [],
    child_ids: memory.child_ids ?? [],
    blocks: memory.blocks ?? [],
    related_files: memory.related_files ?? [],

    // Mark as current schema version
    schema_version: memory.schema_version ?? 2,
  } as StoredMemory
}

/**
 * Check if a memory needs migration (is v1)
 */
export function needsMigration(memory: Partial<StoredMemory>): boolean {
  return !memory.schema_version || memory.schema_version < 2
}

/**
 * Session summary - high-level context for session continuity
 */
export interface SessionSummary {
  id: string
  session_id: string
  project_id: string
  summary: string                           // Brief session summary
  interaction_tone: string                  // How was the interaction?
  created_at: number
}

/**
 * Project snapshot - current state of the project
 */
export interface ProjectSnapshot {
  id: string
  session_id: string
  project_id: string
  current_phase: string                     // What phase is the project in?
  recent_achievements: string[]             // What was accomplished?
  active_challenges: string[]               // Current blockers/challenges
  next_steps: string[]                      // Planned next steps
  created_at: number
}

/**
 * Curation result from Claude
 */
export interface CurationResult {
  session_summary: string
  interaction_tone?: string
  project_snapshot?: ProjectSnapshot
  memories: CuratedMemory[]
}

/**
 * Memory retrieval result with scoring
 */
export interface RetrievalResult extends StoredMemory {
  score: number                             // Combined relevance + value score
  relevance_score: number                   // Relevance component (max 0.30)
  value_score: number                       // Value component (max 0.70)
}

/**
 * Session primer - what to show at session start
 */
export interface SessionPrimer {
  temporal_context: string                  // "Last session: 2 days ago"
  current_datetime: string                  // "Monday, December 23, 2024 • 3:45 PM EST"
  session_number: number                    // Which session this is (1, 2, 43, etc.)
  personal_context?: string                 // Personal primer (relationship context) - injected EVERY session
  session_summary?: string                  // Previous session summary
  project_status?: string                   // Current project state
  key_memories?: StoredMemory[]             // Essential memories to surface
}

/**
 * Emoji map for memory context types
 * Compact visual representation for efficient parsing
 */
export const MEMORY_TYPE_EMOJI: Record<string, string> = {
  breakthrough: '💡',      // Insight, discovery
  decision: '⚖️',          // Choice made
  personal: '💜',          // Relationship, friendship
  technical: '🔧',         // Technical knowledge
  technical_state: '📍',   // Current state
  unresolved: '❓',        // Open question
  preference: '⚙️',        // User preference
  workflow: '🔄',          // How work flows
  architectural: '🏗️',     // System design
  debugging: '🐛',         // Debug insight
  philosophy: '🌀',        // Deeper thinking
  todo: '🎯',              // Action needed
  implementation: '⚡',    // Implementation detail
  problem_solution: '✅',  // Problem→Solution pair
  project_context: '📦',   // Project context
  milestone: '🏆',         // Achievement
  general: '📝',           // General note
}

/**
 * Get emoji for a context type, with fallback
 */
export function getMemoryEmoji(contextType: string): string {
  return MEMORY_TYPE_EMOJI[contextType.toLowerCase()] ?? '📝'
}
