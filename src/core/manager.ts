// ============================================================================
// MEMORY MANAGER - Post-curation memory lifecycle management
// Spawns a management agent to update, supersede, and organize memories
// Mirrors Curator pattern exactly
// ============================================================================

import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import type { CurationResult } from "../types/memory.ts";
import { logger } from "../utils/logger.ts";
import {
  getClaudeCommand,
  getManagerPromptPath,
  getManagerCwd,
  getCentralStoragePath,
  getStorageMode,
  type StoragePaths,
} from "../utils/paths.ts";

/**
 * Manager configuration
 */
export interface ManagerConfig {
  /**
   * Enable the management agent
   * When disabled, memories are stored but not organized/linked
   * Default: true
   */
  enabled?: boolean;

  /**
   * CLI command to use (for subprocess mode)
   * Default: auto-detected (~/.claude/local/claude or 'claude')
   */
  cliCommand?: string;

  /**
   * Maximum turns for the management agent
   * Set to undefined for unlimited turns
   * Default: undefined (unlimited)
   */
  maxTurns?: number;
}

// Re-export StoragePaths for backwards compatibility
export type { StoragePaths } from "../utils/paths.ts";

/**
 * Management result - what the agent did
 */
export interface ManagementResult {
  success: boolean;
  superseded: number;
  resolved: number;
  linked: number;
  filesRead: number;
  filesWritten: number;
  primerUpdated: boolean;
  actions: string[]; // Detailed action log lines
  summary: string; // Brief summary for storage
  fullReport: string; // Complete management report (ACTIONS + SUMMARY sections)
  error?: string;
}

/**
 * Memory Manager - Updates and organizes memories after curation
 * Mirrors Curator class structure
 */
export class Manager {
  private _config: {
    enabled: boolean;
    cliCommand: string;
    maxTurns?: number; // undefined = unlimited
  };

  constructor(config: ManagerConfig = {}) {
    this._config = {
      enabled: config.enabled ?? true,
      cliCommand: config.cliCommand ?? getClaudeCommand(),
      maxTurns: config.maxTurns, // undefined = unlimited turns
    };
  }

  /**
   * Build the management prompt
   * Loads from skills file
   */
  async buildManagementPrompt(): Promise<string | null> {
    const skillPaths = [
      // Development - relative to src/core
      join(import.meta.dir, "../../skills/memory-management.md"),
      // Installed via bun global
      join(
        homedir(),
        ".bun/install/global/node_modules/@rlabs-inc/memory/skills/memory-management.md",
      ),
      // Installed via npm global
      join(
        homedir(),
        ".npm/global/node_modules/@rlabs-inc/memory/skills/memory-management.md",
      ),
      // Local node_modules
      join(
        process.cwd(),
        "node_modules/@rlabs-inc/memory/skills/memory-management.md",
      ),
    ];

    for (const path of skillPaths) {
      try {
        const content = await Bun.file(path).text();
        if (content) return content;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Build the user message with curation data
   * Includes actual storage paths resolved at runtime
   */
  buildUserMessage(
    projectId: string,
    sessionNumber: number,
    result: CurationResult,
    storagePaths?: StoragePaths,
  ): string {
    const today = new Date().toISOString().split("T")[0];

    // Build storage paths section if provided
    // Includes both root paths (for permissions context) and memories paths (for file operations)
    const pathsSection = storagePaths
      ? `
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
`
      : "";

    return `## Curation Data

**Project ID:** ${projectId}
**Session Number:** ${sessionNumber}
**Date:** ${today}
${pathsSection}
### Session Summary
${result.session_summary || "No summary provided"}

### Project Snapshot
${result.project_snapshot
        ? `
- Current Phase: ${result.project_snapshot.current_phase || "N/A"}
- Recent Achievements: ${result.project_snapshot.recent_achievements?.join(", ") || "None"}
- Active Challenges: ${result.project_snapshot.active_challenges?.join(", ") || "None"}
- Next Steps: ${result.project_snapshot.next_steps?.join(", ") || "None"}
`
        : "No snapshot provided"
      }

### New Memories (${result.memories.length})
${result.memories
        .map(
          (m, i) => `
#### Memory ${i + 1}
- **Content:** ${m.content}
- **Type:** ${m.context_type}
- **Scope:** ${m.scope || "project"}
- **Domain:** ${m.domain || "N/A"}
- **Importance:** ${m.importance_weight}
- **Tags:** ${m.semantic_tags?.join(", ") || "None"}
`,
        )
        .join("\n")}

---

Please process these memories according to your management procedure. Use the exact storage paths provided above to read and write memory files. Update, supersede, or link existing memories as needed. Update the personal primer if any personal memories warrant it.`;
  }

  /**
   * Manage using Claude Agent SDK (no API key needed - uses Claude Code OAuth)
   * Use this for ingest command - cleaner than CLI subprocess
   */
  async manageWithSDK(
    projectId: string,
    sessionNumber: number,
    result: CurationResult,
    storagePaths?: StoragePaths,
  ): Promise<ManagementResult> {
    // Skip if disabled via config or env var
    if (!this._config.enabled || process.env.MEMORY_MANAGER_DISABLED === "1") {
      return {
        success: true,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: "Management agent disabled",
        fullReport: "Management agent disabled via configuration",
      };
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
        summary: "No memories to process",
        fullReport: "No memories to process - skipped",
      };
    }

    // Load skill file
    const systemPrompt = await this.buildManagementPrompt();
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
        summary: "",
        fullReport: "Error: Management skill file not found",
        error: "Management skill not found",
      };
    }

    const userMessage = this.buildUserMessage(
      projectId,
      sessionNumber,
      result,
      storagePaths,
    );

    try {
      // Dynamic import to make Agent SDK optional
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      // Build allowed directories for file access
      const globalPath =
        storagePaths?.globalPath ?? join(getCentralStoragePath(), "global");
      const projectPath = storagePaths?.projectPath ?? getCentralStoragePath();

      // Use Agent SDK with file tools
      const q = query({
        prompt: userMessage,
        options: {
          systemPrompt,
          permissionMode: "bypassPermissions",
          model: "claude-opus-4-5-20251101",
          // Only allow file tools - no Bash, no web
          allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
          // Allow access to memory directories
          additionalDirectories: [globalPath, projectPath],
          // Limit turns if configured
          maxTurns: this._config.maxTurns,
        },
      });

      // Iterate through the async generator to get the result
      let resultText = "";
      for await (const msg of q) {
        if (msg.type === "result" && "result" in msg) {
          resultText = msg.result;
          break;
        }
      }

      if (!resultText) {
        return {
          success: true,
          superseded: 0,
          resolved: 0,
          linked: 0,
          filesRead: 0,
          filesWritten: 0,
          primerUpdated: false,
          actions: [],
          summary: "No result from management agent",
          fullReport: "Management agent completed but returned no result",
        };
      }

      return this._parseSDKManagementResult(resultText);
    } catch (error: any) {
      return {
        success: false,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: "",
        fullReport: `Manager Claude - Error: Agent SDK failed: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Parse management result from Agent SDK response
   * Similar to parseManagementResponse but for SDK output format
   */
  private _parseSDKManagementResult(resultText: string): ManagementResult {
    // Extract actions section
    const actionsMatch = resultText.match(
      /=== MANAGEMENT ACTIONS ===([\s\S]*?)(?:=== SUMMARY ===|$)/,
    );
    const actions: string[] = [];
    if (actionsMatch) {
      const actionsText = actionsMatch[1];
      const actionLines = actionsText
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) =>
          /^(READ|WRITE|RECEIVED|CREATED|UPDATED|SUPERSEDED|RESOLVED|LINKED|PRIMER|SKIPPED|NO_ACTION)/.test(
            line,
          ),
        );
      actions.push(...actionLines);
    }

    // Extract the full report
    const reportMatch = resultText.match(/(=== MANAGEMENT ACTIONS ===[\s\S]*)/);
    const fullReport = reportMatch ? reportMatch[1].trim() : resultText;

    // Extract stats from result text
    const supersededMatch =
      resultText.match(/memories_superseded[:\s]+(\d+)/i) ||
      resultText.match(/superseded[:\s]+(\d+)/i);
    const resolvedMatch =
      resultText.match(/memories_resolved[:\s]+(\d+)/i) ||
      resultText.match(/resolved[:\s]+(\d+)/i);
    const linkedMatch =
      resultText.match(/memories_linked[:\s]+(\d+)/i) ||
      resultText.match(/linked[:\s]+(\d+)/i);
    const filesReadMatch = resultText.match(/files_read[:\s]+(\d+)/i);
    const filesWrittenMatch = resultText.match(/files_written[:\s]+(\d+)/i);
    const primerUpdated =
      /primer_updated[:\s]+true/i.test(resultText) ||
      /PRIMER\s+OK/i.test(resultText);

    // Count file operations from actions if not in summary
    const readActions = actions.filter((a: string) =>
      a.startsWith("READ OK"),
    ).length;
    const writeActions = actions.filter((a: string) =>
      a.startsWith("WRITE OK"),
    ).length;

    return {
      success: true,
      superseded: supersededMatch ? parseInt(supersededMatch[1]) : 0,
      resolved: resolvedMatch ? parseInt(resolvedMatch[1]) : 0,
      linked: linkedMatch ? parseInt(linkedMatch[1]) : 0,
      filesRead: filesReadMatch ? parseInt(filesReadMatch[1]) : readActions,
      filesWritten: filesWrittenMatch
        ? parseInt(filesWrittenMatch[1])
        : writeActions,
      primerUpdated,
      actions,
      summary: resultText.slice(0, 500),
      fullReport,
    };
  }

  /**
   * Manage using Gemini CLI (for Gemini-only users)
   * Uses --prompt + --output-format json combo (no --resume needed for manager)
   * System prompt injected via GEMINI_SYSTEM_MD environment variable
   */
  async manageWithGeminiCLI(
    projectId: string,
    sessionNumber: number,
    result: CurationResult,
    storagePaths?: StoragePaths,
    apiKey?: string,
  ): Promise<ManagementResult> {
    // Skip if disabled via config or env var
    if (!this._config.enabled || process.env.MEMORY_MANAGER_DISABLED === "1") {
      return {
        success: true,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: "Manager Gemini - Management agent disabled",
        fullReport: "Management agent disabled via configuration",
      };
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
        summary: "Manager Gemini - No memories to process",
        fullReport: "No memories to process - skipped",
      };
    }

    // Load skill file
    const systemPrompt = await this.buildManagementPrompt();
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
        summary: "",
        fullReport:
          "Manager Gemini - Error: Management skill not file not found",
        error: "Management skill not found",
      };
    }

    const userMessage = this.buildUserMessage(
      projectId,
      sessionNumber,
      result,
      storagePaths,
    );

    // Resolve paths using centralized utilities
    const managerCwd = getManagerCwd(storagePaths);
    const projectPath =
      storagePaths?.projectPath ?? join(getCentralStoragePath(), projectId);
    const globalPath =
      storagePaths?.globalPath ?? join(getCentralStoragePath(), "global");

    // Write system prompt to temp file (tmpdir always exists)
    const geminiSystemPrompt = `${systemPrompt}

## Available Tools

You have access to the following tools to manage memory files:

\${AvailableTools}

Use these tools to read existing memories, write updates, and manage the memory filesystem.
`;
    const tempPromptPath = getManagerPromptPath();
    await Bun.write(tempPromptPath, geminiSystemPrompt);

    // Copy user's Gemini settings to managerCwd with hooks disabled
    // This prevents the manager's session from triggering hooks recursively
    const userSettingsPath = join(homedir(), ".gemini", "settings.json");
    const managerSettingsDir = join(managerCwd, ".gemini");
    const managerSettingsPath = join(managerSettingsDir, "settings.json");

    try {
      // Disable memory hooks to prevent recursive curation
      // Format: hooks.disabled array with hook command names
      const settings = {
        hooks: {
          disabled: [
            "inject-memories",
            "load-session-primer",
            "curate-memories",
            "curate-memories",
          ],
        },
        hooksConfig: {
          enabled: false,
        },
      };

      // Ensure .gemini directory exists in managerCwd
      if (!existsSync(managerSettingsDir)) {
        const { mkdirSync } = await import("fs");
        mkdirSync(managerSettingsDir, { recursive: true });
      }

      await Bun.write(managerSettingsPath, JSON.stringify(settings, null, 2));
      logger.debug(
        `Manager Gemini: Created settings with hooks disabled at ${managerSettingsPath}`,
        "manager",
      );
    } catch (err: any) {
      logger.debug(
        `Manager Gemini: Could not create settings file: ${err.message}`,
        "manager",
      );
    }

    logger.debug(
      `Manager Gemini - Starting management for project ${projectId}`,
      "manager",
    );
    logger.debug(
      `Manager Gemini - Processing ${result.memories.length} memories`,
      "manager",
    );
    logger.debug(
      `Manager Gemini - Storage mode: ${getStorageMode(storagePaths)}, cwd: ${managerCwd}`,
      "manager",
    );

    // Build CLI command
    // - cwd gives write access to that tree
    // - --include-directories adds read access to other paths
    const args = [
      "-p",
      userMessage,
      "--output-format",
      "json",
      "--yolo", // Auto-approve file operations
      "--include-directories",
      projectPath,
      "--include-directories",
      globalPath,
    ];

    logger.debug(
      `Manager Gemini: Spawning gemini CLI from ${managerCwd}`,
      "manager",
    );

    // Execute CLI with system prompt via environment variable
    // cwd determines write access, --include-directories adds read access
    const proc = Bun.spawn(["gemini", ...args], {
      cwd: managerCwd,
      env: {
        ...process.env,
        MEMORY_CURATOR_ACTIVE: "1", // Prevent recursive hook triggering
        GEMINI_SYSTEM_MD: tempPromptPath, // Inject our management prompt
        ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Capture output
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    logger.debug(`Manager Gemini - Exit code ${exitCode}`, "manager");
    if (stderr && stderr.trim()) {
      logger.debug(`Manager Gemini - stderr: ${stderr}`, "manager");
    }

    if (exitCode !== 0) {
      logger.debug(
        `Manager Gemini - Failed with exit code ${exitCode}`,
        "manager",
      );
      const errorMsg = stderr || `Exit code ${exitCode}`;
      return {
        success: false,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: "",
        fullReport: `Manager Gemini - Error: Gemini CLI failed with exit code ${exitCode}\n${stderr}`,
        error: errorMsg,
      };
    }

    // Parse Gemini JSON output
    // Note: Gemini CLI outputs log messages before AND after the JSON
    // We need to extract just the JSON object
    logger.debug(
      `Manager Gemini - Parsing response (${stdout.length} chars)`,
      "manager",
    );
    try {
      // Find the JSON object - it starts with { and we need to find the matching }
      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        logger.debug(
          "Manager Gemini - No JSON object found in output",
          "manager",
        );
        // logger.debug(
        //   `Manager Gemini - Raw stdout: ${stdout.slice(0, 500)}`,
        //   "manager",
        // );
        return {
          success: false,
          superseded: 0,
          resolved: 0,
          linked: 0,
          filesRead: 0,
          filesWritten: 0,
          primerUpdated: false,
          actions: [],
          summary: "Manager Gemini - No JSON in Gemini response",
          fullReport:
            "Manager Gemini - Failed: No JSON object in Gemini CLI output",
        };
      }

      // Find the matching closing brace by counting braces
      let braceCount = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < stdout.length; i++) {
        if (stdout[i] === "{") braceCount++;
        if (stdout[i] === "}") braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }

      if (jsonEnd === -1) {
        logger.debug(
          "Manager Gemini - Could not find matching closing brace",
          "manager",
        );
        return {
          success: false,
          superseded: 0,
          resolved: 0,
          linked: 0,
          filesRead: 0,
          filesWritten: 0,
          primerUpdated: false,
          actions: [],
          summary: "Manager Gemini - Incomplete JSON in Gemini response",
          fullReport:
            "Manager Gemini - Failed: Could not find complete JSON object",
        };
      }

      const jsonStr = stdout.slice(jsonStart, jsonEnd);
      logger.debug(
        `Manager Gemini - Extracted JSON (${jsonStr.length} chars)`,
        "manager",
      );

      const geminiOutput = JSON.parse(jsonStr);

      // Gemini returns { response: "...", stats: {...} }
      const aiResponse = geminiOutput.response || "";

      if (!aiResponse) {
        logger.debug("Manager Gemini - No response field in output", "manager");
        return {
          success: true,
          superseded: 0,
          resolved: 0,
          linked: 0,
          filesRead: 0,
          filesWritten: 0,
          primerUpdated: false,
          actions: [],
          summary: "Managetr Gemini - No response from Gemini",
          fullReport: "Management completed but no response returned",
        };
      }

      logger.debug(
        `Manager Gemini - Got response (${aiResponse.length} chars)`,
        "manager",
      );

      // Parse using our existing SDK parser (same format expected)
      const result = this._parseSDKManagementResult(aiResponse);
      logger.debug(
        `Manager Gemini - Parsed result - superseded: ${result.superseded}, resolved: ${result.resolved}, linked: ${result.linked}`,
        "manager",
      );
      return result;
    } catch (error: any) {
      logger.debug(`Manager Gemini - Parse error: ${error.message}`, "manager");
      logger.debug(
        `Manager Gemini - Raw stdout (first 500 chars): ${stdout.slice(0, 500)}`,
        "manager",
      );
      return {
        success: false,
        superseded: 0,
        resolved: 0,
        linked: 0,
        filesRead: 0,
        filesWritten: 0,
        primerUpdated: false,
        actions: [],
        summary: "",
        fullReport: `Manager Gemini - Error: Failed to parse Gemini response: ${error.message}`,
        error: error.message,
      };
    }
  }
}

/**
 * Create a new manager
 */
export function createManager(config?: ManagerConfig): Manager {
  return new Manager(config);
}
