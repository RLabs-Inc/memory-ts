// ============================================================================
// INSTALL COMMAND - Set up Claude Code hooks
// ============================================================================

import { homedir } from 'os'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { c, symbols, fmt } from '../colors.ts'

interface InstallOptions {
  verbose?: boolean
  force?: boolean
}

export async function install(options: InstallOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory - Install Hooks`))
  console.log()

  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  // Find the hooks directory (relative to this CLI)
  const cliPath = import.meta.dir
  const packageRoot = join(cliPath, '..', '..', '..')
  const hooksDir = join(packageRoot, 'hooks')

  console.log(`  ${fmt.kv('Claude config', claudeDir)}`)
  console.log(`  ${fmt.kv('Hooks source', hooksDir)}`)
  console.log()

  // Check if hooks directory exists
  if (!existsSync(hooksDir)) {
    console.log(c.error(`  ${symbols.cross} Hooks directory not found at ${hooksDir}`))
    console.log(c.muted(`  Make sure the memory package is properly installed`))
    process.exit(1)
  }

  // Ensure .claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
    console.log(`  ${c.success(symbols.tick)} Created ${claudeDir}`)
  }

  // Read existing settings or create new
  let settings: any = {}
  if (existsSync(settingsPath)) {
    try {
      const content = await Bun.file(settingsPath).text()
      settings = JSON.parse(content)
      console.log(`  ${c.success(symbols.tick)} Found existing settings.json`)
    } catch {
      console.log(`  ${c.warn(symbols.warning)} Could not parse settings.json, creating backup`)
      const backupPath = `${settingsPath}.backup.${Date.now()}`
      await Bun.write(backupPath, await Bun.file(settingsPath).text())
    }
  }

  // Build hooks configuration
  const sessionStartHook = join(hooksDir, 'session-start.ts')
  const userPromptHook = join(hooksDir, 'user-prompt.ts')
  const curationHook = join(hooksDir, 'curation.ts')

  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            type: 'command',
            command: `bun "${sessionStartHook}"`,
            timeout: 10
          }
        ]
      }
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: `bun "${userPromptHook}"`,
            timeout: 10
          }
        ]
      }
    ],
    PreCompact: [
      {
        matcher: 'auto|manual',
        hooks: [
          {
            type: 'command',
            command: `bun "${curationHook}"`,
            timeout: 120
          }
        ]
      }
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: 'command',
            command: `bun "${curationHook}"`,
            timeout: 120
          }
        ]
      }
    ]
  }

  // Check for existing hooks
  if (settings.hooks && !options.force) {
    const existingHooks = Object.keys(settings.hooks)
    if (existingHooks.length > 0) {
      console.log()
      console.log(c.warn(`  ${symbols.warning} Existing hooks found: ${existingHooks.join(', ')}`))
      console.log(c.muted(`  Use --force to overwrite, or manually merge in settings.json`))
      console.log()

      // Show what would be added
      console.log(c.bold('  Hooks to add:'))
      console.log(c.muted('  ' + JSON.stringify(hooksConfig, null, 2).split('\n').join('\n  ')))
      console.log()
      process.exit(1)
    }
  }

  // Merge hooks
  settings.hooks = {
    ...settings.hooks,
    ...hooksConfig
  }

  // Write settings
  try {
    await Bun.write(settingsPath, JSON.stringify(settings, null, 2))
    console.log(`  ${c.success(symbols.tick)} Updated ${settingsPath}`)
  } catch (error: any) {
    console.log(c.error(`  ${symbols.cross} Failed to write settings: ${error.message}`))
    process.exit(1)
  }

  console.log()
  console.log(c.success(`${symbols.sparkles} Hooks installed successfully!`))
  console.log()
  console.log(c.bold('Next steps:'))
  console.log(`  1. Start the memory server: ${c.command('memory serve')}`)
  console.log(`  2. Open Claude Code in any project`)
  console.log(`  3. Memories will be automatically injected`)
  console.log()
}
