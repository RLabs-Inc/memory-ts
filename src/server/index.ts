// ============================================================================
// MEMORY SERVER - HTTP API compatible with Python hooks
// Drop-in replacement for the FastAPI server
// ============================================================================

import { MemoryEngine, createEngine, type EngineConfig } from '../core/engine.ts'
import { Curator, createCurator, type CuratorConfig } from '../core/curator.ts'
import { EmbeddingGenerator, createEmbeddings } from '../core/embeddings.ts'
import { Manager, createManager, type ManagerConfig } from '../core/manager.ts'
import type { CurationTrigger } from '../types/memory.ts'
import { logger } from '../utils/logger.ts'

/**
 * Server configuration
 */
export interface ServerConfig extends EngineConfig {
  port?: number
  host?: string
  curator?: CuratorConfig
  manager?: ManagerConfig

  /**
   * Enable the management agent (convenience shortcut)
   * When false, memories are stored but not organized/linked asynchronously
   * Default: true
   */
  managerEnabled?: boolean

  /**
   * Enable personal memories extraction and storage (convenience shortcut)
   * When false, personal/relationship memories are not extracted or surfaced
   * Default: true
   */
  personalMemoriesEnabled?: boolean
}

/**
 * Request types matching Python API
 */
interface ContextRequest {
  session_id: string
  project_id: string
  current_message?: string
  max_memories?: number
  project_path?: string
}

interface ProcessRequest {
  session_id: string
  project_id: string
  user_message?: string
  claude_response?: string
  project_path?: string
}

interface CheckpointRequest {
  session_id: string
  project_id: string
  claude_session_id: string
  trigger: CurationTrigger
  cwd?: string
  cli_type?: 'claude-code' | 'gemini-cli'
  project_path?: string
}

/**
 * Create and start the memory server
 */
export async function createServer(config: ServerConfig = {}) {
  const {
    port = 8765,
    host = 'localhost',
    curator: curatorConfig,
    manager: managerConfig,
    managerEnabled,
    personalMemoriesEnabled,
    ...engineConfig
  } = config

  // Initialize embeddings (loads model into memory)
  const embeddings = createEmbeddings()
  logger.info('Initializing embedding model (this may take a moment on first run)...')
  await embeddings.initialize()

  // Merge top-level convenience options with nested configs
  const finalCuratorConfig: CuratorConfig = {
    ...curatorConfig,
    // Top-level option overrides nested if set
    personalMemoriesEnabled: personalMemoriesEnabled ?? curatorConfig?.personalMemoriesEnabled,
  }

  const finalManagerConfig: ManagerConfig = {
    ...managerConfig,
    // Top-level option overrides nested if set
    enabled: managerEnabled ?? managerConfig?.enabled,
  }

  // Create engine with embedder and personalMemoriesEnabled flag
  const engine = createEngine({
    ...engineConfig,
    embedder: embeddings.createEmbedder(),
    personalMemoriesEnabled: finalCuratorConfig.personalMemoriesEnabled,
  })
  const curator = createCurator(finalCuratorConfig)
  const manager = createManager(finalManagerConfig)

  const server = Bun.serve({
    port,
    hostname: host,

    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname

      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
      }

      try {
        // Health check
        if (path === '/health' && req.method === 'GET') {
          return Response.json({ status: 'healthy', engine: 'typescript' }, { headers: corsHeaders })
        }

        // Get memory context for a message
        if (path === '/memory/context' && req.method === 'POST') {
          const body = await req.json() as ContextRequest

          logger.request('POST', '/memory/context', body.project_id)

          const result = await engine.getContext({
            sessionId: body.session_id,
            projectId: body.project_id,
            currentMessage: body.current_message ?? '',
            maxMemories: body.max_memories,
            projectPath: body.project_path,
          })

          // Log what happened
          if (result.primer) {
            logger.primer(`Session primer for ${body.project_id}`)
          } else if (result.memories.length > 0) {
            logger.logRetrievedMemories(
              result.memories.map(m => ({
                content: m.content,
                score: m.score,
                context_type: m.context_type,
              })),
              body.current_message ?? ''
            )
          }

          return Response.json({
            success: true,
            session_id: body.session_id,
            message_count: 0,
            context_text: result.formatted,
            has_memories: result.memories.length > 0,
            curator_enabled: true,
            memories_count: result.memories.length,
            has_primer: !!result.primer,
          }, { headers: corsHeaders })
        }

        // Process/track a message exchange
        if (path === '/memory/process' && req.method === 'POST') {
          const body = await req.json() as ProcessRequest

          const messageCount = await engine.trackMessage(
            body.project_id,
            body.session_id,
            body.project_path
          )

          logger.session(`Message #${messageCount} tracked [${body.project_id}]`)

          return Response.json({
            success: true,
            message_count: messageCount,
          }, { headers: corsHeaders })
        }

        // Checkpoint - trigger curation
        if (path === '/memory/checkpoint' && req.method === 'POST') {
          const body = await req.json() as CheckpointRequest

          logger.logCurationStart(body.claude_session_id, body.trigger)

          // Fire and forget - don't block the response
          setImmediate(async () => {
            try {
              // Try session resume first (v2) - gets full context including tool uses
              // Falls back to transcript parsing if resume fails
              let result = await curator.curateWithSessionResume(
                body.claude_session_id,
                body.trigger
              )

              // Fallback to transcript-based curation if resume returned nothing
              if (result.memories.length === 0) {
                logger.debug('Session resume returned no memories, falling back to transcript parsing', 'server')
                result = await curator.curateFromSessionFile(
                  body.claude_session_id,
                  body.trigger,
                  body.cwd
                )
              }

              if (result.memories.length > 0) {
                await engine.storeCurationResult(
                  body.project_id,
                  body.session_id,
                  result,
                  body.project_path
                )

                logger.logCurationComplete(result.memories.length, result.session_summary)
                logger.logCuratedMemories(result.memories)

                // Fire and forget - spawn management agent to update/organize memories
                const sessionNumber = await engine.getSessionNumber(body.project_id, body.project_path)
                // Get resolved storage paths from engine config (runtime values, not hardcoded)
                const storagePaths = engine.getStoragePaths(body.project_id, body.project_path)

                setImmediate(async () => {
                  try {
                    logger.logManagementStart(result.memories.length)
                    const startTime = Date.now()

                    // Use SDK mode - more reliable than CLI which can go off-rails
                    const managementResult = await manager.manageWithSDK(
                      body.project_id,
                      sessionNumber,
                      result,
                      storagePaths
                    )

                    logger.logManagementComplete({
                      success: managementResult.success,
                      superseded: managementResult.superseded || undefined,
                      resolved: managementResult.resolved || undefined,
                      linked: managementResult.linked || undefined,
                      filesRead: managementResult.filesRead || undefined,
                      filesWritten: managementResult.filesWritten || undefined,
                      primerUpdated: managementResult.primerUpdated,
                      actions: managementResult.actions,
                      fullReport: managementResult.fullReport,
                      error: managementResult.error,
                    })

                    // Store management log with full action history (no truncation)
                    await engine.storeManagementLog({
                      projectId: body.project_id,
                      sessionNumber,
                      memoriesProcessed: result.memories.length,
                      supersededCount: managementResult.superseded,
                      resolvedCount: managementResult.resolved,
                      linkedCount: managementResult.linked,
                      primerUpdated: managementResult.primerUpdated,
                      success: managementResult.success,
                      durationMs: Date.now() - startTime,
                      summary: managementResult.summary,
                      fullReport: managementResult.fullReport,
                      error: managementResult.error,
                      details: {
                        actions: managementResult.actions,
                        filesRead: managementResult.filesRead,
                        filesWritten: managementResult.filesWritten,
                      },
                    })
                  } catch (error) {
                    logger.error(`Management failed: ${error}`)
                  }
                })
              } else {
                logger.logCurationComplete(0)
              }
            } catch (error) {
              logger.error(`Curation failed: ${error}`)
            }
          })

          return Response.json({
            success: true,
            message: 'Curation triggered',
          }, { headers: corsHeaders })
        }

        // Get stats
        if (path === '/memory/stats' && req.method === 'GET') {
          const projectId = url.searchParams.get('project_id') ?? 'default'
          const projectPath = url.searchParams.get('project_path') ?? undefined

          const stats = await engine.getStats(projectId, projectPath)

          return Response.json({
            success: true,
            ...stats,
          }, { headers: corsHeaders })
        }

        // Expand memories by ID - returns full content for specific memories
        if (path === '/memory/expand' && req.method === 'GET') {
          const idsParam = url.searchParams.get('ids') ?? ''
          const projectId = url.searchParams.get('project_id') ?? 'default'
          const projectPath = url.searchParams.get('project_path') ?? undefined

          if (!idsParam) {
            return Response.json({
              success: false,
              error: 'Missing ids parameter. Usage: /memory/expand?ids=abc123,def456',
            }, { status: 400, headers: corsHeaders })
          }

          // Parse comma-separated short IDs
          const shortIds = idsParam.split(',').map(id => id.trim()).filter(Boolean)

          // Get all memories and filter by short ID suffix
          const allMemories = await engine.getAllMemories(projectId, projectPath)
          const expanded: Record<string, { headline?: string; content: string; context_type: string }> = {}

          for (const memory of allMemories) {
            const shortId = memory.id.slice(-6)
            if (shortIds.includes(shortId)) {
              expanded[shortId] = {
                headline: memory.headline,
                content: memory.content,
                context_type: memory.context_type || 'technical',
              }
            }
          }

          // Format as readable text for CLI output
          const lines: string[] = ['## Expanded Memories\n']
          for (const shortId of shortIds) {
            const mem = expanded[shortId]
            if (mem) {
              lines.push(`### #${shortId} (${mem.context_type})`)
              if (mem.headline) {
                lines.push(`**${mem.headline}**\n`)
              }
              lines.push(mem.content)
              lines.push('')
            } else {
              lines.push(`### #${shortId}`)
              lines.push(`Memory not found`)
              lines.push('')
            }
          }

          return new Response(lines.join('\n'), {
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
          })
        }

        // 404
        return Response.json(
          { error: 'Not found', path },
          { status: 404, headers: corsHeaders }
        )
      } catch (error) {
        logger.error(`Server error: ${error}`)
        return Response.json(
          { error: String(error) },
          { status: 500, headers: corsHeaders }
        )
      }
    },
  })

  logger.startup(port, host, engineConfig.storageMode ?? 'central')

  return {
    server,
    engine,
    curator,
    manager,
    embeddings,
    stop: () => server.stop(),
  }
}

// CLI entry point
if (import.meta.main) {
  const port = parseInt(process.env.MEMORY_PORT ?? '8765')
  const host = process.env.MEMORY_HOST ?? 'localhost'
  const storageMode = (process.env.MEMORY_STORAGE_MODE ?? 'central') as 'central' | 'local'
  const apiKey = process.env.ANTHROPIC_API_KEY

  // Feature toggles (default: enabled)
  // Set to '0' or 'false' to disable
  const managerEnabled = !['0', 'false'].includes(process.env.MEMORY_MANAGER_ENABLED?.toLowerCase() ?? '')
  const personalMemoriesEnabled = !['0', 'false'].includes(process.env.MEMORY_PERSONAL_ENABLED?.toLowerCase() ?? '')

  // Wrap in async IIFE for CJS compatibility
  void (async () => {
    await createServer({
      port,
      host,
      storageMode,
      managerEnabled,
      personalMemoriesEnabled,
      curator: { apiKey },
    })
  })()
}
