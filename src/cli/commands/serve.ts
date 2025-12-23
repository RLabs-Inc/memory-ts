// ============================================================================
// SERVE COMMAND - Start the memory server
// ============================================================================

import { c, symbols, fmt, box } from '../colors.ts'
import { createServer } from '../../server/index.ts'

interface ServeOptions {
  port?: string
  verbose?: boolean
  quiet?: boolean
}

export async function serve(options: ServeOptions) {
  const port = parseInt(options.port || process.env.MEMORY_PORT || '8765')
  const host = process.env.MEMORY_HOST || 'localhost'
  const storageMode = (process.env.MEMORY_STORAGE_MODE || 'central') as 'central' | 'local'
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!options.quiet) {
    console.log()
    console.log(c.header(`${symbols.brain} Memory Server`))
    console.log()
  }

  try {
    const { server } = createServer({
      port,
      host,
      storageMode,
      curator: { apiKey },
    })

    if (!options.quiet) {
      const url = `http://${host}:${port}`

      console.log(`  ${c.success(symbols.tick)} Server running at ${c.cyan(url)}`)
      console.log()
      console.log(`  ${fmt.kv('Storage', storageMode)}`)
      console.log(`  ${fmt.kv('Curation', apiKey ? c.success('enabled') : c.warn('disabled'))}`)
      console.log()
      console.log(c.muted(`  Press Ctrl+C to stop`))
      console.log()

      if (options.verbose) {
        console.log(c.muted('─'.repeat(50)))
        console.log()
      }
    }

    // Keep process alive
    process.on('SIGINT', () => {
      if (!options.quiet) {
        console.log()
        console.log(`  ${symbols.info} Shutting down...`)
      }
      server.stop()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      server.stop()
      process.exit(0)
    })

  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      console.error(c.error(`${symbols.cross} Port ${port} is already in use`))
      console.log(c.muted(`  Try a different port with --port <number>`))
      console.log(c.muted(`  Or check if another memory server is running`))
    } else {
      console.error(c.error(`${symbols.cross} Failed to start server: ${error.message}`))
    }
    process.exit(1)
  }
}
