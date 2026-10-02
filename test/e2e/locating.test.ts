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
})
