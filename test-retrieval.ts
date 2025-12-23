#!/usr/bin/env bun
/**
 * Quick test to isolate FatherStateDB retrieval
 * Tests if data loads correctly from disk
 */

import { createDatabase } from 'fatherstatedb'
import { sessionSummarySchema, memorySchema } from './src/types/schema.ts'
import { homedir } from 'os'
import { join } from 'path'

const basePath = join(homedir(), '.local', 'share', 'memory', 'memory-ts')

console.log('🧪 Testing FatherStateDB Retrieval')
console.log('=' .repeat(60))
console.log(`📂 Base path: ${basePath}`)

// Test 1: Load summaries
console.log('\n📋 Test 1: Loading summaries database...')
const summaries = await createDatabase({
  path: join(basePath, 'summaries'),
  schema: sessionSummarySchema,
  contentColumn: 'summary',
  autoSave: true,
})

const allSummaries = summaries.all()
console.log(`   Found ${allSummaries.length} summaries`)

if (allSummaries.length > 0) {
  console.log('\n   Latest summary:')
  const latest = allSummaries.sort((a, b) => b.created - a.created)[0]
  console.log(`   - ID: ${latest.id}`)
  console.log(`   - Session: ${latest.session_id}`)
  console.log(`   - Created (raw): ${latest.created}`)
  console.log(`   - All keys: ${Object.keys(latest).join(', ')}`)
  console.log(`   - Summary: ${latest.summary.slice(0, 100)}...`)
} else {
  console.log('   ❌ No summaries found!')
}

// Test 2: Load memories
console.log('\n📋 Test 2: Loading memories database...')
const memories = await createDatabase({
  path: join(basePath, 'memories'),
  schema: memorySchema,
  contentColumn: 'content',
  autoSave: true,
})

const allMemories = memories.all()
console.log(`   Found ${allMemories.length} memories`)

if (allMemories.length > 0) {
  console.log('\n   First 3 memories:')
  for (const mem of allMemories.slice(0, 3)) {
    console.log(`   - [${mem.context_type}] ${mem.content.slice(0, 60)}...`)
  }
} else {
  console.log('   ❌ No memories found!')
}

// Test 3: Insert and retrieve
console.log('\n📋 Test 3: Insert and immediate retrieve...')
const testId = await summaries.insert({
  session_id: 'test-session',
  project_id: 'test-project',
  summary: 'Test summary for retrieval verification',
  interaction_tone: 'testing',
})
console.log(`   Inserted with ID: ${testId}`)

const afterInsert = summaries.all()
console.log(`   Summaries after insert: ${afterInsert.length}`)

const found = summaries.get(testId)
console.log(`   Retrieved by ID: ${found ? 'YES' : 'NO'}`)
if (found) {
  console.log(`   - Summary: ${found.summary}`)
}

// Cleanup test record
await summaries.delete(testId)
console.log(`   Cleaned up test record`)

console.log('\n' + '=' .repeat(60))
console.log('🧪 Test complete!')

// Close databases
summaries.close()
memories.close()
