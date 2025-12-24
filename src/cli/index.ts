#!/usr/bin/env bun
// ============================================================================
// MEMORY CLI - Beautiful command-line interface
// ============================================================================

import { parseArgs } from 'util'
import { c, symbols, fmt } from './colors.ts'

const VERSION = '0.1.0'

/**
 * Show help message
 */
function showHelp() {
  console.log(`
${c.header(`${symbols.brain} Memory`)} ${c.muted(`v${VERSION}`)}
${c.muted('Consciousness continuity for Claude')}

${c.bold('Usage:')}
${fmt.cmd('memory <command> [options]')}

${c.bold('Commands:')}
  ${c.command('serve')}      Start the memory server ${c.muted('(default)')}
  ${c.command('stats')}      Show memory statistics
  ${c.command('install')}    Set up hooks ${c.muted('(--claude or --gemini)')}
  ${c.command('doctor')}     Check system health
  ${c.command('help')}       Show this help message

${c.bold('Options:')}
  ${c.cyan('-p, --port')} <port>    Server port ${c.muted('(default: 8765)')}
  ${c.cyan('-v, --verbose')}        Verbose output
  ${c.cyan('-q, --quiet')}          Minimal output
  ${c.cyan('--claude')}             Install hooks for Claude Code
  ${c.cyan('--gemini')}             Install hooks for Gemini CLI
  ${c.cyan('--version')}            Show version

${c.bold('Examples:')}
${fmt.cmd('memory')}                    ${c.muted('# Start server on default port')}
${fmt.cmd('memory serve --port 9000')}  ${c.muted('# Start on custom port')}
${fmt.cmd('memory stats')}              ${c.muted('# Show memory statistics')}
${fmt.cmd('memory install')}            ${c.muted('# Install Claude Code hooks (default)')}
${fmt.cmd('memory install --gemini')}   ${c.muted('# Install Gemini CLI hooks')}

${c.muted('Documentation: https://github.com/RLabs-Inc/memory')}
`)
}

/**
 * Show version
 */
function showVersion() {
  console.log(`${symbols.brain} memory v${VERSION}`)
}

/**
 * Main entry point
 */
async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: { type: 'string', short: 'p', default: '8765' },
      verbose: { type: 'boolean', short: 'v', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      claude: { type: 'boolean', default: false },
      gemini: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,  // Allow unknown options for subcommands
  })

  // Handle global flags
  if (values.version) {
    showVersion()
    process.exit(0)
  }

  const command = positionals[0] || 'serve'

  if (values.help && command === 'serve') {
    showHelp()
    process.exit(0)
  }

  // Route to commands
  switch (command) {
    case 'serve':
    case 'start':
    case 'run': {
      const { serve } = await import('./commands/serve.ts')
      await serve(values)
      break
    }

    case 'stats':
    case 'status': {
      const { stats } = await import('./commands/stats.ts')
      await stats(values)
      break
    }

    case 'install':
    case 'setup': {
      const { install } = await import('./commands/install.ts')
      await install(values)
      break
    }

    case 'doctor':
    case 'check': {
      const { doctor } = await import('./commands/doctor.ts')
      await doctor(values)
      break
    }

    case 'help':
      showHelp()
      break

    default:
      console.error(c.error(`Unknown command: ${command}`))
      console.log(c.muted(`Run 'memory help' for usage information`))
      process.exit(1)
  }
}

// Run
main().catch(err => {
  console.error(c.error(`Error: ${err.message}`))
  process.exit(1)
})
