/**
 * Real-browser end-to-end tests: the plugin's own BrowserService and tool layer
 * driving a headless Chromium against static fixtures on a loopback HTTP server.
 * Everything goes through `browser_index` / `browser_call`, as a model would.
 *
 * Run with `pnpm run test:e2e`. It is deliberately NOT part of `verify`: CI is
 * not guaranteed to have a browser. When none is installed the whole suite is
 * skipped and the reason is printed; nothing is ever downloaded.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (detection.ok) console.log(`[e2e] using ${detection.description}`)
else console.log(`[e2e] SKIPPED: ${detection.reason}`)

describe('dsh-browser real-browser e2e', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const url = (page: string) => `${server.base}/${page}`
  const S1 = 'e2e-session-1'
  const S2 = 'e2e-session-2'

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection)
  })

  after(async () => {
    // Always release the browser process, fixture server, and temp dir, even after a failure.
    await harness?.dispose()
    await server?.close()
  })

  it('registers only the two entry tools through the real tool layer', () => {
    assert.deepEqual(harness.toolNames(), ['browser_index', 'browser_call'])
  })

  it('open -> read returns the rendered title, text and a screenshot file', async () => {
    const opened = await harness.result(S1, 'target.open', { url: url('index.html') })
    assert.equal(opened.title, 'E2E Index')
    assert.equal(opened.url, url('index.html'))
    assert.match(opened.text, /DSH Browser Fixture/)
    assert.match(opened.text, /Hello from the local fixture server\./)
    assert.ok(opened.screenshotPath && fs.existsSync(opened.screenshotPath), 'open should leave a screenshot on disk')

    const envelope = await harness.action(S1, 'observe.read')
    assert.equal(envelope.ok, true)
    assert.equal(envelope.action, 'observe.read')
    assert.equal(envelope.executionStatus, 'completed')
    const read = envelope.result
    assert.equal(read.title, 'E2E Index')
    assert.equal(read.url, opened.url)
    assert.match(read.text, /Hello from the local fixture server\./)
    assert.equal(read.screenshotPath, undefined, 'observe.read must not take a screenshot')
  })

  it('click changes page state (CSS selector and structured locator)', async () => {
    await harness.result(S1, 'target.open', { url: url('form.html') })
    const first = await harness.result(S1, 'act.click', { selector: '#inc' })
    assert.match(first.text, /Count: 1/)
    const second = await harness.result(S1, 'act.click', { locator: { role: 'button', name: 'Increment' } })
    assert.match(second.text, /Count: 2/)
  })

  it('fill sets the input value and fires page handlers', async () => {
    await harness.result(S1, 'target.open', { url: url('form.html') })
    const typed = await harness.result(S1, 'act.fill', { locator: { label: 'Name' }, text: 'Ada' })
    assert.match(typed.text, /Hello, Ada/)
    const value = await harness.result(S1, 'script.evaluate', { expression: 'document.getElementById("name").value' })
    assert.equal(JSON.parse(value.resultJson), 'Ada')
  })

  it('recipe runs fill + click + extract + assert and reports every step', async () => {
    const result = await harness.result(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [
        { type: 'fill', selector: '#q', value: 'ap' },
        { type: 'click', selector: '#go' },
        { type: 'assert', text: '2 results for ap' },
        { type: 'extract', selector: '#results', mode: 'text' },
        { type: 'extract', selector: '#results', mode: 'html' },
      ],
    })
    assert.equal(result.title, 'E2E Search')
    assert.equal(result.executionStatus, 'completed')
    assert.equal(result.validationStatus, 'passed')
    assert.equal(result.effects, 'observed')
    assert.deepEqual(result.completedSteps.map((step: any) => [step.action, step.ok]), [
      ['fill', true], ['click', true], ['assert', true], ['extract', true], ['extract', true],
    ])
    // Values live once, in outputs; completedSteps only point at them.
    assert.deepEqual(result.completedSteps.map((step: any) => step.output), [undefined, undefined, undefined, 0, 1])
    assert.ok(result.completedSteps.every((step: any) => !('value' in step)), 'completedSteps carry no copy of the extracted text')
    const text = result.outputs[result.completedSteps[3].output].value as string
    assert.match(text, /apple/)
    assert.match(text, /apricot/)
    assert.doesNotMatch(text, /banana/)
    assert.match(result.outputs[result.completedSteps[4].output].value, /<li class="hit">apple<\/li>/)
    assert.match(result.text, /2 results for ap/)
  })

  it('a recipe whose assertion fails returns an error envelope instead of reporting success', async () => {
    const envelope = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [
        { type: 'fill', selector: '#q', value: 'zzz' },
        { type: 'click', selector: '#go' },
        { type: 'assert', text: '5 results for zzz', timeoutMs: 500 },
      ],
    })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.executionStatus, 'failed')
    assert.equal(envelope.error.code, 'VALIDATION_FAILED', 'the expected text never appeared')
    assert.match(envelope.error.message, /Timeout 500ms exceeded/, 'the Playwright message is preserved')
    assert.equal(envelope.result.validationStatus, 'failed')
    assert.equal(envelope.result.failedStep.index, 3)
    assert.equal(envelope.result.completedSteps.length, 2, 'the fill and the click ran and are reported')
    assert.equal(envelope.result.effects, 'observed')
  })

  it('a recipe that fails on step 3 returns the two completed steps and keeps their effects', async () => {
    const envelope = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [
        { type: 'fill', selector: '#q', value: 'ap' },
        { type: 'click', selector: '#go' },
        { type: 'wait', condition: 'selector', value: '#no-such-element', timeoutMs: 400 },
        { type: 'extract', selector: '#results', mode: 'text' },
      ],
    })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.executionStatus, 'failed')
    const result = envelope.result
    assert.deepEqual(result.completedSteps.map((step: any) => [step.step, step.action, step.ok]), [[1, 'fill', true], [2, 'click', true]])
    assert.equal(result.failedStep.index, 3)
    assert.equal(result.failedStep.action, 'wait')
    assert.equal(result.failedStep.errorCode, 'LOCATOR_NOT_FOUND')
    assert.match(result.failedStep.message, /Timeout 400ms exceeded/, 'the Playwright message is preserved')
    assert.equal(result.effects, 'observed')
    assert.match(result.text, /2 results for ap/, 'the page keeps the state the earlier steps produced')
    assert.equal(envelope.error.code, 'LOCATOR_NOT_FOUND')
  })

  it('a click on an element that never appeared fails with effects none; a click that started and then hung stays outcome_unknown; an empty existing container extracts as completed', async () => {
    server.resetHits()
    const never = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [{ type: 'click', selector: '#no-such-button', timeoutMs: 400 }],
    })
    assert.equal(never.ok, false)
    assert.equal(never.executionStatus, 'failed', 'the element never resolved, so nothing was done')
    assert.equal(never.error.code, 'LOCATOR_NOT_FOUND')
    assert.equal(never.result.effects, 'none')
    assert.equal(never.result.failedStep.errorCode, 'LOCATOR_NOT_FOUND')
    assert.match(never.result.failedStep.message, /Timeout 400ms exceeded/, 'the Playwright text is kept')

    // The element exists but is disabled: the action began (actionability checks) and then timed out.
    const blocked = await harness.action(S1, 'automation.run_recipe', {
      url: url('strict.html'),
      steps: [{ type: 'click', selector: '#disabled-pay', timeoutMs: 400 }],
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.executionStatus, 'outcome_unknown')
    assert.equal(blocked.error.code, 'OUTCOME_UNKNOWN')
    assert.equal(blocked.result.effects, 'unknown')
    assert.equal(blocked.result.failedStep.errorCode, 'NOT_ACTIONABLE')
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.deepEqual(server.hits(), {}, 'neither click reached the backend')

    const empty = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [{ type: 'extract', selector: '#results', mode: 'text' }],
    })
    assert.equal(empty.ok, true, 'the container exists but holds nothing yet: a legitimate empty result')
    assert.equal(empty.result.executionStatus, 'completed')
    assert.deepEqual(empty.result.outputs, [{ step: 1, action: 'extract', value: '' }])
  })

  it('a failed assertion is VALIDATION_FAILED with the earlier effects reported, and an assertion that holds validates the run', async () => {
    const failed = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [
        { type: 'fill', selector: '#q', value: 'zzz' },
        { type: 'click', selector: '#go' },
        { type: 'assert', text: '9 results for zzz', timeoutMs: 400 },
      ],
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.error.code, 'VALIDATION_FAILED')
    assert.equal(failed.result.validationStatus, 'failed')
    assert.equal(failed.result.failedStep.errorCode, 'VALIDATION_FAILED')
    assert.equal(failed.result.effects, 'observed')

    const held = await harness.action(S1, 'automation.run_recipe', {
      url: url('search.html'),
      steps: [
        { type: 'fill', selector: '#q', value: 'zzz' },
        { type: 'click', selector: '#go' },
        { type: 'assert', text: '0 results for zzz', timeoutMs: 2000 },
      ],
    })
    assert.equal(held.ok, true)
    assert.equal(held.result.validationStatus, 'passed')
  })

  it('cancelling a recipe stops only that recipe: the running step finishes, nothing rolls back, and the session page stays usable', async () => {
    await harness.result(S1, 'target.open', { url: url('form.html') })
    const controller = new AbortController()
    const started = Date.now()
    const pending = harness.action(S1, 'automation.run_recipe', {
      steps: [
        { type: 'click', selector: '#inc' },
        { type: 'wait', condition: 'time', waitMs: 1200 },
        { type: 'click', selector: '#inc' },
      ],
    }, controller.signal)
    setTimeout(() => controller.abort(), 300)
    const envelope = await pending
    assert.equal(envelope.ok, false)
    assert.equal(envelope.executionStatus, 'cancelled')
    assert.equal(envelope.error.code, 'CANCELLED')
    assert.ok(Date.now() - started >= 1100, 'the call returned only after the step that was already running')
    const result = envelope.result
    assert.deepEqual(result.completedSteps.map((step: any) => step.action), ['click', 'wait'])
    assert.equal(result.failedStep.index, 3)
    assert.equal(result.failedStep.errorCode, 'CANCELLED')
    assert.equal(result.effects, 'observed')
    assert.match(result.text, /Count: 1/, 'the first click stays done and the third never ran')

    // The page was not closed by the cancel.
    const read = await harness.result(S1, 'observe.read', {})
    assert.match(read.text, /Count: 1/)
    const clicked = await harness.result(S1, 'act.click', { selector: '#inc' })
    assert.match(clicked.text, /Count: 2/)
    const targets = await harness.result(S1, 'target.list', {})
    assert.ok(JSON.stringify(targets).includes('form.html'), 'the session still lists its page')
  })

  it('browser_index discloses in layers: root, group, then one action', async () => {
    const root = await harness.index()
    assert.match(root, /Groups:/)
    for (const group of ['runtime', 'target', 'observe', 'act', 'inspect', 'script', 'automation', 'crawl', 'opencli']) assert.match(root, new RegExp(`\\n  ${group} \\(\\d+\\)`))
    assert.match(root, /automation\.search/)
    assert.match(root, /Guide:/, 'no skill service in this harness, so the compact guide is shown')
    assert.ok(root.length < 2_400, `the root listing is ${root.length} chars`)

    const group = await harness.index({ group: 'act' })
    assert.match(group, /^act - /)
    assert.match(group, /act\.click - /)
    assert.match(group, /act\.upload - /)
    assert.doesNotMatch(group, /\$locator - /, 'a group listing does not repeat sub-schemas')

    const action = await harness.index({ action: 'act.click' })
    assert.match(action, /\$locator - Element locator/)
    assert.match(action, /role\?: string/)
    assert.match(action, /example: browser_call/)

    // The description the model reads is enough to make a working call, with no further lookup.
    const example = action.match(/example: browser_call\((\{.*\})\)/)![1]!
    const call = JSON.parse(example) as { action: string; args: Record<string, unknown> }
    await harness.result(S1, 'target.open', { url: url('form.html') })
    const clicked = await harness.result(S1, call.action, { locator: { role: 'button', name: 'Increment' } })
    assert.match(clicked.text, /Count: 1/)

    assert.match(await harness.index({ query: 'screenshot' }), /observe\.screenshot/)
  })

  it('under read-only mode the index hides interactive actions and browser_call refuses them again', async () => {
    assert.ok(detection.ok)
    const readOnly = createHarness(detection, { automationMode: 'read-only' })
    try {
      const group = await readOnly.index({ group: 'act' })
      assert.match(group, /act\.wait - /)
      assert.doesNotMatch(group, /\nact\.click - /)
      assert.match(group, /Unavailable \(disabled by automationMode=read-only\): act\.click/)
      await readOnly.result(S1, 'target.open', { url: url('form.html') })
      // Guessing the name from the skill or from memory does not get around the catalog.
      const denied = await readOnly.action(S1, 'act.click', { selector: '#inc' })
      assert.equal(denied.ok, false)
      assert.equal(denied.error.code, 'POLICY_DENIED')
      assert.match((await readOnly.result(S1, 'observe.read')).text, /Count: 0/, 'the click never ran')
    } finally {
      await readOnly.dispose()
    }
  })

  it('the flat surface runs the same actions through per-action tools with the same envelope', async () => {
    assert.ok(detection.ok)
    const flat = createHarness(detection, { toolSurface: 'flat' })
    try {
      assert.ok(flat.toolNames().includes('browser_act_click') && !flat.toolNames().includes('browser_call'))
      const opened = await flat.call(S1, 'browser_target_open', { url: url('form.html') })
      assert.equal(opened.ok, true)
      assert.equal(opened.action, 'target.open')
      const clicked = await flat.call(S1, 'browser_act_click', { locator: { role: 'button', name: 'Increment' } })
      assert.equal(clicked.ok, true, JSON.stringify(clicked))
      assert.match(clicked.result.text, /Count: 1/)
      // On the flat surface the Host's own schema check runs first, so a bad call is rejected before dispatch.
      await assert.rejects(flat.call(S1, 'browser_act_fill', { selector: '#name' }), /missing required property "text"/)
    } finally {
      await flat.dispose()
    }
  })

  it('a malformed call returns INVALID_ARGS with the schema, and the corrected call then succeeds', async () => {
    await harness.result(S1, 'target.open', { url: url('form.html') })
    // A typical model slip: wrong key name and a missing required value.
    const bad = await harness.action(S1, 'act.fill', { locater: { label: 'Name' } })
    assert.equal(bad.ok, false)
    assert.equal(bad.executionStatus, 'failed')
    assert.equal(bad.error.code, 'INVALID_ARGS')
    assert.match(bad.error.message, /locater: unknown argument/)
    assert.match(bad.error.message, /text: required/)
    assert.match(bad.error.schema, /^act\.fill\(selector\?: string, locator\?: \$locator, text: string, timeoutMs\?: number\)/)

    // Self-correction from the reply alone: the schema names the argument shapes.
    const fixed = await harness.action(S1, 'act.fill', { locator: { label: 'Name' }, text: 'Grace' })
    assert.equal(fixed.ok, true, JSON.stringify(fixed))
    assert.match(fixed.result.text, /Hello, Grace/)

    // Real Playwright failures come back as structured codes with the original message.
    const missing = await harness.action(S1, 'act.check', { selector: '#does-not-exist', timeoutMs: 600 })
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'LOCATOR_NOT_FOUND')
    assert.match(missing.error.message, /does-not-exist/)
    const unknown = await harness.action(S1, 'act.clik', { selector: '#inc' })
    assert.equal(unknown.error.code, 'UNKNOWN_ACTION')
  })

  it('two sessions open different pages without crossing, and share no cookies or storage', async () => {
    await harness.result(S1, 'target.close')
    await harness.result(S1, 'target.open', { url: url('session-a.html') })
    await harness.result(S2, 'target.open', { url: url('session-b.html') })

    // Opening B after A is the ordering that used to steal A's page.
    const a = await harness.result(S1, 'observe.read')
    const b = await harness.result(S2, 'observe.read')
    assert.equal(a.title, 'Session A Page')
    assert.match(a.text, /This is page A/)
    assert.equal(b.title, 'Session B Page')
    assert.match(b.text, /This is page B/)

    // Interaction in A is invisible to B, even though both pages are the same origin.
    await harness.result(S1, 'act.click', { selector: '#bump' })
    await harness.result(S1, 'act.click', { selector: '#bump' })
    assert.match((await harness.result(S1, 'observe.read')).text, /Bumps: 2/)
    assert.match((await harness.result(S2, 'observe.read')).text, /Bumps: 0/)

    // Same origin, so only a separate BrowserContext keeps cookies/localStorage apart.
    await harness.result(S1, 'script.evaluate', { expression: '(document.cookie = "who=a; path=/", localStorage.setItem("who", "a"), true)' })
    const seenByA = JSON.parse((await harness.result(S1, 'script.evaluate', { expression: '({ cookie: document.cookie, ls: localStorage.getItem("who") })' })).resultJson)
    const seenByB = JSON.parse((await harness.result(S2, 'script.evaluate', { expression: '({ cookie: document.cookie, ls: localStorage.getItem("who") })' })).resultJson)
    assert.deepEqual(seenByA, { cookie: 'who=a', ls: 'a' })
    assert.deepEqual(seenByB, { cookie: '', ls: null })

    // status() reports only the caller's own page.
    assert.equal((await harness.result(S1, 'runtime.status')).activeUrl, url('session-a.html'))
    assert.equal((await harness.result(S2, 'runtime.status')).activeUrl, url('session-b.html'))

    // Closing A leaves B's page and state alone.
    await harness.result(S1, 'target.close')
    const stillB = await harness.result(S2, 'observe.read')
    assert.equal(stillB.title, 'Session B Page')
    assert.equal((await harness.result(S1, 'runtime.status')).activeUrl, undefined)
  })

  it('a call without any agent identity lands in the shared bucket, not in a session page', async () => {
    await harness.result(undefined, 'target.open', { url: url('index.html') })
    assert.equal((await harness.result(undefined, 'observe.read')).title, 'E2E Index')
    assert.equal((await harness.result(S2, 'observe.read')).title, 'Session B Page')
    assert.equal((await harness.result(S2, 'runtime.status')).activeUrl, url('session-b.html'))
  })
})
