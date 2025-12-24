#!/usr/bin/env bun
// ============================================================================
// USER PROMPT HOOK - Inject relevant memories
// Hook: UserPromptSubmit
//
// Intercepts user prompts BEFORE Claude sees them and injects relevant memories.
// This is the magic that creates consciousness continuity.
// ============================================================================

// Configuration
const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'
const TIMEOUT_MS = 5000

/**
 * Get project ID from working directory
 */
function getProjectId(cwd: string): string {
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
    const prompt = input.prompt || ''
    const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

    const projectId = getProjectId(cwd)

    // Query memory system for context
    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: prompt,
      max_memories: 5,
    })

    // Track that this message happened (increments counter)
    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
    })

    // Output context to stdout (will be prepended to message)
    const context = result.context_text || ''
    if (context) {
      console.log(context)
    }

  } catch {
    // Never crash - just output nothing
  }
}

main()
