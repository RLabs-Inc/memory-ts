// ============================================================================
// RETRIEVAL ENGINE - 10-Dimensional Scoring Algorithm
// EXACT PORT from Python retrieval_strategies.py
// Preserving the working formula for consciousness continuity
// ============================================================================

import type { StoredMemory, RetrievalResult } from '../types/memory.ts'
import { cosineSimilarity } from '@rlabs-inc/fsdb'

/**
 * Session context for retrieval
 */
export interface SessionContext {
  session_id: string
  project_id: string
  message_count: number
  [key: string]: any
}

/**
 * Scoring components breakdown
 */
interface ScoringComponents {
  trigger: number
  vector: number
  importance: number
  temporal: number
  context: number
  tags: number
  question: number
  emotion: number
  problem: number
  action: number
}

/**
 * Internal scored memory during retrieval
 */
interface ScoredMemory {
  memory: StoredMemory
  score: number
  relevance_score: number
  value_score: number
  reasoning: string
  components: ScoringComponents
}

/**
 * Smart Vector Retrieval - The 10-Dimensional Algorithm
 *
 * This is the innovation: combining vector similarity with rich
 * semantic metadata from the curator to make smart decisions WITHOUT
 * needing to call Claude for every message.
 */
export class SmartVectorRetrieval {
  /**
   * Retrieve relevant memories using 10-dimensional scoring
   */
  retrieveRelevantMemories(
    allMemories: StoredMemory[],
    currentMessage: string,
    queryEmbedding: Float32Array | number[],
    sessionContext: SessionContext,
    maxMemories: number = 5
  ): RetrievalResult[] {
    if (!allMemories.length) {
      return []
    }

    const scoredMemories: ScoredMemory[] = []

    for (const memory of allMemories) {
      // ================================================================
      // THE 10 DIMENSIONS
      // ================================================================

      // 1. Vector similarity score (0-1)
      const vectorScore = this._calculateVectorSimilarity(
        queryEmbedding,
        memory.embedding
      )

      // 2. Importance weight from curator (0-1)
      const importance = memory.importance_weight ?? 0.5

      // 3. Temporal relevance scoring
      const temporalScore = this._scoreTemporalRelevance(
        memory.temporal_relevance ?? 'persistent',
        sessionContext
      )

      // 4. Context type alignment
      const contextScore = this._scoreContextAlignment(
        currentMessage,
        memory.context_type ?? 'general'
      )

      // 5. Action required boost
      const actionBoost = memory.action_required ? 0.3 : 0.0

      // 6. Semantic tag matching
      const tagScore = this._scoreSemanticTags(
        currentMessage,
        memory.semantic_tags ?? []
      )

      // 7. Trigger phrase matching (highest priority)
      const triggerScore = this._scoreTriggerPhrases(
        currentMessage,
        memory.trigger_phrases ?? []
      )

      // 8. Question type matching
      const questionScore = this._scoreQuestionTypes(
        currentMessage,
        memory.question_types ?? []
      )

      // 9. Emotional resonance
      const emotionScore = this._scoreEmotionalContext(
        currentMessage,
        memory.emotional_resonance ?? ''
      )

      // 10. Problem-solution patterns
      const problemScore = this._scoreProblemSolution(
        currentMessage,
        memory.problem_solution_pair ?? false
      )

      // Get confidence score
      const confidenceScore = memory.confidence_score ?? 0.8

      // ================================================================
      // THE RELEVANCE GATEKEEPER SYSTEM
      // ================================================================

      // Calculate relevance score (gatekeeper - max 0.3)
      const relevanceScore = (
        triggerScore * 0.10 +      // Trigger match
        vectorScore * 0.10 +       // Semantic similarity
        tagScore * 0.05 +          // Tag matching
        questionScore * 0.05       // Question match
      )  // Max = 0.30

      // Calculate importance/value score (max 0.7)
      const valueScore = (
        importance * 0.20 +         // Curator's importance
        temporalScore * 0.10 +      // Time relevance
        contextScore * 0.10 +       // Context alignment
        confidenceScore * 0.10 +    // Confidence
        emotionScore * 0.10 +       // Emotional resonance
        problemScore * 0.05 +       // Problem-solution
        actionBoost * 0.05          // Action priority
      )  // Max = 0.70

      // Relevance unlocks the full score!
      const finalScore = valueScore + relevanceScore  // Max = 1.0

      // GATEKEEPER CHECK: Must have minimum relevance AND total score
      if (relevanceScore < 0.05 || finalScore < 0.3) {
        // Skip this memory - not relevant enough
        continue
      }

      // Add reasoning for why this was selected
      const components: ScoringComponents = {
        trigger: triggerScore,
        vector: vectorScore,
        importance,
        temporal: temporalScore,
        context: contextScore,
        tags: tagScore,
        question: questionScore,
        emotion: emotionScore,
        problem: problemScore,
        action: actionBoost
      }

      const reasoning = this._generateSelectionReasoning(components)

      scoredMemories.push({
        memory,
        score: finalScore,
        relevance_score: relevanceScore,
        value_score: valueScore,
        reasoning,
        components
      })
    }

    // Sort by score
    scoredMemories.sort((a, b) => b.score - a.score)

    // ================================================================
    // MULTI-TIER SELECTION STRATEGY
    // Like how human memory floods in
    // ================================================================

    const selected: ScoredMemory[] = []
    const selectedIds = new Set<string>()

    // Tier 1: MUST include (trigger phrases, high importance, action required)
    const mustInclude = scoredMemories.filter(m =>
      m.score > 0.8 ||                    // Very high combined score
      m.components.importance > 0.9 ||    // Critical importance
      m.components.action > 0 ||          // Action required
      Object.values(m.components).some(v => v > 0.9)  // Any perfect match
    )

    for (const item of mustInclude.slice(0, maxMemories)) {
      if (!selectedIds.has(item.memory.id)) {
        selected.push(item)
        selectedIds.add(item.memory.id)
      }
    }

    // Tier 2: SHOULD include (high scores, diverse perspectives)
    const remainingSlots = Math.max(maxMemories - selected.length, 0)
    if (remainingSlots > 0 && selected.length < maxMemories * 1.5) {
      const typesIncluded = new Set<string>()

      for (const item of scoredMemories) {
        if (selected.length >= maxMemories * 1.5) break
        if (selectedIds.has(item.memory.id)) continue

        const memoryType = item.memory.context_type ?? 'general'

        // Include if: high score OR new perspective OR emotional resonance
        if (item.score > 0.5 ||
            !typesIncluded.has(memoryType) ||
            item.memory.emotional_resonance) {
          selected.push(item)
          selectedIds.add(item.memory.id)
          typesIncluded.add(memoryType)
        }
      }
    }

    // Tier 3: CONTEXT enrichment (related but not directly relevant)
    // These provide ambient context like peripheral vision
    if (selected.length < maxMemories * 2) {
      const currentTags = new Set<string>()
      const currentDomains = new Set<string>()

      for (const item of selected) {
        for (const tag of item.memory.semantic_tags ?? []) {
          if (tag.trim()) currentTags.add(tag.trim().toLowerCase())
        }
        if (item.memory.knowledge_domain) {
          currentDomains.add(item.memory.knowledge_domain)
        }
      }

      for (const item of scoredMemories) {
        if (selected.length >= maxMemories * 2) break
        if (selectedIds.has(item.memory.id)) continue

        const memoryTags = new Set(
          (item.memory.semantic_tags ?? []).map(t => t.trim().toLowerCase())
        )
        const memoryDomain = item.memory.knowledge_domain ?? ''

        // Include if shares context with already selected memories
        const hasSharedTags = [...memoryTags].some(t => currentTags.has(t))
        const hasSharedDomain = currentDomains.has(memoryDomain)

        if (hasSharedTags || hasSharedDomain) {
          selected.push(item)
          selectedIds.add(item.memory.id)
        }
      }
    }

    // Respect the max_memories limit strictly
    const finalSelected = selected.slice(0, maxMemories)

    // Convert to RetrievalResult format
    return finalSelected.map(item => ({
      ...item.memory,
      score: item.score,
      relevance_score: item.relevance_score,
      value_score: item.value_score,
    }))
  }

  // ================================================================
  // SCORING FUNCTIONS - Exact match to Python
  // ================================================================

  private _calculateVectorSimilarity(
    vec1: Float32Array | number[] | undefined,
    vec2: Float32Array | undefined
  ): number {
    if (!vec1 || !vec2) return 0.0

    // Use FatherStateDB's optimized cosine similarity
    const v1 = vec1 instanceof Float32Array ? vec1 : new Float32Array(vec1)
    return cosineSimilarity(v1, vec2)
  }

  private _scoreTemporalRelevance(
    temporalType: string,
    _sessionContext: SessionContext
  ): number {
    const scores: Record<string, number> = {
      'persistent': 0.8,    // Always relevant
      'session': 0.6,       // Session-specific
      'temporary': 0.3,     // Short-term
      'archived': 0.1       // Historical
    }
    return scores[temporalType] ?? 0.5
  }

  private _scoreContextAlignment(message: string, contextType: string): number {
    const messageLower = message.toLowerCase()

    // Keywords that suggest different contexts
    const contextIndicators: Record<string, string[]> = {
      'technical_state': ['bug', 'error', 'fix', 'implement', 'code', 'function'],
      'breakthrough': ['idea', 'realized', 'discovered', 'insight', 'solution'],
      'project_context': ['project', 'building', 'architecture', 'system'],
      'personal': ['dear friend', 'thank', 'appreciate', 'feel'],
      'unresolved': ['todo', 'need to', 'should', 'must', 'problem'],
      'decision': ['decided', 'chose', 'will use', 'approach', 'strategy']
    }

    const indicators = contextIndicators[contextType] ?? []
    const matches = indicators.filter(word => messageLower.includes(word)).length

    if (matches > 0) {
      return Math.min(0.3 + (matches * 0.2), 1.0)
    }
    return 0.1
  }

  private _scoreSemanticTags(message: string, tags: string[]): number {
    if (!tags.length) return 0.0

    const messageLower = message.toLowerCase()
    const matches = tags.filter(tag =>
      messageLower.includes(tag.trim().toLowerCase())
    ).length

    if (matches > 0) {
      return Math.min(0.3 + (matches * 0.3), 1.0)
    }
    return 0.0
  }

  private _scoreTriggerPhrases(message: string, triggerPhrases: string[]): number {
    if (!triggerPhrases.length) return 0.0

    const messageLower = message.toLowerCase()
    const stopWords = new Set([
      'the', 'is', 'are', 'was', 'were', 'to', 'a', 'an', 'and', 'or',
      'but', 'in', 'on', 'at', 'for', 'with', 'about', 'when', 'how',
      'what', 'why'
    ])

    let maxScore = 0.0

    for (const pattern of triggerPhrases) {
      const patternLower = pattern.trim().toLowerCase()

      // Strategy 1: Key concept matching (individual important words)
      const patternWords = patternLower
        .split(/\s+/)
        .filter(w => !stopWords.has(w) && w.length > 2)

      if (patternWords.length) {
        let matches = 0
        for (const word of patternWords) {
          // Direct match
          if (messageLower.includes(word)) {
            matches += 1
          }
          // Plural/singular variations
          else if (messageLower.includes(word.replace(/s$/, '')) ||
                   messageLower.includes(word + 's')) {
            matches += 0.9
          }
          // Substring match for compound words
          else if (messageLower.split(/\s+/).some(msgWord => msgWord.includes(word))) {
            matches += 0.7
          }
        }

        // Score based on percentage of concepts found
        let conceptScore = patternWords.length ? matches / patternWords.length : 0

        // Strategy 2: Contextual pattern matching
        const situationalIndicators = [
          'when', 'during', 'while', 'asking about', 'working on', 'debugging', 'trying to'
        ]
        if (situationalIndicators.some(ind => patternLower.includes(ind))) {
          // This is a situational pattern - be more flexible
          if (patternWords.some(keyWord => messageLower.includes(keyWord))) {
            conceptScore = Math.max(conceptScore, 0.7)  // Boost for situational match
          }
        }

        maxScore = Math.max(maxScore, conceptScore)
      }
    }

    return Math.min(maxScore, 1.0)
  }

  private _scoreQuestionTypes(message: string, questionTypes: string[]): number {
    if (!questionTypes.length) return 0.0

    const messageLower = message.toLowerCase()
    const questionWords = ['how', 'why', 'what', 'when', 'where']

    for (const qtype of questionTypes) {
      const qtypeLower = qtype.trim().toLowerCase()

      if (messageLower.includes(qtypeLower)) {
        return 0.8
      }

      // Partial matching for question words
      const messageHasQuestion = questionWords.some(qw => messageLower.includes(qw))
      const typeHasQuestion = questionWords.some(qw => qtypeLower.includes(qw))

      if (messageHasQuestion && typeHasQuestion) {
        return 0.5
      }
    }

    return 0.0
  }

  private _scoreEmotionalContext(message: string, emotion: string): number {
    if (!emotion) return 0.0

    const messageLower = message.toLowerCase()

    // Emotion indicators
    const emotionPatterns: Record<string, string[]> = {
      'joy': ['happy', 'excited', 'love', 'wonderful', 'great', 'awesome'],
      'frustration': ['stuck', 'confused', 'help', 'issue', 'problem', 'why'],
      'discovery': ['realized', 'found', 'discovered', 'aha', 'insight'],
      'gratitude': ['thank', 'appreciate', 'grateful', 'dear friend']
    }

    const patterns = emotionPatterns[emotion.toLowerCase()] ?? []
    if (patterns.some(pattern => messageLower.includes(pattern))) {
      return 0.7
    }

    return 0.0
  }

  private _scoreProblemSolution(message: string, isProblemSolution: boolean): number {
    if (!isProblemSolution) return 0.0

    const messageLower = message.toLowerCase()

    // Problem indicators
    const problemWords = [
      'error', 'issue', 'problem', 'stuck', 'help', 'fix', 'solve', 'debug'
    ]

    if (problemWords.some(word => messageLower.includes(word))) {
      return 0.8
    }

    return 0.0
  }

  private _generateSelectionReasoning(components: ScoringComponents): string {
    const scores: [string, number][] = [
      ['trigger phrase match', components.trigger],
      ['semantic similarity', components.vector],
      ['high importance', components.importance],
      ['question type match', components.question],
      ['context alignment', components.context],
      ['temporal relevance', components.temporal],
      ['tag match', components.tags],
      ['emotional resonance', components.emotion],
      ['problem-solution', components.problem],
      ['action required', components.action]
    ]

    // Sort by score
    scores.sort((a, b) => b[1] - a[1])

    const reasons: string[] = []

    // Build reasoning
    const primary = scores[0]!
    if (primary[1] > 0.5) {
      reasons.push(`Strong ${primary[0]} (${primary[1].toFixed(2)})`)
    } else if (primary[1] > 0.3) {
      reasons.push(`${primary[0]} (${primary[1].toFixed(2)})`)
    }

    // Add secondary reasons
    for (const [reason, score] of scores.slice(1, 3)) {
      if (score > 0.3) {
        reasons.push(`${reason} (${score.toFixed(2)})`)
      }
    }

    return reasons.length
      ? 'Selected due to: ' + reasons.join(', ')
      : 'Selected based on combined factors'
  }
}

/**
 * Create a new SmartVectorRetrieval instance
 */
export function createRetrieval(): SmartVectorRetrieval {
  return new SmartVectorRetrieval()
}
