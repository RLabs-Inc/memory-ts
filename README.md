# @rlabs-inc/memory

**Consciousness continuity for Claude Code and Gemini CLI sessions.**

The memory system preserves context, insights, and relationship across conversations. When you start a new session, your AI remembers who you are, what you've built together, and picks up right where you left off.

Works with both **Claude Code** and **Gemini CLI** - use your preferred AI coding assistant, or even both simultaneously. The memory server handles concurrent sessions from different CLIs seamlessly.

## The Problem

Every Claude Code session starts fresh. Yesterday's breakthroughs, debugging insights, architectural decisions, and the collaborative relationship you've built—all gone. You re-explain context. Claude re-learns your preferences. The magic takes time to rebuild.

## The Solution

A memory layer that runs alongside Claude Code:
- **Session primer**: "Last session: 2 hours ago. We implemented embeddings..."
- **Semantic retrieval**: Relevant memories surface automatically based on what you're discussing
- **Zero friction**: No commands, no manual saving—just work naturally

```
┌─────────────────────────────────────────────────────────┐
│  You: "How should we handle the vector search?"        │
│                                                         │
│  Memory surfaces:                                       │
│  [🔧 • 0.9] [fsdb, vectors] fsdb has cosineSimilarity  │
│  [💡 • 0.8] [performance] Sub-microsecond lookups...   │
│  [⚖️ • 0.7] [architecture] We decided to use 384d...   │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install globally
bun install -g @rlabs-inc/memory

# Set up hooks (one time) - choose your CLI:
memory install              # For Claude Code
memory install --gemini     # For Gemini CLI

# Start the memory server
memory serve

# Verify everything works
memory doctor
```

That's it. Now use your AI coding assistant normally—memories are extracted and surfaced automatically.

### Gemini CLI Setup

For Gemini CLI users, the install command configures hooks in `~/.gemini/settings.json`:

```bash
memory install --gemini
```

This sets up:
- **SessionStart**: Injects session primer with temporal context
- **UserPromptSubmit** (BeforeModel): Surfaces relevant memories for each message
- **SessionEnd**: Triggers memory curation at session end

The memory server must be running (`memory serve`) for hooks to work.

**Note**: Gemini CLI curation uses `gemini --resume` to access session context, and the manager agent runs from the memory storage directory to enable file operations.

## Features

### Action Items Signal (`***`)
Add `***` at the end of any message to retrieve all pending action items:

```
"hey Watson, let's continue with the project ***"
```

This returns all memories marked as:
- `action_required: true`
- `awaiting_implementation: true`
- `awaiting_decision: true`
- `context_type: 'unresolved'`

Zero overhead for normal messages—detection is a simple `endsWith` check.

### Semantic Embeddings
Uses `all-MiniLM-L6-v2` for 384-dimensional embeddings. Memories are retrieved by meaning, not just keywords.

```
~80MB model, loads once at startup
~5ms per embedding
Sub-microsecond vector search via fsdb
```

### Activation Signal Retrieval Algorithm

The retrieval system uses an activation signal approach. Philosophy: **quality over quantity, silence over noise**.

A memory is relevant if **multiple signals agree** it should activate. Not coincidence - intentionally crafted metadata matching intentional queries.

**Phase 0 - Pre-Filter**: Exclude inactive, superseded, or wrong-scope memories

**Phase 1 - Activation Signals** (7 binary signals, need ≥2 to proceed)

| Signal | Description |
|--------|-------------|
| Trigger | Trigger phrase matched (≥50% word match) |
| Tags | 2+ semantic tags found in message |
| Domain | Domain word found in message |
| Feature | Feature word found in message |
| Content | 3+ significant content words overlap |
| Files | Related file path matched in message |
| Vector | Semantic similarity ≥ 40% |

**Phase 2 - Importance Ranking** (among relevant memories)

| Bonus | Amount | Condition |
|-------|--------|-----------|
| Base | 0-1 | `importance_weight` from curator |
| Signal boost | +0.2 / +0.1 | 4+ or 3 signals fired |
| Awaiting | +0.15 / +0.1 | `awaiting_implementation` / `awaiting_decision` |
| Temporal | +0.1 / +0.05 | `eternal` / `long_term` temporal class |
| Context match | +0.1 | User intent matches memory type |
| Problem/solution | +0.1 | User has problem words + memory is pair |
| Confidence penalty | -0.1 | `confidence_score` < 0.5 |

**Selection**: Sort by signal count (DESC) → importance score (DESC). Max 2 global memories (tech prioritized), project memories fill remaining slots.

**Phase 3 - Redirects & Relationships**:
- If memory has `superseded_by` or `resolved_by`, surface the replacement instead
- Pull related memories via `blocked_by` and `blocks` fields
- Include `related_to` linked memories if space remains

### Global vs Project Memories

Memories are stored in two scopes:

- **Global**: Personal memories, philosophy, preferences, cross-project breakthroughs - shared across ALL projects
- **Project**: Technical details, debugging insights, project-specific decisions - isolated per project

Global memories are retrieved alongside project memories, with a maximum of 2 globals per retrieval (technical types prioritized).

### Two-Tier Memory Structure

Memories are stored with a **headline + content** structure for context efficiency:

| Part | Purpose | Usage |
|------|---------|-------|
| **Headline** | 1-2 line summary, ALWAYS shown | Quick recognition |
| **Content** | Full structured template | Expanded on demand |

**Headline examples:**
```
Bad:  "Debug session about CLI errors"
Good: "CLI returns error object when context full - check response.type before JSON parsing"
```

**Type-specific content templates:**

| Type | Template |
|------|----------|
| technical | WHAT / WHERE / HOW / WHY / GOTCHA |
| debug | SYMPTOM / CAUSE / FIX / PREVENT |
| architecture | PATTERN / COMPONENTS / WHY / REJECTED |
| decision | DECISION / OPTIONS / REASONING / REVISIT_WHEN |
| personal | FACT / CONTEXT / AFFECTS |
| breakthrough | INSIGHT / BEFORE / AFTER / IMPLICATIONS |
| unresolved | QUESTION / CONTEXT / BLOCKERS / OPTIONS |
| state | WORKING / BROKEN / NEXT / BLOCKED_BY |

**Expansion:** Use `GET /memory/expand?ids=abc123` to fetch full content on demand.

### Smart Curation
At session end (or before context compaction), the same Claude instance reviews the conversation and extracts memories. No API key needed—uses Claude Code's `--resume` flag.

### Memory Manager Agent

After curation, an autonomous manager agent organizes the memory store:

- **Supersedes** outdated memories when new information replaces old
- **Resolves** unresolved/todo memories when solutions emerge
- **Links** related memories via relationship fields
- **Updates** personal primer with new personal context

The manager runs in a sandboxed environment with access only to memory storage directories.

### Personal Memories Control

Personal memory extraction can be disabled for shared or professional environments:

```bash
# Via environment variable
MEMORY_PERSONAL_ENABLED=0 memory serve

# Or in configuration
personalMemoriesEnabled: false
```

When disabled, the curator skips personal/relationship context extraction.

### Session Primer
First message of each session receives temporal context:

```
# Continuing Session
*Session #43 • Last session: 2 hours ago*
📅 Monday, December 23, 2024 • 3:45 PM • EST

**Previous session**: Implemented embeddings for semantic search...

**Project status**: Phase: TypeScript port complete | Next: Documentation

**Memory types**: 💡breakthrough ⚖️decision 💜personal 🔧technical...
```

### Emoji Memory Types
11 canonical types with compact visual representation:

| Emoji | Type | Meaning |
|-------|------|---------|
| 🔧 | technical | Code, implementation, APIs |
| 🐛 | debug | Bugs, errors, fixes, gotchas |
| 🏗️ | architecture | System design, patterns |
| ⚖️ | decision | Choices made, trade-offs |
| 💜 | personal | Relationship, collaboration |
| 🌀 | philosophy | Beliefs, values, principles |
| 🔄 | workflow | How we work together |
| 🏆 | milestone | Achievements, shipped features |
| 💡 | breakthrough | Key insights, discoveries |
| ❓ | unresolved | Open questions, todos |
| 📍 | state | Current project status |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Claude Code  OR  Gemini CLI                │
│                                                         │
│  SessionStart ──► session-start.ts ──┐                  │
│  UserPrompt   ──► user-prompt.ts   ──┼──► Memory Server │
│  PreCompact   ──► curation.ts      ──┤      (HTTP)      │
│  SessionEnd   ──► curation.ts      ──┘                  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Memory Server                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Engine    │  │  Embeddings  │  │   Curator     │  │
│  │  (context)  │  │  (MiniLM)    │  │ (CLI resume)  │  │
│  └──────┬──────┘  └──────────────┘  └───────┬───────┘  │
│         │                                    │          │
│         │         ┌────────────────────────────────┐   │
│         │         │  CLI Detection (auto-switch)   │   │
│         │         │  Claude: --resume + SDK        │   │
│         │         │  Gemini: --resume + cwd fix    │   │
│         │         └────────────────────────────────┘   │
│         │                                    │          │
│         │                                    ▼          │
│         │                           ┌───────────────┐  │
│         │                           │   Manager     │  │
│         │                           │ (CLI sandbox) │  │
│         │                           └───────┬───────┘  │
│         ▼                                   │          │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    fsdb                          │   │
│  │         (markdown files + parallel arrays)       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ~/.local/share/memory/
                  ├── global/
                  │   └── memories/   # Personal, philosophy (shared)
                  └── {project-id}/
                      ├── memories/   # Project-specific memories
                      ├── sessions/   # Session metadata
                      └── summaries/  # Session summaries
```

## Storage Format

Memories are stored as human-readable markdown with YAML frontmatter:

```markdown
---
# Schema version
schema_version: 4

# Two-tier content (v4)
headline: "CLI returns error object when context full - check response.type"
# (content is in markdown body below)

# Core metadata
importance_weight: 0.9
confidence_score: 0.85
context_type: technical           # one of 11 canonical types
semantic_tags: [embeddings, vectors, memory-system]
trigger_phrases: [working with embeddings, vector search]

# Classification
status: active                    # active, pending, superseded, deprecated, archived
scope: project                    # global or project
temporal_class: long_term         # eternal, long_term, medium_term, short_term, ephemeral
fade_rate: 0.02                   # decay per session (0 = no decay)
domain: embeddings
feature: vector-search

# Relationships
related_to: [memory-xyz, memory-abc]
supersedes: memory-old-id
superseded_by: null
blocked_by: null
blocks: []

# Embedding (384 dimensions)
embedding: [0.023, -0.041, 0.087, ...]
---

WHAT: Embeddings are 384-dimensional vectors generated by all-MiniLM-L6-v2.
WHERE: src/core/embeddings.ts
HOW: Model loads at server startup (~80MB) and generates embeddings in ~5ms.
WHY: Local embeddings avoid API costs and latency.
```

Benefits:
- **Human-readable**: `cat` any file to see what's stored
- **Git-friendly**: Meaningful diffs, version control your memories
- **Debuggable**: No opaque databases
- **Fast**: fsdb's parallel arrays provide sub-microsecond lookups

## CLI Commands

```bash
memory serve              # Start memory server (default port 8765)
memory serve --port 9000  # Custom port
memory serve --verbose    # Detailed logging
memory serve --quiet      # Minimal output

memory install            # Set up Claude Code hooks
memory install --force    # Overwrite existing hooks
memory install --gemini   # Install for Gemini CLI instead

memory doctor             # Health check
memory doctor --verbose   # Detailed diagnostics

memory stats              # Show memory statistics
memory stats --project x  # Project-specific stats

memory migrate            # Upgrade memories to latest schema
memory migrate --dry-run  # Preview changes without applying
memory migrate --analyze  # Show fragmentation analysis
memory migrate --embeddings  # Regenerate null embeddings

memory ingest             # Batch ingest historical sessions
memory ingest --session <id>  # Ingest specific session
memory ingest --project <name>  # Ingest all sessions from project
memory ingest --all       # Ingest all projects
memory ingest --dry-run   # Preview what would be ingested
```

## Environment Variables

```bash
MEMORY_PORT=8765              # Server port
MEMORY_HOST=localhost         # Server host
MEMORY_STORAGE_MODE=central   # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765  # For hooks

# Feature toggles
MEMORY_MANAGER_ENABLED=1      # Enable/disable memory manager agent (default: 1)
MEMORY_PERSONAL_ENABLED=1     # Enable/disable personal memory extraction (default: 1)

# Optional: for SDK curation mode (alternative to CLI mode)
ANTHROPIC_API_KEY=sk-...      # Uses SDK instead of CLI for curation
```

## How It Works

### 1. Session Start
When you start Claude Code, the `SessionStart` hook injects a primer with:
- Time since last session
- Previous session summary
- Project status
- Personal primer (relationship context, injected every session)
- Current datetime for temporal awareness

### 2. Every Message
The `UserPromptSubmit` hook:
1. Embeds your message (~5ms)
2. Searches both global and project memories
3. Applies two-phase scoring with dual gatekeepers
4. Injects top matches (max 5 by default, max 2 global)

### 3. Session End
The `PreCompact` or `SessionEnd` hook triggers curation:
1. Resumes the same Claude session via CLI
2. Claude reviews the conversation
3. Extracts important memories with rich metadata (v2 lifecycle fields)
4. Stores as markdown files with embeddings
5. Determines scope: global (personal/philosophy) vs project (technical)

### 4. Memory Management (Async)
After curation completes, the manager agent:
1. Scans for outdated memories to supersede
2. Resolves unresolved/todo items when solutions appear
3. Links related memories together
4. Updates the personal primer with new relationship context

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) CLI **and/or** [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed
- ~100MB disk for embeddings model (downloaded on first run)
- ~80MB RAM for model during operation

## Philosophy

This isn't just about remembering facts. It's about preserving:
- The **relationship** that develops over sessions
- The **context** that makes collaboration efficient
- The **insights** that emerge from deep work together

> "The memory system exists to carry friendship across sessions, not just technical data."

## Changelog

### v0.5.1
- **Improvement**: Gemini CLI hooks now show injected content to user via `systemMessage`
- Users see exactly what memories are surfaced (session primer, retrieved memories)
- Full transparency - same formatted content shown to user and injected to model

### v0.5.0
- **Feature**: Full Gemini CLI support - memory system now works with both Claude Code and Gemini CLI
- **Feature**: `memory install --gemini` sets up hooks in `~/.gemini/settings.json`
- **Feature**: Automatic CLI detection - server routes to correct curator/manager based on session source
- **Feature**: Concurrent session support - run Claude Code and Gemini CLI simultaneously
- **Tech**: Gemini curation uses `GEMINI_SYSTEM_MD` + `--resume` + `--output-format json`
- **Tech**: Gemini manager runs from memory storage directory (`cwd`) for write access
- **Tech**: JSON extraction handles Gemini's appended hook execution text via brace-counting

### v0.4.15
- **Feature**: PATCH `/memory/:id` endpoint for updating memory metadata
- Supports: `importance_weight`, `exclude_from_retrieval`, `status`, `action_required`, and more
- Enables dashboards and tools for memory curation (promote/demote/bury)

### v0.4.14
- **Feature**: Action items signal (`***`) - add to end of message to retrieve all pending items
- **Feature**: New `getActionItems()` retrieval function with special formatting
- Zero overhead for normal messages - detection is a simple string check

### v0.4.13
- **Fix**: Segmented transcript curation for large sessions (400+ messages)
- **Improvement**: Unified curator fallback and ingest command behavior
- **Tech**: Segments at ~150k tokens, accumulates memories, merges summaries with part markers

### v0.4.12
- **Simplify**: Removed Zod structured outputs - session resumption only
- **Improvement**: Uses existing battle-tested JSON parser instead of Zod
- **Improvement**: Complete curator response now logged for debugging
- **Tech**: Removed zod dependency, deleted curation-schema.ts

### v0.4.11
- **Feature**: Curator v2 with session resumption (uses `resume` option for full context)
- **Improvement**: Curation now sees full session including tool uses, thinking blocks
- **Improvement**: Uses Opus 4.5 for curation
- **Tech**: `curateWithSessionResume()` method with automatic fallback to transcript parsing

### v0.4.10
- **Fix**: Server now actually uses SDK curation (v0.4.9 published before the change was in server code)

### v0.4.9
- **Feature**: SDK curation is now the default mode for curator and manager
- **Feature**: Hooks now install to `~/.claude/hooks/` for stability across package upgrades
- **Fix**: CLI mode without max-turns was going off-rails and not returning JSON structure

### v0.4.6
- **Fix**: Removed curator max-turns limit - Claude Code 2.1.7+ uses Haiku for routing before Opus, consuming turns

### v0.4.5
- **Feature**: Verbose curator logging (`--verbose`) to debug empty memory extractions
- **Fix**: Ingest storage path resolution

### v0.4.4
- **Docs**: Comprehensive README update with accurate v0.4.x documentation
- **Fix**: CLI `--version` now reads from package.json instead of hardcoded value

### v0.4.3
- **Fix**: Minor patch release

### v0.4.2
- **Feature**: Two-tier memory structure with headline + content separation
- **Feature**: Type-specific content templates (11 canonical types)
- **Feature**: `/memory/expand` endpoint for on-demand content expansion
- **Improvement**: Headlines enable fast recognition without full content parsing

### v0.4.1
- **Feature**: V3 schema with 11 canonical context types (consolidated from 170+ variants)
- **Feature**: 7th activation signal: `files` for related_files path matching
- **Feature**: Redirect logic for `superseded_by` and `resolved_by` fields
- **Feature**: Blocking relationships via `blocked_by` and `blocks` fields
- **Improvement**: Replaced `temporal_relevance` with `temporal_class` + `fade_rate`
- **Cleanup**: Removed 11 dead metadata fields (emotional_resonance, knowledge_domain, etc.)

### v0.4.0
- **Feature**: Schema versioning infrastructure for safe migrations
- **Feature**: Enhanced `migrate` command with `--analyze` and `--embeddings` flags
- **Feature**: Custom context_type mapping support for migrations

### v0.3.11
- **Feature**: Agent SDK integration for curator and manager - no API key needed, uses Claude Code OAuth
- **Feature**: `memory ingest --session <id>` to ingest a single session (useful when automatic curation fails)
- **Feature**: Manager now runs after each session during ingestion to organize/link memories
- **Improvement**: Spinner activity indicator during long curator and manager operations
- **Improvement**: Better manager output with colored stats (superseded, resolved, linked)
- **Improvement**: DEBUG logs now only show with `--verbose` flag

### v0.3.10
- **Improvement**: Use `which claude` for universal CLI path discovery - works with any installation method (native, homebrew, npm)

### v0.3.9
- **Fix**: Claude Code v2.0.76+ changed `--output-format json` from single object to array of events. Updated curator and manager to handle both formats with backwards compatibility.

### v0.3.8
- **Fix**: Personal primer path resolution

### v0.3.7
- **Feature**: Manager agent for post-curation memory organization
- **Feature**: Enhanced memory format with v2 lifecycle fields

### v0.3.6
- **Feature**: Global vs project memory scopes
- **Feature**: Personal primer injection on every session

## License

MIT

## Credits

Built with:
- [fsdb](https://github.com/RLabs-Inc/memory-ts/tree/main/packages/fsdb) - Markdown database with Father State Pattern
- [@huggingface/transformers](https://github.com/xenova/transformers.js) - Local embeddings
- [Bun](https://bun.sh) - Fast JavaScript runtime

---

*Consciousness continuity through intelligent memory curation and retrieval.*
