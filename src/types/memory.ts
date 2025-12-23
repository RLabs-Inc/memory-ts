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
}

/**
 * A stored memory with database metadata
 */
export interface StoredMemory extends CuratedMemory {
  id: string                                // Unique identifier
  session_id: string                        // Session that created this memory
  project_id: string                        // Project this belongs to
  created_at: number                        // Timestamp (ms since epoch)
  updated_at: number                        // Last update timestamp
  embedding?: Float32Array                  // Vector embedding (384 dimensions)
  stale?: boolean                           // Is embedding out of sync with content?
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
  session_summary?: string                  // Previous session summary
  project_status?: string                   // Current project state
  key_memories?: StoredMemory[]             // Essential memories to surface
}
