// ============================================================================
// INSTALL COMMAND - Set up hooks for Claude Code or Gemini CLI
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { c, symbols, fmt } from '../colors.ts'
import { getCliCommand, getHookCommand } from '../invocation.ts'

interface InstallOptions {
  verbose?: boolean
  force?: boolean
  claude?: boolean
  gemini?: boolean
}

export async function install(options: InstallOptions) {
  // Determine which platform to install for
  const installClaude = options.claude || (!options.claude && !options.gemini)
  const installGemini = options.gemini

  if (!installClaude && !installGemini) {
    console.log(c.error(`Please specify --claude or --gemini`))
    process.exit(1)
  }

  if (installClaude) {
    await installClaudeHooks(options)
  }

  if (installGemini) {
    await installGeminiHooks(options)
  }
}

async function installClaudeHooks(options: InstallOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory - Install Claude Code Hooks`))
  console.log()

  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  // Detect CLI invocation method
  const cliCommand = getCliCommand()
  console.log(`  ${fmt.kv('Claude config', claudeDir)}`)
  console.log(`  ${fmt.kv('CLI command', cliCommand)}`)
  console.log()

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
      console.log(
        `  ${c.warn(
          symbols.warning
        )} Could not parse settings.json, creating backup`
      )
      const backupPath = `${settingsPath}.backup.${Date.now()}`
      await Bun.write(backupPath, await Bun.file(settingsPath).text())
    }
  }

  // Build hooks configuration using CLI subcommands
  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            type: 'command',
            command: getHookCommand('session-start', 'claude'),
            timeout: 10,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: getHookCommand('user-prompt', 'claude'),
            timeout: 10,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: 'auto|manual',
        hooks: [
          {
            type: 'command',
            command: getHookCommand('curation', 'claude'),
            timeout: 120,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: 'command',
            command: getHookCommand('curation', 'claude'),
            timeout: 120,
          },
        ],
      },
    ],
  }

  // Check for existing hooks
  if (settings.hooks && !options.force) {
    const existingHooks = Object.keys(settings.hooks)
    if (existingHooks.length > 0) {
      console.log()
      console.log(
        c.warn(
          `  ${symbols.warning} Existing hooks found: ${existingHooks.join(
            ', '
          )}`
        )
      )
      console.log(
        c.muted(
          `  Use --force to overwrite, or manually merge in settings.json`
        )
      )
      console.log()

      // Show what would be added
      console.log(c.bold('  Hooks to add:'))
      console.log(
        c.muted(
          '  ' + JSON.stringify(hooksConfig, null, 2).split('\n').join('\n  ')
        )
      )
      console.log()
      process.exit(1)
    }
  }

  // Merge hooks
  settings.hooks = {
    ...settings.hooks,
    ...hooksConfig,
  }

  // Write settings
  try {
    await Bun.write(settingsPath, JSON.stringify(settings, null, 2))
    console.log(`  ${c.success(symbols.tick)} Updated ${settingsPath}`)
  } catch (error: any) {
    console.log(
      c.error(`  ${symbols.cross} Failed to write settings: ${error.message}`)
    )
    process.exit(1)
  }

  console.log()
  console.log(c.success(`${symbols.sparkles} Claude Code hooks installed!`))
  console.log()
  console.log(c.bold('Next steps:'))
  console.log(`  1. Start the memory server: ${c.command('memory serve')}`)
  console.log(`  2. Open Claude Code in any project`)
  console.log(`  3. Memories will be automatically injected`)
  console.log()
}

async function installGeminiHooks(options: InstallOptions) {
  console.log()
  console.log(c.header(`${symbols.brain} Memory - Install Gemini CLI Hooks`))
  console.log()

  const geminiDir = join(homedir(), '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

  // Detect CLI invocation method
  const cliCommand = getCliCommand()
  console.log(`  ${fmt.kv('Gemini config', geminiDir)}`)
  console.log(`  ${fmt.kv('CLI command', cliCommand)}`)
  console.log()

  // Ensure .gemini directory exists
  if (!existsSync(geminiDir)) {
    try {
      mkdirSync(geminiDir, { recursive: true })
      console.log(`  ${c.success(symbols.tick)} Created ${geminiDir}`)
    } catch {
      console.log(
        `  ${c.warn(
          symbols.warning
        )} Could not create ${geminiDir} (sandbox restriction?)`
      )
      console.log(
        `  ${c.muted(
          'Skipping config write, printing manual instructions instead.'
        )}`
      )
    }
  }

  // Read existing settings or create new
  let settings: any = {}
  if (existsSync(settingsPath)) {
    try {
      const content = await Bun.file(settingsPath).text()
      settings = JSON.parse(content)
      console.log(`  ${c.success(symbols.tick)} Found existing settings.json`)
    } catch {
      console.log(`  ${c.warn(symbols.warning)} Could not parse settings.json`)
    }
  }

  // Build hooks configuration using CLI subcommands
  // Based on Gemini CLI documentation
  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            name: 'load-session-primer',
            type: 'command',
            command: getHookCommand('session-start', 'gemini'),
            description: 'Load session primer at the beginning of a session',
          },
        ],
      },
    ],
    BeforeAgent: [
      {
        matcher: '*',
        hooks: [
          {
            name: 'inject-memories',
            type: 'command',
            command: getHookCommand('user-prompt', 'gemini'),
            description: 'Inject relevant memories into user prompt',
          },
        ],
      },
    ],
    PreCompress: [
      {
        matcher: 'auto|manual',
        hooks: [
          {
            name: 'curate-memories',
            type: 'command',
            command: getHookCommand('curation', 'gemini'),
            description: 'Curate memories before context compression',
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: 'exit|logout',
        hooks: [
          {
            name: 'curate-memories',
            type: 'command',
            command: getHookCommand('curation', 'gemini'),
            description: 'Curate memories before session end',
          },
        ],
      },
    ],
  }

  // Merge hooks
  if (!settings.hooks) {
    settings.hooks = {}
  }

  settings.hooks = {
    ...settings.hooks,
    ...hooksConfig,
  }

  // Enable the hooks
  const enabledHooks = new Set(settings.hooks.enabled || [])
  enabledHooks.add('SessionStart')
  enabledHooks.add('BeforeAgent')
  enabledHooks.add('PreCompress')
  enabledHooks.add('SessionEnd')
  settings.hooks.enabled = Array.from(enabledHooks)

  // Write settings
  try {
    if (existsSync(geminiDir)) {
      await Bun.write(settingsPath, JSON.stringify(settings, null, 2))
      console.log(`  ${c.success(symbols.tick)} Updated ${settingsPath}`)
    } else {
      throw new Error('Gemini directory does not exist')
    }
  } catch (error: any) {
    console.log(
      c.error(`  ${symbols.cross} Failed to write settings: ${error.message}`)
    )
    console.log()
    console.log(c.bold('Manual Installation Instructions:'))
    console.log('Add the following to your ~/.gemini/settings.json:')
    console.log()
    console.log(JSON.stringify({ hooks: hooksConfig }, null, 2))
    console.log()
  }

  console.log()
  console.log(c.success(`${symbols.sparkles} Gemini CLI hooks configured!`))
  console.log()
  console.log(c.bold('Next steps:'))
  console.log(`  1. Start the memory server: ${c.command('memory serve')}`)
  console.log(`  2. Open Gemini CLI in any project`)
  console.log(`  3. Memories will be automatically injected`)
  console.log()
}
