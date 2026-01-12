// ============================================================================
// V3 SCHEMA MIGRATION
// Consolidates fragmented metadata into canonical categories
// ============================================================================

/**
 * V3 Schema Version
 */
export const V3_SCHEMA_VERSION = 3

/**
 * Canonical context types - STRICT ENUM, no custom strings allowed
 */
export const CANONICAL_CONTEXT_TYPES = [
  'technical',     // Code, implementation, APIs, how things work
  'debug',         // Bugs, errors, fixes, gotchas, troubleshooting
  'architecture',  // System design, patterns, structure, decisions about structure
  'decision',      // Choices made and reasoning, trade-offs
  'personal',      // Relationship, family, preferences, collaboration style
  'philosophy',    // Beliefs, values, worldview, principles
  'workflow',      // How we work together, processes, habits
  'milestone',     // Achievements, completions, shipped features
  'breakthrough',  // Major discoveries, aha moments, key insights
  'unresolved',    // Open questions, investigations, todos, blockers
  'state',         // Current project status, what's working/broken now
] as const

export type CanonicalContextType = typeof CANONICAL_CONTEXT_TYPES[number]

/**
 * Mapping from ALL known fragmented types to canonical types
 * Built from analysis of 1,278 memories with 170+ unique context_type values
 */
export const CONTEXT_TYPE_MIGRATION_MAP: Record<string, CanonicalContextType> = {
  // === TECHNICAL (code, implementation, APIs) ===
  'technical': 'technical',
  'technical_implementation': 'technical',
  'technical_pattern': 'technical',
  'technical_solution': 'technical',
  'technical_insight': 'technical',
  'technical_reference': 'technical',
  'technical_achievement': 'technical',
  'technical_discovery': 'technical',
  'technical_milestone': 'technical',
  'technical_verification': 'technical',
  'technical_validation': 'technical',
  'technical_research': 'technical',
  'technical_metrics': 'technical',
  'technical_knowledge': 'technical',
  'technical_improvement': 'technical',
  'technical_connection': 'technical',
  'technical_completion': 'technical',
  'technical_clarification': 'technical',
  'technical_blocker': 'technical',
  'technical-pattern': 'technical',
  'technical-solution': 'technical',
  'implementation': 'technical',
  'implementation_detail': 'technical',
  'implementation_pattern': 'technical',
  'implementation_task': 'technical',
  'implementation_status': 'technical',
  'implementation_reference': 'technical',
  'implementation_breakthrough': 'technical',
  'implementation-gap': 'technical',
  'implementation-detail': 'technical',
  'implementation-complete': 'technical',
  'feature_implementation': 'technical',
  'feature_specification': 'technical',
  'feature_reference': 'technical',
  'feature_design': 'technical',
  'code_reference': 'technical',
  'code_quality': 'technical',
  'code_patterns': 'technical',
  'code_pattern': 'technical',
  'coding_pattern': 'technical',
  'api_reference': 'technical',
  'api_migration': 'technical',
  'api_limitation': 'technical',
  'api_documentation': 'technical',
  'api_design': 'technical',
  'api_configuration': 'technical',
  'api_clarification': 'technical',
  'reference': 'technical',
  'reference_implementation': 'technical',
  'domain_knowledge': 'technical',
  'configuration': 'technical',
  'deployment_configuration': 'technical',
  'tool_knowledge': 'technical',
  'tool_created': 'technical',
  'problem_solution': 'technical',  // Has problem_solution_pair flag
  'general': 'technical',  // Fallback
  'insight': 'technical',
  'validation': 'technical',
  'validation_results': 'technical',

  // === DEBUG (bugs, errors, fixes) ===
  'debug': 'debug',
  'debugging': 'debug',
  'debugging_insight': 'debug',
  'debugging_technique': 'debug',
  'debugging_tool': 'debug',
  'debugging_context': 'debug',
  'active_debugging': 'debug',
  'bug_fix': 'debug',
  'bug_solution': 'debug',
  'bug_report': 'debug',
  'bug_fix_pattern': 'debug',
  'bug_fix_needed': 'debug',
  'bug_discovery': 'debug',
  'active_bug': 'debug',
  'active_issue': 'debug',
  'technical_gotcha': 'debug',
  'gotcha': 'debug',
  'problem_discovery': 'debug',
  'technical_fix': 'debug',
  'solved': 'debug',
  'critical_discovery': 'debug',

  // === ARCHITECTURE (system design, patterns) ===
  'architecture': 'architecture',
  'architectural': 'architecture',
  'architectural_decision': 'architecture',
  'architectural_pattern': 'architecture',
  'architectural_principle': 'architecture',
  'architectural_insight': 'architecture',
  'architectural_understanding': 'architecture',
  'architectural_discovery': 'architecture',
  'architectural_direction': 'architecture',
  'architectural-decision': 'architecture',
  'architecture_pattern': 'architecture',
  'architecture_decision': 'architecture',
  'architecture_documentation': 'architecture',
  'system_design': 'architecture',
  'design_pattern': 'architecture',
  'design_methodology': 'architecture',
  'design_principle': 'architecture',
  'design_insight': 'architecture',
  'design_system': 'architecture',
  'design-system': 'architecture',
  'core_concept': 'architecture',

  // === DECISION (choices made and reasoning) ===
  'decision': 'decision',
  'technical_decision': 'decision',
  'design_decision': 'decision',
  'design-decision': 'decision',
  'design_philosophy': 'decision',
  'strategic_decision': 'decision',
  'strategic_priority': 'decision',
  'project-decision': 'decision',

  // === PERSONAL (relationship, family, preferences) ===
  'personal': 'personal',
  'personal_context': 'personal',
  'personal_update': 'personal',
  'personal_philosophy': 'personal',
  'relationship': 'personal',
  'relationship_context': 'personal',
  'relationship_pattern': 'personal',
  'relationship_insight': 'personal',
  'relationship_philosophy': 'personal',
  'relationship_milestone': 'personal',
  'relationship_moment': 'personal',
  'relationship_dynamics': 'personal',
  'relationship_dynamic': 'personal',
  'relationship_repair': 'personal',
  'preference': 'personal',
  'user_preference': 'personal',
  'collaborator_philosophy': 'personal',
  'collaborator-guidance': 'personal',
  'collaboration_philosophy': 'personal',
  'collaboration_pattern': 'personal',
  'collaboration_insight': 'personal',
  'collaboration_context': 'personal',
  'collaboration': 'personal',
  'user_philosophy': 'personal',

  // === PHILOSOPHY (beliefs, values, worldview) ===
  'philosophy': 'philosophy',
  'philosophical_insight': 'philosophy',
  'philosophical_framework': 'philosophy',
  'philosophical_anchor': 'philosophy',
  'philosophical_technical_bridge': 'philosophy',
  'project_philosophy': 'philosophy',
  'product_philosophy': 'philosophy',
  'values_and_ethics': 'philosophy',
  'wisdom': 'philosophy',

  // === WORKFLOW (how we work together) ===
  'workflow': 'workflow',
  'workflow_pattern': 'workflow',
  'development_workflow': 'workflow',
  'development_tip': 'workflow',
  'developer_preferences': 'workflow',
  'development_practice': 'workflow',
  'development_methodology': 'workflow',

  // === MILESTONE (achievements, completions) ===
  'milestone': 'milestone',
  'project_milestone': 'milestone',
  'creative_achievement': 'milestone',
  'technical_achievement': 'milestone',

  // === BREAKTHROUGH (major discoveries) ===
  'breakthrough': 'breakthrough',

  // === UNRESOLVED (open questions, todos) ===
  'unresolved': 'unresolved',
  'todo': 'unresolved',
  'open_question': 'unresolved',
  'open_questions': 'unresolved',
  'open_investigation': 'unresolved',
  'pending_work': 'unresolved',
  'pending_task': 'unresolved',
  'planned_experiment': 'unresolved',
  'work_in_progress': 'unresolved',
  'upcoming_work': 'unresolved',
  'future_planning': 'unresolved',
  'planning': 'unresolved',

  // === STATE (current project status) ===
  'state': 'state',
  'technical_state': 'state',
  'project_status': 'state',
  'project_state': 'state',
  'project_context': 'state',
  'project_structure': 'state',
  'project_roadmap': 'state',
  'project_organization': 'state',
  'project_foundation': 'state',
  'project_direction': 'state',
  'project_vision': 'state',
  'project_documentation': 'state',
  'project_architecture': 'state',
  'experimental_result': 'state',
  'performance_data': 'state',
  'framework_status': 'state',
}

/**
 * New emoji map aligned with canonical types
 */
export const V3_EMOJI_MAP: Record<CanonicalContextType, string> = {
  technical: '🔧',     // Wrench - building/fixing
  debug: '🐛',         // Bug - debugging
  architecture: '🏗️',  // Construction - system design
  decision: '⚖️',      // Scale - weighing options
  personal: '💜',      // Purple heart - relationship
  philosophy: '🌀',    // Spiral - deeper thinking
  workflow: '🔄',      // Cycle - processes
  milestone: '🏆',     // Trophy - achievement
  breakthrough: '💡',  // Lightbulb - insight
  unresolved: '❓',    // Question - open items
  state: '📍',         // Pin - current status
}

/**
 * Fields to DELETE in v3 migration
 */
export const V3_DELETED_FIELDS = [
  'emotional_resonance',      // 580 variants, broken matching
  'knowledge_domain',         // Redundant with domain
  'component',                // Always empty
  'prerequisite_understanding', // Never used
  'follow_up_context',        // Never used
  'dependency_context',       // Never used
  'retrieval_weight',         // Retrieval uses importance_weight
  'parent_id',                // No logic implemented
  'child_ids',                // No logic implemented
  'expires_after_sessions',   // Never used
  'temporal_relevance',       // Replaced by temporal_class
] as const

/**
 * Map old temporal_relevance values to temporal_class
 * Used during migration before deleting temporal_relevance
 */
export const TEMPORAL_RELEVANCE_TO_CLASS: Record<string, string> = {
  'persistent': 'long_term',   // Always relevant → fades slowly
  'session': 'short_term',     // Session-specific → fades quickly
  'temporary': 'ephemeral',    // Short-term → surface once then expire
  'archived': 'medium_term',   // Historical → normal fade (status handles archival)
}

/**
 * Migrate temporal_relevance to temporal_class
 */
export function migrateTemporalRelevance(temporal_relevance: string | null | undefined): string | null {
  if (!temporal_relevance) return null
  return TEMPORAL_RELEVANCE_TO_CLASS[temporal_relevance] ?? null
}

/**
 * V2 defaults updated for v3 canonical types
 */
export const V3_TYPE_DEFAULTS: Record<CanonicalContextType, {
  scope: 'global' | 'project'
  temporal_class: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
  fade_rate: number
}> = {
  personal: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
  philosophy: { scope: 'global', temporal_class: 'eternal', fade_rate: 0 },
  breakthrough: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
  decision: { scope: 'project', temporal_class: 'long_term', fade_rate: 0 },
  milestone: { scope: 'project', temporal_class: 'eternal', fade_rate: 0 },
  architecture: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.01 },
  workflow: { scope: 'project', temporal_class: 'long_term', fade_rate: 0.02 },
  technical: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
  debug: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.03 },
  unresolved: { scope: 'project', temporal_class: 'medium_term', fade_rate: 0.05 },
  state: { scope: 'project', temporal_class: 'short_term', fade_rate: 0.1 },
}

/**
 * Check if a context_type is in our known mapping
 */
export function isKnownContextType(type: string | undefined | null): boolean {
  if (!type) return false
  const normalized = type.toLowerCase().trim()
  return normalized in CONTEXT_TYPE_MIGRATION_MAP || CANONICAL_CONTEXT_TYPES.includes(normalized as CanonicalContextType)
}

/**
 * Migrate a context_type value to its canonical form
 * @param oldType - The old context type value
 * @param preserveUnknown - If true, return null for unknown types (caller can decide to keep original)
 */
export function migrateContextType(oldType: string | undefined | null, preserveUnknown = false): CanonicalContextType | null {
  if (!oldType) return 'technical'

  const normalized = oldType.toLowerCase().trim()

  // Already canonical
  if (CANONICAL_CONTEXT_TYPES.includes(normalized as CanonicalContextType)) {
    return normalized as CanonicalContextType
  }

  // Direct lookup in migration map
  if (normalized in CONTEXT_TYPE_MIGRATION_MAP) {
    return CONTEXT_TYPE_MIGRATION_MAP[normalized]
  }

  // If preserveUnknown is set, return null so caller can keep original
  if (preserveUnknown) {
    return null
  }

  // Fuzzy matching for unknown types
  if (normalized.includes('debug') || normalized.includes('bug') || normalized.includes('fix')) {
    return 'debug'
  }
  if (normalized.includes('architect') || normalized.includes('design') || normalized.includes('pattern')) {
    return 'architecture'
  }
  if (normalized.includes('decision') || normalized.includes('choice')) {
    return 'decision'
  }
  if (normalized.includes('personal') || normalized.includes('relationship') || normalized.includes('preference')) {
    return 'personal'
  }
  if (normalized.includes('philosoph') || normalized.includes('value') || normalized.includes('wisdom')) {
    return 'philosophy'
  }
  if (normalized.includes('workflow') || normalized.includes('process')) {
    return 'workflow'
  }
  if (normalized.includes('milestone') || normalized.includes('achievement') || normalized.includes('complete')) {
    return 'milestone'
  }
  if (normalized.includes('breakthrough') || normalized.includes('insight') || normalized.includes('discover')) {
    return 'breakthrough'
  }
  if (normalized.includes('unresolved') || normalized.includes('todo') || normalized.includes('open') || normalized.includes('pending')) {
    return 'unresolved'
  }
  if (normalized.includes('state') || normalized.includes('status') || normalized.includes('current')) {
    return 'state'
  }

  // Default fallback
  return 'technical'
}

/**
 * Get emoji for a canonical context type
 */
export function getV3Emoji(contextType: CanonicalContextType | string): string {
  const canonical = CANONICAL_CONTEXT_TYPES.includes(contextType as CanonicalContextType)
    ? contextType as CanonicalContextType
    : migrateContextType(contextType)
  return V3_EMOJI_MAP[canonical]
}
