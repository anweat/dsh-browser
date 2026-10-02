/**
 * Real-browser tests for recipe schema v2: strict locating inside recipes, clear, goto limits, typed inputs,
 * postconditions, and the v1 -> v2 conversion path. A counter endpoint on the fixture server shows from the
 * outside whether a click ever reached the backend.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:recipe-v2] SKIPPED: ${detection.reason}`)

describe('dsh-browser recipe v2 in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const url = (page: string) => `${server.base}/${page}`
  const S = 'e2e-recipe-v2'
  const settle = () => new Promise(resolve => setTimeout(resolve, 300))

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection, { automationAssets: { maxModelDraftWritesPerSession: 30, modelDevelopmentEnabled: true } })
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  it('a v2 step with an ambiguous locator returns LOCATOR_AMBIGUOUS with candidates, runs nothing, and the server sees no click', async () => {
    server.resetHits()
    const envelope = await harness.action(S, 'automation.run_recipe', {
      url: url('strict.html'), schemaVersion: 2,
      steps: [
        { type: 'assert', locator: { role: 'button', name: 'Pay now' } },
        { type: 'click', locator: { role: 'button', name: 'Save' } },
        { type: 'click', locator: { role: 'button', name: 'Pay now' } },
      ],
    })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.executionStatus, 'failed')
    assert.equal(envelope.error.code, 'LOCATOR_AMBIGUOUS')
    assert.equal(envelope.error.candidates.total, 2)
    assert.deepEqual(envelope.error.candidates.items.map((item: any) => [item.role, item.name, item.visible]), [['button', 'Save', true], ['button', 'Save', true]])
    const result = envelope.result
    assert.equal(result.failedStep.index, 2)
    assert.equal(result.failedStep.errorCode, 'LOCATOR_AMBIGUOUS')
    assert.equal(result.effects, 'none', 'the ambiguous step did not execute, and the step after it never started')
    assert.deepEqual(result.completedSteps.map((step: any) => step.action), ['assert'])
    await settle()
    assert.deepEqual(server.hits(), {}, 'no request reached the server')

    // With a reason the same step is allowed to pick one; the server then sees exactly that click.
    const picked = await harness.action(S, 'automation.run_recipe', {
      url: url('strict.html'), schemaVersion: 2,
      steps: [
        { type: 'click', locator: { role: 'button', name: 'Save', index: 1, indexReason: 'Shipping is the second Save on the page' } },
        { type: 'assert', text: 'Clicked shipping' },
      ],
    })
    assert.equal(picked.ok, true, JSON.stringify(picked))
    assert.equal(picked.result.validationStatus, 'passed')
    await settle()
    assert.deepEqual(server.hits(), { shipping: 1 })
  })

  it('v1 recipes keep the first-match behaviour in the same browser', async () => {
    server.resetHits()
    const v1 = await harness.action(S, 'automation.run_recipe', {
      url: url('strict.html'),
      steps: [{ type: 'click', selector: 'button[data-hit]' }, { type: 'assert', text: 'Clicked billing' }],
    })
    assert.equal(v1.ok, true, JSON.stringify(v1))
    assert.equal(v1.result.validationStatus, 'passed')
    await settle()
    assert.deepEqual(server.hits(), { billing: 1 }, 'v1 clicked the first of four matches without complaint')

    server.resetHits()
    const v2 = await harness.action(S, 'automation.run_recipe', {
      url: url('strict.html'), schemaVersion: 2,
      steps: [{ type: 'click', locator: { css: 'button[data-hit]' } }],
    })
    assert.equal(v2.error.code, 'LOCATOR_AMBIGUOUS')
    assert.ok(v2.error.candidates.total >= 4)
    await settle()
    assert.deepEqual(server.hits(), {})
  })

  it('a v2 clear step empties a controlled input; a fill with an empty value needs allowEmpty', async () => {
    const cleared = await harness.action(S, 'automation.run_recipe', {
      url: url('controlled.html'), schemaVersion: 2,
      steps: [
        { type: 'assert', text: 'State: [initial]' },
        { type: 'clear', locator: { label: 'Query' } },
        { type: 'assert', text: 'State: []' },
        { type: 'fill', locator: { label: 'Query' }, value: 'abc' },
        { type: 'assert', text: 'State: [abc]' },
        { type: 'fill', locator: { label: 'Query' }, value: '', allowEmpty: true },
        { type: 'assert', text: 'State: []' },
        { type: 'extract', locator: { label: 'Query' }, mode: 'attribute', attribute: 'value', as: 'value' },
      ],
      postconditions: [{ output: 'value', allowEmpty: true }],
    })
    assert.equal(cleared.ok, true, JSON.stringify(cleared))
    assert.equal(cleared.result.validationStatus, 'passed')
    assert.deepEqual(cleared.result.outputs.map((output: any) => [output.name, output.value]), [['value', '']])

    const rejected = await harness.action(S, 'automation.run_recipe', {
      url: url('controlled.html'), schemaVersion: 2,
      steps: [{ type: 'fill', locator: { label: 'Query' }, value: '' }],
    })
    assert.equal(rejected.error.code, 'INVALID_RECIPE')
    assert.match(rejected.error.message, /allowEmpty: true.*clear step/)
    const state = await harness.result(S, 'observe.read')
    assert.match(state.text, /State: \[initial\]/, 'the rejected recipe ran nothing: the freshly loaded page is untouched')
  })

  it('goto stays inside the allowed domains: a literal URL outside them is refused before any step, in an inline recipe and in a saved asset', async () => {
    server.resetHits()
    const inline = await harness.action(S, 'automation.run_recipe', {
      url: url('strict.html'), schemaVersion: 2,
      steps: [
        { type: 'click', locator: { role: 'button', name: 'Pay now' } },
        { type: 'goto', url: 'http://localhost:1/elsewhere' },
      ],
    })
    assert.equal(inline.ok, false)
    assert.equal(inline.error.code, 'POLICY_DENIED')
    assert.match(inline.error.message, /goto localhost is not allowed on this recipe.*nothing ran/)
    await settle()
    assert.deepEqual(server.hits(), {}, 'the click before the bad goto never ran either')

    // The starting origin is allowed: this navigates for real.
    const same = await harness.action(S, 'automation.run_recipe', {
      url: url('index.html'), schemaVersion: 2,
      steps: [{ type: 'goto', url: url('catalog.html') }, { type: 'assert', locator: { role: 'heading', name: 'Catalog fixture' } }, { type: 'assert', urlIncludes: '/catalog.html' }],
    })
    assert.equal(same.ok, true, JSON.stringify(same))
    assert.match((await harness.result(S, 'observe.read')).url, /catalog\.html$/)

    // A saved asset may only go to its own domains.
    const saved = await harness.result(S, 'automation.develop', {
      action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Wanderer', domains: ['127.0.0.1'],
      recipe: [{ type: 'goto', url: 'https://{{where}}/x' }, { type: 'assert', urlIncludes: '/x' }],
      inputSchema: [{ name: 'where', type: 'string', example: '127.0.0.1' }],
    })
    const denied = await harness.action(S, 'automation.develop', { action: 'test', id: saved.assetId, url: url('index.html'), inputs: { where: 'evil.example' } })
    assert.equal(denied.ok, false)
    assert.equal(denied.error.code, 'POLICY_DENIED')
    assert.equal(harness.assets.get(saved.assetId)?.testStatus, 'failed')
  })

  it('a v2 asset: typed inputs are checked and converted, two input sets give different results, and a test passes only through a postcondition', async () => {
    const draft = await harness.result(S, 'automation.develop', {
      action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Catalog apply', domains: ['127.0.0.1'],
      recipe: [
        { type: 'fill', locator: { label: 'Limit' }, value: '{{limit}}' },
        { type: 'select', locator: { label: 'Sort' }, value: '{{sort}}' },
        { type: 'click', locator: { role: 'button', name: 'Apply' } },
        { type: 'extract', locator: { css: '#rows' }, as: 'rows' },
      ],
      inputSchema: [
        { name: 'limit', type: 'number', example: '3' },
        { name: 'sort', type: 'enum', enumValues: ['new', 'top'] },
      ],
      outputSchema: [{ name: 'rows', type: 'string' }],
    })
    const id = draft.assetId
    const target = url('catalog.html')

    // No assert and no postcondition: the steps run, the test cannot pass, and the reason is stated.
    const unverified = await harness.action(S, 'automation.develop', { action: 'test', id, url: target, inputs: { limit: 2, sort: 'new' } })
    assert.equal(unverified.result.executionStatus, 'completed')
    assert.equal(unverified.result.validationStatus, 'not_checked')
    assert.equal(unverified.result.testStatus, 'failed')
    assert.match(unverified.result.testMessage, /no assert step and no postcondition/)

    // Add the verifier: the summary line must show the converted values.
    await harness.result(S, 'automation.develop', {
      action: 'save', id, kind: 'recipe', schemaVersion: 2, name: 'Catalog apply', domains: ['127.0.0.1'],
      recipe: [
        { type: 'fill', locator: { label: 'Limit' }, value: '{{limit}}' },
        { type: 'select', locator: { label: 'Sort' }, value: '{{sort}}' },
        { type: 'click', locator: { role: 'button', name: 'Apply' } },
        { type: 'extract', locator: { css: '#rows' }, as: 'rows' },
      ],
      inputSchema: [
        { name: 'limit', type: 'number', example: '3' },
        { name: 'sort', type: 'enum', enumValues: ['new', 'top'] },
      ],
      outputSchema: [{ name: 'rows', type: 'string' }],
      postconditions: [{ text: 'Sorted by {{sort}}, limit {{limit}}' }, { output: 'rows', nonEmpty: true }],
    })
    const first = await harness.action(S, 'automation.develop', { action: 'test', id, url: target, inputs: { limit: '3.0', sort: 'top' } })
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.result.testStatus, 'passed')
    assert.equal(first.result.evidenceLevel, 'verified')
    assert.match(first.result.outputs[0].value, /top 3/)
    const second = await harness.action(S, 'automation.develop', { action: 'test', id, url: target, inputs: { limit: 1, sort: 'new' } })
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.match(second.result.outputs[0].value, /new 1/)
    assert.doesNotMatch(second.result.outputs[0].value, /top 3/, 'the second input set really produced a different result')

    // Bad inputs never reach the browser.
    for (const [inputs, pattern] of [
      [{ limit: 'many', sort: 'top' }, /input "limit" must be a number/],
      [{ limit: 2, sort: 'old' }, /input "sort" must be one of new \| top/],
      [{ sort: 'top' }, /missing declared automation inputs: limit/],
    ] as const) {
      const bad = await harness.action(S, 'automation.develop', { action: 'test', id, url: target, inputs })
      assert.equal(bad.ok, false)
      assert.equal(bad.error.code, 'INVALID_ARGS')
      assert.match(bad.error.message, pattern)
    }

    // A postcondition that does not hold: completed, but the result is not confirmed.
    await harness.result(S, 'automation.develop', {
      action: 'save', id, kind: 'recipe', schemaVersion: 2, name: 'Catalog apply', domains: ['127.0.0.1'],
      recipe: [
        { type: 'fill', locator: { label: 'Limit' }, value: '{{limit}}' },
        { type: 'click', locator: { role: 'button', name: 'Apply' } },
      ],
      inputSchema: [{ name: 'limit', type: 'number' }],
      postconditions: [{ text: 'Sorted by never, limit 0', timeoutMs: 400 }],
    })
    const failing = await harness.action(S, 'automation.develop', { action: 'test', id, url: target, inputs: { limit: 2 } })
    assert.equal(failing.ok, false)
    assert.equal(failing.error.code, 'VALIDATION_FAILED')
    assert.equal(failing.result.executionStatus, 'completed')
    assert.equal(failing.result.validationStatus, 'failed')
    assert.equal(failing.result.testStatus, 'failed')
    assert.equal(failing.result.effects, 'observed')
    assert.match(failing.result.failedStep.message, /postcondition 1/)
    assert.throws(() => harness.assets.setStatus(id, 'active'), /pass testing/)
  })

  it('convert: a v1 asset becomes a new v2 draft, the active asset is untouched, and the pending first-match step is resolved by editing the draft', async () => {
    server.resetHits()
    const v1 = harness.assets.saveDraft({
      kind: 'recipe', name: 'Save something', domains: ['127.0.0.1'],
      recipe: [{ type: 'click', selector: 'button[data-hit]' }, { type: 'assert', text: 'Clicked billing' }],
    })
    harness.assets.noteTestResult(v1.id, true, url('strict.html'), 'verified')
    harness.assets.setStatus(v1.id, 'active')

    const ran = await harness.action(S, 'automation.run', { id: v1.id, url: url('strict.html') })
    assert.equal(ran.ok, true, JSON.stringify(ran))
    await settle()
    assert.deepEqual(server.hits(), { billing: 1 })
    const before = JSON.stringify(harness.assets.get(v1.id))

    const converted = await harness.result(S, 'automation.develop', { action: 'convert', id: v1.id })
    const draftId = converted.assetId
    assert.equal(converted.status, 'draft')
    assert.notEqual(draftId, v1.id)
    assert.equal(converted.result.sourceAssetId, v1.id)
    assert.equal(converted.result.sourceRevision, v1.revision)
    assert.equal(converted.result.pendingDisambiguation.length, 1)
    assert.deepEqual(converted.result.pendingDisambiguation[0].locator, { css: 'button[data-hit]', explicitFirst: true })
    const draft = (await harness.result(S, 'automation.develop', { action: 'get', id: draftId })).result
    assert.deepEqual(draft.recipe[0], { type: 'click', locator: { css: 'button[data-hit]', explicitFirst: true } })
    assert.equal(JSON.stringify(harness.assets.get(v1.id)), before, 'the active v1 asset is exactly as it was')

    // Edit the draft so it is strict, but still ambiguous: the test fails and nothing is clicked.
    const edit = (locator: Record<string, unknown>) => harness.result(S, 'automation.develop', {
      action: 'save', id: draftId, kind: 'recipe', schemaVersion: 2, name: draft.name, domains: draft.domains,
      recipe: [{ type: 'click', locator }, { type: 'assert', text: 'Clicked billing' }],
    })
    await edit({ css: 'button[data-hit]' })
    server.resetHits()
    const ambiguous = await harness.action(S, 'automation.develop', { action: 'test', id: draftId, url: url('strict.html') })
    assert.equal(ambiguous.ok, false)
    assert.equal(ambiguous.error.code, 'LOCATOR_AMBIGUOUS')
    assert.equal(ambiguous.result.testStatus, 'failed')
    await settle()
    assert.deepEqual(server.hits(), {})

    // Make it unique: the retest passes, with provenance intact and the source still active.
    await edit({ css: '#save-billing' })
    const passed = await harness.action(S, 'automation.develop', { action: 'test', id: draftId, url: url('strict.html') })
    assert.equal(passed.ok, true, JSON.stringify(passed))
    assert.equal(passed.result.testStatus, 'passed')
    assert.equal(passed.result.evidenceLevel, 'verified')
    const final = harness.assets.get(draftId)!
    assert.equal(final.sourceAssetId, v1.id)
    assert.equal(final.pendingDisambiguation, undefined)
    assert.equal(JSON.stringify(harness.assets.get(v1.id)), before)
    assert.equal(harness.assets.get(v1.id)?.status, 'active')
  })

  it('postconditions can check the URL after a navigation, and an unchanged page fails them', async () => {
    const good = await harness.action(S, 'automation.run_recipe', {
      url: url('index.html'), schemaVersion: 2,
      steps: [{ type: 'goto', url: url('form.html') }, { type: 'click', locator: { role: 'button', name: 'Increment' } }],
      postconditions: [{ urlIncludes: '/form.html' }, { text: 'Count: 1' }, { selector: '#count' }],
    })
    assert.equal(good.ok, true, JSON.stringify(good))
    assert.equal(good.result.validationStatus, 'passed')
    const bad = await harness.action(S, 'automation.run_recipe', {
      url: url('index.html'), schemaVersion: 2,
      steps: [{ type: 'click', locator: { role: 'link', name: 'nothing' }, timeoutMs: 300 }],
    })
    assert.equal(bad.result.failedStep.errorCode, 'LOCATOR_NOT_FOUND')
    assert.equal(bad.result.effects, 'none')
    const unchanged = await harness.action(S, 'automation.run_recipe', {
      url: url('index.html'), schemaVersion: 2,
      steps: [{ type: 'screenshot' }],
      postconditions: [{ urlIncludes: '/somewhere-else', timeoutMs: 300 }],
    })
    assert.equal(unchanged.ok, false)
    assert.equal(unchanged.error.code, 'VALIDATION_FAILED')
    assert.equal(unchanged.result.validationStatus, 'failed')
  })
})
