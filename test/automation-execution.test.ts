import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'
import { runRecipe, type BrowserRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-execution-'))
  return { directory, store: new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })) }
}

/** A service whose recipe() is the real runRecipe over a scripted page, and which records what it was asked. */
function serviceOver(behavior: Behavior = {}, extra: Record<string, unknown> = {}) {
  const calls: { legacyRecipe?: boolean }[] = []
  const service = {
    async recipe(steps: BrowserRecipeStep[], opts: { signal?: AbortSignal; legacyRecipe?: boolean }) {
      calls.push({ legacyRecipe: opts.legacyRecipe })
      const run = await runRecipe(fakePage(behavior).page, steps, shot, opts.signal, { legacy: opts.legacyRecipe })
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
    ...extra,
  } as unknown as BrowserService
  return { service, calls }
}

const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

test('a recipe whose asserts hold is verified, and the asset records that evidence level', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Search', domains: ['example.com'], recipe: [{ type: 'click', selector: '#go' }, { type: 'assert', text: 'Results' }] })
  const result = await executeAutomationAsset(serviceOver().service, store, draft.id, URL, {}, 'draft')
  assert.equal(result.succeeded, true)
  assert.equal(result.execution.executionStatus, 'completed')
  assert.equal(result.execution.validationStatus, 'passed')
  assert.equal(result.execution.evidenceLevel, 'verified')
  assert.equal(result.asset.testStatus, 'passed')
  assert.equal(result.asset.evidenceLevel, 'verified')
  assert.match(result.asset.testMessage!, /every assert step held/)
  assert.deepEqual(result.value, { url: URL, title: 'T', text: 'page text' }, 'the page state no longer carries the run fields')
  assert.equal(store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }).status, 'active')
})

test('a recipe without asserts still passes the old activation gate, but is marked legacy-unverified', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Read', domains: ['example.com'], recipe: [{ type: 'extract', selector: 'main', mode: 'text' }] })
  assert.equal(draft.evidenceLevel, undefined, 'untested data has no evidence level')
  const result = await executeAutomationAsset(serviceOver().service, store, draft.id, URL, {}, 'draft')
  assert.equal(result.succeeded, true)
  assert.equal(result.execution.validationStatus, 'not_checked')
  assert.equal(result.execution.evidenceLevel, 'legacy-unverified')
  assert.equal(result.asset.testStatus, 'passed', 'kept so existing assets can still be activated')
  assert.equal(result.asset.evidenceLevel, 'legacy-unverified')
  assert.match(result.asset.testMessage!, /legacy-unverified/)
  assert.equal(store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }).status, 'active')
})

test('a failed assert is not a passed test, does not throw, and blocks activation', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Pay', domains: ['example.com'], recipe: [{ type: 'click', selector: '#pay' }, { type: 'assert', text: 'Paid', timeoutMs: 500 }] })
  const service = serviceOver({ 'text=Paid': { waitFor: () => { throw timeout(500) } } }).service
  const result = await executeAutomationAsset(service, store, draft.id, URL, {}, 'draft')
  assert.equal(result.succeeded, false)
  assert.equal(result.execution.executionStatus, 'failed')
  assert.equal(result.execution.validationStatus, 'failed')
  assert.equal(result.execution.failedStep?.errorCode, 'VALIDATION_FAILED')
  assert.equal(result.execution.effects, 'observed')
  assert.equal(result.asset.testStatus, 'failed')
  assert.equal(result.asset.evidenceLevel, undefined)
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), /pass testing/)
})

test('a recipe that fails before its asserts is not a passed test either', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Broken', domains: ['example.com'], recipe: [{ type: 'extract', selector: '#nope' }, { type: 'assert', text: 'x' }] })
  const service = serviceOver({ '#nope': { innerText: () => { throw timeout(1000) } } }).service
  const result = await executeAutomationAsset(service, store, draft.id, URL, {}, 'draft')
  assert.equal(result.succeeded, false)
  assert.equal(result.execution.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  assert.equal(result.asset.testStatus, 'failed')
})

test('an active run counts a success only when the run completed without a failed assertion', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Check', domains: ['example.com'], recipe: [{ type: 'assert', text: 'Ready', timeoutMs: 500 }] })
  await executeAutomationAsset(serviceOver().service, store, draft.id, URL, {}, 'draft')
  store.setStatus(draft.id, 'active', { expectedRevision: draft.revision })
  const ok = await executeAutomationAsset(serviceOver().service, store, draft.id, URL, {}, 'active')
  assert.equal(ok.succeeded, true)
  assert.equal(ok.asset.successCount, 1)
  const bad = await executeAutomationAsset(serviceOver({ 'text=Ready': { waitFor: () => { throw timeout(500) } } }).service, store, draft.id, URL, {}, 'active')
  assert.equal(bad.succeeded, false)
  assert.equal(bad.asset.failureCount, 1)
  assert.equal(bad.asset.successCount, 1)
})

test('a UserScript result is wrapped in the same structure: a throw is failed, a return is completed, never validated', async () => {
  const { store } = fixture()
  const source = `// ==UserScript==\n// @name Heading\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { heading: document.title }`
  const draft = store.saveDraft({ kind: 'userscript', name: 'Heading', domains: ['example.com'], source })
  const good = await executeAutomationAsset({ runUserscript: async () => ({ resultJson: '{"heading":"H"}' }) } as unknown as BrowserService, store, draft.id, URL, {}, 'draft')
  assert.equal(good.execution.executionStatus, 'completed')
  assert.equal(good.execution.validationStatus, 'not_checked')
  assert.equal(good.execution.evidenceLevel, 'legacy-unverified')
  assert.equal(good.execution.effects, 'unknown')
  assert.equal((good.value as { resultJson: string }).resultJson, '{"heading":"H"}')
  assert.equal(good.asset.testStatus, 'passed')

  const bad = await executeAutomationAsset({ runUserscript: async () => { throw new Error('page.evaluate: Target page, context or browser has been closed') } } as unknown as BrowserService, store, draft.id, URL, {}, 'draft')
  assert.equal(bad.succeeded, false)
  assert.equal(bad.execution.executionStatus, 'failed')
  assert.equal(bad.execution.failedStep?.errorCode, 'TARGET_CLOSED')
  assert.match(bad.execution.failedStep!.message, /has been closed/, 'the original message is kept')
  assert.equal(bad.asset.testStatus, 'failed')
})

test('problems before any step ran (no page, bad navigation) still throw and still record a failure', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Nav', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] })
  const service = { recipe: async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED') } } as unknown as BrowserService
  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, {}, 'draft'), /ERR_NAME_NOT_RESOLVED/)
  assert.equal(store.get(draft.id)?.testStatus, 'failed')
})

test('stored v1 assets keep running with an unknown extract mode, flagged legacyFallback; saving one is rejected', async () => {
  const { directory, store } = fixture()
  assert.throws(() => store.saveDraft({ kind: 'recipe', name: 'Bad mode', domains: ['example.com'], recipe: [{ type: 'extract', selector: 'a', mode: 'markdown' } as unknown as BrowserRecipeStep] }), /unsupported extract mode "markdown"/)
  assert.throws(() => store.saveDraft({ kind: 'recipe', name: 'Bad wait', domains: ['example.com'], recipe: [{ type: 'wait', condition: 'idle' } as unknown as BrowserRecipeStep] }), /unsupported wait condition/)

  // An asset written before B2: unknown mode, no evidenceLevel field.
  const ok = store.saveDraft({ kind: 'recipe', name: 'Old', domains: ['example.com'], recipe: [{ type: 'extract', selector: 'a', mode: 'links' }] })
  const statePath = path.join(directory, 'assets.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.assets[0].recipe[0].mode = 'markdown'
  fs.writeFileSync(statePath, JSON.stringify(state))
  const reopened = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  assert.equal(reopened.get(ok.id)?.evidenceLevel, undefined, 'legacy data loads without the new field')

  const { service, calls } = serviceOver({ a: { evaluateAll: () => [{ text: 'x', url: 'http://x/' }] } })
  const result = await executeAutomationAsset(service, reopened, ok.id, URL, {}, 'draft')
  assert.deepEqual(calls, [{ legacyRecipe: true }])
  assert.equal(result.execution.executionStatus, 'completed')
  assert.equal(result.execution.legacyFallback, true)
  assert.equal(result.execution.evidenceLevel, 'legacy-unverified')
  assert.equal(result.asset.testStatus, 'passed')
})
