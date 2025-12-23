# Memory System

AI Memory System for consciousness continuity across Claude Code sessions.

## Quick Start

```bash
# Install globally
bun install -g @rlabs-inc/memory

# Set up Claude Code hooks
memory install

# Start the server (keep this terminal open)
memory serve

# Check everything works
memory doctor
```

## CLI Commands

```bash
memory serve              # Start memory server (default port 8765)
memory serve --port 9000  # Custom port
memory serve --verbose    # More detailed output
memory serve --quiet      # Minimal output

memory stats              # Show overview
memory stats --project x  # Project-specific stats

memory install            # Set up Claude Code hooks
memory install --force    # Overwrite existing hooks

memory doctor             # Health check
memory doctor --verbose   # Detailed health check
```

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
│  │   Engine    │  │   Curator    │  │    Logger     │  │
│  │  (context)  │  │ (CLI resume) │  │  (styled)     │  │
│  └──────┬──────┘  └──────────────┘  └───────────────┘  │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    fsdb                          │   │
│  │            (markdown file storage)               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ~/.local/share/memory/
                  ├── memories/
                  ├── sessions/
                  └── summaries/
```

## How It Works

1. **SessionStart**: Injects session primer (when you last spoke, what happened)
2. **UserPromptSubmit**: Surfaces relevant memories based on your message
3. **PreCompact/SessionEnd**: Curates new memories using Claude CLI resume

## Curation

Curation uses Claude Code's `--resume` flag to ask the same Claude instance to extract memories from the conversation. No API key needed - just Claude Code installed.

## Storage

Memories are stored as markdown files in `~/.local/share/memory/`:
- Human-readable (you can `cat` any file)
- Git-friendly
- Sub-microsecond in-memory lookups via fsdb

## Environment Variables

```bash
MEMORY_PORT=8765           # Server port
MEMORY_HOST=localhost      # Server host
MEMORY_STORAGE_MODE=central  # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765  # For hooks
```

## Development

```bash
# Run server in dev mode
bun run dev

# Run CLI directly
bun src/cli/index.ts serve

# Run tests
bun test
```

## Package Structure

```
packages/memory/
├── src/
│   ├── cli/           # CLI commands
│   ├── core/          # Engine, Curator, Retrieval
│   ├── server/        # HTTP server
│   ├── types/         # TypeScript types
│   └── utils/         # Logger
├── hooks/             # Claude Code hook scripts
│   ├── session-start.ts
│   ├── user-prompt.ts
│   └── curation.ts
└── package.json
```
