// ============================================================================
// DATABASE SCHEMAS - FatherStateDB column definitions
// Maps CuratedMemory to reactive parallel arrays
// ============================================================================

import type { SchemaDefinition } from '@rlabs-inc/fsdb'

/**
 * Memory storage schema
 * Each field becomes a parallel reactive array in FatherStateDB
 */
export const memorySchema = {
  // Core content
  content: 'string',
  reasoning: 'string',

  // Numeric scores (for sorting and filtering)
  importance_weight: 'number',          // 0.0 to 1.0
  confidence_score: 'number',           // 0.0 to 1.0

  // Classification (strings for flexibility)
  context_type: 'string',               // breakthrough, decision, technical, etc.
  temporal_relevance: 'string',         // persistent, session, temporary, archived
  knowledge_domain: 'string',           // architecture, debugging, philosophy
  emotional_resonance: 'string',        // joy, frustration, discovery, gratitude

  // Flags
  action_required: 'boolean',
  problem_solution_pair: 'boolean',

  // Arrays for semantic matching
  semantic_tags: 'string[]',            // ["typescript", "signals", "reactivity"]
  trigger_phrases: 'string[]',          // ["working on memory", "debugging curator"]
  question_types: 'string[]',           // ["how", "why", "what is"]

  // Session/project tracking
  session_id: 'string',
  project_id: 'string',

  // Vector embedding for semantic search (384 dimensions - MiniLM)
  embedding: 'vector:384',
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
