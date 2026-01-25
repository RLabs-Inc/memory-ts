// ============================================================================
// INSTALL COMMAND - Set up hooks for Claude Code or Gemini CLI
// ============================================================================

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { c, symbols, fmt } from '../colors.ts'

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
  const targetHooksDir = join(claudeDir, 'hooks')
  const settingsPath = join(claudeDir, 'settings.json')

  // Find the hooks directory (relative to this CLI - source files)
  const cliPath = import.meta.dir
  const packageRoot = join(cliPath, '..', '..', '..')
  const sourceHooksDir = join(packageRoot, 'hooks', 'claude')

  console.log(`  ${fmt.kv('Claude config', claudeDir)}`)
  console.log(`  ${fmt.kv('Hooks source', sourceHooksDir)}`)
  console.log(`  ${fmt.kv('Hooks target', targetHooksDir)}`)
  console.log()

  // Check if source hooks directory exists
  if (!existsSync(sourceHooksDir)) {
    console.log(
      c.error(`  ${symbols.cross} Hooks directory not found at ${sourceHooksDir}`)
    )
    console.log(c.muted(`  Make sure the memory package is properly installed`))
    process.exit(1)
  }

  // Ensure .claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
    console.log(`  ${c.success(symbols.tick)} Created ${claudeDir}`)
  }

  // Ensure target hooks directory exists
  if (!existsSync(targetHooksDir)) {
    mkdirSync(targetHooksDir, { recursive: true })
    console.log(`  ${c.success(symbols.tick)} Created ${targetHooksDir}`)
  }

  // Copy hooks to target directory (stable location, won't change with package upgrades)
  const filesToCopy = ['session-start.ts', 'user-prompt.ts', 'curation.ts']
  for (const file of filesToCopy) {
    const source = join(sourceHooksDir, file)
    const target = join(targetHooksDir, file)
    try {
      const content = await Bun.file(source).text()
      await Bun.write(target, content)
      console.log(`  ${c.success(symbols.tick)} Installed hook: ${file}`)
    } catch (e: any) {
      console.log(
        c.error(`  ${symbols.cross} Failed to copy ${file}: ${e.message}`)
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
      console.log(
        `  ${c.warn(
          symbols.warning
        )} Could not parse settings.json, creating backup`
      )
      const backupPath = `${settingsPath}.backup.${Date.now()}`
      await Bun.write(backupPath, await Bun.file(settingsPath).text())
    }
  }

  // Build hooks configuration pointing to TARGET directory (stable ~/.claude/hooks/)
  const sessionStartHook = join(targetHooksDir, 'session-start.ts')
  const userPromptHook = join(targetHooksDir, 'user-prompt.ts')
  const curationHook = join(targetHooksDir, 'curation.ts')

  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            type: 'command',
            command: `bun "${sessionStartHook}"`,
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
            command: `bun "${userPromptHook}"`,
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
            command: `bun "${curationHook}"`,
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
            command: `bun "${curationHook}"`,
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
  const targetHooksDir = join(geminiDir, 'hooks')
  const settingsPath = join(geminiDir, 'settings.json')

  // Find the hooks directory (relative to this CLI)
  const cliPath = import.meta.dir
  const packageRoot = join(cliPath, '..', '..', '..')
  const hooksDir = join(packageRoot, 'hooks', 'gemini')

  console.log(`  ${fmt.kv('Gemini config', geminiDir)}`)
  console.log(`  ${fmt.kv('Hooks source', hooksDir)}`)
  console.log(`  ${fmt.kv('Hooks target', targetHooksDir)}`)
  console.log()

  // Check if source hooks directory exists
  if (!existsSync(hooksDir)) {
    console.log(
      c.error(`  ${symbols.cross} Hooks directory not found at ${hooksDir}`)
    )
    process.exit(1)
  }

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

  // Ensure target hooks directory exists
  if (!existsSync(targetHooksDir)) {
    try {
      mkdirSync(targetHooksDir, { recursive: true })
      console.log(`  ${c.success(symbols.tick)} Created ${targetHooksDir}`)
    } catch {
      console.log(
        `  ${c.warn(symbols.warning)} Could not create ${targetHooksDir}`
      )
    }
  }

  // Copy hooks to target directory
  const filesToCopy = ['session-start.ts', 'user-prompt.ts', 'curation.ts']
  for (const file of filesToCopy) {
    const source = join(hooksDir, file)
    const target = join(targetHooksDir, file)
    try {
      const content = await Bun.file(source).text()
      await Bun.write(target, content)
      console.log(`  ${c.success(symbols.tick)} Installed hook: ${file}`)
    } catch (e: any) {
      console.log(
        `  ${c.error(symbols.cross)} Failed to copy ${file}: ${e.message}`
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

  // Build hooks configuration pointing to TARGET directory
  const sessionStartHook = join(targetHooksDir, 'session-start.ts')
  const userPromptHook = join(targetHooksDir, 'user-prompt.ts')
  const curationHook = join(targetHooksDir, 'curation.ts')

  // Based on Gemini CLI documentation
  const hooksConfig = {
    SessionStart: [
      {
        matcher: 'startup|resume',
        hooks: [
          {
            name: 'load-session-primer',
            type: 'command',
            command: `bun "${sessionStartHook}"`,
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
            command: `bun "${userPromptHook}"`,
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
            command: `bun "${curationHook}"`,
            description: 'Curate memories before context compression',
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: '*',
        hooks: [
          {
            name: 'curate-memories',
            type: 'command',
            command: `bun "${curationHook}"`,
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

  // Enable hooks system - both locations for compatibility
  // hooks.enabled = true is what actually makes hooks fire
  // hooksConfig.enabled is per Gemini docs but may not be sufficient alone
  settings.hooks.enabled = true
  settings.hooksConfig = { enabled: true }

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
