import test from 'node:test'
import assert from 'node:assert/strict'
import { runRecipe, recipeNeedsApproval, type AnyRecipeStep } from '../src/automation.ts'
import {
  coerceInputs, coerceOutput, materializeDeep, normalizeInputSchema, normalizeOutputSchema, normalizePostconditions, normalizeRequiredCapabilities,
  pendingDisambiguation, placeholderNames, validateRecipeV2, type BrowserRecipeStepV2,
} from '../src/automation-v2.ts'
import { mapError } from '../src/actions/errors.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (what: string, ms = 1000): Error =>
  Object.assign(new Error(`locator.${what}: Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })
const strict = (): Error => new Error("locator.click: Error: strict mode violation: getByRole('button') resolved to 2 elements")
const v2 = (steps: BrowserRecipeStepV2[], page: any, extra: Record<string, unknown> = {}, signal?: AbortSignal) =>
  runRecipe(page, steps as AnyRecipeStep[], shot, signal, { schemaVersion: 2, ...extra })

test('v2 steps are validated: locator not selector, an empty fill must say so, index needs a reason', () => {
  const bad = (steps: unknown[], pattern: RegExp) => assert.throws(() => validateRecipeV2(steps as BrowserRecipeStepV2[]), pattern)
  bad([{ type: 'click', selector: '#a' }], /use "locator" \(for example \{"css":"#id"\}\), not "selector"|locate with "locator"/)
  bad([{ type: 'click', locator: { selector: '#a' } }], /uses "css" for a CSS selector in v2/)
  bad([{ type: 'click', locator: { css: '#a', index: 1 } }], /index requires indexReason/)
  bad([{ type: 'click' }], /locator must be an object/)
  bad([{ type: 'fill', locator: { label: 'Q' }, value: '' }], /value is empty.*allowEmpty: true.*clear step/)
  bad([{ type: 'fill', locator: { label: 'Q' } }], /value must be a string/)
  bad([{ type: 'click', locator: { css: '#a' }, bogus: 1 }], /unsupported field "bogus"/)
  bad([{ type: 'wait', condition: 'selector', value: '#a' }], /unsupported wait condition "selector"; use one of locator, text, url, load, time/)
  bad([{ type: 'extract', mode: 'markdown' }], /unsupported extract mode "markdown"/)
  bad([{ type: 'goto', url: '/relative' }], /\(goto\) url must be an absolute http\(s\) URL/)
  bad([{ type: 'goto', url: 'file:///etc/passwd' }], /absolute http\(s\) URL/)
  bad([{ type: 'assert' }], /assert needs locator, text, or urlIncludes/)
  bad([{ type: 'extract', as: 'a' }, { type: 'extract', as: 'a' }], /output name "a" is already used/)
  bad([{ type: 'extract', as: '1bad' }], /as must be a name/)
  bad([{ type: 'click', locator: { css: '#a' }, timeoutMs: 99_999 }], /timeoutMs must be between/)
  bad([{ type: 'nope' }], /unsupported step type "nope"/)
  bad([], /between 1 and 25 steps/)
  validateRecipeV2([
    { type: 'fill', locator: { label: 'Q' }, value: '', allowEmpty: true },
    { type: 'clear', locator: { label: 'Q' } },
    { type: 'click', locator: { role: 'button', name: 'Save', index: 1, indexReason: 'footer button' } },
    { type: 'goto', url: 'https://{{host}}/x' },
    { type: 'extract', locator: { css: 'main', explicitFirst: true }, as: 'body' },
    { type: 'assert', urlIncludes: '/done' },
  ])
})

test('a v2 locator is strict: no first(), and an ambiguous match performs nothing, reports candidates, and has no effect', async () => {
  const rows = [{ index: 0, role: 'button', name: 'Save', text: 'Save', visible: true }, { index: 1, role: 'button', name: 'Save', text: 'Save', visible: false }]
  const { page, trace, log } = fakePage({ 'role=button:Save': { click: () => { throw strict() }, count: () => 2, evaluateAll: () => rows } })
  const run = await v2([
    { type: 'click', locator: { role: 'button', name: 'Save' } },
    { type: 'click', locator: { css: '#after' } },
  ], page)
  assert.equal(run.executionStatus, 'failed')
  assert.equal(run.failedStep?.errorCode, 'LOCATOR_AMBIGUOUS')
  assert.equal(run.failedStep?.index, 1)
  assert.deepEqual(run.failedStep?.candidates, { total: 2, items: rows })
  assert.equal(run.effects, 'none', 'nothing was clicked: an ambiguous step does not execute')
  assert.equal(run.completedSteps.length, 0)
  assert.ok(!log.includes('click:#after'), 'the next step never ran')
  assert.ok(!trace.some(entry => entry.startsWith('first:') || entry.startsWith('nth:')), 'no hidden first()')
  assert.match(run.message!, /did not start/)
})

test('index with a reason picks the n-th match; explicitFirst keeps the first match but stays flagged', async () => {
  const { page, trace } = fakePage()
  const steps: BrowserRecipeStepV2[] = [
    { type: 'click', locator: { role: 'button', name: 'Save', index: 1, indexReason: 'the footer Save' } },
    { type: 'click', locator: { css: '.row', explicitFirst: true } },
  ]
  const run = await v2(steps, page)
  assert.equal(run.executionStatus, 'completed')
  assert.deepEqual(trace.filter(entry => /^(nth|first):/.test(entry)), ['nth:role=button:Save:1', 'first:.row'])
  assert.deepEqual(pendingDisambiguation(steps), [{ step: 2, action: 'click', kind: 'explicit-first', locator: { css: '.row', explicitFirst: true } }])
})

test('the v2 locator kinds map to the same Playwright calls as the atomic actions', async () => {
  const { page, log } = fakePage()
  await v2([
    { type: 'click', locator: { role: 'button', name: 'Go' } },
    { type: 'fill', locator: { label: 'Name' }, value: 'Ada' },
    { type: 'click', locator: { text: 'More' } },
    { type: 'click', locator: { testId: 'ok' } },
    { type: 'click', locator: { css: '#x', framePath: ['iframe#a'] } },
  ], page)
  assert.deepEqual(log, ['click:role=button:Go', 'fill:label=Name', 'click:text=More', 'click:testid=ok', 'click:frame(iframe#a)>#x'])
})

test('clear is an effectful step that empties a field; fill with allowEmpty writes an empty string', async () => {
  const { page, log } = fakePage({ '#q': { fill: (value: string) => { if (value !== '') throw new Error('expected empty') } } })
  const run = await v2([
    { type: 'clear', locator: { css: '#q' } },
    { type: 'fill', locator: { css: '#q' }, value: '', allowEmpty: true },
  ], page)
  assert.equal(run.executionStatus, 'completed')
  assert.equal(run.effects, 'observed')
  assert.deepEqual(log, ['clear:#q', 'fill:#q'])
  assert.equal(recipeNeedsApproval([{ type: 'clear', locator: { css: '#q' } }] as AnyRecipeStep[]), true)
  assert.equal(recipeNeedsApproval([{ type: 'goto', url: 'https://example.com/a' }, { type: 'extract' }] as AnyRecipeStep[]), false, 'goto is navigation, like target.open')
  const never = await v2([{ type: 'clear', locator: { css: '#gone' } }], fakePage({ '#gone': { clear: () => { throw timeout('clear') } } }).page)
  assert.equal(never.executionStatus, 'failed')
  assert.equal(never.effects, 'none')
})

test('goto: a literal URL outside the allowed domains is refused before any step runs, with POLICY_DENIED', async () => {
  const { page, log } = fakePage()
  const options = { allowedDomains: ['example.com'], goto: async (url: string) => { await page.goto(url) } }
  const error = await v2([{ type: 'click', locator: { css: '#a' } }, { type: 'goto', url: 'https://evil.test/steal' }], page, options).catch(caught => caught)
  assert.match(error.message, /recipe step 2: goto evil\.test is not allowed on this recipe \(allowed: example\.com\); nothing ran/)
  assert.equal(mapError(error, 'automation.run').code, 'POLICY_DENIED')
  assert.deepEqual(log, [], 'step 1 did not run either')

  const ok = await v2([{ type: 'goto', url: 'https://app.example.com/inbox' }, { type: 'assert', urlIncludes: '/inbox' }], page, options)
  assert.equal(ok.executionStatus, 'completed', 'a subdomain of an allowed domain is allowed')
  assert.deepEqual(log.filter(entry => entry.startsWith('goto:')), ['goto:https://app.example.com/inbox'])
})

test('goto: an inline recipe may stay on the starting origin, or go where it was explicitly allowed', async () => {
  const { page } = fakePage()
  const goto = async (url: string) => { await page.goto(url) }
  const same = await v2([{ type: 'goto', url: 'https://example.com/b' }], page, { sameOrigin: 'https://example.com', goto })
  assert.equal(same.executionStatus, 'completed')
  const other = await v2([{ type: 'goto', url: 'http://example.com/b' }], page, { sameOrigin: 'https://example.com', goto }).catch(caught => caught)
  assert.match(other.message, /is not allowed on this recipe/, 'a different scheme is a different origin')
  const explicit = await v2([{ type: 'goto', url: 'https://other.org/x' }], page, { sameOrigin: 'https://example.com', allowedDomains: ['other.org'], goto })
  assert.equal(explicit.executionStatus, 'completed')
})

test('goto: a redirect that lands outside the allowed domains fails the step instead of using that page', async () => {
  const { page } = fakePage()
  const goto = async () => { await page.goto('https://tracker.example.net/landing') }
  const run = await v2([{ type: 'goto', url: 'https://example.com/start' }, { type: 'extract' }], page, { allowedDomains: ['example.com'], goto })
  assert.equal(run.executionStatus, 'failed')
  assert.equal(run.failedStep?.errorCode, 'POLICY_DENIED')
  assert.match(run.failedStep!.message, /landed on tracker\.example\.net/)
  assert.equal(run.completedSteps.length, 0)
})

test('extract and assert default to 5 s, not 30 s, and take their own timeoutMs', async () => {
  const seen: { extract?: unknown; wait?: unknown; html?: unknown } = {}
  const { page } = fakePage({
    '#a': { innerText: (options: unknown) => { seen.extract = options; return 'x' }, innerHTML: (options: unknown) => { seen.html = options; return '<b>x</b>' }, waitFor: (options: unknown) => { seen.wait = options } },
  })
  await v2([
    { type: 'extract', locator: { css: '#a' } },
    { type: 'extract', locator: { css: '#a' }, mode: 'html', timeoutMs: 700 },
    { type: 'assert', locator: { css: '#a' } },
  ], page)
  assert.deepEqual(seen.extract, { timeout: 5000 })
  assert.deepEqual(seen.html, { timeout: 700 })
  assert.deepEqual(seen.wait, { state: 'visible', timeout: 5000 })

  const missing = await v2([{ type: 'extract', locator: { css: '#nope' }, timeoutMs: 300 }], fakePage({ '#nope': { innerText: () => { throw timeout('innerText', 300) } } }).page)
  assert.equal(missing.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  assert.match(missing.failedStep!.message, /Timeout 300ms exceeded/)
})

test('extract with `as` produces a named output; the step points at it', async () => {
  const { page } = fakePage({ 'h1': { innerText: () => 'Title' }, '.price': { innerText: () => '1,234.50' } })
  const run = await v2([
    { type: 'extract', locator: { css: 'h1' }, as: 'title' },
    { type: 'extract', locator: { css: '.price' }, as: 'price' },
    { type: 'screenshot' },
  ], page, { outputSchema: [{ name: 'title', type: 'string' }, { name: 'price', type: 'number' }] })
  assert.equal(run.executionStatus, 'completed')
  assert.deepEqual(run.outputs.map(({ name, value }) => [name, value]), [['title', 'Title'], ['price', 1234.5], [undefined, '/tmp/shot.png']])
  assert.deepEqual(run.completedSteps.map(step => step.output), [0, 1, 2])
  assert.equal(run.validationStatus, 'not_checked', 'a typed output is not a verifier by itself')
})

test('an extracted value that does not convert to its declared output type fails validation, not execution', async () => {
  const { page } = fakePage({ '.price': { innerText: () => 'free' } })
  const run = await v2([{ type: 'extract', locator: { css: '.price' }, as: 'price' }], page, { outputSchema: [{ name: 'price', type: 'number' }] })
  assert.equal(run.executionStatus, 'completed')
  assert.equal(run.validationStatus, 'failed')
  assert.equal(run.failedStep?.errorCode, 'VALIDATION_FAILED')
  assert.match(run.failedStep!.message, /output "price" is not a number/)
  assert.deepEqual(coerceOutput({ name: 'rows', type: 'json' }, '[1,2]'), { ok: true, value: [1, 2] })
  assert.equal(coerceOutput({ name: 'rows', type: 'json' }, '{bad').ok, false)
})

test('validationStatus counts asserts and postconditions: passed only when every one holds', async () => {
  const holds = fakePage({ '#ok': { innerText: () => 'done' } })
  const passed = await v2([
    { type: 'click', locator: { css: '#go' } },
    { type: 'assert', locator: { css: '#ok' } },
    { type: 'extract', locator: { css: '#ok' }, as: 'result' },
  ], holds.page, { postconditions: [{ text: 'Saved' }, { selector: '#ok' }, { urlIncludes: '/start' }, { output: 'result', nonEmpty: true }] })
  assert.equal(passed.executionStatus, 'completed')
  assert.equal(passed.validationStatus, 'passed')

  const onlyPost = await v2([{ type: 'click', locator: { css: '#go' } }], fakePage().page, { postconditions: [{ text: 'Saved' }] })
  assert.equal(onlyPost.validationStatus, 'passed', 'a postcondition alone is enough to verify')

  const none = await v2([{ type: 'click', locator: { css: '#go' } }], fakePage().page)
  assert.equal(none.validationStatus, 'not_checked')

  const missing = fakePage({ 'text=Saved': { waitFor: () => { throw timeout('waitFor', 5000) } } })
  const failed = await v2([{ type: 'click', locator: { css: '#go' } }], missing.page, { postconditions: [{ text: 'Saved' }, { selector: '#ok' }] })
  assert.equal(failed.executionStatus, 'completed', 'every step ran')
  assert.equal(failed.validationStatus, 'failed', 'but the result is not confirmed')
  assert.equal(failed.failedStep?.errorCode, 'VALIDATION_FAILED')
  assert.equal(failed.failedStep?.action, 'postcondition')
  assert.match(failed.failedStep!.message, /postcondition 1 \{"text":"Saved"\}: did not hold within 5000ms/)
  assert.equal(failed.effects, 'observed', 'the click is reported; nothing is rolled back')

  const partial = await v2([{ type: 'assert', locator: { css: '#ok' } }, { type: 'click', locator: { css: '#boom' } }], fakePage({ '#boom': { click: () => { throw new Error('boom') } } }).page, { postconditions: [{ text: 'Saved' }] })
  assert.equal(partial.validationStatus, 'not_checked', 'the run stopped before the postcondition: nothing is confirmed')
})

test('output postconditions: nonEmpty rejects an empty value, allowEmpty only needs the extract to have run', async () => {
  const page = () => fakePage({ '#list': { innerText: () => '   ' } }).page
  const steps: BrowserRecipeStepV2[] = [{ type: 'extract', locator: { css: '#list' }, as: 'rows' }]
  const empty = await v2(steps, page(), { postconditions: [{ output: 'rows', nonEmpty: true }] })
  assert.equal(empty.validationStatus, 'failed')
  assert.match(empty.failedStep!.message, /output "rows" is empty/)
  const allowed = await v2(steps, page(), { postconditions: [{ output: 'rows', allowEmpty: true }] })
  assert.equal(allowed.validationStatus, 'passed')
})

test('a cancel is honoured between the last step and the postconditions', async () => {
  const controller = new AbortController()
  const { page } = fakePage({ '#go': { click: () => { controller.abort() } } })
  const run = await v2([{ type: 'click', locator: { css: '#go' } }], page, { postconditions: [{ text: 'Saved' }] }, controller.signal)
  assert.equal(run.executionStatus, 'cancelled')
  assert.equal(run.validationStatus, 'not_checked')
})

test('inputSchema: values are validated and converted by type; optional inputs default to empty', () => {
  const schema = normalizeInputSchema([
    { name: 'query', type: 'string', required: true, example: 'dsh' },
    { name: 'limit', type: 'number', example: 10 },
    { name: 'sort', type: 'enum', enumValues: ['new', 'top'], required: false },
  ])
  assert.deepEqual(coerceInputs(schema, { query: 'a b', limit: '12.50' }), { query: 'a b', limit: '12.5', sort: '' })
  assert.deepEqual(coerceInputs(schema, { query: 7, limit: 3, sort: 'top' }), { query: '7', limit: '3', sort: 'top' })
  assert.throws(() => coerceInputs(schema, { query: 'x', limit: 'many' }), /input "limit" must be a number \(got "many"\)/)
  assert.throws(() => coerceInputs(schema, { query: 'x', limit: Number.NaN }), /must be a number/)
  assert.throws(() => coerceInputs(schema, { query: 'x', limit: 1, sort: 'old' }), /input "sort" must be one of new \| top/)
  assert.throws(() => coerceInputs(schema, { limit: 1 }), /missing declared automation inputs: query/)
  assert.throws(() => coerceInputs(schema, { query: 'x', limit: 1, extra: 'y' }), /undeclared automation inputs: extra/)
  assert.throws(() => coerceInputs(schema, { query: { a: 1 }, limit: 1 }), /input "query" must be a string/)
  for (const message of ['input "limit" must be a number', 'missing declared automation inputs: query', 'undeclared automation inputs: extra']) {
    assert.equal(mapError(new Error(message), 'automation.run').code, 'INVALID_ARGS', message)
  }
})

test('asset-level fields are validated when saved', () => {
  assert.throws(() => normalizeInputSchema([{ name: 'a', type: 'date' }]), /type must be one of string, number, enum/)
  assert.throws(() => normalizeInputSchema([{ name: 'a', type: 'enum' }]), /enumValues must list 1 to 50 values/)
  assert.throws(() => normalizeInputSchema([{ name: 'a', type: 'string', enumValues: ['x'] }]), /only valid for type enum/)
  assert.throws(() => normalizeInputSchema([{ name: 'a', type: 'number', example: 'abc' }]), /example must be numeric/)
  assert.throws(() => normalizeInputSchema([{ name: 'a', type: 'string' }, { name: 'a', type: 'string' }]), /declared twice/)
  assert.throws(() => normalizeInputSchema([{ name: 'a b', type: 'string' }]), /name must be a name/)
  const steps: BrowserRecipeStepV2[] = [{ type: 'extract', locator: { css: 'h1' }, as: 'title' }]
  assert.deepEqual(normalizeOutputSchema([{ name: 'title', type: 'string' }], steps), [{ name: 'title', type: 'string' }])
  assert.throws(() => normalizeOutputSchema([{ name: 'ghost', type: 'string' }], steps), /is not produced: add an extract step with as: "ghost"/)
  assert.throws(() => normalizeOutputSchema([{ name: 'title', type: 'date' }], steps), /type must be one of string, number, json/)
  assert.deepEqual(normalizePostconditions([{ selector: '#ok' }, { text: 'Saved', timeoutMs: 800 }, { urlIncludes: '/done' }, { output: 'title', nonEmpty: true }, { output: 'title', allowEmpty: true }], steps).length, 5)
  assert.throws(() => normalizePostconditions([{ selector: '#a', text: 'b' }], steps), /exactly one of selector, text, urlIncludes, or output/)
  assert.throws(() => normalizePostconditions([{ output: 'title' }], steps), /exactly one of nonEmpty: true or allowEmpty: true/)
  assert.throws(() => normalizePostconditions([{ output: 'title', nonEmpty: true, allowEmpty: true }], steps), /exactly one of nonEmpty/)
  assert.throws(() => normalizePostconditions([{ output: 'ghost', nonEmpty: true }], steps), /not produced by any extract step/)
  assert.throws(() => normalizePostconditions([{ selector: '#a', nonEmpty: true }], steps), /unsupported field "nonEmpty"/)
  assert.deepEqual(normalizeRequiredCapabilities(['act.fill', 'auth:profile', 'act.fill']), ['act.fill', 'auth:profile'])
  assert.throws(() => normalizeRequiredCapabilities(['bad name']), /capability name/)
})

test('placeholders are found and replaced in every string of a step, but never in type or indexReason', () => {
  const step = { type: 'fill', locator: { role: 'textbox', name: '{{field}}', index: 0, indexReason: 'the {{field}} box' }, value: '{{query}}' }
  assert.deepEqual(placeholderNames([step], [{ text: '{{query}} saved' }]).sort(), ['field', 'query'])
  assert.deepEqual(materializeDeep(step, { field: 'Search', query: 'dsh' }), { type: 'fill', locator: { role: 'textbox', name: 'Search', index: 0, indexReason: 'the {{field}} box' }, value: 'dsh' })
  assert.throws(() => materializeDeep(step, { field: 'x' }), /missing automation input: query/)
})
