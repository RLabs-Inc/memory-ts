// ============================================================================
// CURATION SCHEMA - Zod schemas for SDK structured outputs
// Mirrors memory.ts types for JSON Schema generation
// ============================================================================

import { z } from 'zod'

/**
 * All 11 canonical context types - matches memory.ts CONTEXT_TYPES
 */
export const ContextTypeSchema = z.enum([
  'technical',
  'debug',
  'architecture',
  'decision',
  'personal',
  'philosophy',
  'workflow',
  'milestone',
  'breakthrough',
  'unresolved',
  'state'
])

/**
 * Temporal class - matches memory.ts TemporalClass
 */
export const TemporalClassSchema = z.enum([
  'eternal',
  'long_term',
  'medium_term',
  'short_term',
  'ephemeral'
])

/**
 * Scope - global (shared) or project-specific
 */
export const ScopeSchema = z.enum(['global', 'project'])

/**
 * Single curated memory - matches memory.ts CuratedMemory
 * Fields marked optional have smart defaults applied by applyV4Defaults()
 */
export const CuratedMemorySchema = z.object({
  // Core content (v4: two-tier structure)
  headline: z.string().describe('1-2 line summary WITH conclusion - always shown in retrieval'),
  content: z.string().describe('Full structured template (WHAT/WHERE/HOW/WHY) - expandable'),
  reasoning: z.string().describe('Why this memory matters for future sessions'),

  // Scores
  importance_weight: z.number().min(0).max(1).describe('0.9+ breakthrough, 0.7-0.8 important, 0.5-0.6 useful'),
  confidence_score: z.number().min(0).max(1).describe('How confident in this assessment'),

  // Classification
  context_type: ContextTypeSchema.describe('One of 11 canonical types'),
  temporal_class: TemporalClassSchema.optional().describe('Persistence duration - defaults by context_type'),
  scope: ScopeSchema.optional().describe('global for personal/philosophy, project for technical'),

  // Retrieval optimization (the secret sauce)
  trigger_phrases: z.array(z.string()).describe('Situational patterns: "when debugging X", "working on Y"'),
  semantic_tags: z.array(z.string()).describe('User-typeable concepts - avoid generic terms'),

  // Optional categorization
  domain: z.string().optional().describe('Specific area: embeddings, auth, family'),
  feature: z.string().optional().describe('Specific feature within domain'),
  related_files: z.array(z.string()).optional().describe('Source files for technical memories'),

  // Flags
  action_required: z.boolean().default(false).describe('Needs follow-up action'),
  problem_solution_pair: z.boolean().default(false).describe('Problem→solution pattern'),
  awaiting_implementation: z.boolean().optional().describe('Planned feature not yet built'),
  awaiting_decision: z.boolean().optional().describe('Decision point needing resolution'),
})

/**
 * Project snapshot - current state
 */
export const ProjectSnapshotSchema = z.object({
  current_phase: z.string().describe('What phase is the project in'),
  recent_achievements: z.array(z.string()).describe('What was accomplished this session'),
  active_challenges: z.array(z.string()).describe('Current blockers or challenges'),
  next_steps: z.array(z.string()).describe('Planned next steps'),
})

/**
 * Full curation result - what the curator returns
 */
export const CurationResultSchema = z.object({
  session_summary: z.string().describe('2-3 sentence overview of what happened'),
  interaction_tone: z.string().nullable().optional().describe('How was the interaction'),
  project_snapshot: ProjectSnapshotSchema.optional().describe('Current project state'),
  memories: z.array(CuratedMemorySchema).describe('Extracted memories from session'),
})

// Type exports for TypeScript inference
export type ZodCuratedMemory = z.infer<typeof CuratedMemorySchema>
export type ZodCurationResult = z.infer<typeof CurationResultSchema>
export type ZodProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>

/**
 * Generate JSON Schema for SDK structured outputs
 * Use: z.toJSONSchema(CurationResultSchema)
 */
export function getCurationJsonSchema() {
  return z.toJSONSchema(CurationResultSchema)
}
