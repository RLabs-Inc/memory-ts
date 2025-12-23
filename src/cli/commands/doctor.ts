// ============================================================================
// DOCTOR COMMAND - Check system health
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { c, symbols, fmt } from '../colors.ts'

interface DoctorOptions {
  verbose?: boolean
}

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:8765'

export async function doctor(options: DoctorOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory - Health Check`))
  console.log()

  let allGood = true

  // 1. Check Claude directory
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  if (existsSync(claudeDir)) {
    console.log(`  ${c.success(symbols.tick)} Claude config directory exists`)
  } else {
    console.log(`  ${c.error(symbols.cross)} Claude config directory not found`)
    console.log(c.muted(`    Expected at: ${claudeDir}`))
    allGood = false
  }

  // 2. Check settings.json and hooks
  if (existsSync(settingsPath)) {
    try {
      const content = await Bun.file(settingsPath).text()
      const settings = JSON.parse(content)

      if (settings.hooks) {
        const hookTypes = Object.keys(settings.hooks)
        const hasMemoryHooks = hookTypes.some(h =>
          ['SessionStart', 'UserPromptSubmit', 'PreCompact'].includes(h)
        )

        if (hasMemoryHooks) {
          console.log(`  ${c.success(symbols.tick)} Memory hooks configured`)
          if (options.verbose) {
            hookTypes.forEach(h => {
              console.log(c.muted(`    ${symbols.bullet} ${h}`))
            })
          }
        } else {
          console.log(`  ${c.warn(symbols.warning)} Hooks exist but memory hooks not found`)
          console.log(c.muted(`    Run: memory install`))
          allGood = false
        }
      } else {
        console.log(`  ${c.warn(symbols.warning)} No hooks configured`)
        console.log(c.muted(`    Run: memory install`))
        allGood = false
      }
    } catch {
      console.log(`  ${c.error(symbols.cross)} Could not parse settings.json`)
      allGood = false
    }
  } else {
    console.log(`  ${c.warn(symbols.warning)} settings.json not found`)
    console.log(c.muted(`    Run: memory install`))
    allGood = false
  }

  // 3. Check if server is running
  try {
    const response = await fetch(`${MEMORY_API_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    })

    if (response.ok) {
      const health = await response.json()
      console.log(`  ${c.success(symbols.tick)} Memory server is running`)
      if (options.verbose) {
        console.log(c.muted(`    ${symbols.bullet} Engine: ${health.engine || 'unknown'}`))
        console.log(c.muted(`    ${symbols.bullet} URL: ${MEMORY_API_URL}`))
      }
    } else {
      console.log(`  ${c.error(symbols.cross)} Memory server responded with error`)
      allGood = false
    }
  } catch {
    console.log(`  ${c.warn(symbols.warning)} Memory server is not running`)
    console.log(c.muted(`    Start with: memory serve`))
    allGood = false
  }

  // 4. Check for Claude Code CLI (used for curation)
  const claudeCliPath = join(homedir(), '.claude', 'local', 'claude')
  if (existsSync(claudeCliPath)) {
    console.log(`  ${c.success(symbols.tick)} Claude Code CLI found`)
    if (options.verbose) {
      console.log(c.muted(`    ${symbols.bullet} Path: ${claudeCliPath}`))
    }
  } else {
    // Try to find claude in PATH
    try {
      const result = Bun.spawnSync(['which', 'claude'])
      if (result.exitCode === 0) {
        console.log(`  ${c.success(symbols.tick)} Claude Code CLI found in PATH`)
      } else {
        console.log(`  ${c.warn(symbols.warning)} Claude Code CLI not found`)
        console.log(c.muted(`    Install Claude Code for curation to work`))
        allGood = false
      }
    } catch {
      console.log(`  ${c.warn(symbols.warning)} Claude Code CLI not found`)
      console.log(c.muted(`    Install Claude Code for curation to work`))
      allGood = false
    }
  }

  // 5. Check storage directory
  const storageDir = join(homedir(), '.local', 'share', 'memory')
  if (existsSync(storageDir)) {
    console.log(`  ${c.success(symbols.tick)} Storage directory exists`)
    if (options.verbose) {
      console.log(c.muted(`    ${symbols.bullet} Path: ${storageDir}`))
    }
  } else {
    console.log(`  ${c.muted(symbols.info)} Storage directory will be created on first use`)
  }

  // Summary
  console.log()
  if (allGood) {
    console.log(c.success(`${symbols.sparkles} All systems operational!`))
  } else {
    console.log(c.warn(`${symbols.warning} Some issues found - see above for details`))
  }
  console.log()

  process.exit(allGood ? 0 : 1)
}
