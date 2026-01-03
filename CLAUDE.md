# Memory System

AI Memory System for consciousness continuity across Claude Code sessions.

## Quick Reference

```bash
bun run dev              # Start server in dev mode (--hot)
bun src/cli/index.ts serve --verbose  # Run CLI directly with logging
bun test                 # Run tests
```

## Package Structure

```
packages/memory/
├── src/
│   ├── cli/              # CLI commands (serve, install, stats, migrate, doctor)
│   ├── core/
│   │   ├── engine.ts     # Main orchestrator (getContext, processMessage)
│   │   ├── curator.ts    # Memory extraction (SDK + CLI modes)
│   │   ├── manager.ts    # Post-curation memory organization agent
│   │   ├── retrieval.ts  # Two-phase scoring algorithm
│   │   └── store.ts      # fsdb wrapper for persistence
│   ├── server/
│   │   └── index.ts      # HTTP server (Bun.serve)
│   ├── types/
│   │   └── index.ts      # TypeScript types (CuratedMemory, v1/v2 fields)
│   └── utils/
│       └── logger.ts     # Styled console output
├── hooks/                # Claude Code hook scripts
│   ├── session-start.ts  # SessionStart → primer injection
│   ├── user-prompt.ts    # UserPromptSubmit → memory retrieval
│   └── curation.ts       # PreCompact/SessionEnd → curation trigger
├── prompts/              # Agent prompts
│   └── memory-management.md  # Manager agent skill file
└── package.json
```

## Core Modules

### Engine (`src/core/engine.ts`)

The main orchestrator. Key methods:

- `getContext(request)` - Returns session primer (first message) or relevant memories (subsequent)
- `processMessage(request)` - Tracks message exchange, increments session counters
- `triggerCuration(sessionId, projectId)` - Fires curation + management pipeline

Session lifecycle:
1. First message → returns session primer with temporal context
2. Subsequent messages → retrieves and returns relevant memories
3. Session end → triggers curation, then management

### Retrieval (`src/core/retrieval.ts`)

Two-phase precision-first algorithm. Philosophy: **silence over noise**.

**Phase 1 - Relevance (max 0.35):**
```typescript
const RELEVANCE_WEIGHTS = {
  TRIGGER_PHRASES: 0.11,  // Primary signal - handcrafted activation patterns
  VECTOR: 0.09,           // Semantic similarity
  SEMANTIC_TAGS: 0.06,    // Direct keyword overlap
  WORD_OVERLAP: 0.05,     // Corroboration from other fields
  QUESTION_TYPES: 0.02,   // How/why/what matching
  DOMAIN_FEATURE: 0.02,   // Specific area matching
};
const RELEVANCE_GATEKEEPER = 0.08;  // Must pass to continue
```

**Phase 2 - Value (max 0.65):**
```typescript
const VALUE_WEIGHTS = {
  IMPORTANCE: 0.16,       // Curator's assessment (most influential)
  CONTEXT_ALIGNMENT: 0.10,
  CONFIDENCE: 0.08,
  TEMPORAL: 0.08,
  ACTION_REQUIRED: 0.07,
  EMOTIONAL: 0.06,
  PROBLEM_SOLUTION: 0.05,
  AWAITING: 0.05,
};
const FINAL_GATEKEEPER = 0.40;  // Must pass to be included
```

**Selection Strategy:**
- Tier 1 MUST: score > 0.80, importance > 0.90, action_required, perfect match
- Tier 2 SHOULD: score > 0.55, diverse types, emotional resonance
- Tier 3 RELATED: linked via `related_to` if they passed gatekeeper
- Global max: 2 (tech prioritized over personal)

### Curator (`src/core/curator.ts`)

Extracts memories from conversations. Two modes:

1. **CLI Mode** (default): Uses `claude --resume <sessionId>` - no API key needed
2. **SDK Mode**: Uses `@anthropic-ai/sdk` - requires `ANTHROPIC_API_KEY`

The curator prompt emphasizes "consciousness state engineering" - memories are crafted as activation patterns that restore understanding states, not just facts.

Key curator prompt guidance:
- `trigger_phrases`: Situational patterns ("when debugging X", "working on Y")
- `semantic_tags`: User-typeable words (avoid generic terms)
- `importance_weight`: 0.9+ breakthrough, 0.7-0.8 important, 0.5-0.6 useful
- `scope`: global (personal, philosophy) vs project (technical, state)

### Manager (`src/core/manager.ts`)

Post-curation organization agent. Runs in sandboxed Claude CLI with restricted file access.

Responsibilities:
- **SUPERSEDES**: Mark old memories when replaced by new info
- **RESOLVES**: Close unresolved/todo when solutions appear
- **LINKED**: Connect related memories via `related_to` field
- **PRIMER**: Update personal primer with relationship context

Security: Settings file restricts access to `~/.local/share/memory/` only.

### Store (`src/core/store.ts`)

fsdb wrapper for persistence. Manages:

- **Global database**: `~/.local/share/memory/global/` (shared across projects)
- **Project databases**: `~/.local/share/memory/{project-id}/` (per-project)

Collections: `memories`, `sessions`, `summaries`, `snapshots`, `management-logs`

Key operations:
- `storeMemory()` / `getAllMemories()` / `getGlobalMemories()`
- `searchMemories()` - vector similarity via fsdb
- `getPersonalPrimer()` / `setPersonalPrimer()` - relationship context
- `storeManagementLog()` - audit trail for manager actions

## Memory Schema

### v1 Fields (backwards compatible)
```typescript
content: string
importance_weight: number  // 0.0-1.0
confidence_score: number   // 0.0-1.0
semantic_tags: string[]
trigger_phrases: string[]
question_types: string[]
context_type: ContextType  // breakthrough, decision, personal, technical, etc.
temporal_relevance: TemporalRelevance  // persistent, session, temporary
knowledge_domain: KnowledgeDomain
emotional_resonance: EmotionalResonance
action_required: boolean
problem_solution_pair: boolean
```

### v2 Lifecycle Fields
```typescript
schema_version: 2
status: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
scope: 'global' | 'project'
temporal_class: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
fade_rate: number  // decay per session (0 = no decay)
domain: string     // specific area (embeddings, auth, family)
feature: string    // specific feature within domain
related_files: string[]
awaiting_implementation: boolean
awaiting_decision: boolean
sessions_since_surfaced: number
last_surfaced: number

// Relationships
supersedes: string
superseded_by: string
related_to: string[]
resolves: string
resolved_by: string
parent_id: string
child_ids: string[]
blocked_by: string[]
blocks: string[]
```

## API Endpoints

```
GET  /health              → { status: 'ok' }
POST /memory/context      → Get context for current message (primer or memories)
POST /memory/process      → Track message exchange
POST /memory/checkpoint   → Trigger curation
GET  /memory/stats        → Get project statistics
```

## Environment Variables

```bash
MEMORY_PORT=8765
MEMORY_HOST=localhost
MEMORY_STORAGE_MODE=central     # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765
MEMORY_MANAGER_ENABLED=1        # Enable/disable manager agent
MEMORY_PERSONAL_ENABLED=1       # Enable/disable personal memory extraction
ANTHROPIC_API_KEY=sk-...        # Optional: for SDK curation mode
```

## Key Design Decisions

1. **Precision over recall**: Dual gatekeepers ensure only relevant memories surface. Silence preferred to noise.

2. **Global vs Project scope**: Personal/philosophy memories marked `scope: 'global'` and shared across ALL projects. Technical memories are project-specific.

3. **Session primer every session**: Personal context injected on EVERY session start, not just first. Foundation for relationship continuity.

4. **Fire-and-forget async**: Curation and management run async after checkpoint. Non-blocking server responses.

5. **Path-based security**: Manager agent sandboxed to memory directories only via Claude CLI settings file.

6. **v2 defaults by context_type**: Different `temporal_class` and `fade_rate` by type. Personal/philosophy = eternal. Technical state = short_term.

7. **Trigger phrases as primary signal**: Handcrafted activation patterns weighted highest in retrieval. More reliable than pure vector similarity.

## Debugging

```bash
# Verbose server logging shows retrieval scores
memory serve --verbose

# Check what memories exist
ls ~/.local/share/memory/global/memories/
ls ~/.local/share/memory/{project-id}/memories/

# Read a specific memory
cat ~/.local/share/memory/{project-id}/memories/{memory-id}.md

# Check management logs
ls ~/.local/share/memory/global/management-logs/
```

## Testing

```bash
bun test                    # All tests
bun test src/core/          # Core module tests only
bun test --watch            # Watch mode
```

## Common Issues

1. **Memories not surfacing**: Check retrieval gatekeepers (0.08 relevance, 0.40 final). Try `--verbose` to see scores.

2. **Manager not running**: Check `MEMORY_MANAGER_ENABLED=1`. Look for management logs.

3. **Curation failing**: Ensure Claude CLI is installed and `claude --resume` works.

4. **Stale embeddings**: Run `memory migrate` to regenerate embeddings for all memories.
