// ============================================================================
// INGEST COMMAND - Batch ingest historical sessions into memory system
// Uses session parser + SDK curator to extract memories from past sessions
// ============================================================================

import { logger } from '../../utils/logger.ts'
import { styleText } from 'util'
import {
  findAllSessions,
  findProjectSessions,
  parseSessionFileWithSegments,
  getSessionSummary,
  calculateStats,
  type ParsedProject,
} from '../../core/session-parser.ts'
import { Curator } from '../../core/curator.ts'
import { MemoryStore } from '../../core/store.ts'
import { homedir } from 'os'
import { join } from 'path'

type Style = Parameters<typeof styleText>[0]
const style = (format: Style, text: string): string => styleText(format, text)

interface IngestOptions {
  project?: string
  all?: boolean
  dryRun?: boolean
  verbose?: boolean
  limit?: number
  maxTokens?: number
}

export async function ingest(options: IngestOptions) {
  logger.setVerbose(options.verbose ?? false)

  // Header
  console.log()
  console.log(style(['bold', 'magenta'], '┌──────────────────────────────────────────────────────────┐'))
  console.log(style(['bold', 'magenta'], '│') + style('bold', '  🧠 MEMORY INGESTION                                      ') + style(['bold', 'magenta'], '│'))
  console.log(style(['bold', 'magenta'], '└──────────────────────────────────────────────────────────┘'))
  console.log()

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && !options.dryRun) {
    logger.error('ANTHROPIC_API_KEY not set')
    console.log()
    console.log(style('dim', '   Set your API key to use SDK curation:'))
    console.log(style('dim', '   export ANTHROPIC_API_KEY=sk-...'))
    console.log()
    console.log(style('dim', '   Or use --dry-run to see what would be ingested'))
    console.log()
    process.exit(1)
  }

  const projectsFolder = join(homedir(), '.claude', 'projects')
  const maxTokens = options.maxTokens ?? 150000

  // Find sessions to ingest
  let projects: ParsedProject[] = []

  if (options.project) {
    // Find specific project
    const projectPath = join(projectsFolder, options.project)
    const sessions = await findProjectSessions(projectPath, { limit: options.limit })

    if (sessions.length === 0) {
      logger.error(`No sessions found for project: ${options.project}`)
      console.log()
      process.exit(1)
    }

    projects = [{
      folderId: options.project,
      name: sessions[0]?.projectName ?? options.project,
      path: projectPath,
      sessions
    }]
  } else if (options.all) {
    // Find all projects
    projects = await findAllSessions(projectsFolder, { limit: options.limit })

    if (projects.length === 0) {
      logger.error(`No sessions found in ${projectsFolder}`)
      console.log()
      process.exit(1)
    }
  } else {
    logger.error('Specify --project <name> or --all')
    console.log()
    console.log(style('dim', '   Examples:'))
    console.log(style('dim', '     memory ingest --project my-project'))
    console.log(style('dim', '     memory ingest --all'))
    console.log(style('dim', '     memory ingest --all --dry-run'))
    console.log()
    process.exit(1)
  }

  // Calculate stats
  const stats = calculateStats(projects)

  logger.info('Discovery complete')
  console.log(`      ${style('dim', 'projects:')} ${stats.totalProjects}`)
  console.log(`      ${style('dim', 'sessions:')} ${stats.totalSessions}`)
  console.log(`      ${style('dim', 'messages:')} ${stats.totalMessages}`)
  console.log(`      ${style('dim', 'tool uses:')} ${stats.totalToolUses}`)
  if (stats.oldestSession) {
    console.log(`      ${style('dim', 'range:')} ${stats.oldestSession.slice(0, 10)} → ${stats.newestSession?.slice(0, 10) ?? 'now'}`)
  }
  console.log()

  if (options.dryRun) {
    logger.info('Dry run - sessions to ingest:')
    console.log()

    for (const project of projects) {
      console.log(`   ${style('cyan', '📁')} ${style('bold', project.name)} ${style('dim', `(${project.sessions.length} sessions)`)}`)

      for (const session of project.sessions.slice(0, 5)) {
        const summary = getSessionSummary(session)
        const truncated = summary.length > 55 ? summary.slice(0, 52) + '...' : summary
        const tokens = session.metadata.estimatedTokens
        const segments = Math.ceil(tokens / maxTokens)

        console.log(`      ${style('dim', '•')} ${session.id.slice(0, 8)}... ${style('dim', `(${tokens} tok, ${segments} seg)`)}`)
        console.log(`        ${style('dim', truncated)}`)
      }

      if (project.sessions.length > 5) {
        console.log(`      ${style('dim', `... and ${project.sessions.length - 5} more`)}`)
      }
      console.log()
    }

    logger.success('Dry run complete. Remove --dry-run to ingest.')
    console.log()
    return
  }

  // Initialize curator and store
  const curator = new Curator({ apiKey })
  const store = new MemoryStore()

  logger.divider()
  logger.info('Starting ingestion...')
  console.log()

  let totalSegments = 0
  let totalMemories = 0
  let failedSegments = 0

  for (const project of projects) {
    console.log(`   ${style('cyan', '📁')} ${style('bold', project.name)}`)

    for (const session of project.sessions) {
      const summary = getSessionSummary(session)
      const truncated = summary.length > 45 ? summary.slice(0, 42) + '...' : summary

      if (options.verbose) {
        console.log(`      ${style('dim', '•')} ${session.id.slice(0, 8)}... "${truncated}"`)
      }

      // Parse into segments
      const segments = await parseSessionFileWithSegments(session.filepath, maxTokens)
      totalSegments += segments.length

      for (const segment of segments) {
        try {
          if (options.verbose) {
            console.log(`        ${style('dim', `→ Segment ${segment.segmentIndex + 1}/${segment.totalSegments} (${segment.estimatedTokens} tokens)`)}`)
          }

          // Curate the segment
          const result = await curator.curateFromSegment(segment, 'historical')

          // Store memories
          for (const memory of result.memories) {
            await store.storeMemory(project.folderId, session.id, memory)
            totalMemories++
          }

          if (options.verbose && result.memories.length > 0) {
            console.log(`        ${style('green', '✓')} Extracted ${result.memories.length} memories`)
          }
        } catch (error: any) {
          failedSegments++
          if (options.verbose) {
            console.log(`        ${style('red', '✗')} Failed: ${error.message}`)
          }
        }
      }
    }

    console.log()
  }

  // Summary
  logger.divider()
  console.log()
  logger.info('Ingestion complete')
  console.log(`      ${style('dim', 'segments:')} ${totalSegments}`)
  console.log(`      ${style('dim', 'memories:')} ${style('green', String(totalMemories))}`)
  if (failedSegments > 0) {
    console.log(`      ${style('dim', 'failed:')} ${style('yellow', String(failedSegments))}`)
  }
  console.log()

  if (totalMemories > 0) {
    logger.success(`Extracted ${totalMemories} memories from ${totalSegments} segments`)
  } else {
    logger.warn('No memories extracted. Try --verbose to see details.')
  }
  console.log()
}
