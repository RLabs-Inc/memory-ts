// ============================================================================
// CLI INVOCATION DETECTION
// Detects how the CLI was invoked and returns the appropriate command
// to use for hook registration.
// ============================================================================

import { execSync } from "child_process";
import { resolve } from "path";

const PACKAGE_NAME = "@rlabs-inc/memory";

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect how the CLI was invoked and return the appropriate command
 * to use for spawning subprocesses (like hooks)
 */
export function getCliCommand(): string {
  const argv = process.argv;

  const executor = argv[0]?.toLowerCase() || "";
  const scriptPath = argv[1] || "";

  // Detect bunx invocation (script path contains bunx cache patterns)
  if (
    executor.includes("bun") &&
    (scriptPath.includes(".bun/install/cache") ||
      scriptPath.includes("x.bun.sh") ||
      process.env.BUN_WHICH_BIN?.includes("bunx"))
  ) {
    return `bunx ${PACKAGE_NAME}`;
  }

  // Detect npx invocation (script path contains npx cache patterns)
  if (
    (executor.includes("node") || executor.includes("npx")) &&
    (scriptPath.includes(".npm/_npx") || scriptPath.includes("npx-cache"))
  ) {
    return `npx ${PACKAGE_NAME}`;
  }

  // Detect direct bun execution (e.g., `bun src/cli/index.ts`)
  // If script path is a .ts file and not in a cache directory, it's direct execution
  if (
    executor.includes("bun") &&
    scriptPath.endsWith(".ts") &&
    !scriptPath.includes("node_modules") &&
    !scriptPath.includes(".bun")
  ) {
    const absoluteScriptPath = resolve(scriptPath);
    return `bun "${absoluteScriptPath}"`;
  }

  // Check if 'memory' command exists globally (via npm/bun global install)
  if (commandExists("memory")) {
    return "memory";
  }

  // Check if bun is available, prefer bunx
  if (commandExists("bun")) {
    return `bunx ${PACKAGE_NAME}`;
  }

  // Fall back to npx
  if (commandExists("npx")) {
    return `npx ${PACKAGE_NAME}`;
  }

  // Last resort - assume memory is available
  return "memory";
}

/**
 * Get the hook command for a specific hook type
 */
export function getHookCommand(
  hookType: "session-start" | "user-prompt" | "curation",
  platform: "claude" | "gemini",
): string {
  const baseCmd = getCliCommand();
  return `${baseCmd} hooks ${hookType} --${platform}`;
}
