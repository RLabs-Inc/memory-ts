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
 * Logger with beautiful styled output
 */
export const logger = {
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
   * Log retrieved memories
   */
  logRetrievedMemories(memories: Array<{
    content: string
    score: number
    context_type: string
  }>, query: string) {
    const queryPreview = query.length > 40
      ? query.slice(0, 40) + '...'
      : query

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
      const score = style('green', `${(m.score * 100).toFixed(0)}%`)
      const type = style('cyan', m.context_type)
      const num = style('dim', `${i + 1}.`)

      const preview = m.content.length > 55
        ? m.content.slice(0, 55) + style('dim', '...')
        : m.content

      console.log(`   ${num} [${score}] ${type}`)
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
}

export default logger
