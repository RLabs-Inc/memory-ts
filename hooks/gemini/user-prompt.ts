#!/usr/bin/env bun
// ============================================================================
// GEMINI BEFORE AGENT HOOK
// Hook: BeforeAgent (equivalent to Claude's UserPromptSubmit)
//
// Intercepts user prompts to inject relevant memories.
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

    const sessionId = input.session_id || process.env.GEMINI_SESSION_ID || 'unknown'
    const prompt = input.prompt || '' // Gemini passes 'prompt' in BeforeAgent
    const cwd = input.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd()
    const projectId = getProjectId(cwd)

    const result = await httpPost(`${MEMORY_API_URL}/memory/context`, {
      session_id: sessionId,
      project_id: projectId,
      current_message: prompt,
      max_memories: 5,
    })

    await httpPost(`${MEMORY_API_URL}/memory/process`, {
      session_id: sessionId,
      project_id: projectId,
      metadata: { platform: 'gemini' }
    })

    const context = result.context_text || ''
    
    if (context) {
      // Gemini requires structured JSON output
      console.log(JSON.stringify({
        decision: "allow",
        hookSpecificOutput: {
          hookEventName: "BeforeAgent",
          additionalContext: context
        }
      }))
    } else {
      // Must always output valid JSON or nothing? 
      // Safest to output "allow" if no context
      console.log(JSON.stringify({ decision: "allow" }))
    }
  } catch {
    // Fail safe
    console.log(JSON.stringify({ decision: "allow" }))
  }
}

main()