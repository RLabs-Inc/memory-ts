// ============================================================================
// MEMORY MANAGER - Post-curation memory lifecycle management
// Spawns a management agent to update, supersede, and organize memories
// Mirrors Curator pattern exactly
// ============================================================================

import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import type { CurationResult } from '../types/memory.ts'

/**
 * Get the Claude CLI command path
 * Same logic as curator.ts
 */
function getClaudeCommand(): string {
  const envCommand = process.env.CURATOR_COMMAND
  if (envCommand) return envCommand

  const claudeLocal = join(homedir(), '.claude', 'local', 'claude')
  if (existsSync(claudeLocal)) return claudeLocal

  return 'claude'
}

/**
 * Manager configuration
 */
export interface ManagerConfig {
  /**
   * Enable the management agent
   * When disabled, memories are stored but not organized/linked
   * Default: true
   */
  enabled?: boolean

  /**
   * CLI command to use (for subprocess mode)
   * Default: auto-detected (~/.claude/local/claude or 'claude')
   */
  cliCommand?: string

  /**
   * Maximum turns for the management agent
   * Set to undefined for unlimited turns
   * Default: undefined (unlimited)
   */
  maxTurns?: number
}

/**
 * Storage paths for the management agent
 * These are resolved at runtime from the server's actual configuration
 */
export interface StoragePaths {
  /**
   * Root path to project storage directory (NOT the memories subdirectory)
   * e.g., ~/.local/share/memory/memory-ts/ (central)
   * or /path/to/project/.memory/ (local)
   */
  projectPath: string

  /**
   * Root path to global storage directory (NOT the memories subdirectory)
   * Always ~/.local/share/memory/global/
   */
  globalPath: string

  /**
   * Full path to project memories directory
   * e.g., ~/.local/share/memory/memory-ts/memories/ (central)
   * or /path/to/project/.memory/memories/ (local)
   */
  projectMemoriesPath: string

  /**
   * Full path to global memories directory
   * Always ~/.local/share/memory/global/memories/
   */
  globalMemoriesPath: string

  /**
   * Full path to personal primer file
   * Always ~/.local/share/memory/global/memories/personal-primer.md
   */
  personalPrimerPath: string

  /**
   * Storage mode for context
   */
  storageMode: 'central' | 'local'
}

/**
 * Management result - what the agent did
 */
export interface ManagementResult {
  success: boolean
  superseded: number
  resolved: number
  linked: number
  filesRead: number
  filesWritten: number
  primerUpdated: boolean
  actions: string[]  // Detailed action log lines
  summary: string    // Brief summary for storage
  fullReport: string // Complete management report (ACTIONS + SUMMARY sections)
  error?: string
}

/**
 * Memory Manager - Updates and organizes memories after curation
 * Mirrors Curator class structure
 */
export class Manager {
  private _config: {
    enabled: boolean
    cliCommand: string
    maxTurns?: number  // undefined = unlimited
  }

  constructor(config: ManagerConfig = {}) {
    this._config = {
      enabled: config.enabled ?? true,
      cliCommand: config.cliCommand ?? getClaudeCommand(),
      maxTurns: config.maxTurns,  // undefined = unlimited turns
    }
  }

  /**
   * Build the management prompt
   * Loads from skills file
   */
  async buildManagementPrompt(): Promise<string | null> {
    const skillPaths = [
      // Development - relative to src/core
      join(import.meta.dir, '../../skills/memory-management.md'),
      // Installed via bun global
      join(homedir(), '.bun/install/global/node_modules/@rlabs-inc/memory/skills/memory-management.md'),
      // Installed via npm global
      join(homedir(), '.npm/global/node_modules/@rlabs-inc/memory/skills/memory-management.md'),
      // Local node_modules
      join(process.cwd(), 'node_modules/@rlabs-inc/memory/skills/memory-management.md'),
    ]

    for (const path of skillPaths) {
      try {
        const content = await Bun.file(path).text()
        if (content) return content
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Build the user message with curation data
   * Includes actual storage paths resolved at runtime
   */
  buildUserMessage(
    projectId: string,
    sessionNumber: number,
    result: CurationResult,
    storagePaths?: StoragePaths
  ): string {
    const today = new Date().toISOString().split('T')[0]

    // Build storage paths section if provided
    // Includes both root paths (for permissions context) and memories paths (for file operations)
    const pathsSection = storagePaths ? `
## Storage Paths (ACTUAL - use these exact paths)

**Storage Mode:** ${storagePaths.storageMode}

### Project Storage
- **Project Root:** ${storagePaths.projectPath}
- **Project Memories:** ${storagePaths.projectMemoriesPath}

### Global Storage (shared across all projects)
- **Global Root:** ${storagePaths.globalPath}
- **Global Memories:** ${storagePaths.globalMemoriesPath}
- **Personal Primer:** ${storagePaths.personalPrimerPath}

> ⚠️ These paths are resolved from the running server configuration. Use them exactly as provided.
> Memories are stored as individual markdown files in the memories directories.
` : ''

    return `## Curation Data

**Project ID:** ${projectId}
**Session Number:** ${sessionNumber}
**Date:** ${today}
${pathsSection}
### Session Summary
${result.session_summary || 'No summary provided'}

### Project Snapshot
${result.project_snapshot ? `
- Current Phase: ${result.project_snapshot.current_phase || 'N/A'}
- Recent Achievements: ${result.project_snapshot.recent_achievements?.join(', ') || 'None'}
- Active Challenges: ${result.project_snapshot.active_challenges?.join(', ') || 'None'}
- Next Steps: ${result.project_snapshot.next_steps?.join(', ') || 'None'}
` : 'No snapshot provided'}

### New Memories (${result.memories.length})
${result.memories.map((m, i) => `
#### Memory ${i + 1}
- **Content:** ${m.content}
- **Type:** ${m.context_type}
- **Scope:** ${m.scope || 'project'}
- **Domain:** ${m.domain || 'N/A'}
- **Importance:** ${m.importance_weight}
- **Tags:** ${m.semantic_tags?.join(', ') || 'None'}
`).join('\n')}

---

Please process these memories according to your management procedure. Use the exact storage paths provided above to read and write memory files. Update, supersede, or link existing memories as needed. Update the personal primer if any personal memories warrant it.`
  }

  /**
   * Parse management response from Claude
   */
  parseManagementResponse(responseJson: string): ManagementResult {
    const emptyResult = (error?: string): ManagementResult => ({
      success: !error,
      superseded: 0,
      resolved: 0,
      linked: 0,
      filesRead: 0,
      filesWritten: 0,
      primerUpdated: false,
      actions: [],
      summary: error ? '' : 'No actions taken',
      fullReport: error ? `Error: ${error}` : '',
      error,
    })

    try {
      // First, parse the CLI JSON wrapper
      const cliOutput = JSON.parse(responseJson)

      // Check for error response
      if (cliOutput.type === 'error' || cliOutput.is_error === true) {
        return emptyResult(cliOutput.error || 'Unknown error')
      }

      // Extract the "result" field (AI's response text)
      const resultText = typeof cliOutput.result === 'string' ? cliOutput.result : ''

      // Extract the full report (everything from === MANAGEMENT ACTIONS === onwards)
      const reportMatch = resultText.match(/(=== MANAGEMENT ACTIONS ===[\s\S]*)/)
      const fullReport = reportMatch ? reportMatch[1].trim() : resultText

      // Extract actions section
      const actionsMatch = resultText.match(/=== MANAGEMENT ACTIONS ===([\s\S]*?)(?:=== SUMMARY ===|$)/)
      const actions: string[] = []
      if (actionsMatch) {
        const actionsText = actionsMatch[1]
        // Extract lines that look like actions (TYPE: description or TYPE OK/FAILED: path)
        // Note: RECEIVED replaced CREATED - manager receives new memories from curator, doesn't create them
        const actionLines = actionsText.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => /^(READ|WRITE|RECEIVED|CREATED|UPDATED|SUPERSEDED|RESOLVED|LINKED|PRIMER|SKIPPED|NO_ACTION)/.test(line))
        actions.push(...actionLines)
      }

      // Extract stats from result text
      const supersededMatch = resultText.match(/memories_superseded[:\s]+(\d+)/i) || resultText.match(/superseded[:\s]+(\d+)/i)
      const resolvedMatch = resultText.match(/memories_resolved[:\s]+(\d+)/i) || resultText.match(/resolved[:\s]+(\d+)/i)
      const linkedMatch = resultText.match(/memories_linked[:\s]+(\d+)/i) || resultText.match(/linked[:\s]+(\d+)/i)
      const filesReadMatch = resultText.match(/files_read[:\s]+(\d+)/i)
      const filesWrittenMatch = resultText.match(/files_written[:\s]+(\d+)/i)
      const primerUpdated = /primer_updated[:\s]+true/i.test(resultText) || /PRIMER\s+OK/i.test(resultText)

      // Count file operations from actions if not in summary
      const readActions = actions.filter((a: string) => a.startsWith('READ OK')).length
      const writeActions = actions.filter((a: string) => a.startsWith('WRITE OK')).length

      return {
        success: true,
        superseded: supersededMatch ? parseInt(supersededMatch[1]) : 0,
        resolved: resolvedMatch ? parseInt(resolvedMatch[1]) : 0,
        linked: linkedMatch ? parseInt(linkedMatch[1]) : 0,
        filesRead: filesReadMatch ? parseInt(filesReadMatch[1]) : readActions,
        filesWritten: filesWrittenMatch ? parseInt(filesWrittenMatch[1]) : writeActions,
        primerUpdated,
        actions,
        summary: resultText.slice(0, 500),  // Brief summary for storage
        fullReport,                          // Complete report for logging
      }
    } catch {
      return emptyResult('Failed to parse response')
    }
  }

  /**
   * Build a temporary settings file with path-based permissions
   *
   * Claude CLI supports path restrictions via settings.json permissions, NOT via --allowedTools.
   * Syntax: Read(//absolute/path/**) where // means absolute path
   *
   * This provides real security - the agent can ONLY access memory storage paths.
   */
  private async _buildSettingsFile(storagePaths?: StoragePaths): Promise<string> {
    // Build allow list with path restrictions
    const allowRules: string[] = []

    // Global path - always central at ~/.local/share/memory/global
    const globalPath = storagePaths?.globalPath
      ?? join(homedir(), '.local', 'share', 'memory', 'global')

    // Project path - depends on storage mode
    const projectPath = storagePaths?.projectPath
      ?? join(homedir(), '.local', 'share', 'memory')

    // Glob and Grep - tool names only (no path syntax in Claude CLI for these)
    allowRules.push('Glob')
    allowRules.push('Grep')

    // Helper to format path for Claude CLI permissions
    // // means "absolute path from filesystem root"
    // If path already starts with /, replace it with //
    const formatPath = (p: string) => p.startsWith('/') ? '/' + p : '//' + p

    // Read, Write, Edit - use path patterns with // for absolute paths
    // Global path (always ~/.local/share/memory/global/)
    allowRules.push(`Read(${formatPath(globalPath)}/**)`)
    allowRules.push(`Write(${formatPath(globalPath)}/**)`)
    allowRules.push(`Edit(${formatPath(globalPath)}/**)`)

    // Project path (always different from global, even in central mode)
    // Central: ~/.local/share/memory/{project_id}/
    // Local: {project_path}/.memory/{project_id}/
    allowRules.push(`Read(${formatPath(projectPath)}/**)`)
    allowRules.push(`Write(${formatPath(projectPath)}/**)`)
    allowRules.push(`Edit(${formatPath(projectPath)}/**)`)


    const settings = {
      permissions: {
        allow: allowRules,
        deny: [
          // Explicitly deny sensitive paths for Read/Write/Edit
          'Read(/etc/**)',
          'Read(~/.ssh/**)',
          'Read(~/.aws/**)',
          'Read(~/.gnupg/**)',
          'Read(.env)',
          'Read(.env.*)',
        ]
      }
    }

    // Write to temp file
    const tempPath = join(homedir(), '.local', 'share', 'memory', '.manager-settings.json')
    await Bun.write(tempPath, JSON.stringify(settings, null, 2))
    return tempPath
  }

  /**
   * Manage using CLI subprocess
   * Similar to Curator.curateWithCLI
   */
  async manageWithCLI(
    projectId: string,
    sessionNumber: number,
    result: CurationResult,
    storagePaths?: StoragePaths
  ): Promise<ManagementResult> {
    // Skip if disabled via config or env var
    if (!this._config.enabled || process.env.MEMORY_MANAGER_DISABLED === '1') {
      return {
        success: true,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: 'Management agent disabled',
        fullReport: 'Management agent disabled via configuration',
      }
    }

    // Skip if no memories
    if (result.memories.length === 0) {
      return {
        success: true,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: 'No memories to process',
        fullReport: 'No memories to process - skipped',
      }
    }

    // Load skill file
    const systemPrompt = await this.buildManagementPrompt()
    if (!systemPrompt) {
      return {
        success: false,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: '',
        fullReport: 'Error: Management skill file not found',
        error: 'Management skill not found',
      }
    }

    const userMessage = this.buildUserMessage(projectId, sessionNumber, result, storagePaths)

    // Build settings file with path-based permissions
    // This provides real security - the agent can ONLY access memory storage paths
    const settingsPath = await this._buildSettingsFile(storagePaths)

    // Build CLI command with settings file for path restrictions
    const args = [
      '-p', userMessage,
      '--append-system-prompt', systemPrompt,
      '--output-format', 'json',
      '--settings', settingsPath,
    ]

    // Add max-turns only if configured (undefined = unlimited)
    if (this._config.maxTurns !== undefined) {
      args.push('--max-turns', String(this._config.maxTurns))
    }

    // Execute CLI
    const proc = Bun.spawn([this._config.cliCommand, ...args], {
      env: {
        ...process.env,
        MEMORY_CURATOR_ACTIVE: '1',  // Prevent recursive hook triggering
      },
      stderr: 'pipe',
    })

    // Capture output
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const errorMsg = stderr || `Exit code ${exitCode}`
      return {
        success: false,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: '',
        fullReport: `Error: CLI failed with exit code ${exitCode}\n${stderr}`,
        error: errorMsg,
      }
    }

    return this.parseManagementResponse(stdout)
  }
}

/**
 * Create a new manager
 */
export function createManager(config?: ManagerConfig): Manager {
  return new Manager(config)
}
