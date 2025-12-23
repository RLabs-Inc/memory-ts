// ============================================================================
// MEMORY SERVER - HTTP API compatible with Python hooks
// Drop-in replacement for the FastAPI server
// ============================================================================

import { MemoryEngine, createEngine, type EngineConfig } from '../core/engine.ts'
import { Curator, createCurator, type CuratorConfig } from '../core/curator.ts'
import type { CurationTrigger } from '../types/memory.ts'
import { logger } from '../utils/logger.ts'

/**
 * Server configuration
 */
export interface ServerConfig extends EngineConfig {
  port?: number
  host?: string
  curator?: CuratorConfig
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
export function createServer(config: ServerConfig = {}) {
  const {
    port = 8765,
    host = 'localhost',
    curator: curatorConfig,
    ...engineConfig
  } = config

  const engine = createEngine(engineConfig)
  const curator = createCurator(curatorConfig)

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
              const result = await curator.curateWithCLI(
                body.claude_session_id,
                body.trigger,
                body.cwd
              )

              if (result.memories.length > 0) {
                await engine.storeCurationResult(
                  body.project_id,
                  body.session_id,
                  result,
                  body.project_path
                )

                logger.logCurationComplete(result.memories.length, result.session_summary)
                logger.logCuratedMemories(result.memories)
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
    stop: () => server.stop(),
  }
}

// CLI entry point
if (import.meta.main) {
  const port = parseInt(process.env.MEMORY_PORT ?? '8765')
  const host = process.env.MEMORY_HOST ?? 'localhost'
  const storageMode = (process.env.MEMORY_STORAGE_MODE ?? 'central') as 'central' | 'local'
  const apiKey = process.env.ANTHROPIC_API_KEY

  createServer({
    port,
    host,
    storageMode,
    curator: { apiKey },
  })
}
