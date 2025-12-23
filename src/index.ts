// ============================================================================
// @rlabs-inc/memory - AI Memory System
// Consciousness continuity through intelligent memory curation and retrieval
// ============================================================================

// Core exports
export {
  MemoryEngine,
  createEngine,
  type EngineConfig,
  type StorageMode,
  type ContextRequest,
} from './core/engine.ts'

export {
  MemoryStore,
  createStore,
  type StoreConfig,
} from './core/store.ts'

export {
  SmartVectorRetrieval,
  createRetrieval,
  type SessionContext,
} from './core/retrieval.ts'

export {
  Curator,
  createCurator,
  type CuratorConfig,
} from './core/curator.ts'

// Type exports
export type {
  CuratedMemory,
  StoredMemory,
  SessionSummary,
  ProjectSnapshot,
  CurationResult,
  RetrievalResult,
  SessionPrimer,
  ContextType,
  TemporalRelevance,
  EmotionalResonance,
  KnowledgeDomain,
  CurationTrigger,
} from './types/memory.ts'

export {
  memorySchema,
  sessionSummarySchema,
  projectSnapshotSchema,
  sessionSchema,
  type MemorySchema,
  type SessionSummarySchema,
  type ProjectSnapshotSchema,
  type SessionSchema,
} from './types/schema.ts'
