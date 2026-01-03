// ============================================================================
// DATABASE SCHEMAS - FatherStateDB column definitions
// Maps CuratedMemory to reactive parallel arrays
// ============================================================================

import type { SchemaDefinition } from '@rlabs-inc/fsdb'

/**
 * Schema version for migration tracking
 * Increment this when adding new fields that require migration
 */
export const MEMORY_SCHEMA_VERSION = 2

/**
 * Memory storage schema
 * Each field becomes a parallel reactive array in FatherStateDB
 *
 * VERSION HISTORY:
 * v1: Original schema (content, reasoning, importance_weight, etc.)
 * v2: Added lifecycle management fields (status, scope, domain, relationships, etc.)
 */
export const memorySchema = {
  // ========== CORE CONTENT (v1) ==========
  content: 'string',
  reasoning: 'string',

  // ========== SCORES (v1) ==========
  importance_weight: 'number',          // 0.0 to 1.0
  confidence_score: 'number',           // 0.0 to 1.0

  // ========== CLASSIFICATION (v1) ==========
  context_type: 'string',               // breakthrough, decision, technical, etc.
  temporal_relevance: 'string',         // persistent, session, temporary, archived
  knowledge_domain: 'string',           // architecture, debugging, philosophy
  emotional_resonance: 'string',        // joy, frustration, discovery, gratitude

  // ========== FLAGS (v1) ==========
  action_required: 'boolean',
  problem_solution_pair: 'boolean',

  // ========== ARRAYS (v1) ==========
  semantic_tags: 'string[]',            // ["typescript", "signals", "reactivity"]
  trigger_phrases: 'string[]',          // ["working on memory", "debugging curator"]
  question_types: 'string[]',           // ["how", "why", "what is"]

  // ========== SESSION/PROJECT (v1) ==========
  session_id: 'string',
  project_id: 'string',

  // ========== EMBEDDING (v1) ==========
  embedding: 'vector:384',

  // ========== LIFECYCLE STATUS (v2) ==========
  status: 'string',                     // active | pending | superseded | deprecated | archived
  scope: 'string',                      // global | project

  // ========== TEMPORAL TRACKING (v2) ==========
  session_created: 'number',            // Session number when created
  session_updated: 'number',            // Session number when last updated
  last_surfaced: 'number',              // Session number when last retrieved
  sessions_since_surfaced: 'number',    // Counter for decay

  // ========== TEMPORAL CLASS & DECAY (v2) ==========
  temporal_class: 'string',             // eternal | long_term | medium_term | short_term | ephemeral
  fade_rate: 'number',                  // Decay rate per session
  expires_after_sessions: 'number',     // For ephemeral only

  // ========== CATEGORIZATION (v2) ==========
  domain: 'string',                     // embeddings, gpu, auth, family, etc.
  feature: 'string',                    // Specific feature within domain
  component: 'string',                  // Code component if applicable

  // ========== RELATIONSHIPS (v2) ==========
  supersedes: 'string',                 // ID of memory this replaces
  superseded_by: 'string',              // ID of memory that replaced this
  related_to: 'string[]',               // IDs of related memories
  resolves: 'string[]',                 // IDs of unresolved/debug/todo this solved
  resolved_by: 'string',                // ID of solved memory that resolved this
  parent_id: 'string',                  // For chains/sequences
  child_ids: 'string[]',                // Children in chain

  // ========== LIFECYCLE TRIGGERS (v2) ==========
  awaiting_implementation: 'boolean',   // Set true for planned features
  awaiting_decision: 'boolean',         // Waiting on a decision
  blocked_by: 'string',                 // ID of blocking memory
  blocks: 'string[]',                   // IDs this memory blocks
  related_files: 'string[]',            // Source files for technical memories

  // ========== RETRIEVAL CONTROL (v2) ==========
  retrieval_weight: 'number',           // Current weight (affected by decay)
  exclude_from_retrieval: 'boolean',    // Force exclusion

  // ========== SCHEMA VERSION (v2) ==========
  schema_version: 'number',             // Track which schema version this record uses
} as const satisfies SchemaDefinition

export type MemorySchema = typeof memorySchema

/**
 * Session summary schema
 */
export const sessionSummarySchema = {
  session_id: 'string',
  project_id: 'string',
  summary: 'string',
  interaction_tone: 'string',
} as const satisfies SchemaDefinition

export type SessionSummarySchema = typeof sessionSummarySchema

/**
 * Project snapshot schema
 */
export const projectSnapshotSchema = {
  session_id: 'string',
  project_id: 'string',
  current_phase: 'string',
  recent_achievements: 'string[]',
  active_challenges: 'string[]',
  next_steps: 'string[]',
} as const satisfies SchemaDefinition

export type ProjectSnapshotSchema = typeof projectSnapshotSchema

/**
 * Session tracking schema
 */
export const sessionSchema = {
  project_id: 'string',
  message_count: 'number',
  first_session_completed: 'boolean',
  last_active: 'timestamp',
  metadata: 'string',                   // JSON string for flexible metadata
} as const satisfies SchemaDefinition

export type SessionSchema = typeof sessionSchema

/**
 * Management log schema - tracks what the management agent did
 */
export const managementLogSchema = {
  project_id: 'string',
  session_number: 'number',
  memories_processed: 'number',
  superseded_count: 'number',
  resolved_count: 'number',
  linked_count: 'number',
  primer_updated: 'boolean',
  success: 'boolean',
  duration_ms: 'number',
  summary: 'string',                    // Agent's summary of what it did
  error: 'string',                      // Error message if failed
  details: 'string',                    // JSON string with full details
} as const satisfies SchemaDefinition

export type ManagementLogSchema = typeof managementLogSchema
