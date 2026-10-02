/**
 * Real-browser tests for strict locating, the v2 recipe schema, and the page list.
 * Same rules as browser.test.ts: skipped with a printed reason when no browser exists, nothing is downloaded.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:locating] SKIPPED: ${detection.reason}`)

describe('dsh-browser strict locating in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const url = (page: string) => `${server.base}/${page}`
  const S = 'e2e-locating'

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection)
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  it('an ambiguous atomic locator returns LOCATOR_AMBIGUOUS with candidates and the backend never sees a click', async () => {
    await harness.result(S, 'target.open', { url: url('strict.html') })
    server.resetHits()
    const ambiguous = await harness.action(S, 'act.click', { locator: { role: 'button', name: 'Save' }, timeoutMs: 2000 })
    assert.equal(ambiguous.ok, false)
    assert.equal(ambiguous.error.code, 'LOCATOR_AMBIGUOUS')
    assert.equal(ambiguous.error.candidates.total, 2, 'the display:none Save is not an accessible match')
    assert.deepEqual(ambiguous.error.candidates.items.map((item: any) => [item.role, item.name, item.visible]), [['button', 'Save', true], ['button', 'Save', true]])
    assert.match(ambiguous.error.message, /nothing was done/)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(server.hits(), {}, 'no request reached the server: the click was not performed')

    // The same ambiguity through a CSS selector.
    const css = await harness.action(S, 'act.click', { selector: 'button[data-hit]', timeoutMs: 2000 })
    assert.equal(css.error.code, 'LOCATOR_AMBIGUOUS')
    assert.ok(css.error.candidates.total >= 4)
    assert.deepEqual(server.hits(), {})

    // index without a reason is refused before anything runs.
    const noReason = await harness.action(S, 'act.click', { locator: { role: 'button', name: 'Save', index: 1 } })
    assert.equal(noReason.error.code, 'INVALID_ARGS')
    assert.match(noReason.error.message, /index requires indexReason/)

    // A unique locator, and an explicit index with a reason, both act on exactly one element.
    await harness.result(S, 'act.click', { locator: { role: 'button', name: 'Save', index: 1, indexReason: 'the Shipping section is the second Save' } })
    await harness.result(S, 'act.click', { locator: { role: 'button', name: 'Pay now' } })
    await harness.result(S, 'act.click', { locator: { testId: 'nope' }, timeoutMs: 300 }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(server.hits(), { shipping: 1, pay: 1 })
  })
  it('act.clear empties a controlled input and the app state follows; act.type fires one key event per character', async () => {
    await harness.result(S, 'target.open', { url: url('controlled.html') })
    const before = await harness.result(S, 'observe.read')
    assert.match(before.text, /State: \[initial\]/)

    const cleared = await harness.result(S, 'act.clear', { locator: { label: 'Query' } })
    assert.match(cleared.text, /State: \[\]/, 'the controlled state saw the empty value, not just the DOM')
    const value = await harness.result(S, 'script.evaluate', { expression: 'document.getElementById("q").value' })
    assert.equal(JSON.parse(value.resultJson), '')

    const keysOf = (text: string): number => Number(/Keys: (\d+)/.exec(text)![1])
    const keysBefore = keysOf(cleared.text)
    const typed = await harness.result(S, 'act.type', { locator: { label: 'Query' }, text: 'xyz' })
    assert.match(typed.text, /State: \[xyz\]/)
    assert.equal(keysOf(typed.text) - keysBefore, 3, 'pressSequentially sends a key event per character')

    // fill replaces the value without key events; it is a different action.
    const filled = await harness.result(S, 'act.fill', { locator: { label: 'Query' }, text: 'abc' })
    assert.match(filled.text, /State: \[abc\]/)
    assert.equal(keysOf(filled.text), keysOf(typed.text), 'fill fires no key events')

    // Both are strict like every other locator.
    const missing = await harness.action(S, 'act.clear', { locator: { label: 'No such field' }, timeoutMs: 400 })
    assert.equal(missing.error.code, 'LOCATOR_NOT_FOUND')
    const index = await harness.index({ action: 'act.type' })
    assert.match(index, /act\.type/)
  })
  it('a popup joins the session page list; target.select switches to it, and closing it falls back to the opener', async () => {
    const S2 = 'e2e-locating-other'
    await harness.result(S, 'target.close')
    await harness.result(S, 'target.open', { url: url('popup-opener.html') })
    const single = await harness.result(S, 'target.list')
    // Ids are never reused within a session, even after target.close, so a stale id cannot alias a new page.
    assert.equal(single.targets.length, 1)
    assert.deepEqual([single.targets[0].active, single.targets[0].title], [true, 'E2E Popup Opener'])
    const opener: string = single.targets[0].id

    await harness.result(S, 'act.click', { locator: { role: 'link', name: 'Open child' } })
    let targets: any[] = []
    for (let attempt = 0; attempt < 20 && targets.length < 2; attempt += 1) {
      targets = (await harness.result(S, 'target.list')).targets
      if (targets.length < 2) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(targets.length, 2, 'the popup is in the list')
    assert.equal(targets.find(target => target.active).id, opener, 'a popup does not take over the active page by itself')
    const child = targets.find(target => target.id !== opener)
    assert.match(child.url, /popup-child\.html$/)

    // Actions still go to the opener until the model selects the popup.
    assert.match((await harness.result(S, 'observe.read')).text, /Opener page/)
    const selected = await harness.result(S, 'target.select', { id: child.id })
    assert.equal(selected.title, 'E2E Popup Child')
    assert.match(selected.text, /Pings: 0/)
    assert.match((await harness.result(S, 'act.click', { selector: '#ping' })).text, /Pings: 1/)
    assert.match((await harness.result(S, 'observe.read')).text, /Child page/)
    assert.equal((await harness.result(S, 'target.list')).targets.find((target: any) => target.active).id, child.id)

    // Another session sees none of this.
    await harness.result(S2, 'target.open', { url: url('index.html') })
    assert.equal((await harness.result(S2, 'target.list')).targets.length, 1)
    assert.match((await harness.result(S2, 'observe.read')).text, /DSH Browser Fixture/)

    // Back to the opener, then close the popup from inside: the session keeps working on the opener.
    await harness.result(S, 'target.select', { id: opener })
    assert.match((await harness.result(S, 'observe.read')).text, /Opener page/)
    await harness.result(S, 'target.select', { id: child.id })
    await harness.result(S, 'act.click', { selector: '#close-me' })
    let after: any[] = []
    for (let attempt = 0; attempt < 20 && after.length !== 1; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
      after = (await harness.result(S, 'target.list')).targets
    }
    assert.deepEqual(after.map(target => [target.id, target.active]), [[opener, true]])
    assert.match((await harness.result(S, 'observe.read')).text, /Opener page/, 'the active page fell back to the opener')

    const stale = await harness.action(S, 'target.select', { id: child.id })
    assert.equal(stale.ok, false)
    assert.equal(stale.error.code, 'TARGET_CLOSED')
    await harness.result(S2, 'target.close')
  })
})
