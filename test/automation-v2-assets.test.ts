import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy, type AutomationAsset } from '../src/automation-assets.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'
import { runRecipe, type AnyRecipeStep, type BrowserRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { mapError } from '../src/actions/errors.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-v2-'))
  return { directory, store: new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', minInputSetsForActivation: 1 })) }
}

/** A service whose recipe() is the real runRecipe over a scripted page, recording the options it was given. */
function serviceOver(behavior: Behavior = {}) {
  const calls: Record<string, unknown>[] = []
  const service = {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      calls.push({ schemaVersion: opts.schemaVersion, legacyRecipe: opts.legacyRecipe, allowedDomains: opts.allowedDomains, gotoSameOrigin: opts.gotoSameOrigin, steps })
      const { page } = fakePage(behavior)
      const run = await runRecipe(page, steps, shot, opts.signal, {
        legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, outputSchema: opts.outputSchema, allowedDomains: opts.allowedDomains,
        goto: async (url: string) => { await (page as any).goto(url) },
      })
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  return { service, calls }
}

const v2Draft = (extra: Partial<AutomationAsset> = {}): Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'> => ({
  kind: 'recipe', name: 'Search v2', domains: ['example.com'], schemaVersion: 2,
  recipe: [
    { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
    { type: 'click', locator: { role: 'button', name: 'Search' } },
    { type: 'extract', locator: { css: '#results' }, as: 'results' },
  ] as unknown as AnyRecipeStep[],
  ...extra,
})

test('schemaVersion is optional: a stored v1 asset has none and behaves as before; v2-only fields are refused on v1', () => {
  const { store } = fixture()
  const v1 = store.saveDraft({ kind: 'recipe', name: 'Old', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] })
  assert.equal(v1.schemaVersion, undefined)
  assert.equal('schemaVersion' in store.snapshot().assets[0]!, false, 'summaries of v1 assets are unchanged')
  for (const field of [{ postconditions: [{ text: 'x' }] }, { inputSchema: [{ name: 'a', type: 'string' }] }, { outputSchema: [] }, { requiredCapabilities: ['act.fill'] }]) {
    assert.throws(() => store.saveDraft({ kind: 'recipe', name: 'Old', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }], ...field } as never), /need schemaVersion 2/)
  }
  assert.throws(() => store.saveDraft({ kind: 'recipe', name: 'Odd', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }], schemaVersion: 3 as never }), /schemaVersion must be 1 or 2/)
  assert.throws(() => store.saveDraft({ kind: 'userscript', name: 'U', domains: ['example.com'], source: 'x', schemaVersion: 2 }), /recipe assets only/)
})

test('a v2 draft is validated and stored with its schema fields; inputNames come from inputSchema', () => {
  const { store } = fixture()
  const asset = store.saveDraft(v2Draft({
    inputSchema: [{ name: 'query', type: 'string', required: true, example: 'dsh' }],
    outputSchema: [{ name: 'results', type: 'string' }],
    postconditions: [{ output: 'results', nonEmpty: true }],
    requiredCapabilities: ['act.fill'],
  }))
  assert.equal(asset.schemaVersion, 2)
  assert.deepEqual(asset.inputNames, ['query'])
  assert.deepEqual(asset.inputSchema, [{ name: 'query', type: 'string', required: true, example: 'dsh' }])
  assert.deepEqual(asset.postconditions, [{ output: 'results', nonEmpty: true }])
  assert.deepEqual(asset.requiredCapabilities, ['act.fill'])
  assert.equal(asset.pendingDisambiguation, undefined)
  assert.equal(store.snapshot().assets[0]!.schemaVersion, 2)
  assert.equal(JSON.parse(fs.readFileSync(path.join(store.policy.directory, 'assets.json'), 'utf8')).assets[0].schemaVersion, 2)

  // Without an inputSchema, placeholders still declare the inputs (as strings).
  const plain = store.saveDraft(v2Draft({ name: 'Plain' }))
  assert.deepEqual(plain.inputNames, ['query'])
  assert.equal(plain.inputSchema, undefined)
})

test('saving a malformed v2 draft is INVALID_RECIPE with a message that says what to fix', () => {
  const { store } = fixture()
  const bad = (extra: Partial<AutomationAsset>, pattern: RegExp) => {
    const error = (() => { try { store.saveDraft(v2Draft(extra)) } catch (caught) { return caught } })() as Error
    assert.match(error?.message ?? 'no error', pattern)
    assert.equal(mapError(error, 'automation.develop').code, 'INVALID_RECIPE')
  }
  bad({ recipe: [{ type: 'click', selector: '#a' }] as unknown as AnyRecipeStep[] }, /locate with "locator"/)
  bad({ inputSchema: [{ name: 'other', type: 'string' }] }, /uses \{\{query\}\} but inputSchema does not declare it/)
  bad({ outputSchema: [{ name: 'ghost', type: 'string' }] }, /is not produced: add an extract step with as: "ghost"/)
  bad({ postconditions: [{ output: 'ghost', nonEmpty: true }] }, /not produced by any extract step/)
  bad({ recipe: [{ type: 'goto', url: 'https://evil.test/x' }] as unknown as AnyRecipeStep[] }, /goto evil\.test is not allowed on this asset/)
  bad({ domains: [], recipe: [{ type: 'goto', url: 'https://example.com/x' }] as unknown as AnyRecipeStep[] }, /must declare domains/)
  assert.doesNotThrow(() => store.saveDraft(v2Draft({ recipe: [{ type: 'goto', url: 'https://app.example.com/x' }, { type: 'assert', urlIncludes: '/x' }] as unknown as AnyRecipeStep[], inputSchema: [] })))
})

test('editing a v2 draft keeps its schema version and provenance; explicit-first steps are tracked from the recipe', () => {
  const { store } = fixture()
  const created = store.saveDraft({ ...v2Draft({ recipe: [{ type: 'click', locator: { css: '.row', explicitFirst: true } }] as unknown as AnyRecipeStep[], inputSchema: [] }), sourceAssetId: 'src-1', sourceRevision: 4 })
  assert.deepEqual(created.pendingDisambiguation, [{ step: 1, action: 'click', kind: 'explicit-first', locator: { css: '.row', explicitFirst: true } }])
  assert.equal(created.sourceAssetId, 'src-1')
  const { schemaVersion: _drop, sourceAssetId: _a, sourceRevision: _b, ...edit } = v2Draft({ id: created.id, recipe: [{ type: 'click', locator: { css: '.row', index: 0, indexReason: 'the first row is the newest' } }] as unknown as AnyRecipeStep[], inputSchema: [] })
  const edited = store.saveDraft(edit as never)
  assert.equal(edited.schemaVersion, 2, 'an omitted schemaVersion does not downgrade a v2 draft')
  assert.equal(edited.pendingDisambiguation, undefined, 'resolved once the marker is gone')
  assert.equal(edited.sourceAssetId, 'src-1')
  assert.equal(edited.sourceRevision, 4)
  assert.equal(edited.revision, created.revision + 1)
})

test('validate() on a v2 draft names what is still missing', () => {
  const { store } = fixture()
  const draft = store.saveDraft(v2Draft({ recipe: [{ type: 'click', locator: { css: '.row', explicitFirst: true } }] as unknown as AnyRecipeStep[], inputSchema: [] }))
  const message = store.validate(draft.id).testMessage!
  assert.match(message, /Recipe v2 structure is valid/)
  assert.match(message, /1 step\(s\) still take the first match/)
  assert.match(message, /no assert step or postcondition/)
})

test('a v2 test with no assert and no postcondition cannot pass, and says why; v1 keeps its legacy gate', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(v2Draft())
  const { service, calls } = serviceOver()
  const result = await executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh' }, 'draft')
  assert.equal(result.execution.executionStatus, 'completed', 'the steps ran')
  assert.equal(result.execution.validationStatus, 'not_checked')
  assert.equal(result.succeeded, false)
  assert.equal(result.asset.testStatus, 'failed')
  assert.match(result.asset.testMessage!, /no assert step and no postcondition, so nothing verified the result and the test cannot pass/)
  assert.match(result.execution.message!, /nothing verified the result/)
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), /pass testing/)
  assert.deepEqual(calls.map(call => [call.schemaVersion, call.legacyRecipe, call.allowedDomains, call.gotoSameOrigin]), [[2, undefined, ['example.com'], undefined]], 'asset goto is limited to its domains, with no same-origin allowance')

  const v1 = store.saveDraft({ kind: 'recipe', name: 'v1', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] })
  const old = await executeAutomationAsset(serviceOver().service, store, v1.id, URL, {}, 'draft')
  assert.equal(old.succeeded, true, 'v1 assets without an assert still pass as legacy-unverified')
  assert.equal(old.execution.evidenceLevel, 'legacy-unverified')
})

test('a v2 asset with an assert or a postcondition can pass, and is verified', async () => {
  const { store } = fixture()
  const withAssert = store.saveDraft(v2Draft({ name: 'with assert', recipe: [{ type: 'click', locator: { css: '#go' } }, { type: 'assert', text: 'Done' }] as unknown as AnyRecipeStep[], inputSchema: [] }))
  const a = await executeAutomationAsset(serviceOver().service, store, withAssert.id, URL, {}, 'draft')
  assert.equal(a.succeeded, true)
  assert.equal(a.execution.validationStatus, 'passed')
  assert.equal(a.asset.evidenceLevel, 'verified')
  assert.equal(a.asset.testStatus, 'passed')

  const withPost = store.saveDraft(v2Draft({ name: 'with post', recipe: [{ type: 'click', locator: { css: '#go' } }] as unknown as AnyRecipeStep[], inputSchema: [], postconditions: [{ text: 'Saved' }] }))
  const b = await executeAutomationAsset(serviceOver().service, store, withPost.id, URL, {}, 'draft')
  assert.equal(b.succeeded, true)
  assert.equal(b.asset.evidenceLevel, 'verified')
  assert.equal(store.setStatus(withPost.id, 'active', { expectedRevision: withPost.revision }).status, 'active')
})

test('a failing postcondition makes the run completed but not validated, the test failed, and activation impossible', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(v2Draft({ recipe: [{ type: 'click', locator: { css: '#pay' } }] as unknown as AnyRecipeStep[], inputSchema: [], postconditions: [{ text: 'Paid' }] }))
  const service = serviceOver({ 'text=Paid': { waitFor: () => { throw timeout(5000) } } }).service
  const result = await executeAutomationAsset(service, store, draft.id, URL, {}, 'draft')
  assert.equal(result.execution.executionStatus, 'completed')
  assert.equal(result.execution.validationStatus, 'failed')
  assert.equal(result.execution.failedStep?.errorCode, 'VALIDATION_FAILED')
  assert.equal(result.execution.effects, 'observed')
  assert.equal(result.succeeded, false)
  assert.equal(result.asset.testStatus, 'failed')
  assert.equal(result.asset.evidenceLevel, undefined)
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), /pass testing/)
})

test('inputSchema types are enforced at run time and the converted values reach the steps', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(v2Draft({
    recipe: [
      { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
      { type: 'select', locator: { label: 'Sort' }, value: '{{sort}}' },
      { type: 'fill', locator: { label: 'Limit' }, value: '{{limit}}' },
      { type: 'assert', text: '{{query}} results' },
    ] as unknown as AnyRecipeStep[],
    inputSchema: [
      { name: 'query', type: 'string', required: true },
      { name: 'sort', type: 'enum', enumValues: ['new', 'top'], required: true },
      { name: 'limit', type: 'number', required: true },
    ],
  }))
  const { service, calls } = serviceOver()
  const ok = await executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh', sort: 'top', limit: '12.0' }, 'draft')
  assert.equal(ok.succeeded, true)
  assert.deepEqual((calls[0]!.steps as any[]).map(step => step.value ?? step.text), ['dsh', 'top', '12', 'dsh results'], 'number converted, text placeholders replaced everywhere')

  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh', sort: 'top', limit: 'many' }, 'draft'), /input "limit" must be a number/)
  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh', sort: 'old', limit: 1 }, 'draft'), /input "sort" must be one of new \| top/)
  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh', limit: 1 }, 'draft'), /missing declared automation inputs: sort/)
  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, { query: 'dsh', sort: 'top', limit: 1, extra: 1 }, 'draft'), /undeclared automation inputs: extra/)
  assert.equal(calls.length, 1, 'a bad input never reaches the browser')
})

test('a v2 asset cannot goto outside its domains: refused before any step runs', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(v2Draft({ recipe: [{ type: 'click', locator: { css: '#a' } }, { type: 'goto', url: 'https://{{where}}/x' }, { type: 'assert', text: 'x' }] as unknown as AnyRecipeStep[], inputSchema: [{ name: 'where', type: 'string' }] }))
  const { service } = serviceOver()
  await assert.rejects(() => executeAutomationAsset(service, store, draft.id, URL, { where: 'evil.test' }, 'draft'), (error: Error) => {
    assert.match(error.message, /goto evil\.test is not allowed on this recipe \(allowed: example\.com\); nothing ran/)
    assert.equal(mapError(error, 'automation.run').code, 'POLICY_DENIED')
    return true
  })
  assert.equal(store.get(draft.id)?.testStatus, 'failed')
  const ok = await executeAutomationAsset(service, store, draft.id, URL, { where: 'app.example.com' }, 'draft')
  assert.equal(ok.execution.executionStatus, 'completed')
})

test('a persisted asset with an unknown schemaVersion fails closed', () => {
  const { directory, store } = fixture()
  store.saveDraft({ kind: 'recipe', name: 'x', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] })
  const statePath = path.join(directory, 'assets.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.assets[0].schemaVersion = 7
  fs.writeFileSync(statePath, JSON.stringify(state))
  assert.throws(() => new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })), /malformed/)
})
