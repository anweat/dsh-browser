import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy, type AutomationAsset } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { convertV1ToV2Draft } from '../src/automation-convert.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'
import { runRecipe, type AnyRecipeStep, type BrowserRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { mapError } from '../src/actions/errors.ts'
import { fakePage } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'

function fixture(extra: Record<string, unknown> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-convert-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', minInputSetsForActivation: 1, ...extra })
  const store = new AutomationAssetStore(policy)
  return { directory, store, development: new AutomationDevelopmentService(store, policy) }
}

const V1: BrowserRecipeStep[] = [
  { type: 'wait', condition: 'selector', value: '#q', timeoutMs: 8000 },
  { type: 'fill', selector: '#q', value: '{{query}}' },
  { type: 'click', selector: 'button.go' },
  { type: 'wait', condition: 'text', value: 'Results' },
  { type: 'press', key: 'Enter' },
  { type: 'press', key: 'Tab', selector: '#q' },
  { type: 'select', selector: '#sort', value: 'top' },
  { type: 'check', selector: '#all', checked: false },
  { type: 'hover', selector: '.menu' },
  { type: 'wait', condition: 'time', waitMs: 50 },
  { type: 'scroll', deltaY: 500 },
  { type: 'extract', selector: '#results', mode: 'text', limit: 10 },
  { type: 'extract' },
  { type: 'assert', selector: '#status', timeoutMs: 9000 },
  { type: 'assert', text: 'Done' },
  { type: 'screenshot' },
]

function activeV1(store: AutomationAssetStore): AutomationAsset {
  const draft = store.saveDraft({ kind: 'recipe', name: 'Search issues', description: 'Search and read', domains: ['example.com'], tags: ['search'], recipe: V1 })
  store.noteTestResult(draft.id, true, URL)
  store.setStatus(draft.id, 'active', { expectedRevision: draft.revision })
  return store.get(draft.id)!
}

test('convert makes a NEW v2 draft with css locators marked explicitFirst, and lists every marked step', () => {
  const { store } = fixture()
  const source = activeV1(store)
  const result = convertV1ToV2Draft(source)
  assert.deepEqual(result.draft.recipe, [
    { type: 'wait', condition: 'locator', locator: { css: '#q', explicitFirst: true }, timeoutMs: 8000 },
    { type: 'fill', locator: { css: '#q', explicitFirst: true }, value: '{{query}}' },
    { type: 'click', locator: { css: 'button.go', explicitFirst: true } },
    { type: 'wait', condition: 'text', value: 'Results' },
    { type: 'press', key: 'Enter' },
    { type: 'press', key: 'Tab', locator: { css: '#q', explicitFirst: true } },
    { type: 'select', locator: { css: '#sort', explicitFirst: true }, value: 'top' },
    { type: 'check', locator: { css: '#all', explicitFirst: true }, checked: false },
    { type: 'hover', locator: { css: '.menu', explicitFirst: true } },
    { type: 'wait', condition: 'time', waitMs: 50 },
    { type: 'scroll', deltaY: 500 },
    { type: 'extract', locator: { css: '#results', explicitFirst: true }, mode: 'text', limit: 10 },
    { type: 'extract' },
    { type: 'assert', locator: { css: '#status', explicitFirst: true }, timeoutMs: 9000 },
    { type: 'assert', text: 'Done' },
    { type: 'screenshot' },
  ])
  assert.deepEqual(result.pendingDisambiguation.map(entry => [entry.step, entry.action]), [[1, 'wait'], [2, 'fill'], [3, 'click'], [6, 'press'], [7, 'select'], [8, 'check'], [9, 'hover'], [12, 'extract'], [14, 'assert']])
  assert.ok(result.pendingDisambiguation.every(entry => entry.kind === 'explicit-first' && entry.locator.explicitFirst === true))
  assert.equal(result.draft.schemaVersion, 2)
  assert.equal(result.draft.sourceAssetId, source.id)
  assert.equal(result.draft.sourceRevision, source.revision)
  assert.deepEqual(result.draft.inputSchema, [{ name: 'query', type: 'string', required: true }])
  assert.equal(result.draft.id, undefined, 'always a new draft, never an overwrite')
  assert.match(result.notes.join('\n'), /no postconditions/)
  assert.match(result.notes.join('\n'), /5 s/)
})

test('converting an active asset leaves it, byte for byte, as it was, and creates a separate draft', () => {
  const { store, development } = fixture()
  const source = activeV1(store)
  const before = JSON.stringify(store.get(source.id))
  const { draft, conversion } = development.convert(source.id, 'session-1')
  assert.equal(JSON.stringify(store.get(source.id)), before, 'the active asset is unchanged: same revision, status, recipe, test result')
  assert.notEqual(draft.id, source.id)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.schemaVersion, 2)
  assert.equal(draft.sourceAssetId, source.id)
  assert.equal(draft.sourceRevision, source.revision)
  assert.equal(draft.testStatus, 'untested', 'the draft starts untested: the old test result does not carry over')
  assert.equal(draft.name, 'Search issues (v2)')
  assert.deepEqual(draft.domains, ['example.com'])
  assert.deepEqual(draft.pendingDisambiguation, conversion.pendingDisambiguation)
  assert.equal(store.snapshot().assets.length, 2)
  assert.equal(store.search('search issues', 'example.com')[0]?.id, source.id, 'the active asset is still what search returns')
  assert.equal(store.search('search issues', 'example.com').length, 1, 'the draft is not active, so it is not offered')
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), /pass testing/)
})

test('a draft source and an archived source convert too; only recipes that are still v1 do', () => {
  const { store, development } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Draft', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] })
  assert.equal(development.convert(draft.id, 's').draft.sourceAssetId, draft.id)
  store.setStatus(draft.id, 'archived')
  assert.equal(development.convert(draft.id, 's').draft.sourceRevision, draft.revision)

  const script = store.saveDraft({ kind: 'userscript', name: 'U', domains: ['example.com'], source: `// ==UserScript==\n// @name U\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1` })
  assert.throws(() => development.convert(script.id, 's'), /only recipe assets have a schema to convert/)
  const v2 = development.convert(draft.id, 's').draft
  assert.throws(() => development.convert(v2.id, 's'), /already schema v2/)
  assert.throws(() => development.convert('missing', 's'), /not found/)
})

test('an unknown extract mode or wait condition refuses the conversion and says why', () => {
  const { directory, store } = fixture()
  const ok = store.saveDraft({ kind: 'recipe', name: 'Old', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }, { type: 'extract', selector: 'a', mode: 'links' }] })
  // Stored before B2: the mode was never checked and ran as "links".
  const statePath = path.join(directory, 'assets.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.assets[0].recipe[1].mode = 'markdown'
  fs.writeFileSync(statePath, JSON.stringify(state))
  const reopened = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  const error = (() => { try { convertV1ToV2Draft(reopened.get(ok.id)!) } catch (caught) { return caught as Error } })()!
  assert.match(error.message, /cannot convert asset .* to schema v2: step 2 \(extract\) has the extract mode "markdown"/)
  assert.match(error.message, /treated it as "links"/)
  assert.equal(mapError(error, 'automation.develop').code, 'INVALID_RECIPE')
  assert.equal(reopened.snapshot().assets.length, 1, 'no draft was created')

  state.assets[0].recipe[1] = { type: 'wait', condition: 'idle' }
  fs.writeFileSync(statePath, JSON.stringify(state))
  const again = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  assert.throws(() => convertV1ToV2Draft(again.get(ok.id)!), /step 2 \(wait\) has the wait condition "idle"/)
})

test('each conversion counts as a draft write, and the draft limit still applies', () => {
  const { store, development } = fixture({ maxModelDraftWritesPerSession: 2 })
  const source = activeV1(store)
  development.convert(source.id, 'session-1')
  development.convert(source.id, 'session-1')
  assert.throws(() => development.convert(source.id, 'session-1'), /draft write limit reached/)
  assert.equal(development.convert(source.id, 'session-2').draft.status, 'draft', 'another session has its own budget')
})

test('the converted draft runs with v1 first-match behaviour, but cannot pass a test until something verifies the result', async () => {
  const { store, development } = fixture()
  const source = store.saveDraft({ kind: 'recipe', name: 'Go', domains: ['example.com'], recipe: [{ type: 'click', selector: '.row' }, { type: 'extract', selector: '#out', mode: 'text' }] })
  const { draft } = development.convert(source.id, 'session-1')
  const traces: string[][] = []
  const service = {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      const { page, trace } = fakePage()
      const run = await runRecipe(page, steps, shot, opts.signal, { schemaVersion: opts.schemaVersion, allowedDomains: opts.allowedDomains, postconditions: opts.postconditions })
      traces.push(trace)
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  const first = await executeAutomationAsset(service, store, draft.id, URL, {}, 'draft')
  assert.equal(first.execution.executionStatus, 'completed')
  assert.ok(traces[0]!.includes('first:.row'), 'explicitFirst keeps the v1 first-match semantics')
  assert.equal(first.succeeded, false)
  assert.match(first.asset.testMessage!, /no assert step and no postcondition/)

  // Adding a postcondition (the author's next step) lets the test pass; the pending list still shows what is not unique.
  const { schemaVersion: _s, sourceAssetId: _a, sourceRevision: _r, ...editable } = store.get(draft.id)!
  const fixed = store.saveDraft({ ...editable, schemaVersion: 2, postconditions: [{ text: 'ok' }] } as never)
  const second = await executeAutomationAsset(service, store, fixed.id, URL, {}, 'draft')
  assert.equal(second.succeeded, true)
  assert.equal(store.get(fixed.id)?.sourceAssetId, source.id, 'provenance survives edits')
  assert.equal(store.get(fixed.id)?.pendingDisambiguation?.length, 2)
  assert.equal(store.get(source.id)?.revision, source.revision)
})
