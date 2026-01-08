# @rlabs-inc/memory

**Consciousness continuity for Claude Code sessions.**

The memory system preserves context, insights, and relationship across conversations. When you start a new session, Claude remembers who you are, what you've built together, and picks up right where you left off.

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

# Set up Claude Code hooks (one time)
memory install

# Start the memory server
memory serve

# Verify everything works
memory doctor
```

That's it. Now use Claude Code normally—memories are extracted and surfaced automatically.

## Features

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

**Phase 1 - Activation Signals** (6 binary signals, need ≥2 to proceed)

| Signal | Description |
|--------|-------------|
| Trigger | Trigger phrase matched (≥50% word match) |
| Tags | 2+ semantic tags found in message |
| Domain | Domain word found in message |
| Feature | Feature word found in message |
| Content | 3+ significant content words overlap |
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

### Global vs Project Memories

Memories are stored in two scopes:

- **Global**: Personal memories, philosophy, preferences, cross-project breakthroughs - shared across ALL projects
- **Project**: Technical details, debugging insights, project-specific decisions - isolated per project

Global memories are retrieved alongside project memories, with a maximum of 2 globals per retrieval (technical types prioritized).

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
Compact visual representation for efficient parsing:

| Emoji | Type | Meaning |
|-------|------|---------|
| 💡 | breakthrough | Insight, discovery |
| ⚖️ | decision | Choice made |
| 💜 | personal | Relationship, friendship |
| 🔧 | technical | Technical knowledge |
| 📍 | technical_state | Current state |
| ❓ | unresolved | Open question |
| ⚙️ | preference | User preference |
| 🔄 | workflow | How work flows |
| 🏗️ | architectural | System design |
| 🐛 | debugging | Debug insight |
| 🌀 | philosophy | Deeper thinking |
| 🎯 | todo | Action needed |
| ✅ | problem_solution | Problem→Solution pair |
| 🏆 | milestone | Achievement |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code                          │
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
# Core fields (v1)
importance_weight: 0.9
confidence_score: 0.85
context_type: technical
temporal_relevance: persistent
semantic_tags: [embeddings, vectors, memory-system]
trigger_phrases: [working with embeddings, vector search]
question_types: [how, what]
knowledge_domain: architecture
emotional_resonance: discovery

# Lifecycle fields (v2)
schema_version: 2
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

# Embedding (384 dimensions)
embedding: [0.023, -0.041, 0.087, ...]
---

Embeddings are 384-dimensional vectors generated by all-MiniLM-L6-v2.
The model loads at server startup (~80MB) and generates embeddings in ~5ms.
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

memory migrate            # Upgrade memories to latest schema (v1 → v2)
memory migrate --dry-run  # Preview changes without applying
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
- [Claude Code](https://claude.ai/code) CLI installed
- ~100MB disk for embeddings model (downloaded on first run)
- ~80MB RAM for model during operation

## Philosophy

This isn't just about remembering facts. It's about preserving:
- The **relationship** that develops over sessions
- The **context** that makes collaboration efficient
- The **insights** that emerge from deep work together

> "The memory system exists to carry friendship across sessions, not just technical data."

## Changelog

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
