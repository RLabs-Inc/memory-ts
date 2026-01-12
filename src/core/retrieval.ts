// ============================================================================
// RETRIEVAL ENGINE - Activation Signal Algorithm
// Philosophy: Quality over quantity. Silence over noise.
// Return ONLY memories that are truly relevant to the current context.
// ============================================================================

import type { StoredMemory, RetrievalResult } from '../types/memory.ts'
import { cosineSimilarity } from '@rlabs-inc/fsdb'
import { logger } from '../utils/logger.ts'

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
 * Activation signals - binary indicators of relevance
 */
interface ActivationSignals {
  trigger: boolean      // Trigger phrase matched
  tags: boolean         // 2+ semantic tags found in message
  domain: boolean       // Domain word found in message
  feature: boolean      // Feature word found in message
  content: boolean      // Key content words found in message
  files: boolean        // Related file path matched
  count: number         // Total signals activated
  triggerStrength: number  // How strong the trigger match was (0-1)
  tagCount: number      // How many tags matched
  vectorSimilarity: number // Semantic similarity (0-1)
}

/**
 * Scored memory with activation signals
 */
interface ActivatedMemory {
  memory: StoredMemory
  signals: ActivationSignals
  importanceScore: number  // For ranking among relevant memories
  isGlobal: boolean
}

/**
 * Global memory type priority (lower = higher priority)
 */
const GLOBAL_TYPE_PRIORITY: Record<string, number> = {
  technical: 1,
  preference: 2,
  architectural: 3,
  workflow: 4,
  decision: 5,
  breakthrough: 6,
  philosophy: 7,
  personal: 8,
}

// Minimum signals required for a memory to be considered relevant
const MIN_ACTIVATION_SIGNALS = 2

/**
 * Stopwords for word extraction
 */
const STOPWORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'to', 'a', 'an', 'and', 'or',
  'but', 'in', 'on', 'at', 'for', 'with', 'about', 'when', 'how',
  'what', 'why', 'where', 'this', 'that', 'it', 'of', 'be', 'have',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can',
  'may', 'might', 'must', 'shall', 'has', 'had', 'been', 'being',
  'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your', 'our',
  'its', 'his', 'her', 'their', 'if', 'then', 'else', 'so', 'as',
  'from', 'by', 'into', 'through', 'during', 'before', 'after',
  'also', 'now', 'back', 'get', 'go', 'come', 'let', 'like', 'just',
  'know', 'think', 'see', 'look', 'make', 'take', 'want', 'need',
])


/**
 * Activation Signal Retrieval
 *
 * Phase 1: Count activation signals (binary relevance indicators)
 * Phase 2: Among relevant memories, rank by importance
 *
 * Philosophy: A memory is relevant if multiple signals agree it should activate.
 * Not coincidence - intentionally crafted metadata matching intentional queries.
 */
export class SmartVectorRetrieval {

  /**
   * Extract significant words from text
   */
  private _extractSignificantWords(text: string): Set<string> {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
    return new Set(words)
  }

  /**
   * Extract file paths from message
   * Matches patterns like /path/to/file.ts, src/core/engine.ts, ./relative/path
   */
  private _extractFilePaths(text: string): Set<string> {
    const paths = new Set<string>()
    // Match file paths (with / or \ separators, optional extension)
    const pathPattern = /(?:^|[\s'"(])([.\/\\]?(?:[\w.-]+[\/\\])+[\w.-]+(?:\.\w+)?)/g
    let match
    while ((match = pathPattern.exec(text)) !== null) {
      const path = match[1].toLowerCase()
      paths.add(path)
      // Also add just the filename for partial matching
      const filename = path.split(/[\/\\]/).pop()
      if (filename) paths.add(filename)
    }
    return paths
  }

  /**
   * Check if related_files activate for this message
   */
  private _checkFilesActivation(
    messagePaths: Set<string>,
    relatedFiles: string[] | undefined
  ): boolean {
    if (!relatedFiles?.length || !messagePaths.size) return false

    for (const file of relatedFiles) {
      const fileLower = file.toLowerCase()
      // Check if any message path matches this file
      for (const msgPath of messagePaths) {
        if (fileLower.includes(msgPath) || msgPath.includes(fileLower)) {
          return true
        }
      }
      // Also check just the filename
      const filename = fileLower.split(/[\/\\]/).pop()
      if (filename && messagePaths.has(filename)) {
        return true
      }
    }
    return false
  }

  /**
   * Pre-filter: Binary exclusions based on v2 lifecycle fields
   * NOTE: superseded_by memories are NOT filtered here - they get redirected in Phase 1
   */
  private _preFilter(
    memories: StoredMemory[],
    currentProjectId: string,
    messageLower: string
  ): StoredMemory[] {
    return memories.filter(memory => {
      if (memory.status && memory.status !== 'active') return false
      if (memory.exclude_from_retrieval === true) return false
      // NOTE: Don't filter superseded_by here - we handle redirects in Phase 1
      const isGlobal = memory.scope === 'global' || memory.project_id === 'global'
      if (!isGlobal && memory.project_id !== currentProjectId) return false
      if (memory.anti_triggers?.length) {
        for (const antiTrigger of memory.anti_triggers) {
          if (messageLower.includes(antiTrigger.toLowerCase())) return false
        }
      }
      return true
    })
  }

  /**
   * Check if trigger phrases activate for this message
   */
  private _checkTriggerActivation(
    messageLower: string,
    messageWords: Set<string>,
    triggerPhrases: string[]
  ): { activated: boolean; strength: number } {
    if (!triggerPhrases.length) return { activated: false, strength: 0 }

    let maxStrength = 0

    for (const phrase of triggerPhrases) {
      const phraseLower = phrase.trim().toLowerCase()
      const phraseWords = phraseLower
        .split(/\s+/)
        .filter(w => !STOPWORDS.has(w) && w.length > 2)

      if (!phraseWords.length) continue

      let matches = 0
      for (const word of phraseWords) {
        if (messageWords.has(word) || messageLower.includes(word)) {
          matches++
        } else if (messageWords.has(word.replace(/s$/, '')) ||
                   messageWords.has(word + 's') ||
                   messageLower.includes(word.replace(/s$/, '')) ||
                   messageLower.includes(word + 's')) {
          matches += 0.8
        }
      }

      const strength = phraseWords.length > 0 ? matches / phraseWords.length : 0
      maxStrength = Math.max(maxStrength, strength)
    }

    return { activated: maxStrength >= 0.5, strength: maxStrength }
  }

  /**
   * Check if semantic tags activate for this message
   */
  private _checkTagActivation(
    messageLower: string,
    messageWords: Set<string>,
    tags: string[]
  ): { activated: boolean; count: number } {
    if (!tags.length) return { activated: false, count: 0 }

    let matchCount = 0
    for (const tag of tags) {
      const tagLower = tag.trim().toLowerCase()
      if (messageWords.has(tagLower) || messageLower.includes(tagLower)) {
        matchCount++
      }
    }

    const threshold = tags.length <= 2 ? 1 : 2
    return { activated: matchCount >= threshold, count: matchCount }
  }

  /**
   * Check if domain activates for this message
   */
  private _checkDomainActivation(
    messageLower: string,
    messageWords: Set<string>,
    domain: string | undefined
  ): boolean {
    if (!domain) return false
    const domainLower = domain.trim().toLowerCase()
    return messageWords.has(domainLower) || messageLower.includes(domainLower)
  }

  /**
   * Check if feature activates for this message
   */
  private _checkFeatureActivation(
    messageLower: string,
    messageWords: Set<string>,
    feature: string | undefined
  ): boolean {
    if (!feature) return false
    const featureLower = feature.trim().toLowerCase()
    return messageWords.has(featureLower) || messageLower.includes(featureLower)
  }

  /**
   * Check if content keywords activate for this message
   */
  private _checkContentActivation(
    messageWords: Set<string>,
    memory: StoredMemory
  ): boolean {
    const contentPreview = memory.content.slice(0, 200)
    const contentWords = this._extractSignificantWords(contentPreview)

    let overlap = 0
    for (const word of messageWords) {
      if (contentWords.has(word)) overlap++
    }

    return overlap >= 3
  }

  /**
   * Calculate vector similarity
   */
  private _vectorDebugSamples: number[] = []

  private _calculateVectorSimilarity(
    vec1: Float32Array | number[] | undefined,
    vec2: Float32Array | number[] | undefined
  ): number {
    if (!vec1 || !vec2) {
      return 0.0
    }
    const v1 = vec1 instanceof Float32Array ? vec1 : new Float32Array(vec1)
    const v2 = vec2 instanceof Float32Array ? vec2 : new Float32Array(vec2)
    const similarity = cosineSimilarity(v1, v2)

    // Collect samples to understand similarity range
    if (this._vectorDebugSamples.length < 20) {
      this._vectorDebugSamples.push(similarity)
    }

    return similarity
  }

  /**
   * Log vector similarity stats after retrieval
   */
  private _logVectorStats(): void {
    if (this._vectorDebugSamples.length === 0) return
    const samples = this._vectorDebugSamples
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    logger.debug(`Vector similarities: min=${(min*100).toFixed(1)}% max=${(max*100).toFixed(1)}% avg=${(avg*100).toFixed(1)}% (${samples.length} samples)`, 'retrieval')
    this._vectorDebugSamples = []  // Reset for next retrieval
  }

  /**
   * Calculate importance score using ALL rich metadata
   * Additive discrete bonuses - no averaging, no compression
   */
  private _calculateImportanceScore(
    memory: StoredMemory,
    signalCount: number,
    messageLower: string,
    messageWords: Set<string>
  ): number {
    let score = 0

    // BASE: importance weight (0-1)
    score += memory.importance_weight ?? 0.5

    // SIGNAL BOOST: reward strong relevance match
    if (signalCount >= 4) score += 0.2
    else if (signalCount >= 3) score += 0.1

    // AWAITING: unfinished work needs attention
    if (memory.awaiting_implementation) score += 0.15
    if (memory.awaiting_decision) score += 0.1

    // CONTEXT TYPE MATCH: does user's intent match memory type?
    const contextType = memory.context_type?.toLowerCase() ?? ''
    const contextKeywords: Record<string, string[]> = {
      debugging: ['debug', 'bug', 'error', 'fix', 'issue', 'problem', 'broken'],
      decision: ['decide', 'decision', 'choose', 'choice', 'option', 'should'],
      architectural: ['architect', 'design', 'structure', 'pattern', 'how'],
      breakthrough: ['insight', 'realize', 'understand', 'discover', 'why'],
      technical: ['implement', 'code', 'function', 'method', 'api'],
      workflow: ['process', 'workflow', 'step', 'flow', 'pipeline'],
      philosophy: ['philosophy', 'principle', 'belief', 'approach', 'think'],
    }
    const keywords = contextKeywords[contextType] ?? []
    for (const kw of keywords) {
      if (messageWords.has(kw) || messageLower.includes(kw)) {
        score += 0.1
        break // Only one boost per context match
      }
    }

    // PROBLEM/SOLUTION: boost if user seems to have a problem
    if (memory.problem_solution_pair) {
      const problemWords = ['error', 'bug', 'issue', 'problem', 'wrong', 'fail', 'broken', 'help', 'stuck']
      for (const pw of problemWords) {
        if (messageWords.has(pw) || messageLower.includes(pw)) {
          score += 0.1
          break
        }
      }
    }

    // TEMPORAL CLASS: eternal truths matter more
    const temporalClass = memory.temporal_class ?? 'medium_term'
    if (temporalClass === 'eternal') score += 0.1
    else if (temporalClass === 'long_term') score += 0.05
    else if (temporalClass === 'ephemeral') {
      // Ephemeral only gets boost if from recent session (sessions_since_surfaced <= 1)
      if ((memory.sessions_since_surfaced ?? 0) <= 1) score += 0.1
    }

    // CONFIDENCE PENALTY: low confidence memories are less reliable
    const confidence = memory.confidence_score ?? 0.7
    if (confidence < 0.5) score -= 0.1

    // NOTE: emotional_resonance matching removed in v3 (field deleted - 580 variants, unusable)

    return score
  }

  /**
   * Main retrieval - Activation Signal Algorithm
   */
  retrieveRelevantMemories(
    allMemories: StoredMemory[],
    currentMessage: string,
    queryEmbedding: Float32Array | number[],
    sessionContext: SessionContext,
    maxMemories: number = 5,
    alreadyInjectedCount: number = 0,
    maxGlobalMemories: number = 2
  ): RetrievalResult[] {
    const startTime = performance.now()

    if (!allMemories.length) {
      return []
    }

    const messageLower = currentMessage.toLowerCase()
    const messageWords = this._extractSignificantWords(currentMessage)
    const messagePaths = this._extractFilePaths(currentMessage)

    // Build lookup map for redirect resolution
    const memoryById = new Map<string, StoredMemory>()
    for (const m of allMemories) {
      memoryById.set(m.id, m)
    }

    // ================================================================
    // PHASE 0: PRE-FILTER (Binary exclusions)
    // ================================================================
    const candidates = this._preFilter(allMemories, sessionContext.project_id, messageLower)
    if (!candidates.length) {
      return []
    }

    // ================================================================
    // PHASE 1: ACTIVATION SIGNALS
    // Count how many signals agree this memory should activate
    // A memory is relevant if >= MIN_ACTIVATION_SIGNALS fire
    // Handles redirects for superseded_by/resolved_by
    // ================================================================
    const activatedMemories: ActivatedMemory[] = []
    const activatedIds = new Set<string>()
    let rejectedCount = 0

    for (const memory of candidates) {
      // Check each activation signal
      const triggerResult = this._checkTriggerActivation(
        messageLower, messageWords, memory.trigger_phrases ?? []
      )
      const tagResult = this._checkTagActivation(
        messageLower, messageWords, memory.semantic_tags ?? []
      )
      const domainActivated = this._checkDomainActivation(
        messageLower, messageWords, memory.domain
      )
      const featureActivated = this._checkFeatureActivation(
        messageLower, messageWords, memory.feature
      )
      const contentActivated = this._checkContentActivation(messageWords, memory)
      const filesActivated = this._checkFilesActivation(messagePaths, memory.related_files)
      const vectorSimilarity = this._calculateVectorSimilarity(queryEmbedding, memory.embedding)

      // Count activated signals (now 7 possible signals)
      let signalCount = 0
      if (triggerResult.activated) signalCount++
      if (tagResult.activated) signalCount++
      if (domainActivated) signalCount++
      if (featureActivated) signalCount++
      if (contentActivated) signalCount++
      if (filesActivated) signalCount++
      // Vector similarity as bonus signal only if very high
      if (vectorSimilarity >= 0.40) signalCount++

      const signals: ActivationSignals = {
        trigger: triggerResult.activated,
        tags: tagResult.activated,
        domain: domainActivated,
        feature: featureActivated,
        content: contentActivated,
        files: filesActivated,
        count: signalCount,
        triggerStrength: triggerResult.strength,
        tagCount: tagResult.count,
        vectorSimilarity,
      }

      // RELEVANCE GATE: Must have at least MIN_ACTIVATION_SIGNALS
      if (signalCount < MIN_ACTIVATION_SIGNALS) {
        rejectedCount++
        continue
      }

      // REDIRECT: If superseded_by or resolved_by exists, surface the replacement instead
      let memoryToSurface = memory
      if (memory.superseded_by || memory.resolved_by) {
        const replacementId = memory.superseded_by ?? memory.resolved_by
        const replacement = replacementId ? memoryById.get(replacementId) : undefined
        if (replacement && replacement.status !== 'archived' && replacement.status !== 'deprecated') {
          memoryToSurface = replacement
          logger.debug(`Redirect: ${memory.id.slice(-8)} → ${replacement.id.slice(-8)} (${memory.superseded_by ? 'superseded' : 'resolved'})`, 'retrieval')
        }
      }

      // Skip if we already added this memory (could happen from multiple redirects)
      if (activatedIds.has(memoryToSurface.id)) {
        continue
      }

      const isGlobal = memoryToSurface.scope === 'global' || memoryToSurface.project_id === 'global'

      // Calculate importance for ranking (Phase 2) - uses ALL rich metadata
      const importanceScore = this._calculateImportanceScore(memoryToSurface, signalCount, messageLower, messageWords)

      activatedMemories.push({
        memory: memoryToSurface,
        signals,
        importanceScore,
        isGlobal,
      })
      activatedIds.add(memoryToSurface.id)
    }

    // Log diagnostics
    this._logActivationDistribution(activatedMemories, candidates.length, rejectedCount)
    this._logVectorStats()

    // If nothing activated, return empty - silence over noise
    if (!activatedMemories.length) {
      const durationMs = performance.now() - startTime
      logger.logRetrievalScoring({
        totalMemories: allMemories.length,
        currentMessage,
        alreadyInjected: alreadyInjectedCount,
        preFiltered: allMemories.length - candidates.length,
        globalCount: 0,
        projectCount: 0,
        finalCount: 0,
        durationMs,
        selectedMemories: [],
      })
      return []
    }

    // ================================================================
    // PHASE 2: IMPORTANCE RANKING (Among Relevant)
    // Sort by: signal count (primary), then importance (secondary)
    // ================================================================
    activatedMemories.sort((a, b) => {
      // First by signal count (more signals = more certainly relevant)
      if (b.signals.count !== a.signals.count) {
        return b.signals.count - a.signals.count
      }
      // Then by importance score
      return b.importanceScore - a.importanceScore
    })

    // ================================================================
    // PHASE 3: SELECTION
    // Separate global/project, respect limits
    // ================================================================
    const selected: ActivatedMemory[] = []
    const selectedIds = new Set<string>()

    const globalMemories = activatedMemories.filter(m => m.isGlobal)
    const projectMemories = activatedMemories.filter(m => !m.isGlobal)

    // --- GLOBAL MEMORIES (max 2) ---
    const globalsSorted = globalMemories.sort((a, b) => {
      const aPriority = GLOBAL_TYPE_PRIORITY[a.memory.context_type ?? 'personal'] ?? 8
      const bPriority = GLOBAL_TYPE_PRIORITY[b.memory.context_type ?? 'personal'] ?? 8
      if (aPriority !== bPriority) return aPriority - bPriority
      if (b.signals.count !== a.signals.count) return b.signals.count - a.signals.count
      return b.importanceScore - a.importanceScore
    })

    for (const item of globalsSorted.slice(0, maxGlobalMemories)) {
      if (!selectedIds.has(item.memory.id)) {
        selected.push(item)
        selectedIds.add(item.memory.id)
      }
    }

    // --- PROJECT MEMORIES ---
    // Prioritize: action_required, high signal count, high importance
    const projectsSorted = [...projectMemories].sort((a, b) => {
      const aAction = a.memory.action_required ? 1 : 0
      const bAction = b.memory.action_required ? 1 : 0
      if (bAction !== aAction) return bAction - aAction
      if (b.signals.count !== a.signals.count) return b.signals.count - a.signals.count
      return b.importanceScore - a.importanceScore
    })

    // Debug: show top 15 candidates with calculated scores
    if (logger.isVerbose()) {
      logger.debug(`Top 15 candidates (sorted):`, 'retrieval')
      for (let i = 0; i < Math.min(15, projectsSorted.length); i++) {
        const m = projectsSorted[i]
        const action = m.memory.action_required ? '⚡' : ''
        logger.debug(`  ${i+1}. [${m.signals.count}sig] score=${m.importanceScore.toFixed(2)} ${action} ${m.memory.content.slice(0, 45)}...`, 'retrieval')
      }
    }

    for (const item of projectsSorted) {
      if (selected.length >= maxMemories) break
      if (selectedIds.has(item.memory.id)) continue
      selected.push(item)
      selectedIds.add(item.memory.id)
    }

    // PHASE 4: LINKED MEMORIES (related_to, blocked_by, blocks)
    // Pull in linked memories when space remains
    if (selected.length < maxMemories) {
      const linkedIds = new Set<string>()

      for (const item of selected) {
        // related_to - explicit relationships
        for (const relatedId of item.memory.related_to ?? []) {
          if (!selectedIds.has(relatedId)) {
            linkedIds.add(relatedId)
          }
        }
        // blocked_by - show what's blocking this
        if (item.memory.blocked_by && !selectedIds.has(item.memory.blocked_by)) {
          linkedIds.add(item.memory.blocked_by)
        }
        // blocks - show what this blocks
        for (const blockedId of item.memory.blocks ?? []) {
          if (!selectedIds.has(blockedId)) {
            linkedIds.add(blockedId)
          }
        }
      }

      // First try to find linked memories in the activated list
      for (const item of activatedMemories) {
        if (selected.length >= maxMemories) break
        if (selectedIds.has(item.memory.id)) continue
        if (linkedIds.has(item.memory.id)) {
          selected.push(item)
          selectedIds.add(item.memory.id)
          logger.debug(`Linked: ${item.memory.id.slice(-8)} pulled by relationship`, 'retrieval')
        }
      }

      // If linked memories weren't in activated list, pull them directly from allMemories
      // (they might not have activated on their own but are important for context)
      if (selected.length < maxMemories) {
        for (const linkedId of linkedIds) {
          if (selected.length >= maxMemories) break
          if (selectedIds.has(linkedId)) continue

          const linkedMemory = memoryById.get(linkedId)
          if (linkedMemory && linkedMemory.status !== 'archived' && linkedMemory.status !== 'deprecated') {
            const isGlobal = linkedMemory.scope === 'global' || linkedMemory.project_id === 'global'
            selected.push({
              memory: linkedMemory,
              signals: { trigger: false, tags: false, domain: false, feature: false, content: false, files: false, count: 0, triggerStrength: 0, tagCount: 0, vectorSimilarity: 0 },
              importanceScore: linkedMemory.importance_weight ?? 0.5,
              isGlobal,
            })
            selectedIds.add(linkedId)
            logger.debug(`Linked (direct): ${linkedId.slice(-8)} pulled for context`, 'retrieval')
          }
        }
      }
    }

    const durationMs = performance.now() - startTime

    // Log the final selection
    logger.logRetrievalScoring({
      totalMemories: allMemories.length,
      currentMessage,
      alreadyInjected: alreadyInjectedCount,
      preFiltered: allMemories.length - candidates.length,
      globalCount: globalMemories.length,
      projectCount: projectMemories.length,
      finalCount: selected.length,
      durationMs,
      selectedMemories: selected.map(item => ({
        content: item.memory.content,
        reasoning: this._generateActivationReasoning(item.signals),
        signalCount: item.signals.count,
        importance_weight: item.memory.importance_weight ?? 0.5,
        context_type: item.memory.context_type ?? 'general',
        semantic_tags: item.memory.semantic_tags ?? [],
        isGlobal: item.isGlobal,
        signals: {
          trigger: item.signals.trigger,
          triggerStrength: item.signals.triggerStrength,
          tags: item.signals.tags,
          tagCount: item.signals.tagCount,
          domain: item.signals.domain,
          feature: item.signals.feature,
          content: item.signals.content,
          files: item.signals.files,
          vector: item.signals.vectorSimilarity >= 0.40,
          vectorSimilarity: item.signals.vectorSimilarity,
        },
      })),
    })

    // Convert to RetrievalResult format
    return selected.map(item => ({
      ...item.memory,
      score: item.signals.count / 7,  // 7 possible signals
      relevance_score: item.signals.count / 7,
      value_score: item.importanceScore,
    }))
  }

  /**
   * Generate reasoning string from activation signals
   */
  private _generateActivationReasoning(signals: ActivationSignals): string {
    const reasons: string[] = []

    if (signals.trigger) reasons.push(`trigger:${(signals.triggerStrength * 100).toFixed(0)}%`)
    if (signals.tags) reasons.push(`tags:${signals.tagCount}`)
    if (signals.domain) reasons.push('domain')
    if (signals.feature) reasons.push('feature')
    if (signals.content) reasons.push('content')
    if (signals.files) reasons.push('files')
    if (signals.vectorSimilarity >= 0.40) reasons.push(`vector:${(signals.vectorSimilarity * 100).toFixed(0)}%`)

    return reasons.length
      ? `Activated: ${reasons.join(', ')} (${signals.count} signals)`
      : 'No signals'
  }

  /**
   * Log activation distribution for diagnostics
   */
  private _logActivationDistribution(
    activated: ActivatedMemory[],
    totalCandidates: number,
    rejectedCount: number
  ): void {
    const signalBuckets: Record<string, number> = {
      '2 signals': 0, '3 signals': 0, '4 signals': 0, '5 signals': 0, '6 signals': 0, '7 signals': 0
    }
    for (const mem of activated) {
      const key = `${Math.min(mem.signals.count, 7)} signals`
      signalBuckets[key] = (signalBuckets[key] ?? 0) + 1
    }

    let triggerCount = 0, tagCount = 0, domainCount = 0, featureCount = 0, contentCount = 0, filesCount = 0, vectorCount = 0
    for (const mem of activated) {
      if (mem.signals.trigger) triggerCount++
      if (mem.signals.tags) tagCount++
      if (mem.signals.domain) domainCount++
      if (mem.signals.feature) featureCount++
      if (mem.signals.content) contentCount++
      if (mem.signals.files) filesCount++
      if (mem.signals.vectorSimilarity >= 0.40) vectorCount++
    }

    logger.logScoreDistribution({
      totalCandidates,
      passedGatekeeper: activated.length,
      rejectedByGatekeeper: rejectedCount,
      buckets: signalBuckets,
      stats: {
        min: activated.length ? Math.min(...activated.map(m => m.signals.count)) : 0,
        max: activated.length ? Math.max(...activated.map(m => m.signals.count)) : 0,
        mean: activated.length ? Math.round(activated.reduce((s, m) => s + m.signals.count, 0) / activated.length * 10) / 10 : 0,
        stdev: 0,
        spread: activated.length ? Math.max(...activated.map(m => m.signals.count)) - Math.min(...activated.map(m => m.signals.count)) : 0,
      },
      percentiles: {},
      compressionWarning: false,
      signalBreakdown: {
        trigger: triggerCount,
        tags: tagCount,
        domain: domainCount,
        feature: featureCount,
        content: contentCount,
        files: filesCount,
        vector: vectorCount,
        total: activated.length,
      },
    })
  }

}


/**
 * Create a new SmartVectorRetrieval instance
 */
export function createRetrieval(): SmartVectorRetrieval {
  return new SmartVectorRetrieval()
}
