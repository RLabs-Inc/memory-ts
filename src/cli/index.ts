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
  ${c.command('ingest')}     Ingest historical sessions into memory ${c.muted('(--session, --project, or --all)')}
  ${c.command('migrate')}    Upgrade memories to latest schema version
  ${c.command('doctor')}     Check system health
  ${c.command('help')}       Show this help message

${c.bold('Options:')}
  ${c.cyan('-p, --port')} <port>    Server port ${c.muted('(default: 8765)')}
  ${c.cyan('-v, --verbose')}        Verbose output
  ${c.cyan('-q, --quiet')}          Minimal output
  ${c.cyan('--dry-run')}            Preview changes without applying ${c.muted('(migrate, ingest)')}
  ${c.cyan('--embeddings')}         Regenerate embeddings for memories ${c.muted('(migrate)')}
  ${c.cyan('--session')} <id>       Ingest a specific session by ID ${c.muted('(ingest)')}
  ${c.cyan('--claude')}             Install hooks for Claude Code
  ${c.cyan('--gemini')}             Install hooks for Gemini CLI
  ${c.cyan('--version')}            Show version

${c.bold('Examples:')}
${fmt.cmd('memory')}                    ${c.muted('# Start server on default port')}
${fmt.cmd('memory serve --port 9000')}  ${c.muted('# Start on custom port')}
${fmt.cmd('memory stats')}              ${c.muted('# Show memory statistics')}
${fmt.cmd('memory install')}            ${c.muted('# Install Claude Code hooks (default)')}
${fmt.cmd('memory install --gemini')}   ${c.muted('# Install Gemini CLI hooks')}
${fmt.cmd('memory ingest --session abc123')}  ${c.muted('# Ingest a specific session')}
${fmt.cmd('memory ingest --project foo')}  ${c.muted('# Ingest all sessions from a project')}
${fmt.cmd('memory ingest --all --dry-run')}  ${c.muted('# Preview all sessions to ingest')}
${fmt.cmd('memory migrate --analyze')}   ${c.muted('# Analyze fragmentation before migrating')}
${fmt.cmd('memory migrate --dry-run')}  ${c.muted('# Preview migration without changes')}
${fmt.cmd('memory migrate')}            ${c.muted('# Upgrade memories to v3 schema')}
${fmt.cmd('memory migrate --generate-mapping map.json')}  ${c.muted('# Create custom mapping file')}
${fmt.cmd('memory migrate --mapping map.json')}  ${c.muted('# Use custom type mappings')}

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
      'dry-run': { type: 'boolean', default: false },
      embeddings: { type: 'boolean', default: false },  // Regenerate embeddings in migrate
      path: { type: 'string' },  // Custom path for migrate
      analyze: { type: 'boolean', default: false },  // Analyze migration
      'generate-mapping': { type: 'string' },  // Generate custom mapping file
      mapping: { type: 'string' },  // Use custom mapping file
      session: { type: 'string' },  // Session ID to ingest
      project: { type: 'string' },  // Project to ingest
      all: { type: 'boolean', default: false },  // Ingest all projects
      limit: { type: 'string' },  // Limit sessions per project
      'max-tokens': { type: 'string' },  // Max tokens per segment
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

    case 'migrate':
    case 'upgrade': {
      const { migrate } = await import('./commands/migrate.ts')
      await migrate({
        dryRun: values['dry-run'],
        verbose: values.verbose,
        path: values.path,
        embeddings: values.embeddings,
        analyze: values.analyze,
        generateMapping: values['generate-mapping'],
        mapping: values.mapping,
      })
      break
    }

    case 'ingest': {
      const { ingest } = await import('./commands/ingest.ts')
      await ingest({
        session: values.session,
        project: values.project,
        all: values.all,
        dryRun: values['dry-run'],
        verbose: values.verbose,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        maxTokens: values['max-tokens'] ? parseInt(values['max-tokens'], 10) : undefined,
      })
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
