// ============================================================================
// STATS COMMAND - Show memory statistics
// ============================================================================

import { c, symbols, fmt } from '../colors.ts'

interface StatsOptions {
  project?: string
  verbose?: boolean
}

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'

export async function stats(options: StatsOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory Statistics`))
  console.log()

  try {
    // Check if server is running
    const healthResponse = await fetch(`${MEMORY_API_URL}/health`).catch(() => null)

    if (!healthResponse?.ok) {
      console.log(`  ${c.error(symbols.cross)} Memory server is not running`)
      console.log()
      console.log(c.muted(`  Start it with: memory serve`))
      console.log()
      process.exit(1)
    }

    const health = await healthResponse.json()
    console.log(`  ${c.success(symbols.tick)} Server: ${c.cyan(MEMORY_API_URL)}`)
    console.log(`  ${fmt.kv('Engine', health.engine || 'unknown')}`)
    console.log()

    // Get project stats if project specified
    if (options.project) {
      const statsUrl = `${MEMORY_API_URL}/memory/stats?project_id=${encodeURIComponent(options.project)}`
      const statsResponse = await fetch(statsUrl)

      if (statsResponse.ok) {
        const projectStats = await statsResponse.json()
        console.log(fmt.section(`Project: ${options.project}`))
        console.log()
        console.log(`  ${fmt.kv('Total Memories', projectStats.totalMemories || 0)}`)
        console.log(`  ${fmt.kv('Total Sessions', projectStats.totalSessions || 0)}`)
        console.log(`  ${fmt.kv('Stale Memories', projectStats.staleMemories || 0)}`)
        if (projectStats.latestSession) {
          console.log(`  ${fmt.kv('Latest Session', projectStats.latestSession.slice(0, 8) + '...')}`)
        }
      } else {
        console.log(c.warn(`  ${symbols.warning} Could not fetch stats for project: ${options.project}`))
      }
    } else {
      console.log(c.muted(`  Use --project <name> to see project-specific stats`))
    }

    console.log()

  } catch (error: any) {
    console.error(c.error(`${symbols.cross} Error: ${error.message}`))
    process.exit(1)
  }
}
