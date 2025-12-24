#!/usr/bin/env bun
// ============================================================================
// CURATION HOOK - Trigger memory curation
// Hook: PreCompact (auto|manual)
//
// Triggers memory curation when context is about to be compacted.
// This ensures memories are captured before context is lost.
// ============================================================================

import { styleText } from 'util'

// Configuration
const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'

// Styled output helpers (for stderr feedback)
const info = (text: string) => styleText('cyan', text)
const success = (text: string) => styleText('green', text)
const warn = (text: string) => styleText('yellow', text)

/**
 * Get project ID from working directory
 */
function getProjectId(cwd: string): string {
  return cwd.split('/').pop() || 'default'
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
    const trigger = input.trigger || 'pre_compact'
    const hookEvent = input.hook_event_name || 'PreCompact'

    const projectId = getProjectId(cwd)

    console.error(info(`🧠 Curating memories (${hookEvent})...`))

    // Fire and forget - trigger curation
    // The server handles the actual curation asynchronously
    const response = await fetch(`${MEMORY_API_URL}/memory/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        project_id: projectId,
        claude_session_id: sessionId,
        trigger: trigger === 'pre_compact' || trigger === 'manual' ? 'pre_compact' : 'session_end',
        cwd,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (response?.ok) {
      console.error(success('✨ Memory curation started'))
    } else {
      console.error(warn('⚠️ Memory server not available'))
    }

  } catch (error: any) {
    console.error(warn(`⚠️ Hook error: ${error.message}`))
  }
}

main()
