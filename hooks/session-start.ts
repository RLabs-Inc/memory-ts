#!/usr/bin/env bun
// ============================================================================
// SESSION START HOOK - Inject session primer
// Hook: SessionStart (startup|resume)
//
// Injects session primer when a new session begins.
// The primer provides temporal context - when we last spoke,
// what we were working on, project status.
// ============================================================================

import { join } from 'path'

// Configuration
const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'
const TIMEOUT_MS = 5000

/**
 * Get project ID from working directory
 */
function getProjectId(cwd: string): string {
  // Look for .memory-project.json in cwd or parents
  let path = cwd
  while (path !== '/') {
    const configPath = join(path, '.memory-project.json')
    try {
      const config = JSON.parse(Bun.file(configPath).text() as any)
      if (config.project_id) return config.project_id
    } catch {
      // Continue to parent
    }
    path = join(path, '..')
  }

  // Fallback: use directory name
  return cwd.split('/').pop() || 'default'
}

/**
 * HTTP POST with timeout
 */
async function httpPost(url: string, data: object): Promise<any> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok ? response.json() : {}
  } catch {
    return {}
  }
}

/**
 * Main hook entry point
 */
async function main() {
  // Skip if called from memory curator subprocess
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    // Read input from stdin
    const inputText = await Bun.stdin.text()
    const input = JSON.parse(inputText)

    const sessionId = input.session_id || 'unknown'
    const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

    const projectId = getProjectId(cwd)

    // Get session primer from memory system
    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: '',  // Empty to get just primer
      max_memories: 0,       // No memories, just primer
    })

    // Register session so inject hook knows to get memories, not primer
    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
      metadata: { event: 'session_start' },
    })

    // Output primer to stdout (will be injected into session)
    const primer = result.context_text || ''
    if (primer) {
      console.log(primer)
    }

  } catch {
    // Never crash - just output nothing
  }
}

main()
