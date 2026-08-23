import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, normalizeRecipeForCandidate, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import type { BrowserRecipeStep } from '../src/automation.ts'

function fixture(overrides: Parameters<typeof resolveAutomationAssetPolicy>[0] = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-assets-'))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, ...overrides }))
  return { directory, store }
}

const recipe: BrowserRecipeStep[] = [
  { type: 'fill', selector: 'input[name=q]', value: 'private search text' },
  { type: 'click', selector: 'button[type=submit]' },
  { type: 'extract', selector: 'main', mode: 'text', limit: 10 },
]

test('candidate normalization removes concrete inputs and marks secret selectors', () => {
  const normalized = normalizeRecipeForCandidate([
    ...recipe,
    { type: 'fill', selector: 'input[type=password]', value: 'do-not-store' },
  ]) as Array<Record<string, unknown>>
  assert.equal(normalized[0]?.value, '{{input_q}}')
  assert.equal(normalized[3]?.value, '{{secret}}')
  assert.equal(normalized[0]?.selector, 'input[name]')
  assert.equal(JSON.stringify(normalized).includes('private search text'), false)
  assert.equal(JSON.stringify(normalized).includes('do-not-store'), false)
})

test('candidate is suggested only after bounded repeated success across sessions', () => {
  const { store } = fixture({ minSuccessfulRuns: 3, minDistinctSessions: 2, maxSuggestionsPerDay: 2 })
  assert.equal(store.recordRecipe('https://example.com/search', recipe, 'session-a', true)?.suggestedAt, undefined)
  assert.equal(store.recordRecipe('https://example.com/search', recipe, 'session-a', true)?.suggestedAt, undefined)
  const candidate = store.recordRecipe('https://example.com/search', recipe, 'session-b', true)
  assert.ok(candidate?.suggestedAt)
  assert.equal(candidate?.sessionIds.includes('session-a'), false)
  assert.equal(store.snapshot().candidates.length, 1)
  assert.equal(JSON.stringify(store.snapshot()).includes('private search text'), false)
  assert.equal(Object.hasOwn(store.snapshot().candidates[0]!, 'steps'), false)
  assert.equal(Object.hasOwn(store.snapshot().candidates[0]!, 'sessionIds'), false)
})

test('candidate summary creates a draft that must pass testing before activation', () => {
  const { store } = fixture({ minSuccessfulRuns: 2, minDistinctSessions: 1 })
  store.recordRecipe('https://example.com/search', recipe, 'session-a', true)
  const candidate = store.recordRecipe('https://example.com/search', recipe, 'session-a', true)!
  const draft = store.summarizeCandidate(candidate.id)
  assert.equal(draft.status, 'draft')
  assert.throws(() => store.setStatus(draft.id, 'active'), /pass testing/)
  store.test(draft.id)
  assert.equal(store.setStatus(draft.id, 'active').status, 'active')
  assert.doesNotThrow(() => store.assertTarget(store.get(draft.id)!, 'https://sub.example.com/result'))
  assert.throws(() => store.assertTarget(store.get(draft.id)!, 'https://other.example/result'), /not allowed/)
  assert.equal(store.search('search', 'example.com')[0]?.id, draft.id)
  assert.equal('recipe' in store.search('search', 'example.com')[0]!, false)
})

test('success threshold resets outside the configured observation window', () => {
  const { store } = fixture({ minSuccessfulRuns: 2, minDistinctSessions: 1, successWindowDays: 1 })
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  store.recordRecipe('https://example.com/', recipe, 'session-a', true, start)
  const candidate = store.recordRecipe('https://example.com/', recipe, 'session-a', true, start + 2 * 86_400_000)
  assert.equal(candidate?.successfulRuns, 1)
  assert.equal(candidate?.suggestedAt, undefined)
})

test('retrieval returns only active summaries and respects top-k', () => {
  const { store } = fixture({ persistenceMode: 'manual', retrievalTopK: 1 })
  for (const name of ['Search articles', 'Search issues']) {
    const draft = store.saveDraft({ kind: 'recipe', name, description: 'search example', domains: ['example.com'], recipe })
    store.test(draft.id)
    store.setStatus(draft.id, 'active')
  }
  const results = store.search('search', 'example.com')
  assert.equal(results.length, 1)
  assert.equal(Object.hasOwn(results[0]!, 'source'), false)
  assert.equal(Object.hasOwn(results[0]!, 'recipe'), false)
  assert.throws(() => store.search('   '), /explicit keywords/)
  assert.equal(store.search('issues', 'example.com', 'active', 'recipe')[0]?.kind, 'recipe')
})

test('auto-tested policy never promotes a static validation result', () => {
  const { store } = fixture({ persistenceMode: 'manual', activationMode: 'auto-tested' })
  const draft = store.saveDraft({ kind: 'recipe', name: 'Bounded recipe', domains: ['example.com'], recipe })
  assert.equal(store.test(draft.id).status, 'draft')
})

test('corrupt persisted assets fail closed instead of being overwritten', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-assets-corrupt-'))
  fs.writeFileSync(path.join(directory, 'assets.json'), '{broken', 'utf8')
  assert.throws(() => new AutomationAssetStore(resolveAutomationAssetPolicy({ directory })), /refusing to overwrite/)
  fs.writeFileSync(path.join(directory, 'assets.json'), JSON.stringify({ version: 1, candidates: [], assets: [{}] }), 'utf8')
  assert.throws(() => new AutomationAssetStore(resolveAutomationAssetPolicy({ directory })), /malformed/)
})
