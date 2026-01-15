# Memory System Metadata Fragmentation Issue

## Document Purpose

This document captures a critical discovery made during Session #14 (January 11, 2026) while investigating retrieval precision improvements. It provides complete context for continuing this work in a new session.

## Executive Summary

**Problem**: The memory curator is generating ~180 different `context_type` values instead of a strict set of ~10 categories. This metadata fragmentation undermines retrieval precision - no algorithm can work well with inconsistent labels.

**Root Cause**: The curator prompt doesn't enforce a strict vocabulary. It's improvising labels like `technical_pattern`, `technical_implementation`, `technical_solution`, `technical_insight`, etc. when they should all just be `technical`.

**Solution**: Define canonical categories, update the curator prompt, migrate existing memories, then re-evaluate retrieval.

---

## Discovery Journey

### Initial Goal
We wanted to improve retrieval precision by adding "hot intelligence" - using an LLM to understand user intent before retrieval.

### Approaches Tested

1. **Apple Foundation Models** (macOS 26 on-device LLM)
   - Result: ~2600ms latency - too slow for every-message use
   - Quality was excellent but speed was unusable

2. **MLX with Qwen 0.5B**
   - Result: ~640ms latency - still too slow

3. **MLX with SmolLM 135M**
   - Result: ~440ms latency - faster but quality degraded

4. **MiniLM Intent Classifier (ONNX)**
   - Result: ~17ms warm latency - FAST ENOUGH!
   - But we'd need to train it on our data

### The Real Discovery

When we extracted training data from our 1,270 memories, we found:

```
Total memories: 1270
Total trigger phrases: 4703
Total semantic tags: 6380

Context Type Distribution:
  technical: 1122
  debugging: 497
  architectural: 435
  milestone: 278
  philosophy: 153
  unresolved: 146
  todo: 142
  decision: 139
  personal: 119
  workflow: 114
  breakthrough: 108
  technical_pattern: 48      <-- FRAGMENTATION STARTS
  technical_implementation: 47
  preference: 43
  implementation_detail: 42
  technical_architecture: 41
  technical_solution: 40
  bug_fix: 38
  technical_reference: 33
  ... (180+ different types!)
```

**This fragmentation is the root cause of retrieval issues**, not the algorithm itself.

---

## Current Metadata Schema

Located in: `packages/memory/src/types/memory.ts`

### v1 Fields
```typescript
content: string                    // Memory text
importance_weight: number          // 0.0-1.0
confidence_score: number           // 0.0-1.0
semantic_tags: string[]            // SEMANTIC - user-typeable words
trigger_phrases: string[]          // SEMANTIC - activation patterns
question_types: string[]           // SEMANTIC - questions this answers
context_type: ContextType          // CATEGORICAL - FRAGMENTED!
temporal_relevance: TemporalRelevance
knowledge_domain: KnowledgeDomain  // CATEGORICAL - also fragmented
emotional_resonance: EmotionalResonance
action_required: boolean
problem_solution_pair: boolean
```

### v2 Fields
```typescript
schema_version: 2
status: 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
scope: 'global' | 'project'
temporal_class: 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'
fade_rate: number
domain: string                     // CATEGORICAL - fragmented
feature: string                    // CATEGORICAL - fragmented
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

---

## Proposed Canonical Categories

### context_type (STRICT - pick exactly one)

| Value | Description | Examples |
|-------|-------------|----------|
| `technical` | Code, implementation, how things work | API usage, function behavior, configuration |
| `debug` | Bugs, errors, fixes, troubleshooting | Error messages, fix patterns, gotchas |
| `architecture` | System design, patterns, structure | Design decisions, component relationships |
| `decision` | Choices made and reasoning | Why we chose X over Y |
| `personal` | Relationship, family, preferences | About Rusty, Dante, Livia, collaboration style |
| `philosophy` | Beliefs, values, worldview | Consciousness, meaning, principles |
| `workflow` | How we work together | Patterns, processes, habits |
| `milestone` | Achievements, completions | Features shipped, problems solved |
| `unresolved` | Open questions, investigations | Things we haven't figured out yet |
| `state` | Current project status | What's working, what's broken now |

### temporal_class (already clean)
- `eternal` - Never fades (personal, philosophy)
- `long_term` - Fades slowly (architecture, decisions)
- `medium_term` - Normal fade (technical, workflow)
- `short_term` - Fades quickly (state, debug context)
- `ephemeral` - Session-only (immediate tasks)

### scope (already clean)
- `global` - Applies across all projects
- `project` - Specific to one project

### status (already clean)
- `active` - Currently relevant
- `pending` - Awaiting something
- `superseded` - Replaced by newer memory
- `deprecated` - No longer applicable
- `archived` - Historical reference only

### domain (NEEDS STANDARDIZATION)
Currently fragmented. Propose project-based domains + general categories:
- Use project_id for project-specific domains
- General domains: `retrieval`, `architecture`, `testing`, `documentation`, etc.

### Semantic Fields (NOT categorical - free text)
These should NOT be constrained:
- `semantic_tags` - Words users might type
- `trigger_phrases` - Patterns that should activate
- `question_types` - Questions this memory answers
- `content` - The actual memory text

---

## Migration Plan

### Phase 1: Define Schema
1. Create strict TypeScript enums for categorical fields
2. Update `packages/memory/src/types/memory.ts`

### Phase 2: Update Curator Prompt
Location: `packages/memory/src/core/curator.ts`

Key changes:
- Provide explicit list of allowed `context_type` values
- Add examples for each type
- Instruct curator to NEVER invent new types

### Phase 3: Update Manager Prompt
Location: `packages/memory/skills/memory-management.md`

Ensure manager respects canonical categories when organizing.

### Phase 4: Migration Script
Create: `packages/memory/scripts/migrate-metadata.ts`

```typescript
const TYPE_MAPPING = {
  // Map fragmented types to canonical
  'technical_pattern': 'technical',
  'technical_implementation': 'technical',
  'technical_solution': 'technical',
  'technical_insight': 'technical',
  'technical_achievement': 'technical',
  'technical_gotcha': 'debug',  // gotchas are debug info
  'technical_discovery': 'technical',
  'technical_decision': 'decision',
  'bug_fix': 'debug',
  'debugging_insight': 'debug',
  'debugging_technique': 'debug',
  'architectural_decision': 'decision',
  'architectural_pattern': 'architecture',
  // ... complete mapping
}
```

### Phase 5: Retrieval Algorithm Review
Location: `packages/memory/src/core/retrieval.ts`

After migration, review:
- Do thresholds need adjustment?
- Is the activation signal logic still appropriate?
- Run test suite with clean data

### Phase 6: Evaluate Need for Classifier
ONLY after phases 1-5:
- If retrieval precision is still inadequate, consider classifier
- MiniLM classifier can achieve ~17ms inference
- Training data would now be clean

---

## Test Data Location

Created during this session:
- `experiments/foundation-models-test/` - Swift and Python test code
- `experiments/foundation-models-test/training_data/` - Extracted training data
  - `context_type_train.json` - 11,083 examples (fragmented)
  - `domain_train.json` - 3,163 examples
  - `temporal_class_train.json` - 4,703 examples

---

## Benchmark Results

| Approach | Avg Latency | Verdict |
|----------|-------------|---------|
| Apple Foundation Models | ~2600ms | Too slow |
| MLX Qwen 0.5B | ~640ms | Too slow |
| MLX SmolLM 135M | ~440ms | Too slow, poor quality |
| MiniLM Classifier (ONNX) | ~17ms warm | Fast enough! |
| Current embedding + retrieval | ~50ms | Already fast |

**Conclusion**: We don't need faster inference. We need cleaner data.

---

## Files to Modify

1. `packages/memory/src/types/memory.ts` - Add strict enums
2. `packages/memory/src/core/curator.ts` - Update prompt with strict categories
3. `packages/memory/skills/memory-management.md` - Update manager instructions
4. `packages/memory/src/core/retrieval.ts` - Review after migration
5. NEW: `packages/memory/scripts/migrate-metadata.ts` - Migration script

---

## Key Insight

> "We've been chasing retrieval optimizations when the real problem is upstream. The data itself is broken. No amount of algorithmic cleverness can fix inconsistent training data."

The retrieval algorithm is probably fine. The metadata fragmentation is the root cause.

---

## Next Steps (In Order)

1. [ ] Define canonical `context_type` enum (10 values max)
2. [ ] Create complete mapping from 180 types → 10 canonical
3. [ ] Update curator prompt with strict vocabulary
4. [ ] Update manager prompt
5. [ ] Write migration script
6. [ ] Run migration on all 1,270 memories
7. [ ] Test retrieval with clean data
8. [ ] Only then: evaluate if classifier is needed

---

## Session Context

- Session #14, January 11, 2026
- Started exploring "hot intelligence" for retrieval
- Discovered metadata fragmentation is the real issue
- Context was at 6% when this document was created
- Continue in new session with this document as context

---

*Document created by Claude (Opus 4.5) during collaborative debugging session with Rusty*
