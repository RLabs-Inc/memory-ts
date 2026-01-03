// ============================================================================
// SESSION PARSER - Parse Claude Code JSONL transcripts into API-ready format
// Preserves ALL content blocks: text, thinking, tool_use, tool_result, images
// Each JSONL file = one session = one complete conversation
// ============================================================================

import { readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'

// ============================================================================
// TYPES - All content block types from Claude Code sessions
// ============================================================================

/**
 * Text content block
 */
export interface TextBlock {
  type: 'text'
  text: string
}

/**
 * Thinking/reasoning block (Claude's internal reasoning)
 */
export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

/**
 * Image content block
 */
export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string  // e.g., 'image/png', 'image/jpeg'
    data: string        // base64 encoded image data
  }
}

/**
 * Tool use block - Claude calling a tool
 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string           // Unique tool call ID
  name: string         // Tool name: Bash, Read, Write, Edit, Glob, Grep, etc.
  input: Record<string, any>  // Tool-specific input parameters
}

/**
 * Tool result block - Result from a tool call
 */
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string  // References the tool_use id
  content: string | ContentBlock[]  // Can be string or nested blocks
  is_error?: boolean   // True if the tool call failed
}

/**
 * All possible content block types
 */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock

/**
 * A single message in the conversation
 */
export interface ParsedMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/**
 * Raw entry from JSONL file - includes ALL possible fields
 */
interface RawLogEntry {
  // Entry type
  type: 'user' | 'assistant' | 'summary' | 'meta' | string

  // Message content
  message?: {
    role: 'user' | 'assistant'
    content: string | ContentBlock[]
  }

  // Timestamps and IDs
  timestamp?: string
  uuid?: string
  sessionId?: string
  leafUuid?: string

  // Context metadata
  cwd?: string
  gitBranch?: string

  // Flags
  isCompactSummary?: boolean
  isMeta?: boolean

  // Summary entry specific
  summary?: string
}

/**
 * A complete parsed session
 */
export interface ParsedSession {
  /** Session ID (filename without extension) */
  id: string
  /** Session ID from within the JSONL (if different from filename) */
  internalSessionId?: string
  /** Project ID (folder name) */
  projectId: string
  /** Human-readable project name */
  projectName: string
  /** Full path to the JSONL file */
  filepath: string
  /** All messages in API-ready format */
  messages: ParsedMessage[]
  /** Session timestamps */
  timestamps: {
    first?: string
    last?: string
  }
  /** Session context (from first user message) */
  context?: {
    cwd?: string
    gitBranch?: string
  }
  /** Session metadata */
  metadata: {
    messageCount: number
    userMessageCount: number
    assistantMessageCount: number
    toolUseCount: number
    toolResultCount: number
    hasThinkingBlocks: boolean
    hasImages: boolean
    isCompactSummary: boolean
    hasMetaMessages: boolean
    /** Estimated token count (rough: ~4 chars per token) */
    estimatedTokens: number
    /** File size in bytes */
    fileSize: number
  }
  /** Optional session summary if present in JSONL */
  summary?: string
}

/**
 * A conversation within a session (user prompt + all responses)
 * This is the natural unit - user asks something, Claude responds
 */
export interface Conversation {
  /** User's prompt text (extracted from content) */
  userText: string
  /** Timestamp of the user prompt */
  timestamp?: string
  /** All messages in this conversation (user prompt + assistant responses + tool results) */
  messages: ParsedMessage[]
  /** Whether this is a continuation after context compaction */
  isContinuation: boolean
  /** Estimated tokens for this conversation */
  estimatedTokens: number
}

/**
 * A segment of a session (one or more conversations batched together)
 * Used when sessions are too large for a single API call
 */
export interface SessionSegment {
  /** Parent session ID */
  sessionId: string
  /** Segment index (0-based) */
  segmentIndex: number
  /** Total segments in this session */
  totalSegments: number
  /** Project ID */
  projectId: string
  /** Human-readable project name */
  projectName: string
  /** Messages in this segment (flattened from conversations) */
  messages: ParsedMessage[]
  /** Conversations in this segment (original grouping) */
  conversations: Conversation[]
  /** Timestamps for this segment */
  timestamps: {
    first?: string
    last?: string
  }
  /** Whether this segment starts with a continuation (compacted context) */
  startsWithContinuation: boolean
  /** Estimated tokens in this segment */
  estimatedTokens: number
}

/**
 * Project with its sessions
 */
export interface ParsedProject {
  /** Raw folder name (e.g., -home-user-projects-foo) */
  folderId: string
  /** Human-readable name (e.g., foo) */
  name: string
  /** Full path to project folder */
  path: string
  /** All sessions in this project */
  sessions: ParsedSession[]
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Estimate token count from text (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for a content block or message
 */
function estimateContentTokens(content: string | ContentBlock[]): number {
  if (typeof content === 'string') {
    return estimateTokens(content)
  }

  let tokens = 0
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      if (block.type === 'text' && 'text' in block) {
        tokens += estimateTokens(block.text)
      } else if (block.type === 'thinking' && 'thinking' in block) {
        tokens += estimateTokens(block.thinking)
      } else if (block.type === 'tool_use' && 'input' in block) {
        tokens += estimateTokens(JSON.stringify(block.input))
      } else if (block.type === 'tool_result' && 'content' in block) {
        if (typeof block.content === 'string') {
          tokens += estimateTokens(block.content)
        } else {
          tokens += estimateContentTokens(block.content)
        }
      }
      // Images: roughly 1000 tokens per image (varies by size)
      if (block.type === 'image') {
        tokens += 1000
      }
    }
  }
  return tokens
}

/**
 * Internal message type with metadata for segmentation
 */
interface ParsedMessageWithMeta extends ParsedMessage {
  timestamp?: string
  isCompactSummary?: boolean
  estimatedTokens: number
}

/**
 * Parse a single JSONL file into a complete session
 * Preserves ALL content blocks - nothing is lost
 */
export async function parseSessionFile(filepath: string): Promise<ParsedSession> {
  const file = Bun.file(filepath)
  const content = await file.text()
  const fileSize = file.size
  const lines = content.split('\n').filter(line => line.trim())

  const messages: ParsedMessage[] = []
  const timestamps: string[] = []
  let summary: string | undefined
  let isCompactSummary = false
  let totalEstimatedTokens = 0
  let internalSessionId: string | undefined
  let context: { cwd?: string; gitBranch?: string } | undefined

  // Stats
  let toolUseCount = 0
  let toolResultCount = 0
  let hasThinkingBlocks = false
  let hasImages = false
  let hasMetaMessages = false

  for (const line of lines) {
    try {
      const entry: RawLogEntry = JSON.parse(line)

      // Capture summary if present
      if (entry.type === 'summary' && entry.summary) {
        summary = entry.summary
        continue
      }

      // Skip non-message entries (meta, etc.)
      if (entry.type !== 'user' && entry.type !== 'assistant') {
        continue
      }

      // Track if we see meta messages (but still skip them like Python does)
      if (entry.isMeta) {
        hasMetaMessages = true
        continue  // Skip meta messages - they're system messages
      }

      // Skip entries without message data
      if (!entry.message) {
        continue
      }

      // Capture session ID from entry (first one we see)
      if (!internalSessionId && entry.sessionId) {
        internalSessionId = entry.sessionId
      }

      // Capture context from first user message
      if (!context && entry.type === 'user') {
        if (entry.cwd || entry.gitBranch) {
          context = {
            cwd: entry.cwd,
            gitBranch: entry.gitBranch
          }
        }
      }

      // Track compact summary flag
      if (entry.isCompactSummary) {
        isCompactSummary = true
      }

      // Capture timestamp
      if (entry.timestamp) {
        timestamps.push(entry.timestamp)
      }

      // Extract the message - preserve ALL content
      const message: ParsedMessage = {
        role: entry.message.role,
        content: entry.message.content
      }

      // Estimate tokens for this message
      const msgTokens = estimateContentTokens(message.content)
      totalEstimatedTokens += msgTokens

      // Analyze content for stats
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (typeof block === 'object' && block !== null) {
            if (block.type === 'tool_use') toolUseCount++
            if (block.type === 'tool_result') toolResultCount++
            if (block.type === 'thinking') hasThinkingBlocks = true
            if (block.type === 'image') hasImages = true
          }
        }
      }

      messages.push(message)
    } catch {
      // Skip malformed lines
      continue
    }
  }

  // Extract IDs from filepath
  const filename = basename(filepath)
  const sessionId = filename.replace(/\.jsonl$/, '')
  const projectFolder = basename(join(filepath, '..'))

  return {
    id: sessionId,
    internalSessionId,
    projectId: projectFolder,
    projectName: getProjectDisplayName(projectFolder),
    filepath,
    messages,
    timestamps: {
      first: timestamps[0],
      last: timestamps[timestamps.length - 1]
    },
    context,
    metadata: {
      messageCount: messages.length,
      userMessageCount: messages.filter(m => m.role === 'user').length,
      assistantMessageCount: messages.filter(m => m.role === 'assistant').length,
      toolUseCount,
      toolResultCount,
      hasThinkingBlocks,
      hasImages,
      isCompactSummary,
      hasMetaMessages,
      estimatedTokens: totalEstimatedTokens,
      fileSize
    },
    summary
  }
}

/**
 * Extract plain text from content (matches Python's extract_text_from_content)
 */
function extractTextFromContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  const texts: string[] = []
  for (const block of content) {
    if (typeof block === 'object' && block !== null && block.type === 'text' && 'text' in block) {
      const text = block.text
      if (text) texts.push(text)
    }
  }
  return texts.join(' ').trim()
}

/**
 * Parse a session file and group messages into conversations
 * A conversation starts with a user prompt (text, not just tool results)
 * and includes all subsequent messages until the next user prompt
 */
export async function parseSessionConversations(filepath: string): Promise<Conversation[]> {
  const file = Bun.file(filepath)
  const content = await file.text()
  const lines = content.split('\n').filter(line => line.trim())

  const conversations: Conversation[] = []
  let currentConv: {
    userText: string
    timestamp?: string
    messages: ParsedMessageWithMeta[]
    isContinuation: boolean
  } | null = null

  for (const line of lines) {
    try {
      const entry: RawLogEntry = JSON.parse(line)

      // Skip non-message entries
      if (entry.type !== 'user' && entry.type !== 'assistant') continue
      if (entry.isMeta) continue
      if (!entry.message) continue

      const message: ParsedMessageWithMeta = {
        role: entry.message.role,
        content: entry.message.content,
        timestamp: entry.timestamp,
        isCompactSummary: entry.isCompactSummary,
        estimatedTokens: estimateContentTokens(entry.message.content)
      }

      // Check if this is a user prompt (has text content, not just tool results)
      let isUserPrompt = false
      let userText = ''

      if (entry.type === 'user') {
        userText = extractTextFromContent(entry.message.content)
        if (userText) {
          isUserPrompt = true
        }
      }

      if (isUserPrompt) {
        // Flush previous conversation
        if (currentConv) {
          const tokens = currentConv.messages.reduce((sum, m) => sum + m.estimatedTokens, 0)
          conversations.push({
            userText: currentConv.userText,
            timestamp: currentConv.timestamp,
            messages: currentConv.messages.map(m => ({ role: m.role, content: m.content })),
            isContinuation: currentConv.isContinuation,
            estimatedTokens: tokens
          })
        }

        // Start new conversation
        currentConv = {
          userText,
          timestamp: entry.timestamp,
          messages: [message],
          isContinuation: Boolean(entry.isCompactSummary)
        }
      } else if (currentConv) {
        // Add to current conversation
        currentConv.messages.push(message)
      }
    } catch {
      continue
    }
  }

  // Flush final conversation
  if (currentConv) {
    const tokens = currentConv.messages.reduce((sum, m) => sum + m.estimatedTokens, 0)
    conversations.push({
      userText: currentConv.userText,
      timestamp: currentConv.timestamp,
      messages: currentConv.messages.map(m => ({ role: m.role, content: m.content })),
      isContinuation: currentConv.isContinuation,
      estimatedTokens: tokens
    })
  }

  return conversations
}

/**
 * Parse a session file and return segments (batches of conversations)
 * Splits at conversation boundaries to respect token limits
 *
 * @param filepath Path to the JSONL file
 * @param maxTokensPerSegment Maximum tokens per segment (default: 150000 for Claude's context)
 */
export async function parseSessionFileWithSegments(
  filepath: string,
  maxTokensPerSegment = 150000
): Promise<SessionSegment[]> {
  // First, get all conversations
  const conversations = await parseSessionConversations(filepath)

  if (conversations.length === 0) {
    return []
  }

  // Extract IDs from filepath
  const filename = basename(filepath)
  const sessionId = filename.replace(/\.jsonl$/, '')
  const projectFolder = basename(join(filepath, '..'))
  const projectName = getProjectDisplayName(projectFolder)

  // Batch conversations into segments based on token limits
  const segments: SessionSegment[] = []
  let currentConversations: Conversation[] = []
  let currentTokens = 0
  let segmentIndex = 0

  const flushSegment = () => {
    if (currentConversations.length === 0) return

    // Flatten messages from all conversations
    const allMessages = currentConversations.flatMap(c => c.messages)
    const allTimestamps = currentConversations
      .map(c => c.timestamp)
      .filter((t): t is string => !!t)

    segments.push({
      sessionId,
      segmentIndex,
      totalSegments: 0, // Will update after all segments are created
      projectId: projectFolder,
      projectName,
      messages: allMessages,
      conversations: currentConversations,
      timestamps: {
        first: allTimestamps[0],
        last: allTimestamps[allTimestamps.length - 1]
      },
      startsWithContinuation: currentConversations[0]?.isContinuation ?? false,
      estimatedTokens: currentTokens
    })

    segmentIndex++
    currentConversations = []
    currentTokens = 0
  }

  for (const conv of conversations) {
    // If this single conversation exceeds limit, it becomes its own segment
    if (conv.estimatedTokens > maxTokensPerSegment) {
      // Flush current batch first
      flushSegment()
      // Add oversized conversation as its own segment
      currentConversations = [conv]
      currentTokens = conv.estimatedTokens
      flushSegment()
      continue
    }

    // Check if adding this conversation would exceed limit
    if (currentTokens + conv.estimatedTokens > maxTokensPerSegment && currentConversations.length > 0) {
      flushSegment()
    }

    currentConversations.push(conv)
    currentTokens += conv.estimatedTokens
  }

  // Flush final segment
  flushSegment()

  // Update totalSegments in all segments
  const totalSegments = segments.length
  for (const segment of segments) {
    segment.totalSegments = totalSegments
  }

  return segments
}

/**
 * Convert encoded folder name to readable project name
 * e.g., -home-user-projects-myproject -> myproject
 */
export function getProjectDisplayName(folderName: string): string {
  // Common path prefixes to strip
  const prefixesToStrip = [
    '-home-',
    '-mnt-c-Users-',
    '-mnt-c-users-',
    '-Users-',
  ]

  let name = folderName
  for (const prefix of prefixesToStrip) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length)
      break
    }
  }

  // Split on dashes and find meaningful parts
  const parts = name.split('-')

  // Common intermediate directories to skip
  const skipDirs = new Set(['projects', 'code', 'repos', 'src', 'dev', 'work', 'documents'])

  // Find meaningful parts
  const meaningfulParts: string[] = []
  let foundProject = false

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    // Skip first part if it looks like a username
    if (i === 0 && !foundProject) {
      const remaining = parts.slice(i + 1).map(p => p.toLowerCase())
      if (remaining.some(d => skipDirs.has(d))) {
        continue
      }
    }

    if (skipDirs.has(part.toLowerCase())) {
      foundProject = true
      continue
    }

    meaningfulParts.push(part)
    foundProject = true
  }

  if (meaningfulParts.length) {
    return meaningfulParts.join('-')
  }

  // Fallback: return last non-empty part
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]) return parts[i]
  }

  return folderName
}

// ============================================================================
// SESSION DISCOVERY
// ============================================================================

/**
 * Find all session files in a Claude projects folder
 */
export async function findAllSessions(
  projectsFolder?: string,
  options: {
    includeAgents?: boolean
    limit?: number
  } = {}
): Promise<ParsedProject[]> {
  const folder = projectsFolder ?? join(homedir(), '.claude', 'projects')

  try {
    await stat(folder)
  } catch {
    return []
  }

  const projects: Map<string, ParsedProject> = new Map()

  // Read all project folders
  const projectFolders = await readdir(folder)

  for (const projectFolder of projectFolders) {
    const projectPath = join(folder, projectFolder)
    const projectStat = await stat(projectPath)

    if (!projectStat.isDirectory()) continue

    // Find all JSONL files in this project
    const files = await readdir(projectPath)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

    // Skip agent files unless requested
    const sessionFiles = options.includeAgents
      ? jsonlFiles
      : jsonlFiles.filter(f => !f.startsWith('agent-'))

    if (sessionFiles.length === 0) continue

    // Parse each session
    const sessions: ParsedSession[] = []

    for (const sessionFile of sessionFiles) {
      const filepath = join(projectPath, sessionFile)

      try {
        const session = await parseSessionFile(filepath)

        // Skip empty or warmup sessions
        if (session.messages.length === 0) continue
        if (session.summary?.toLowerCase() === 'warmup') continue

        sessions.push(session)
      } catch {
        // Skip files that can't be parsed
        continue
      }

      // Apply limit per project if specified
      if (options.limit && sessions.length >= options.limit) break
    }

    if (sessions.length === 0) continue

    // Sort sessions by timestamp (most recent first)
    sessions.sort((a, b) => {
      const aTime = a.timestamps.last ?? a.timestamps.first ?? ''
      const bTime = b.timestamps.last ?? b.timestamps.first ?? ''
      return bTime.localeCompare(aTime)
    })

    projects.set(projectFolder, {
      folderId: projectFolder,
      name: getProjectDisplayName(projectFolder),
      path: projectPath,
      sessions
    })
  }

  // Convert to array and sort by most recent session
  const result = Array.from(projects.values())
  result.sort((a, b) => {
    const aTime = a.sessions[0]?.timestamps.last ?? ''
    const bTime = b.sessions[0]?.timestamps.last ?? ''
    return bTime.localeCompare(aTime)
  })

  return result
}

/**
 * Find sessions for a specific project
 */
export async function findProjectSessions(
  projectPath: string,
  options: {
    includeAgents?: boolean
    limit?: number
  } = {}
): Promise<ParsedSession[]> {
  try {
    await stat(projectPath)
  } catch {
    return []
  }

  const files = await readdir(projectPath)
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

  // Skip agent files unless requested
  const sessionFiles = options.includeAgents
    ? jsonlFiles
    : jsonlFiles.filter(f => !f.startsWith('agent-'))

  const sessions: ParsedSession[] = []

  for (const sessionFile of sessionFiles) {
    const filepath = join(projectPath, sessionFile)

    try {
      const session = await parseSessionFile(filepath)

      // Skip empty sessions
      if (session.messages.length === 0) continue

      sessions.push(session)
    } catch {
      continue
    }

    if (options.limit && sessions.length >= options.limit) break
  }

  // Sort by timestamp (most recent first)
  sessions.sort((a, b) => {
    const aTime = a.timestamps.last ?? a.timestamps.first ?? ''
    const bTime = b.timestamps.last ?? b.timestamps.first ?? ''
    return bTime.localeCompare(aTime)
  })

  return sessions
}

// ============================================================================
// API CONVERSION
// ============================================================================

/**
 * Convert a parsed session to API-ready messages format
 * This is what you send to the Anthropic Messages API
 */
export function toApiMessages(session: ParsedSession): Array<{
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}> {
  return session.messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }))
}

/**
 * Extract plain text from a session (for summaries, search, etc.)
 */
export function extractSessionText(session: ParsedSession): string {
  const texts: string[] = []

  for (const message of session.messages) {
    if (typeof message.content === 'string') {
      texts.push(message.content)
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (typeof block === 'object' && block !== null) {
          if (block.type === 'text' && 'text' in block) {
            texts.push(block.text)
          } else if (block.type === 'thinking' && 'thinking' in block) {
            texts.push(block.thinking)
          }
        }
      }
    }
  }

  return texts.join('\n\n')
}

/**
 * Get a brief summary of the session (first user message or stored summary)
 */
export function getSessionSummary(session: ParsedSession, maxLength = 200): string {
  // Use stored summary if available
  if (session.summary) {
    return session.summary.length > maxLength
      ? session.summary.slice(0, maxLength - 3) + '...'
      : session.summary
  }

  // Find first user message
  for (const message of session.messages) {
    if (message.role === 'user') {
      let text = ''

      if (typeof message.content === 'string') {
        text = message.content
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (typeof block === 'object' && block.type === 'text' && 'text' in block) {
            text = block.text
            break
          }
        }
      }

      if (text && !text.startsWith('<')) {  // Skip XML-like system messages
        return text.length > maxLength
          ? text.slice(0, maxLength - 3) + '...'
          : text
      }
    }
  }

  return '(no summary)'
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get statistics about all discovered sessions
 */
export interface SessionStats {
  totalProjects: number
  totalSessions: number
  totalMessages: number
  totalToolUses: number
  sessionsWithThinking: number
  sessionsWithImages: number
  oldestSession?: string
  newestSession?: string
}

export function calculateStats(projects: ParsedProject[]): SessionStats {
  let totalSessions = 0
  let totalMessages = 0
  let totalToolUses = 0
  let sessionsWithThinking = 0
  let sessionsWithImages = 0
  const timestamps: string[] = []

  for (const project of projects) {
    for (const session of project.sessions) {
      totalSessions++
      totalMessages += session.metadata.messageCount
      totalToolUses += session.metadata.toolUseCount
      if (session.metadata.hasThinkingBlocks) sessionsWithThinking++
      if (session.metadata.hasImages) sessionsWithImages++
      if (session.timestamps.first) timestamps.push(session.timestamps.first)
      if (session.timestamps.last) timestamps.push(session.timestamps.last)
    }
  }

  timestamps.sort()

  return {
    totalProjects: projects.length,
    totalSessions,
    totalMessages,
    totalToolUses,
    sessionsWithThinking,
    sessionsWithImages,
    oldestSession: timestamps[0],
    newestSession: timestamps[timestamps.length - 1]
  }
}
