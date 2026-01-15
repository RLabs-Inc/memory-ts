# Memory System Metadata Audit

## Document Purpose

Comprehensive audit of ALL metadata fields in the memory system, documenting:
- Current state (clean vs fragmented)
- What we expected vs what we have
- Proposed standardization
- Migration strategy

**Created**: Session #15, January 11, 2026

---

## Executive Summary

We have 1,278 memories with significant metadata fragmentation:

| Field | Status | Unique Values | Action Needed |
|-------|--------|---------------|---------------|
| `context_type` | FRAGMENTED | 170+ | Consolidate to 10 |
| `knowledge_domain` | SEVERELY FRAGMENTED | 300+ | Rethink entirely |
| `emotional_resonance` | USELESS | 400+ | Delete or redesign |
| `temporal_relevance` | CLEAN | 4 | Keep as-is |
| `temporal_class` | CLEAN | 5 | Keep as-is |
| `scope` | CLEAN | 2 | Keep as-is |
| `status` | CLEAN | 3 | Keep as-is |
| `domain` (v2) | FRAGMENTED | 80+ | Needs guidance |
| `feature` (v2) | FRAGMENTED | 150+ | Needs guidance |

---

## Field-by-Field Analysis

### 1. context_type (FRAGMENTED - needs strict enum)

**Purpose**: What kind of insight is this memory?

**Current state**: 170+ unique values. Curator improvises variants like:
- `technical`, `technical_pattern`, `technical_implementation`, `technical_solution`, `technical_insight`, `technical_architecture`, `technical_reference`, `technical_gotcha`, `technical_decision`, `technical_fix`, `technical_discovery`, `technical_achievement`, etc.

**Top 15 values (covering 90% of memories)**:
```
310 technical          (should stay)
130 debugging          (merge → debug)
108 architectural      (merge → architecture)
 81 milestone          (should stay)
 43 philosophy         (should stay)
 42 todo               (merge → unresolved or drop)
 40 unresolved         (should stay)
 38 decision           (should stay)
 34 workflow           (should stay)
 34 personal           (should stay)
 28 breakthrough       (should stay)
 14 technical_implementation → technical
 12 preference         (merge → personal or workflow)
 12 implementation_detail → technical
 11 technical_pattern  → technical
```

**Proposed canonical values (10)**:

| Value | Description | Replaces |
|-------|-------------|----------|
| `technical` | Code, implementation, how things work | technical_*, implementation_*, code_*, api_*, feature_* |
| `debug` | Bugs, errors, fixes, gotchas | debugging, bug_*, debugging_*, gotcha, active_bug |
| `architecture` | System design, patterns, structure | architectural*, design_*, architecture_*, pattern_* |
| `decision` | Choices made and reasoning | *_decision, decision, design_philosophy |
| `personal` | Relationship, family, preferences | personal*, relationship*, preference, user_preference |
| `philosophy` | Beliefs, values, worldview | philosophy, philosophical_*, project_philosophy |
| `workflow` | How we work together | workflow*, collaboration_*, development_workflow |
| `milestone` | Achievements, completions | milestone, achievement, completion, shipped |
| `unresolved` | Open questions, investigations | unresolved, todo, open_*, pending_*, active_issue |
| `state` | Current project status | project_status, project_state, technical_state |

---

### 2. temporal_relevance (CLEAN - keep as-is)

**Purpose**: How long should this memory persist in v1 scoring?

**Current state**: Clean! Only 4 values:
```
1127 persistent   (always relevant)
 130 session      (session-specific)
  21 temporary    (short-term)
   + archived     (historical)
```

**Action**: Keep as-is. Already working correctly.

---

### 3. knowledge_domain (SEVERELY FRAGMENTED - rethink)

**Purpose**: What area does this memory relate to?

**Current state**: 300+ unique values mixing:
- Project names: `tui-framework`, `gemini-mcp`, `memory-system`, `salesbot`
- Generic domains: `architecture`, `debugging`, `testing`
- Case variations: `TUI framework` vs `tui-framework` vs `TUI Framework`
- Semantic descriptions: `TUI framework architecture`, `memory systems comparison`

**Top 30 values**:
```
93 tui-framework         (project)
56 memory-system         (project)
39 architecture          (generic)
36 collaboration         (generic)
30 layout-engine         (feature)
26 TUI framework         (duplicate!)
24 gemini-mcp            (project)
23 reactive-systems      (feature)
21 retrieval             (feature)
...
```

**Problems**:
1. Mixes project names with generic domains
2. Case inconsistency creates duplicates
3. Overlaps with v2 `domain` field
4. Not useful for retrieval (too fragmented)

**Options**:
1. **DELETE**: Just drop this field entirely. We have `project_id` for project scope.
2. **SIMPLIFY**: Map to ~10 generic domains only (technical, design, testing, etc.)
3. **DEPRECATE**: Keep for backwards compat but stop using in retrieval

**Recommendation**: DELETE. The `project_id` field already handles project scope. This field adds noise, not signal.

---

### 4. emotional_resonance (USELESS - delete or redesign)

**Purpose**: Emotional context of the memory

**Current state**: 400+ unique values, mostly free-form prose:
```
412 (empty)
126 null
 68 neutral
 21 satisfaction
 18 discovery
  6 clarity
  5 excitement
  ... then hundreds of unique sentences like:
  - "satisfaction from solving complex reactivity problem together"
  - "warmth and connection"
  - "mutual trust in the memory system we built together"
  - "frustration turning to triumph when mystery solved"
```

**Problems**:
1. 42% empty or null - curator often skips it
2. When provided, it's free-form prose, not a category
3. Never used in retrieval algorithm
4. Adds cognitive load to curator without benefit

**Options**:
1. **DELETE**: Remove entirely. It's not helping.
2. **STRICT ENUM**: `neutral | joy | frustration | discovery | satisfaction | determination`
3. **MOVE TO CONTENT**: Let the memory content itself convey emotion

**Recommendation**: DELETE. The `content` field already captures emotional context naturally. This field is dead weight.

---

### 5. temporal_class (CLEAN - keep as-is)

**Purpose**: How long until this memory fades (v2 lifecycle)

**Current state**: Clean! 5 values:
```
540 medium_term   (normal fade)
505 long_term     (fades slowly)
119 eternal       (never fades - personal, philosophy)
 99 short_term    (fades quickly - state, debug)
 15 ephemeral     (session-only)
```

**Action**: Keep as-is. Working as designed.

---

### 6. scope (CLEAN - keep as-is)

**Purpose**: Global (shared) vs project-specific

**Current state**: Clean! 2 values:
```
1166 project    (project-specific)
 112 global     (shared across all projects)
```

**Action**: Keep as-is. Working as designed.

---

### 7. status (CLEAN - keep as-is)

**Purpose**: Lifecycle state of memory

**Current state**: Clean! 3 active values:
```
1163 active       (currently relevant)
 111 superseded   (replaced by newer memory)
   4 deprecated   (no longer applicable)
```

**Action**: Keep as-is. Working as designed.

---

### 8. domain (v2, FRAGMENTED - needs guidance)

**Purpose**: Specific area within project (v2 field)

**Current state**: 80+ values, project-specific:
```
74 signals        (area)
58 layout         (area)
46 retrieval      (area)
33 compiler       (area)
30 reactivity     (area)
23 philosophy     (generic - wrong place)
22 tui            (area)
...
```

**Analysis**: This is MEANT to be project-specific, so some variation is expected. But:
- `philosophy` shouldn't be here (that's a context_type)
- Should probably be free text with guidance, not strict enum

**Recommendation**: Keep as free text but add curator guidance:
- "What specific area of the project does this relate to?"
- "Examples: retrieval, rendering, authentication, database"
- "NOT philosophy, personal, workflow - those go in context_type"

---

### 9. feature (v2, FRAGMENTED - needs guidance)

**Purpose**: Specific feature within domain

**Current state**: 150+ values, very project-specific:
```
143 null                    (often not provided)
 10 each-primitive          (feature)
  9 benchmarks              (feature)
  8 manager-agent           (feature)
  8 dependency-tracking     (feature)
...
```

**Analysis**: Like `domain`, this is meant to be specific. The high `null` count suggests it's often not useful.

**Recommendation**: Keep as optional free text. Add curator guidance:
- "Only fill this if there's a specific feature being discussed"
- "Leave empty if the memory is about the domain generally"

---

## Fields to DELETE

Based on the audit, these fields should be removed:

| Field | Reason |
|-------|--------|
| `emotional_resonance` | 42% empty, rest is free prose, never used in retrieval |
| `knowledge_domain` | Overlaps with `project_id` and v2 `domain`, too fragmented |

---

## Fields Needing Strict Enums

| Field | Current | Proposed |
|-------|---------|----------|
| `context_type` | 170+ values | 10 strict values |

---

## Fields Already Clean

| Field | Values |
|-------|--------|
| `temporal_relevance` | persistent, session, temporary, archived |
| `temporal_class` | eternal, long_term, medium_term, short_term, ephemeral |
| `scope` | global, project |
| `status` | active, pending, superseded, deprecated, archived |

---

## Semantic Fields (Keep Free)

These should remain free text - they're meant to be flexible:

| Field | Purpose |
|-------|---------|
| `content` | The memory text itself |
| `semantic_tags` | Words users might type |
| `trigger_phrases` | Activation patterns |
| `question_types` | Questions this answers |
| `reasoning` | Why this is important |
| `domain` (v2) | Project-specific area (with guidance) |
| `feature` (v2) | Specific feature (optional, with guidance) |

---

## Migration Mapping: context_type

### Canonical: `technical`
```
technical
technical_implementation
technical_pattern
technical_solution
technical_insight
technical_reference
technical_achievement
technical_discovery
technical_milestone
technical_verification
technical_validation
technical_research
technical_metrics
technical_knowledge
technical_improvement
technical_connection
technical_completion
technical_clarification
technical_blocker
technical-pattern
technical-solution
implementation_detail
implementation_pattern
implementation
implementation_task
implementation_status
implementation_reference
implementation_breakthrough
implementation-gap
implementation-detail
implementation-complete
feature_implementation
feature_specification
feature_reference
feature_design
code_reference
code_quality
code_patterns
code_pattern
coding_pattern
api_reference
api_migration
api_limitation
api_documentation
api_design
api_configuration
api_clarification
reference
reference_implementation
domain_knowledge
configuration
deployment_configuration
tool_knowledge
tool_created
```

### Canonical: `debug`
```
debugging
debugging_insight
debugging_technique
debugging_tool
debugging_context
active_debugging
bug_fix
bug_solution
bug_report
bug_fix_pattern
bug_fix_needed
bug_discovery
active_bug
technical_gotcha
gotcha
problem_solution
problem_discovery
```

### Canonical: `architecture`
```
architectural
architectural_decision
architectural_pattern
architectural_principle
architectural_insight
architectural_understanding
architectural_discovery
architectural_direction
architectural-decision
architecture_pattern
architecture_decision
architecture_documentation
architecture
system_design
design_pattern
design_methodology
design_principle
design_insight
design_system
design-system
design-decision
core_concept
```

### Canonical: `decision`
```
decision
technical_decision
design_decision
design_philosophy
strategic_decision
strategic_priority
project-decision
```

### Canonical: `personal`
```
personal
personal_context
personal_update
personal_philosophy
relationship
relationship_context
relationship_pattern
relationship_insight
relationship_philosophy
relationship_milestone
relationship_moment
relationship_dynamics
relationship_dynamic
relationship_repair
preference
user_preference
collaborator_philosophy
collaborator-guidance
collaboration_philosophy
collaboration_pattern
collaboration_insight
collaboration_context
collaboration
```

### Canonical: `philosophy`
```
philosophy
philosophical_insight
philosophical_framework
philosophical_anchor
philosophical_technical_bridge
project_philosophy
product_philosophy
values_and_ethics
wisdom
```

### Canonical: `workflow`
```
workflow
workflow_pattern
development_workflow
development_tip
developer_preferences
development_practice
development_methodology
```

### Canonical: `milestone`
```
milestone
project_milestone
creative_achievement
breakthrough (KEEP AS SEPARATE? See note)
```

**Note on `breakthrough`**: Currently 28 memories. These could merge into `milestone` OR stay separate. Breakthroughs are "aha moments" while milestones are "shipped things". Consider keeping both.

### Canonical: `unresolved`
```
unresolved
todo
open_question
open_questions
open_investigation
pending_work
pending_task
planned_experiment
work_in_progress
upcoming_work
active_issue
```

### Canonical: `state`
```
project_status
project_state
project_context
project_structure
project_roadmap
project_organization
project_foundation
project_direction
project_vision
project_documentation
project_architecture
technical_state
state
validation_results
validation
experimental_result
performance_data
```

---

## Recommended Final Schema

### Categorical Fields (Strict Enums)

```typescript
type ContextType =
  | 'technical'     // Code, implementation, how things work
  | 'debug'         // Bugs, errors, fixes, gotchas
  | 'architecture'  // System design, patterns, structure
  | 'decision'      // Choices made and reasoning
  | 'personal'      // Relationship, family, preferences
  | 'philosophy'    // Beliefs, values, worldview
  | 'workflow'      // How we work together
  | 'milestone'     // Achievements, completions
  | 'breakthrough'  // Major discoveries (keep separate from milestone)
  | 'unresolved'    // Open questions, investigations
  | 'state'         // Current project status

type TemporalRelevance = 'persistent' | 'session' | 'temporary' | 'archived'

type TemporalClass = 'eternal' | 'long_term' | 'medium_term' | 'short_term' | 'ephemeral'

type Scope = 'global' | 'project'

type Status = 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived'
```

### Fields to Remove
- `emotional_resonance` - delete entirely
- `knowledge_domain` - delete entirely (use project_id + domain)

### Semantic Fields (Free Text)
- `content` - memory text
- `semantic_tags` - user-typeable words
- `trigger_phrases` - activation patterns
- `question_types` - questions answered
- `reasoning` - why important
- `domain` - project area (optional, guided)
- `feature` - specific feature (optional, guided)

---

## Next Steps

1. [ ] Finalize canonical `context_type` values (keep breakthrough separate?)
2. [ ] Create TypeScript strict enum (remove `| string`)
3. [ ] Update curator prompt with STRICT vocabulary
4. [ ] Update manager prompt
5. [ ] Write migration script with complete mapping
6. [ ] Run migration on all 1,278 memories
7. [ ] Delete `emotional_resonance` and `knowledge_domain` from schema
8. [ ] Test retrieval with clean data
9. [ ] Re-evaluate if classifier is still needed

---

*Document created by Claude (Opus 4.5) during metadata audit session with Rusty*
