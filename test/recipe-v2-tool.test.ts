import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { findAction } from '../src/actions/registry.ts'
import { renderIndex, type IndexEnvironment } from '../src/actions/index-view.ts'
import { validateArgs } from '../src/actions/schema.ts'
import { browserPolicyDecision } from '../src/approval-policy.ts'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { runRecipe, type AnyRecipeStep } from '../src/automation.ts'
import { resolveConfig } from '../src/config.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }
const INDEX_ENV: IndexEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: true }
const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

/** A service whose recipe() is the real runRecipe over a scripted page; records what it was asked. */
function serviceOver(behavior: Behavior = {}) {
  const calls: Record<string, any>[] = []
  return {
    calls,
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      calls.push(opts)
      const { page } = fakePage(behavior)
      const run = await runRecipe(page, steps, shot, opts.signal, {
        legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, outputSchema: opts.outputSchema, allowedDomains: opts.allowedDomains,
        ...opts.gotoSameOrigin ? { sameOrigin: 'https://example.com' } : {},
        goto: async (url: string) => { await (page as any).goto(url) },
      })
      return { url: 'https://example.com/', title: 'T', text: 'page', ...run, steps: run.completedSteps }
    },
  }
}

function ctxFor(service: unknown, extra: Record<string, unknown> = {}) {
  return { service: service as never, config: resolveConfig({}), session: 'session:test', sessionId: 'test', agent: undefined, signal: new AbortController().signal, ...extra }
}

function stores() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-v2-tool-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })
  const assets = new AutomationAssetStore(policy)
  return { assets, development: new AutomationDevelopmentService(assets, policy) }
}

test('the L2 detail of automation.develop is enough to write a legal v2 recipe: its own example saves and tests', async () => {
  const detail = renderIndex({ action: 'automation.develop' }, INDEX_ENV).text
  for (const needed of ['$recipeLocator', '$postcondition', '$inputSpec', '$outputSpec', 'explicitFirst', 'indexReason', 'allowEmpty', 'LOCATOR_AMBIGUOUS', 'convert', 'schemaVersion']) {
    assert.ok(detail.includes(needed), `L2 should mention ${needed}`)
  }
  assert.ok(detail.length <= 3_500, `L2 is ${detail.length} chars`)
  const example = /example: browser_call\((\{.*\})\)/.exec(detail)
  assert.ok(example, 'L2 carries a runnable example')
  const call = JSON.parse(example[1]!) as { action: string; args: Record<string, unknown> }
  assert.equal(call.args.schemaVersion, 2)
  assert.deepEqual(validateArgs(findAction(call.action)!.params, call.args).errors, [])

  const { assets, development } = stores()
  const saved = await runAction(call.action, call.args, ctxFor({}, { assets, development }), ENV)
  assert.equal(saved.ok, true, JSON.stringify(saved))
  const result = saved.result as any
  assert.equal(result.result.schemaVersion, 2)
  const asset = assets.get(result.assetId)!
  assert.equal(asset.schemaVersion, 2)
  assert.deepEqual(asset.postconditions, [{ output: 'results', nonEmpty: true }])

  // And it runs: the postcondition on the named output is what makes the test pass.
  const service = serviceOver({ '#results': { innerText: () => 'issue one' } })
  const tested = await runAction('automation.develop', { action: 'test', id: asset.id, url: 'https://example.com/', inputs: { query: 'dsh' } }, ctxFor(service, { assets, development }), ENV)
  assert.equal(tested.ok, true, JSON.stringify(tested))
  assert.equal((tested.result as any).testStatus, 'passed')
  assert.equal((tested.result as any).evidenceLevel, 'verified')
  assert.deepEqual((tested.result as any).outputs.map((output: any) => [output.name, output.value]), [['results', 'issue one']])
  assert.deepEqual((tested.result as any).completedSteps.map((step: any) => step.output), [undefined, undefined, 0], 'steps point at outputs, values are not repeated')
})

test('save: a malformed v2 recipe comes back as INVALID_RECIPE with the fix in the message', async () => {
  const { assets, development } = stores()
  const bad = await runAction('automation.develop', {
    action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Bad', domains: ['example.com'],
    recipe: [{ type: 'fill', locator: { label: 'Query' }, value: '' }],
  }, ctxFor({}, { assets, development }), ENV)
  assert.equal(bad.ok, false)
  assert.equal(bad.error?.code, 'INVALID_RECIPE')
  assert.match(bad.error!.message, /value is empty.*allowEmpty: true.*clear step/)
  const selector = await runAction('automation.develop', { action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Bad', domains: ['example.com'], recipe: [{ type: 'click', selector: '#a' }] }, ctxFor({}, { assets, development }), ENV)
  assert.equal(selector.error?.code, 'INVALID_RECIPE')
  assert.match(selector.error!.message, /locate with "locator"/)
  assert.equal(assets.snapshot().assets.length, 0, 'nothing was saved')
})

test('convert: a v1 recipe becomes a NEW v2 draft; the active source is untouched and the reply says what to fix', async () => {
  const { assets, development } = stores()
  const source = assets.saveDraft({ kind: 'recipe', name: 'Search', domains: ['example.com'], recipe: [{ type: 'fill', selector: '#q', value: '{{query}}' }, { type: 'click', selector: '#go' }, { type: 'assert', text: 'Done' }] })
  assets.noteTestResult(source.id, true, 'https://example.com/')
  assets.setStatus(source.id, 'active', { expectedRevision: source.revision })
  const before = JSON.stringify(assets.get(source.id))

  const converted = await runAction('automation.develop', { action: 'convert', id: source.id }, ctxFor({}, { assets, development, sessionId: 's1' }), ENV)
  assert.equal(converted.ok, true, JSON.stringify(converted))
  const reply = converted.result as any
  assert.equal(reply.action, 'convert')
  assert.equal(reply.status, 'draft')
  assert.notEqual(reply.assetId, source.id)
  assert.equal(reply.result.sourceAssetId, source.id)
  assert.equal(reply.result.sourceRevision, source.revision)
  assert.deepEqual(reply.result.pendingDisambiguation.map((entry: any) => [entry.step, entry.action]), [[1, 'fill'], [2, 'click']])
  assert.match(reply.result.notes.join(' '), /explicitFirst/)
  assert.equal(JSON.stringify(assets.get(source.id)), before, 'the active asset is unchanged')
  assert.equal(assets.get(reply.assetId)?.status, 'draft')

  const missing = await runAction('automation.develop', { action: 'convert' }, ctxFor({}, { assets, development }), ENV)
  assert.equal(missing.ok, false)
  const again = await runAction('automation.develop', { action: 'convert', id: reply.assetId }, ctxFor({}, { assets, development }), ENV)
  assert.equal(again.error?.code, 'INVALID_RECIPE')
  assert.match(again.error!.message, /already schema v2/)
})

test('search shows a v2 asset\'s typed inputs so a caller can run it without opening the recipe', async () => {
  const { assets } = stores()
  const draft = assets.saveDraft({
    kind: 'recipe', name: 'Search issues', domains: ['example.com'], schemaVersion: 2,
    recipe: [{ type: 'fill', locator: { label: 'Query' }, value: '{{query}}' }, { type: 'assert', text: 'Done' }] as unknown as AnyRecipeStep[],
    inputSchema: [{ name: 'query', type: 'string', required: true, example: 'dsh' }],
  })
  assets.noteTestResult(draft.id, true, 'https://example.com/', 'verified')
  assets.setStatus(draft.id, 'active', { expectedRevision: draft.revision })
  const found = await runAction('automation.search', { query: 'search issues' }, ctxFor({}, { assets }), ENV)
  const item = (found.result as any).items[0]
  assert.equal(item.schemaVersion, 2)
  assert.deepEqual(item.inputSchema, [{ name: 'query', type: 'string', required: true, example: 'dsh' }])
  assert.equal('recipe' in item, false)
})

test('run_recipe v2: strict locators, domains, postconditions; v1 stays the default', async () => {
  const service = serviceOver()
  const v1 = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#a' }] }, ctxFor(service), ENV)
  assert.equal(v1.ok, true)
  assert.equal(service.calls[0]!.schemaVersion, undefined, 'no schemaVersion means the v1 runner')

  const v2 = await runAction('automation.run_recipe', {
    url: 'https://example.com/', schemaVersion: 2, allowedDomains: ['example.org'],
    steps: [{ type: 'click', locator: { role: 'button', name: 'Go' } }, { type: 'extract', locator: { css: 'h1' }, as: 'title' }],
    postconditions: [{ output: 'title', nonEmpty: true }],
  }, ctxFor(service), ENV)
  assert.equal(v2.ok, true, JSON.stringify(v2))
  assert.equal((v2.result as any).validationStatus, 'passed')
  assert.deepEqual(service.calls[1]!.allowedDomains, ['example.org'])
  assert.equal(service.calls[1]!.gotoSameOrigin, true, 'an inline recipe may stay on its starting origin')

  const wrongVersion = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#a' }], postconditions: [{ text: 'x' }] }, ctxFor(service), ENV)
  assert.equal(wrongVersion.error?.code, 'INVALID_RECIPE')
  assert.match(wrongVersion.error!.message, /need schemaVersion 2/)
  const badPost = await runAction('automation.run_recipe', { url: 'https://example.com/', schemaVersion: 2, steps: [{ type: 'click', locator: { css: '#a' } }], postconditions: [{ output: 'ghost', nonEmpty: true }] }, ctxFor(service), ENV)
  assert.equal(badPost.error?.code, 'INVALID_RECIPE')
  assert.equal(service.calls.length, 2, 'nothing ran for the rejected calls')

  const failed = await runAction('automation.run_recipe', { url: 'https://example.com/', schemaVersion: 2, steps: [{ type: 'click', locator: { css: '#pay' } }], postconditions: [{ text: 'Paid' }] },
    ctxFor(serviceOver({ 'text=Paid': { waitFor: () => { throw timeout(5000) } } })), ENV)
  assert.equal(failed.ok, false)
  assert.equal(failed.error?.code, 'VALIDATION_FAILED')
  assert.equal((failed.result as any).executionStatus, 'completed')
  assert.equal((failed.result as any).effects, 'observed')
})

test('run_recipe v2: LOCATOR_AMBIGUOUS carries the candidates in the error and the step did nothing', async () => {
  const rows = [{ index: 0, role: 'button', name: 'Save', text: 'Save', visible: true }, { index: 1, role: 'button', name: 'Save', text: 'Save', visible: true }]
  const service = serviceOver({ 'role=button:Save': { click: () => { throw new Error("strict mode violation: getByRole('button') resolved to 2 elements") }, count: () => 2, evaluateAll: () => rows } })
  const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', schemaVersion: 2, steps: [{ type: 'click', locator: { role: 'button', name: 'Save' } }] }, ctxFor(service), ENV)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error?.code, 'LOCATOR_AMBIGUOUS')
  assert.deepEqual(envelope.error?.candidates, { total: 2, items: rows })
  assert.equal((envelope.result as any).effects, 'none')
  assert.equal((envelope.result as any).completedSteps.length, 0)
  assert.match(envelope.error!.hint!, /indexReason/)
})

test('approval: clear is a mutating step; goto alone is navigation; convert is a draft write', () => {
  const run = (steps: unknown[], mode: any) => browserPolicyDecision('automation.run_recipe', { schemaVersion: 2, steps }, mode).kind
  assert.equal(run([{ type: 'clear', locator: { css: '#q' } }], 'standard'), 'ask')
  assert.equal(run([{ type: 'clear', locator: { css: '#q' } }], 'read-only'), 'deny')
  assert.equal(run([{ type: 'goto', url: 'https://example.com/a' }, { type: 'extract' }], 'read-only'), 'allow')
  assert.equal(run([{ type: 'goto', url: 'https://example.com/a' }, { type: 'extract' }], 'standard'), 'allow')
  assert.equal(browserPolicyDecision('automation.develop', { action: 'convert', id: 'x' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('automation.develop', { action: 'convert', id: 'x' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('automation.develop', { action: 'convert', id: 'x' }, 'autonomous').kind, 'allow')
})
