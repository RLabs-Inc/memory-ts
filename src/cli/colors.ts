// ============================================================================
// TERMINAL STYLING - Using Node's built-in util.styleText
// Automatically respects NO_COLOR and terminal capabilities
// ============================================================================

import { styleText } from 'util'

type Style = Parameters<typeof styleText>[0]

/**
 * Style wrapper for cleaner API
 */
const style = (format: Style, text: string): string => styleText(format, text)

/**
 * Color and style functions
 */
export const c = {
  // Styles
  bold: (text: string) => style('bold', text),
  dim: (text: string) => style('dim', text),
  italic: (text: string) => style('italic', text),
  underline: (text: string) => style('underline', text),

  // Colors
  red: (text: string) => style('red', text),
  green: (text: string) => style('green', text),
  yellow: (text: string) => style('yellow', text),
  blue: (text: string) => style('blue', text),
  magenta: (text: string) => style('magenta', text),
  cyan: (text: string) => style('cyan', text),
  white: (text: string) => style('white', text),
  gray: (text: string) => style('gray', text),

  // Semantic
  success: (text: string) => style('green', text),
  error: (text: string) => style('red', text),
  warn: (text: string) => style('yellow', text),
  info: (text: string) => style('cyan', text),
  muted: (text: string) => style('dim', text),

  // Combined styles
  header: (text: string) => style(['bold', 'cyan'], text),
  highlight: (text: string) => style(['bold', 'yellow'], text),
  command: (text: string) => style(['bold', 'green'], text),
}

/**
 * Symbols for terminal output
 */
export const symbols = {
  tick: '✓',
  cross: '✗',
  warning: '⚠',
  info: 'ℹ',
  bullet: '•',
  arrow: '→',
  brain: '🧠',
  sparkles: '✨',
  rocket: '🚀',
  gear: '⚙️',
  folder: '📁',
  file: '📄',
  clock: '🕐',
}

/**
 * Box drawing for nice output
 */
export const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',

  /**
   * Draw a simple box around text
   */
  wrap: (text: string, padding = 1): string => {
    const lines = text.split('\n')
    const maxLen = Math.max(...lines.map(l => l.length))
    const pad = ' '.repeat(padding)
    const innerWidth = maxLen + padding * 2

    const top = box.topLeft + box.horizontal.repeat(innerWidth) + box.topRight
    const bottom = box.bottomLeft + box.horizontal.repeat(innerWidth) + box.bottomRight

    const middle = lines.map(line => {
      const rightPad = ' '.repeat(maxLen - line.length)
      return box.vertical + pad + line + rightPad + pad + box.vertical
    }).join('\n')

    return `${top}\n${middle}\n${bottom}`
  }
}

/**
 * Format helpers
 */
export const fmt = {
  /**
   * Format a key-value pair
   */
  kv: (key: string, value: string | number): string => {
    return `${c.muted(key + ':')} ${value}`
  },

  /**
   * Format a header line
   */
  header: (text: string): string => {
    return c.header(`\n${symbols.brain} ${text}\n`)
  },

  /**
   * Format a section
   */
  section: (title: string): string => {
    return `\n${c.bold(title)}\n${c.muted('─'.repeat(title.length))}`
  },

  /**
   * Format a list item
   */
  item: (text: string, indent = 0): string => {
    return ' '.repeat(indent) + `${c.muted(symbols.bullet)} ${text}`
  },

  /**
   * Format a command example
   */
  cmd: (command: string): string => {
    return `  ${c.muted('$')} ${c.command(command)}`
  },

  /**
   * Format bytes to human readable
   */
  bytes: (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024
      i++
    }
    return `${bytes.toFixed(1)} ${units[i]}`
  },

  /**
   * Format duration
   */
  duration: (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  },

  /**
   * Format relative time
   */
  relativeTime: (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }
}
