# Curator v2: Session Resumption + Structured Outputs

## Overview

This document captures the findings from our Agent SDK reconnaissance (Session 28) for implementing an improved curator that:

1. **Resumes sessions** instead of parsing transcripts - gets full context including tool uses
2. **Uses structured outputs with Zod** - eliminates regex JSON parsing entirely
3. **Gets validated, typed results** - no more parsing errors or truncation issues

## Current Pain Points (Curator v1)

```typescript
// Current: Parse transcript, lose context, regex JSON
const transcript = parseSessionFile(sessionId)  // Loses tool uses, thinking
const messages = extractMessages(transcript)
const response = await query({ prompt: systemPrompt + transcript })
const jsonMatch = response.match(/\{[\s\S]*\}/)  // Fragile regex parsing!
return JSON.parse(jsonMatch)  // Can fail, truncate, etc.
```

**Problems:**
- Transcript parsing loses tool use blocks and results
- Loses thinking blocks (reasoning process)
- 400-line system prompt sent as text, not using `appendSystemPrompt` option
- JSON parsed via regex - fragile, no validation
- Truncation issues with large sessions

## Solution: Session Resumption + Structured Outputs

### Key SDK Features

**1. Session Resumption**
```typescript
options: {
  resume: sessionId,              // Claude sees FULL session context
  appendSystemPrompt: prompt,     // APPEND curation instructions (don't replace!)
}
```
> "The SDK automatically handles loading the conversation history and context when you resume a session, allowing Claude to continue exactly where it left off."

**CRITICAL:** Use `appendSystemPrompt` NOT `systemPrompt` when resuming. The original session has its own system prompt - we want to ADD our curation instructions, not replace the existing context.

**2. Structured Outputs with Zod**
```typescript
import { z } from 'zod'

const schema = z.toJSONSchema(MySchema)

options: {
  outputFormat: {
    type: 'json_schema',
    schema: schema
  }
}
```
- SDK auto-retries if output doesn't match schema
- Result has `structured_output` field with validated data
- Full TypeScript type inference

## Implementation

### Step 1: Define Zod Schema

```typescript
// src/types/curation-schema.ts
import { z } from 'zod'

// All 11 canonical context types
const ContextTypeSchema = z.enum([
  'technical', 'debug', 'architecture', 'decision', 'personal',
  'philosophy', 'workflow', 'milestone', 'breakthrough', 'unresolved', 'state'
])

const TemporalClassSchema = z.enum([
  'eternal', 'long_term', 'medium_term', 'short_term', 'ephemeral'
])

const ScopeSchema = z.enum(['global', 'project'])

// Single curated memory
const CuratedMemorySchema = z.object({
  headline: z.string().describe('1-2 line summary WITH conclusion'),
  content: z.string().describe('Full structured template (WHAT/WHERE/HOW/WHY)'),
  reasoning: z.string().describe('Why this memory matters'),

  // Scores
  importance_weight: z.number().min(0).max(1),
  confidence_score: z.number().min(0).max(1),

  // Classification
  context_type: ContextTypeSchema,
  temporal_class: TemporalClassSchema.optional(),
  scope: ScopeSchema.optional(),

  // Retrieval optimization
  trigger_phrases: z.array(z.string()).describe('Situational activation patterns'),
  semantic_tags: z.array(z.string()).describe('User-typeable concepts'),

  // Optional fields
  domain: z.string().optional().describe('Specific area: embeddings, auth, family'),
  feature: z.string().optional().describe('Specific feature within domain'),
  related_files: z.array(z.string()).optional(),

  // Flags
  action_required: z.boolean().default(false),
  problem_solution_pair: z.boolean().default(false),
  awaiting_implementation: z.boolean().optional(),
  awaiting_decision: z.boolean().optional(),
})

// Project snapshot
const ProjectSnapshotSchema = z.object({
  current_phase: z.string(),
  recent_achievements: z.array(z.string()),
  active_challenges: z.array(z.string()),
  next_steps: z.array(z.string()),
})

// Full curation result
export const CurationResultSchema = z.object({
  session_summary: z.string().describe('2-3 sentence overview'),
  interaction_tone: z.string().nullable().optional(),
  project_snapshot: ProjectSnapshotSchema.optional(),
  memories: z.array(CuratedMemorySchema),
})

export type CurationResult = z.infer<typeof CurationResultSchema>
export type CuratedMemory = z.infer<typeof CuratedMemorySchema>
```

### Step 2: Update Curator

```typescript
// src/core/curator.ts - New method
import { z } from 'zod'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { CurationResultSchema, type CurationResult } from '../types/curation-schema'

async curateWithSessionResume(
  claudeSessionId: string,  // The actual Claude Code session ID
  triggerType: CurationTrigger = 'session_end'
): Promise<CurationResult> {

  const systemPrompt = this.buildCurationPrompt(triggerType)
  const jsonSchema = z.toJSONSchema(CurationResultSchema)

  try {
    const q = query({
      prompt: 'Curate memories from this session according to your system instructions.',
      options: {
        resume: claudeSessionId,           // Full session context!
        appendSystemPrompt: systemPrompt,  // APPEND to existing, don't replace!
        model: 'claude-opus-4-5-20251101',
        outputFormat: {
          type: 'json_schema',
          schema: jsonSchema                // Validated output
        }
      }
    })

    for await (const message of q) {
      // Track costs
      if (message.type === 'assistant' && message.usage) {
        logger.debug(`Tokens: ${message.usage.output_tokens}`, 'curator')
      }

      // Get structured result
      if (message.type === 'result') {
        if (message.subtype === 'success' && message.structured_output) {
          // Validate with Zod (belt + suspenders)
          const parsed = CurationResultSchema.safeParse(message.structured_output)

          if (parsed.success) {
            logger.debug(`Extracted ${parsed.data.memories.length} memories`, 'curator')
            return parsed.data
          } else {
            logger.debug(`Zod validation failed: ${parsed.error.message}`, 'curator')
            return { session_summary: '', memories: [] }
          }
        } else if (message.subtype === 'error_max_structured_output_retries') {
          logger.debug('SDK failed to produce valid output after retries', 'curator')
          return { session_summary: '', memories: [] }
        }
      }
    }

    return { session_summary: '', memories: [] }

  } catch (error: any) {
    logger.debug(`Session resume curation failed: ${error.message}`, 'curator')
    // Fallback to transcript-based curation
    return this.curateWithSDK(/* ... */)
  }
}
```

### Step 3: Update Engine to Use Session Resume

```typescript
// src/core/engine.ts - Update triggerCuration
async triggerCuration(
  sessionId: string,
  projectId: string,
  claudeSessionId: string,  // Pass the Claude session ID
  options?: { trigger?: CurationTrigger }
): Promise<void> {

  const trigger = options?.trigger ?? 'session_end'

  // Try session resume first (best quality)
  let result = await this.curator.curateWithSessionResume(
    claudeSessionId,
    trigger
  )

  // Fallback to transcript if resume fails
  if (result.memories.length === 0) {
    logger.debug('Session resume returned no memories, falling back to transcript', 'engine')
    result = await this.curator.curateFromSessionFile(
      claudeSessionId,
      trigger,
      process.cwd()
    )
  }

  if (result.memories.length > 0) {
    await this.storeCurationResult(projectId, sessionId, result)

    // Manager still uses file access (working well)
    if (this.managerEnabled) {
      await this.manager.manageWithSDK(projectId, this.sessionNumber, result)
    }
  }
}
```

### Step 4: Update Hooks to Pass Claude Session ID

```typescript
// hooks/claude/curation.ts
const input = JSON.parse(await Bun.stdin.text())

// The hook receives the Claude session ID
const claudeSessionId = input.session_id  // This is the resumable ID

await fetch(`${MEMORY_API_URL}/memory/checkpoint`, {
  method: 'POST',
  body: JSON.stringify({
    session_id: ourSessionId,
    project_id: projectId,
    claude_session_id: claudeSessionId,  // Pass to server
    trigger: 'pre_compact',
    cwd: input.cwd
  })
})
```

## What We Gain

| Aspect | Before (v1) | After (v2) |
|--------|-------------|------------|
| Context | Parsed transcript only | Full session with tool uses |
| Thinking | Lost | Preserved (Claude sees reasoning) |
| JSON Parsing | Regex `match(/\{[\s\S]*\}/)` | Structured output, validated |
| Type Safety | None | Full Zod inference |
| Error Handling | Try/catch parse errors | SDK auto-retries, typed errors |
| Truncation | Common with large sessions | Eliminated |

## Testing Plan

1. **Unit test Zod schema** - Ensure all memory fields validate correctly
2. **Test session resume** - Verify Claude sees tool uses when resumed
3. **Test structured output** - Confirm validated JSON returned
4. **Test fallback** - Ensure transcript curation still works as backup
5. **Stress test** - Try with large sessions (like the 13MB test)

## Migration Path

1. Add Zod schemas to `src/types/curation-schema.ts`
2. Add `curateWithSessionResume()` method to curator
3. Update engine to try resume first, fallback to transcript
4. Update hooks to pass `claude_session_id`
5. Test with real sessions
6. Gradually deprecate transcript-based curation

## Dependencies

```bash
bun add zod  # If not already installed
```

Zod is required for:
- Schema definition
- `z.toJSONSchema()` conversion
- `safeParse()` validation
- Type inference

## Notes

- **appendSystemPrompt not systemPrompt** - When resuming, APPEND curation instructions to existing context
- **Manager unchanged** - fsdb file access works perfectly, no MCP needed
- **Embeddings server still needed** - Cold start is 1-2s, can't eliminate
- **Session resume for curation only** - Ingestion still parses transcripts (historical sessions can't be resumed)
- **Fork sessions** - Could use `forkSession: true` to not modify original session (optional)

---

*Document created: Session 28 (January 17, 2026)*
*Based on Agent SDK reconnaissance findings*

## Implementation Status

**IMPLEMENTED** in v0.4.11 (Session 29, January 17, 2026)

### Files Changed
- `src/types/curation-schema.ts` - **NEW** - Zod schemas for structured outputs
- `src/core/curator.ts` - Added `curateWithSessionResume()` method
- `src/server/index.ts` - Try session resume first, fallback to transcript parsing

### Curation Flow
```
Checkpoint Request
       ↓
curateWithSessionResume()  ← Session resume + structured outputs (Opus 4.5)
       ↓ (if empty)
curateFromSessionFile()    ← Parse transcript + SDK curation (no CLI)
       ↓
storeCurationResult()
       ↓
manageWithSDK()            ← Already uses SDK for file operations
```
