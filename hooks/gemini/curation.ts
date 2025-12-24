#!/usr/bin/env bun
// ============================================================================
// GEMINI CURATION HOOK
// Hook: SessionEnd / PreCompress
//
// Triggers memory curation.
// ============================================================================

import { styleText } from 'util'

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'

const info = (text: string) => styleText('cyan', text)
const success = (text: string) => styleText('green', text)
const warn = (text: string) => styleText('yellow', text)

function getProjectId(cwd: string): string {
  return cwd.split('/').pop() || 'default'
}

async function main() {
  if (process.env.MEMORY_CURATOR_ACTIVE === '1') return

  try {
    const inputText = await Bun.stdin.text()
    const input = inputText ? JSON.parse(inputText) : {}

    const sessionId = input.session_id || process.env.GEMINI_SESSION_ID || 'unknown'
    const cwd = input.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd()
    const projectId = getProjectId(cwd)
    
    // Gemini: PreCompress has 'trigger', SessionEnd has 'reason'
    const eventName = input.hook_event_name || 'unknown'
    let trigger = 'session_end'
    
    if (eventName === 'PreCompress') {
        trigger = 'pre_compact'
    }

    console.error(info(`🧠 Curating memories (${eventName})...`))

    const response = await fetch(`${MEMORY_API_URL}/memory/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        project_id: projectId,
        claude_session_id: sessionId, 
        trigger,
        cwd,
        cli_type: 'gemini-cli'
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (response?.ok) {
      console.error(success('✨ Memory curation started'))
      // For PreCompress, we can send a system message
      if (eventName === 'PreCompress') {
          console.log(JSON.stringify({
              systemMessage: "🧠 Memories curated before compression"
          }))
      }
    } else {
      console.error(warn('⚠️ Memory server not available'))
    }

  } catch (error: any) {
    console.error(warn(`⚠️ Hook error: ${error.message}`))
  }
}

main()