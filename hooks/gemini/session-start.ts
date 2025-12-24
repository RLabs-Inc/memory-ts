#!/usr/bin/env bun
// ============================================================================
// GEMINI SESSION START HOOK
// Hook: SessionStart
//
// Injects session primer when a new Gemini session begins.
// ============================================================================

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'
const TIMEOUT_MS = 5000

function getProjectId(cwd: string): string {
  return cwd.split('/').pop() || 'default'
}

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

async function main() {
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    const inputText = await Bun.stdin.text()
    const input = inputText ? JSON.parse(inputText) : {}

    // Gemini provides session_id in the common input fields
    const sessionId = input.session_id || process.env.GEMINI_SESSION_ID || 'unknown'
    const cwd = input.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd()
    const projectId = getProjectId(cwd)

    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: '',
      max_memories: 0,
    })

    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
      metadata: { event: 'session_start', platform: 'gemini' },
    })

    const primer = result.context_text || ''
    
    if (primer) {
      // Gemini expects a structured JSON response for context injection
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: primer
        }
      }))
    }
  } catch (e) {
    // Fail silently, but ensure we don't output invalid JSON if we crashed mid-stream
    process.exit(0)
  }
}

main()