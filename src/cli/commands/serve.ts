// ============================================================================
// SERVE COMMAND - Start the memory server
// ============================================================================

import { join } from 'path'
import { homedir } from 'os'
import { Glob } from 'bun'
import { c, symbols, fmt, box } from '../colors.ts'
import { createServer } from '../../server/index.ts'
import { MEMORY_SCHEMA_VERSION } from '../../types/schema.ts'
import { logger } from '../../utils/logger.ts'

interface ServeOptions {
  port?: string
  verbose?: boolean
  quiet?: boolean
}

/**
 * Quick check for v1 memories that need migration
 * Samples a few files to avoid slow startup
 */
async function checkSchemaVersions(): Promise<{ v1Count: number; checked: number }> {
  const storageMode = process.env.MEMORY_STORAGE_MODE ?? 'central'
  const centralPath = process.env.MEMORY_CENTRAL_PATH ?? join(homedir(), '.local', 'share', 'memory')

  let v1Count = 0
  let checked = 0
  const maxSamples = 20 // Check up to 20 files for speed

  // Determine paths to check
  const pathsToCheck: string[] = []

  // Always check global
  pathsToCheck.push(join(centralPath, 'global', 'memories'))

  if (storageMode === 'local') {
    // Check local project memories
    pathsToCheck.push(join(process.cwd(), '.memory', 'memories'))
  } else {
    // Check central storage - find project directories
    try {
      const projectGlob = new Glob('*/memories')
      for await (const match of projectGlob.scan({ cwd: centralPath, onlyFiles: false })) {
        if (!match.startsWith('global/')) {
          pathsToCheck.push(join(centralPath, match))
        }
        if (pathsToCheck.length >= 10) break // Limit project scans
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  // Check files in each path
  for (const memoryPath of pathsToCheck) {
    if (checked >= maxSamples) break

    try {
      const glob = new Glob('*.md')
      for await (const file of glob.scan({ cwd: memoryPath })) {
        if (checked >= maxSamples) break

        const filePath = join(memoryPath, file)
        const content = await Bun.file(filePath).text()

        // Quick check for schema_version in frontmatter
        const match = content.match(/^---\n[\s\S]*?\n---/)
        if (match) {
          const frontmatter = match[0]
          const versionMatch = frontmatter.match(/schema_version:\s*(\d+)/)

          if (!versionMatch || parseInt(versionMatch[1]) < MEMORY_SCHEMA_VERSION) {
            v1Count++
          }
        }
        checked++
      }
    } catch {
      // Directory doesn't exist or can't read
    }
  }

  return { v1Count, checked }
}

export async function serve(options: ServeOptions) {
  const port = parseInt(options.port || process.env.MEMORY_PORT || '8765')
  const host = process.env.MEMORY_HOST || 'localhost'
  const storageMode = (process.env.MEMORY_STORAGE_MODE || 'central') as
    | 'central'
    | 'local'
  const apiKey = process.env.ANTHROPIC_API_KEY

  // Set verbose mode for logger
  if (options.verbose) {
    logger.setVerbose(true)
  }

  if (!options.quiet) {
    console.log()
    console.log(c.header(`${symbols.brain} Memory Server`))
    console.log()
  }

  try {
    const { server, embeddings } = await createServer({
      port,
      host,
      storageMode,
      curator: { apiKey },
    })

    if (!options.quiet) {
      const url = `http://${host}:${port}`

      console.log(
        `  ${c.success(symbols.tick)} Server running at ${c.cyan(url)}`
      )
      console.log()
      console.log(`  ${fmt.kv('Storage', storageMode)}`)
      console.log(
        `  ${fmt.kv(
          'Embeddings',
          embeddings.isReady ? c.success('loaded') : c.warn('not loaded')
        )}`
      )

      // Check for v1 memories that need migration
      const { v1Count, checked } = await checkSchemaVersions()
      if (v1Count > 0) {
        console.log()
        console.log(c.warn(`  ${symbols.warning} Found ${v1Count}/${checked} memories using old schema (v1)`))
        console.log(c.muted(`    Run 'memory migrate' to upgrade to v${MEMORY_SCHEMA_VERSION}`))
        console.log(c.muted(`    Use 'memory migrate --dry-run' to preview changes first`))
      }

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
      console.error(
        c.error(`${symbols.cross} Failed to start server: ${error.message}`)
      )
    }
    process.exit(1)
  }
}
