/**
 * Real-browser end-to-end tests: the plugin's own BrowserService and tool layer
 * driving a headless Chromium against static fixtures on a loopback HTTP server.
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

  it('registers the interactive tools through the real tool layer', () => {
    const names = harness.toolNames()
    for (const name of ['browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_recipe_run', 'browser_evaluate', 'browser_close', 'browser_status']) {
      assert.ok(names.includes(name), `${name} should be registered`)
    }
  })

  it('open -> read returns the rendered title, text and a screenshot file', async () => {
    const opened = await harness.call(S1, 'browser_open', { url: url('index.html') })
    assert.equal(opened.title, 'E2E Index')
    assert.equal(opened.url, url('index.html'))
    assert.match(opened.text, /DSH Browser Fixture/)
    assert.match(opened.text, /Hello from the local fixture server\./)
    assert.ok(opened.screenshotPath && fs.existsSync(opened.screenshotPath), 'open should leave a screenshot on disk')

    const read = await harness.call(S1, 'browser_read')
    assert.equal(read.title, 'E2E Index')
    assert.equal(read.url, opened.url)
    assert.match(read.text, /Hello from the local fixture server\./)
    assert.equal(read.screenshotPath, undefined, 'browser_read must not take a screenshot')
  })

  it('click changes page state (CSS selector and structured locator)', async () => {
    await harness.call(S1, 'browser_open', { url: url('form.html') })
    const first = await harness.call(S1, 'browser_click', { selector: '#inc' })
    assert.match(first.text, /Count: 1/)
    const second = await harness.call(S1, 'browser_click', { locator: { role: 'button', name: 'Increment' } })
    assert.match(second.text, /Count: 2/)
  })

  it('fill (browser_type) sets the input value and fires page handlers', async () => {
    await harness.call(S1, 'browser_open', { url: url('form.html') })
    const typed = await harness.call(S1, 'browser_type', { locator: { label: 'Name' }, text: 'Ada' })
    assert.match(typed.text, /Hello, Ada/)
    const value = await harness.call(S1, 'browser_evaluate', { expression: 'document.getElementById("name").value' })
    assert.equal(JSON.parse(value.resultJson), 'Ada')
  })

  it('recipe runs fill + click + extract + assert and reports every step', async () => {
    const result = await harness.call(S1, 'browser_recipe_run', {
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
    assert.deepEqual(result.steps.map((step: any) => [step.action, step.ok]), [
      ['fill', true], ['click', true], ['assert', true], ['extract', true], ['extract', true],
    ])
    const text = result.steps[3].value as string
    assert.match(text, /apple/)
    assert.match(text, /apricot/)
    assert.doesNotMatch(text, /banana/)
    assert.match(result.steps[4].value, /<li class="hit">apple<\/li>/)
    assert.match(result.text, /2 results for ap/)
  })

  it('a recipe whose assertion fails rejects instead of reporting success', async () => {
    await assert.rejects(
      harness.call(S1, 'browser_recipe_run', {
        url: url('search.html'),
        steps: [
          { type: 'fill', selector: '#q', value: 'zzz' },
          { type: 'click', selector: '#go' },
          { type: 'assert', text: '5 results for zzz', timeoutMs: 500 },
        ],
      }),
    )
  })

  it('two sessions open different pages without crossing, and share no cookies or storage', async () => {
    await harness.call(S1, 'browser_close')
    await harness.call(S1, 'browser_open', { url: url('session-a.html') })
    await harness.call(S2, 'browser_open', { url: url('session-b.html') })

    // Opening B after A is the ordering that used to steal A's page.
    const a = await harness.call(S1, 'browser_read')
    const b = await harness.call(S2, 'browser_read')
    assert.equal(a.title, 'Session A Page')
    assert.match(a.text, /This is page A/)
    assert.equal(b.title, 'Session B Page')
    assert.match(b.text, /This is page B/)

    // Interaction in A is invisible to B, even though both pages are the same origin.
    await harness.call(S1, 'browser_click', { selector: '#bump' })
    await harness.call(S1, 'browser_click', { selector: '#bump' })
    assert.match((await harness.call(S1, 'browser_read')).text, /Bumps: 2/)
    assert.match((await harness.call(S2, 'browser_read')).text, /Bumps: 0/)

    // Same origin, so only a separate BrowserContext keeps cookies/localStorage apart.
    await harness.call(S1, 'browser_evaluate', { expression: '(document.cookie = "who=a; path=/", localStorage.setItem("who", "a"), true)' })
    const seenByA = JSON.parse((await harness.call(S1, 'browser_evaluate', { expression: '({ cookie: document.cookie, ls: localStorage.getItem("who") })' })).resultJson)
    const seenByB = JSON.parse((await harness.call(S2, 'browser_evaluate', { expression: '({ cookie: document.cookie, ls: localStorage.getItem("who") })' })).resultJson)
    assert.deepEqual(seenByA, { cookie: 'who=a', ls: 'a' })
    assert.deepEqual(seenByB, { cookie: '', ls: null })

    // status() reports only the caller's own page.
    assert.equal((await harness.call(S1, 'browser_status')).activeUrl, url('session-a.html'))
    assert.equal((await harness.call(S2, 'browser_status')).activeUrl, url('session-b.html'))

    // Closing A leaves B's page and state alone.
    await harness.call(S1, 'browser_close')
    const stillB = await harness.call(S2, 'browser_read')
    assert.equal(stillB.title, 'Session B Page')
    assert.equal((await harness.call(S1, 'browser_status')).activeUrl, undefined)
  })

  it('a call without any agent identity lands in the shared bucket, not in a session page', async () => {
    await harness.call(undefined, 'browser_open', { url: url('index.html') })
    assert.equal((await harness.call(undefined, 'browser_read')).title, 'E2E Index')
    assert.equal((await harness.call(S2, 'browser_read')).title, 'Session B Page')
    assert.equal((await harness.call(S2, 'browser_status')).activeUrl, url('session-b.html'))
  })
})
