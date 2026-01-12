// ============================================================================
// MEMORY TYPES - Exact match to Python CuratedMemory
// Preserving the working schema for consciousness continuity
// ============================================================================

/**
 * Context types for memories - STRICT ENUM (v3 schema)
 * NO custom strings allowed - use exactly these 11 values
 */
export type ContextType =
  | 'technical'      // Code, implementation, APIs, how things work
  | 'debug'          // Bugs, errors, fixes, gotchas, troubleshooting
  | 'architecture'   // System design, patterns, structure
  | 'decision'       // Choices made and reasoning, trade-offs
  | 'personal'       // Relationship, family, preferences, collaboration style
  | 'philosophy'     // Beliefs, values, worldview, principles
  | 'workflow'       // How we work together, processes, habits
  | 'milestone'      // Achievements, completions, shipped features
  | 'breakthrough'   // Major discoveries, aha moments, key insights
  | 'unresolved'     // Open questions, investigations, todos, blockers
  | 'state'          // Current project status, what's working/broken now

export const CONTEXT_TYPES = [
  'technical', 'debug', 'architecture', 'decision', 'personal',
  'philosophy', 'workflow', 'milestone', 'breakthrough', 'unresolved', 'state'
] as const

/**
 * Temporal class - how long should this memory persist? (v3: replaces temporal_relevance)
 */
export type TemporalClass =
  | 'eternal'           // Never fades (personal, philosophy, breakthroughs)
  | 'long_term'         // Years - fades slowly (decisions, architecture)
  | 'medium_term'       // Weeks - normal fade (technical, debug)
  | 'short_term'        // Days - fades quickly (state, todos)
  | 'ephemeral'         // Session only - surface once then expire

// NOTE: Removed in v3:
// - TemporalRelevance (replaced by TemporalClass)
// - EmotionalResonance (580 variants, never used)
// - KnowledgeDomain (overlaps with project_id + domain)
// - EmotionalResonance: 580 variants, never used in retrieval
// - KnowledgeDomain: overlaps with project_id + domain field

/**
 * Trigger types for memory curation
 */
export type CurationTrigger =
  | 'session_end'       // Normal session end
  | 'pre_compact'       // Before context compression
  | 'context_full'      // Context window nearly full
  | 'manual'            // Manual trigger
  | 'historical'        // Historical session ingestion

/**
 * A memory curated by Claude with semantic understanding
 * v3 schema - consolidated metadata, strict context types
 */
export interface CuratedMemory {
  // Core content
  content: string                           // The memory content itself
  importance_weight: number                 // 0.0 to 1.0 (curator's assessment)
  semantic_tags: string[]                   // Concepts this relates to
  reasoning: string                         // Why Claude thinks this is important

  // Classification (v3: strict enums)
  context_type: ContextType                 // STRICT: one of 11 canonical types
  temporal_class: TemporalClass             // How long this memory persists

  // Flags
  action_required: boolean                  // Does this need follow-up?
  confidence_score: number                  // 0.0 to 1.0 (Claude's confidence)
  problem_solution_pair: boolean            // Is this a problem→solution pattern?

  // Retrieval optimization (the secret sauce)
  trigger_phrases: string[]                 // Phrases that should trigger this memory
  question_types: string[]                  // Types of questions this answers
  anti_triggers?: string[]                  // Phrases where this memory is NOT relevant

  // ========== V2+ CURATOR FIELDS (optional - get smart defaults if not provided) ==========
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
 * v3 schema - removed unused fields, consolidated metadata
 */
export interface StoredMemory extends CuratedMemory {
  id: string                                // Unique identifier
  session_id: string                        // Session that created this memory
  project_id: string                        // Project this belongs to
  created_at: number                        // Timestamp (ms since epoch)
  updated_at: number                        // Last update timestamp
  embedding?: Float32Array                  // Vector embedding (384 dimensions)
  stale?: boolean                           // Is embedding out of sync with content?

  // ========== LIFECYCLE FIELDS ==========
  status?: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
  scope?: 'global' | 'project'

  // Temporal tracking
  session_created?: number
  session_updated?: number
  last_surfaced?: number
  sessions_since_surfaced?: number
  fade_rate?: number                        // Decay rate per session (derived from temporal_class)

  // Categorization
  domain?: string
  feature?: string

  // Relationships
  supersedes?: string
  superseded_by?: string
  related_to?: string[]
  resolves?: string[]
  resolved_by?: string

  // Lifecycle triggers
  awaiting_implementation?: boolean
  awaiting_decision?: boolean
  blocked_by?: string
  blocks?: string[]
  related_files?: string[]

  // Retrieval control
  exclude_from_retrieval?: boolean

  // Schema version
  schema_version?: number
}

/**
 * Default values for v3 fields based on context_type
 * Uses only the 11 canonical context types
 */
export const V3_DEFAULTS = {
  // Type-specific defaults (all 11 canonical types)
  typeDefaults: {
    personal: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
    philosophy: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
    breakthrough: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
    milestone: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
    decision: { scope: 'project', temporal_class: 'long_term', fade_rate: 0 },
    architecture: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.01 },
    workflow: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.02 },
    technical: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
    debug: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
    unresolved: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.05 },
    state: { scope: 'project', temporal_class: 'short_term', fade_rate: 0.1 },
  } as Record<ContextType, { scope: 'global' | 'project'; temporal_class: string; fade_rate: number }>,

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

// Backwards compatibility alias
export const V2_DEFAULTS = V3_DEFAULTS

/**
 * Apply v3 defaults to a memory
 * Uses context_type to determine appropriate defaults
 */
export function applyV3Defaults(memory: Partial<StoredMemory>): StoredMemory {
  const contextType = (memory.context_type ?? 'technical') as ContextType
  const typeDefaults = V3_DEFAULTS.typeDefaults[contextType] ?? V3_DEFAULTS.typeDefaults.technical

  return {
    // Spread existing memory
    ...memory,

    // Apply status default
    status: memory.status ?? V3_DEFAULTS.fallback.status,

    // Apply scope from type defaults
    scope: memory.scope ?? typeDefaults?.scope ?? V3_DEFAULTS.fallback.scope,

    // Apply temporal class from type defaults
    temporal_class: memory.temporal_class ?? typeDefaults?.temporal_class ?? V3_DEFAULTS.fallback.temporal_class,

    // Apply fade rate from type defaults
    fade_rate: memory.fade_rate ?? typeDefaults?.fade_rate ?? V3_DEFAULTS.fallback.fade_rate,

    // Apply other defaults
    sessions_since_surfaced: memory.sessions_since_surfaced ?? V3_DEFAULTS.fallback.sessions_since_surfaced,
    awaiting_implementation: memory.awaiting_implementation ?? V3_DEFAULTS.fallback.awaiting_implementation,
    awaiting_decision: memory.awaiting_decision ?? V3_DEFAULTS.fallback.awaiting_decision,
    exclude_from_retrieval: memory.exclude_from_retrieval ?? V3_DEFAULTS.fallback.exclude_from_retrieval,

    // Initialize empty arrays if not present
    related_to: memory.related_to ?? [],
    resolves: memory.resolves ?? [],
    blocks: memory.blocks ?? [],
    related_files: memory.related_files ?? [],

    // Mark as current schema version
    schema_version: memory.schema_version ?? 3,
  } as StoredMemory
}

// Backwards compatibility alias
export const applyV2Defaults = applyV3Defaults

/**
 * Check if a memory needs migration to v3
 */
export function needsMigration(memory: Partial<StoredMemory>): boolean {
  return !memory.schema_version || memory.schema_version < 3
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
 * Emoji map for memory context types (v3 schema)
 * Compact visual representation for efficient parsing
 */
export const MEMORY_TYPE_EMOJI: Record<ContextType, string> = {
  technical: '🔧',      // Wrench - building/fixing code
  debug: '🐛',          // Bug - debugging
  architecture: '🏗️',   // Construction - system design
  decision: '⚖️',       // Scale - weighing options
  personal: '💜',       // Purple heart - relationship
  philosophy: '🌀',     // Spiral - deeper thinking
  workflow: '🔄',       // Cycle - processes
  milestone: '🏆',      // Trophy - achievement
  breakthrough: '💡',   // Lightbulb - insight
  unresolved: '❓',     // Question - open items
  state: '📍',          // Pin - current status
}

/**
 * Get emoji for a context type, with fallback
 */
export function getMemoryEmoji(contextType: string): string {
  return MEMORY_TYPE_EMOJI[contextType.toLowerCase()] ?? '📝'
}
