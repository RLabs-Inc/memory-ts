// ============================================================================
// LOGGER - Beautiful console output for the memory system
// Uses Node's built-in util.styleText for proper terminal support
// ============================================================================

import { styleText } from 'util'

type Style = Parameters<typeof styleText>[0]

const style = (format: Style, text: string): string => styleText(format, text)

/**
 * Format a timestamp (HH:MM:SS)
 */
function timestamp(): string {
  return style('dim', new Date().toISOString().slice(11, 19))
}

/**
 * Format a short session ID
 */
function shortId(id: string): string {
  return style('dim', id.slice(0, 8) + '...')
}

/**
 * Symbols
 */
const sym = {
  brain: '🧠',
  sparkles: '✨',
  book: '📖',
  calendar: '📅',
  arrow: '→',
  check: '✓',
  cross: '✗',
  warning: '⚠',
  info: 'ℹ',
  bullet: '•',
  fire: '🔥',
  target: '🎯',
}

/**
 * Logger configuration
 */
let _verbose = false

/**
 * Logger with beautiful styled output
 */
export const logger = {
  /**
   * Set verbose mode
   */
  setVerbose(enabled: boolean) {
    _verbose = enabled
  },

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return _verbose
  },

  /**
   * Debug message (only shown in verbose mode)
   */
  debug(message: string, prefix?: string) {
    if (_verbose) {
      const pfx = prefix ? style('dim', `[${prefix}] `) : ''
      console.log(`${style('dim', `🔍 ${pfx}${message}`)}`)
    }
  },

  /**
   * Info message
   */
  info(message: string) {
    console.log(`${timestamp()} ${style('cyan', sym.info)} ${message}`)
  },

  /**
   * Success message
   */
  success(message: string) {
    console.log(`${timestamp()} ${style('green', sym.check)} ${message}`)
  },

  /**
   * Warning message
   */
  warn(message: string) {
    console.log(`${timestamp()} ${style('yellow', sym.warning)} ${message}`)
  },

  /**
   * Error message
   */
  error(message: string) {
    console.error(`${timestamp()} ${style('red', sym.cross)} ${message}`)
  },

  /**
   * Memory event (curation, storage)
   */
  memory(message: string) {
    console.log(`${timestamp()} ${style('magenta', sym.brain)} ${message}`)
  },

  /**
   * Injection event (memories surfaced)
   */
  inject(message: string) {
    console.log(`${timestamp()} ${style('cyan', sym.sparkles)} ${message}`)
  },

  /**
   * Session event
   */
  session(message: string) {
    console.log(`${timestamp()} ${style('blue', sym.calendar)} ${message}`)
  },

  /**
   * Primer shown
   */
  primer(message: string) {
    console.log(`${timestamp()} ${style('yellow', sym.book)} ${message}`)
  },

  /**
   * Divider line
   */
  divider() {
    console.log(style('dim', '─'.repeat(60)))
  },

  /**
   * Request received (incoming)
   */
  request(method: string, path: string, projectId?: string) {
    const proj = projectId ? style('dim', ` [${projectId}]`) : ''
    console.log(`${timestamp()} ${style('dim', sym.arrow)} ${style('cyan', method)} ${path}${proj}`)
  },

  /**
   * Log curated memories in a beautiful format
   */
  logCuratedMemories(memories: Array<{
    content: string
    importance_weight: number
    context_type: string
    semantic_tags?: string[]
    emotional_resonance?: string
    action_required?: boolean
  }>) {
    console.log()
    console.log(`${timestamp()} ${style('magenta', sym.brain)} ${style(['bold', 'magenta'], `CURATED ${memories.length} MEMORIES`)}`)
    console.log()

    memories.forEach((m, i) => {
      const importance = style('yellow', `${(m.importance_weight * 100).toFixed(0)}%`)
      const type = style('cyan', m.context_type.toUpperCase())
      const num = style('dim', `${i + 1}.`)

      console.log(`   ${num} [${type}] ${importance}`)

      // Content preview
      const preview = m.content.length > 70
        ? m.content.slice(0, 70) + style('dim', '...')
        : m.content
      console.log(`      ${style('white', preview)}`)

      // Tags
      if (m.semantic_tags?.length) {
        const tags = m.semantic_tags.slice(0, 4).join(style('dim', ', '))
        console.log(`      ${style('dim', 'tags:')} ${tags}`)
      }

      // Special flags
      if (m.action_required) {
        console.log(`      ${style('red', '⚡ ACTION REQUIRED')}`)
      }
      console.log()
    })
  },

  /**
   * Log retrieved memories (Activation Signal Algorithm)
   */
  logRetrievedMemories(memories: Array<{
    content: string
    score: number  // signals.count / 6
    context_type: string
  }>, query: string) {
    const queryPreview = query.length > 40
      ? query.slice(0, 40) + '...'
      : query

    // Emoji map for quick visual scanning
    const emojiMap: Record<string, string> = {
      breakthrough: '💡', decision: '⚖️', personal: '💜', technical: '🔧',
      technical_state: '📍', unresolved: '❓', preference: '⚙️', workflow: '🔄',
      architectural: '🏗️', debugging: '🐛', philosophy: '🌀', todo: '🎯',
      implementation: '⚡', problem_solution: '✅', project_context: '📦',
      milestone: '🏆', general: '📝', project_state: '📍', pending_task: '⏳',
      work_in_progress: '🔨', system_feedback: '📣', project_milestone: '🏆',
      architectural_insight: '🏛️', architectural_direction: '🧭',
    }

    console.log()
    console.log(`${timestamp()} ${style('cyan', sym.sparkles)} ${style('bold', `SURFACING ${memories.length} MEMORIES`)}`)
    console.log(`      ${style('dim', 'query:')} "${queryPreview}"`)
    console.log()

    if (memories.length === 0) {
      console.log(`      ${style('dim', '(no relevant memories for this context)')}`)
      console.log()
      return
    }

    memories.forEach((m, i) => {
      // Convert score back to signal count (score is count/6)
      const signalCount = Math.round(m.score * 6)
      const signalStr = style('green', `${signalCount}sig`)
      const emoji = emojiMap[m.context_type?.toLowerCase()] ?? '📝'
      const num = style('dim', `${i + 1}.`)

      const preview = m.content.length > 55
        ? m.content.slice(0, 55) + style('dim', '...')
        : m.content

      console.log(`   ${num} [${signalStr}] ${emoji}`)
      console.log(`      ${preview}`)
    })
    console.log()
  },

  /**
   * Log server startup
   */
  startup(port: number, host: string, mode: string) {
    console.log()
    console.log(style(['bold', 'magenta'], '┌──────────────────────────────────────────────────────────┐'))
    console.log(style(['bold', 'magenta'], '│') + style('bold', `  ${sym.brain} MEMORY SERVER                                        `) + style(['bold', 'magenta'], '│'))
    console.log(style(['bold', 'magenta'], '└──────────────────────────────────────────────────────────┘'))
    console.log()
    console.log(`   ${style('dim', 'url:')}     ${style('cyan', `http://${host}:${port}`)}`)
    console.log(`   ${style('dim', 'storage:')} ${mode}`)
    console.log(`   ${style('dim', 'engine:')}  TypeScript + fsdb`)
    console.log()
    this.divider()
    console.log()
  },

  /**
   * Log session start
   */
  logSessionStart(sessionId: string, projectId: string, isNew: boolean) {
    const status = isNew
      ? style('green', 'new session')
      : style('blue', 'continuing')

    console.log()
    console.log(`${timestamp()} ${style('blue', sym.calendar)} ${style('bold', 'SESSION')} ${shortId(sessionId)}`)
    console.log(`      ${style('dim', 'project:')} ${projectId}`)
    console.log(`      ${style('dim', 'status:')} ${status}`)
    console.log()
  },

  /**
   * Log curation start
   */
  logCurationStart(sessionId: string, trigger: string) {
    console.log()
    console.log(`${timestamp()} ${style('magenta', sym.brain)} ${style('bold', 'CURATING')} ${shortId(sessionId)}`)
    console.log(`      ${style('dim', 'trigger:')} ${trigger}`)
  },

  /**
   * Log curation complete
   */
  logCurationComplete(memoriesCount: number, summary?: string) {
    if (memoriesCount > 0) {
      console.log(`      ${style('dim', 'memories:')} ${style('green', String(memoriesCount))} extracted`)
      if (summary) {
        const shortSummary = summary.length > 50
          ? summary.slice(0, 50) + '...'
          : summary
        console.log(`      ${style('dim', 'summary:')} ${shortSummary}`)
      }
    } else {
      console.log(`      ${style('dim', 'result:')} no memories to extract`)
    }
    console.log()
  },

  /**
   * Log management agent starting
   */
  logManagementStart(memoriesCount: number) {
    console.log(`${timestamp()} ${style('blue', '🔧')} ${style('bold', 'MANAGEMENT AGENT')}`)
    console.log(`      ${style('dim', 'processing:')} ${memoriesCount} new memories`)
  },

  /**
   * Log management agent results
   * In verbose mode: shows all details beautifully formatted
   * In normal mode: shows compact summary
   */
  logManagementComplete(result: {
    success: boolean
    superseded?: number
    resolved?: number
    linked?: number
    filesRead?: number
    filesWritten?: number
    primerUpdated?: boolean
    actions?: string[]
    summary?: string
    fullReport?: string
    error?: string
  }) {
    // Helper to format action with icon
    const formatAction = (action: string, truncate = true): string => {
      let icon = '  •'
      if (action.startsWith('READ OK')) icon = style('dim', '  📖')
      else if (action.startsWith('READ FAILED')) icon = style('red', '  ❌')
      else if (action.startsWith('WRITE OK')) icon = style('green', '  ✏️')
      else if (action.startsWith('WRITE FAILED')) icon = style('red', '  ❌')
      else if (action.startsWith('RECEIVED')) icon = style('cyan', '  📥')
      else if (action.startsWith('CREATED')) icon = style('green', '  ✨')
      else if (action.startsWith('UPDATED')) icon = style('blue', '  📝')
      else if (action.startsWith('SUPERSEDED')) icon = style('yellow', '  🔄')
      else if (action.startsWith('RESOLVED')) icon = style('green', '  ✅')
      else if (action.startsWith('LINKED')) icon = style('cyan', '  🔗')
      else if (action.startsWith('PRIMER')) icon = style('magenta', '  💜')
      else if (action.startsWith('SKIPPED')) icon = style('dim', '  ⏭️')
      else if (action.startsWith('NO_ACTION')) icon = style('dim', '  ◦')

      const text = truncate && action.length > 70 ? action.slice(0, 67) + '...' : action
      return `${icon} ${style('dim', text)}`
    }

    if (result.success) {
      console.log(`      ${style('green', sym.check)} ${style('bold', 'Completed')}`)

      if (_verbose) {
        // ═══════════════════════════════════════════════════════════════
        // VERBOSE MODE: Show everything beautifully formatted
        // ═══════════════════════════════════════════════════════════════

        // File I/O stats section
        console.log(`      ${style('dim', '─'.repeat(50))}`)
        console.log(`      ${style('cyan', '📊')} ${style('bold', 'Statistics')}`)

        const filesRead = result.filesRead ?? 0
        const filesWritten = result.filesWritten ?? 0
        console.log(`         ${style('dim', 'Files read:')}    ${filesRead > 0 ? style('green', String(filesRead)) : style('dim', '0')}`)
        console.log(`         ${style('dim', 'Files written:')} ${filesWritten > 0 ? style('green', String(filesWritten)) : style('dim', '0')}`)

        // Memory changes section
        const superseded = result.superseded ?? 0
        const resolved = result.resolved ?? 0
        const linked = result.linked ?? 0
        console.log(`         ${style('dim', 'Superseded:')}    ${superseded > 0 ? style('yellow', String(superseded)) : style('dim', '0')}`)
        console.log(`         ${style('dim', 'Resolved:')}      ${resolved > 0 ? style('green', String(resolved)) : style('dim', '0')}`)
        console.log(`         ${style('dim', 'Linked:')}        ${linked > 0 ? style('cyan', String(linked)) : style('dim', '0')}`)
        console.log(`         ${style('dim', 'Primer:')}        ${result.primerUpdated ? style('magenta', 'updated') : style('dim', 'unchanged')}`)

        // Actions section - show ALL actions in verbose mode
        if (result.actions && result.actions.length > 0) {
          console.log(`      ${style('dim', '─'.repeat(50))}`)
          console.log(`      ${style('cyan', '🎬')} ${style('bold', 'Actions')} ${style('dim', `(${result.actions.length} total)`)}`)
          for (const action of result.actions) {
            console.log(`      ${formatAction(action, false)}`)  // No truncation in verbose
          }
        }

        // Full report section
        if (result.fullReport) {
          console.log(`      ${style('dim', '─'.repeat(50))}`)
          console.log(`      ${style('cyan', '📋')} ${style('bold', 'Full Report')}`)
          const reportLines = result.fullReport.split('\n')
          for (const line of reportLines) {
            // Highlight section headers
            if (line.includes('===')) {
              console.log(`         ${style('bold', line)}`)
            } else if (line.match(/^[A-Z_]+:/)) {
              // Highlight stat lines like "memories_processed: 5"
              console.log(`         ${style('cyan', line)}`)
            } else {
              console.log(`         ${style('dim', line)}`)
            }
          }
        }

        console.log(`      ${style('dim', '─'.repeat(50))}`)

      } else {
        // ═══════════════════════════════════════════════════════════════
        // NORMAL MODE: Compact summary
        // ═══════════════════════════════════════════════════════════════

        // Memory change stats (one line)
        const stats: string[] = []
        if (result.superseded && result.superseded > 0) stats.push(`${result.superseded} superseded`)
        if (result.resolved && result.resolved > 0) stats.push(`${result.resolved} resolved`)
        if (result.linked && result.linked > 0) stats.push(`${result.linked} linked`)
        if (result.primerUpdated) stats.push('primer updated')

        if (stats.length > 0) {
          console.log(`      ${style('dim', 'changes:')} ${stats.join(style('dim', ', '))}`)
        } else {
          console.log(`      ${style('dim', 'changes:')} none (memories are current)`)
        }

        // Show limited actions
        if (result.actions && result.actions.length > 0) {
          console.log(`      ${style('dim', 'actions:')}`)
          for (const action of result.actions.slice(0, 10)) {
            console.log(`      ${formatAction(action, true)}`)
          }
          if (result.actions.length > 10) {
            console.log(`      ${style('dim', `  ... and ${result.actions.length - 10} more actions`)}`)
          }
        }
      }

    } else {
      // ═══════════════════════════════════════════════════════════════
      // ERROR: Always show error details
      // ═══════════════════════════════════════════════════════════════
      console.log(`      ${style('yellow', sym.warning)} ${style('bold', 'Failed')}`)
      if (result.error) {
        console.log(`      ${style('red', 'error:')} ${result.error}`)
      }

      // Show full report on error (always, for debugging)
      if (result.fullReport) {
        console.log(`      ${style('dim', '─'.repeat(50))}`)
        console.log(`      ${style('red', '📋')} ${style('bold', 'Error Report:')}`)
        const reportLines = result.fullReport.split('\n')
        for (const line of reportLines) {
          console.log(`         ${style('dim', line)}`)
        }
      }
    }
    console.log()
  },

  /**
   * Log memory retrieval scoring details (Activation Signal Algorithm)
   */
  logRetrievalScoring(params: {
    totalMemories: number
    currentMessage: string
    alreadyInjected: number
    preFiltered: number
    globalCount: number
    projectCount: number
    finalCount: number
    durationMs?: number
    selectedMemories: Array<{
      content: string
      reasoning: string  // "Activated: trigger:67%, tags:2, content (3 signals)"
      signalCount: number
      importance_weight: number
      context_type: string
      semantic_tags: string[]
      isGlobal: boolean
      // Activation signals
      signals: {
        trigger: boolean
        triggerStrength: number
        tags: boolean
        tagCount: number
        domain: boolean
        feature: boolean
        content: boolean
        vector: boolean
        vectorSimilarity: number
      }
    }>
  }) {
    const { totalMemories, currentMessage, alreadyInjected, preFiltered, globalCount, projectCount, finalCount, durationMs, selectedMemories } = params

    const timeStr = durationMs !== undefined ? style('cyan', `${durationMs.toFixed(1)}ms`) : ''

    console.log()
    console.log(`${timestamp()} ${style('magenta', sym.brain)} ${style('bold', 'RETRIEVAL')} ${timeStr}`)
    console.log(`      ${style('dim', 'total:')} ${totalMemories} → ${style('dim', 'filtered:')} ${preFiltered} → ${style('dim', 'candidates:')} ${totalMemories - preFiltered}`)
    console.log(`      ${style('dim', 'already injected:')} ${alreadyInjected}`)

    const msgPreview = currentMessage.length > 60
      ? currentMessage.slice(0, 60) + '...'
      : currentMessage
    console.log(`      ${style('dim', 'message:')} "${msgPreview}"`)
    console.log()

    // Selection summary
    console.log(`      ${style('cyan', 'Global:')} ${globalCount} candidates → max 2 selected`)
    console.log(`      ${style('cyan', 'Project:')} ${projectCount} candidates`)
    console.log(`      ${style('green', 'Final:')} ${finalCount} memories selected`)
    console.log()

    if (selectedMemories.length === 0) {
      console.log(`      ${style('dim', '📭 No relevant memories for this context')}`)
      console.log()
      return
    }

    // Detailed breakdown
    console.log(style('dim', '      ─'.repeat(30)))
    console.log(`      ${style('bold', 'SELECTION DETAILS')}`)
    console.log()

    selectedMemories.forEach((m, i) => {
      const num = style('dim', `${i + 1}.`)
      const signalsStr = style('green', `${m.signalCount} signals`)
      const imp = style('magenta', `imp:${(m.importance_weight * 100).toFixed(0)}%`)
      const type = style('yellow', m.context_type.toUpperCase())
      const scope = m.isGlobal ? style('blue', ' [G]') : ''

      console.log(`   ${num} [${signalsStr} • ${imp}] ${type}${scope}`)

      // Content preview
      const preview = m.content.length > 60
        ? m.content.slice(0, 60) + style('dim', '...')
        : m.content
      console.log(`      ${style('white', preview)}`)

      // Show which signals fired with their strengths
      const firedSignals: string[] = []
      if (m.signals.trigger) {
        firedSignals.push(`trigger:${(m.signals.triggerStrength * 100).toFixed(0)}%`)
      }
      if (m.signals.tags) {
        firedSignals.push(`tags:${m.signals.tagCount}`)
      }
      if (m.signals.domain) firedSignals.push('domain')
      if (m.signals.feature) firedSignals.push('feature')
      if (m.signals.content) firedSignals.push('content')
      if (m.signals.vector) {
        firedSignals.push(`vector:${(m.signals.vectorSimilarity * 100).toFixed(0)}%`)
      }

      if (firedSignals.length > 0) {
        console.log(`      ${style('cyan', 'signals:')} ${firedSignals.join(', ')}`)
      }

      console.log()
    })
  },

  /**
   * Log score distribution for diagnostics (supports both old and new algorithm)
   */
  logScoreDistribution(params: {
    totalCandidates: number
    passedGatekeeper: number
    rejectedByGatekeeper: number
    buckets: Record<string, number>
    stats: { min: number; max: number; mean: number; stdev: number; spread: number }
    percentiles: Record<string, number>
    relevanceStats?: { min: number; max: number; spread: number }
    triggerAnalysis?: { perfect: number; zero: number; total: number }
    top5Spread?: number
    compressionWarning: boolean
    signalBreakdown?: {
      trigger: number
      tags: number
      domain: number
      feature: number
      content: number
      vector: number
      total: number
    }
  }) {
    const { totalCandidates, passedGatekeeper, rejectedByGatekeeper, buckets, stats, signalBreakdown } = params

    console.log()
    console.log(style('dim', '      ─'.repeat(30)))
    console.log(`      ${style('bold', 'ACTIVATION SIGNALS')}`)
    console.log()

    // Gatekeeper stats
    const passRate = totalCandidates > 0 ? ((passedGatekeeper / totalCandidates) * 100).toFixed(0) : '0'
    console.log(`      ${style('dim', 'Activated:')} ${style('green', String(passedGatekeeper))}/${totalCandidates} (${passRate}%)`)
    console.log(`      ${style('dim', 'Rejected:')}  ${rejectedByGatekeeper} (< 2 signals)`)
    console.log()

    // Signal breakdown
    if (signalBreakdown && signalBreakdown.total > 0) {
      console.log(`      ${style('cyan', 'Signal Breakdown:')}`)
      const signals = [
        { name: 'trigger', count: signalBreakdown.trigger },
        { name: 'tags', count: signalBreakdown.tags },
        { name: 'domain', count: signalBreakdown.domain },
        { name: 'feature', count: signalBreakdown.feature },
        { name: 'content', count: signalBreakdown.content },
        { name: 'vector', count: signalBreakdown.vector },
      ]
      for (const sig of signals) {
        const pct = ((sig.count / signalBreakdown.total) * 100).toFixed(0)
        const bar = '█'.repeat(Math.round(sig.count / signalBreakdown.total * 20))
        console.log(`        ${sig.name.padEnd(8)} ${bar.padEnd(20)} ${sig.count} (${pct}%)`)
      }
      console.log()
    }

    // Stats
    if (stats.max > 0) {
      console.log(`      ${style('cyan', 'Signals:')} min=${stats.min} max=${stats.max} mean=${stats.mean}`)
      console.log()
    }

    // Histogram by signal count
    if (Object.keys(buckets).length > 0) {
      console.log(`      ${style('bold', 'Distribution:')}`)
      const maxBucketCount = Math.max(...Object.values(buckets), 1)
      const bucketOrder = ['2 signals', '3 signals', '4 signals', '5 signals', '6 signals']

      for (const bucket of bucketOrder) {
        const count = buckets[bucket] ?? 0
        if (count > 0 || bucket === '2 signals') {
          const barLen = Math.round((count / maxBucketCount) * 25)
          const bar = '█'.repeat(barLen) + style('dim', '░'.repeat(25 - barLen))
          const countStr = count.toString().padStart(3)
          console.log(`      ${style('dim', bucket.padEnd(10))} ${bar} ${style('cyan', countStr)}`)
        }
      }
      console.log()
    }
  },
}

export default logger
