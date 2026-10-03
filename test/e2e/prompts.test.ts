/**
 * Prompt overrides through the real tool layer in a real browser: with a `prompts` config the model reads the
 * deployer's note at the root, an action's overridden summary, and the overridden hint of a real Playwright failure,
 * and a live edit of the config applies to the next call without rebuilding anything.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { installErrorHints } from '../../src/actions/errors.ts'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()

/** A config handle the way the Host keeps a volatile field: a stable reference whose value is replaced in place. */
const WRITE = Symbol.for('cosmokit.volatile.write')
function liveRef<T>(value: T) {
  let current = value
  return Object.freeze({ get: () => current, [WRITE]: (next: T) => { current = next } })
}

describe('prompt overrides in a real browser', { skip: detection.ok ? false : (detection as { reason: string }).reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  let release: () => void
  const ref = liveRef<unknown>({
    rootNote: 'E2E-ROOT-NOTE: prefer observe.read before acting.',
    actions: { 'act.check': { summary: 'E2E-CHECK-SUMMARY', notes: 'E2E-CHECK-NOTES' } },
    errorHints: { LOCATOR_NOT_FOUND: 'E2E-HINT: the element is not on the page; read it first.' },
  })

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection, { prompts: ref })
    // The plugin installs this on apply; the harness builds the tool layer directly, so it does the same.
    release = installErrorHints(() => (ref.get() as { errorHints?: Record<string, string> } | undefined)?.errorHints ?? {})
  })

  after(async () => {
    release?.()
    await harness?.dispose()
    await server?.close()
  })

  it('browser_index() shows the root note, and an action shows its overridden summary and notes', async () => {
    const root = await harness.index()
    assert.ok(root.endsWith('E2E-ROOT-NOTE: prefer observe.read before acting.'), root)
    const detail = await harness.index({ action: 'act.check' })
    assert.match(detail, /^act\.check - E2E-CHECK-SUMMARY\n/)
    assert.match(detail, /E2E-CHECK-NOTES/)
    assert.match(await harness.index({ group: 'act' }), /act\.check - E2E-CHECK-SUMMARY \|/)
    // An untouched action keeps its default text.
    assert.doesNotMatch(await harness.index({ action: 'act.click' }), /E2E-/)
  })

  it('a real failure carries the overridden hint with its original code and message', async () => {
    await harness.result('e2e-prompts', 'target.open', { url: `${server.base}/index.html` })
    const missing = await harness.action('e2e-prompts', 'act.check', { selector: '#does-not-exist', timeoutMs: 600 })
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'LOCATOR_NOT_FOUND')
    assert.match(missing.error.message, /does-not-exist/)
    assert.equal(missing.error.hint, 'E2E-HINT: the element is not on the page; read it first.')
  })

  it('runtime.status reports the overrides by key and length, and a live edit applies to the next call', async () => {
    const status = (await harness.result(undefined, 'runtime.status')).prompts
    assert.deepEqual(status.overrides.map((entry: { key: string }) => entry.key), ['rootNote', 'actions.act.check.summary', 'actions.act.check.notes', 'errorHints.LOCATOR_NOT_FOUND'])
    assert.deepEqual(status.diagnostics, [])
    assert.equal(JSON.stringify(status).includes('E2E-ROOT-NOTE'), false, 'the text is not echoed')
    ref[WRITE]({ rootNote: 'E2E-SECOND-NOTE', groups: { bogus: { summary: 'x' } } })
    assert.ok((await harness.index()).endsWith('E2E-SECOND-NOTE'))
    assert.doesNotMatch(await harness.index({ action: 'act.check' }), /E2E-/)
    const after = (await harness.result(undefined, 'runtime.status')).prompts
    assert.deepEqual(after.diagnostics.map((entry: { code: string }) => entry.code), ['unknown-group'])
    const missing = await harness.action('e2e-prompts', 'act.check', { selector: '#does-not-exist', timeoutMs: 600 })
    assert.doesNotMatch(missing.error.hint, /E2E-/, 'the hint override was removed with the config')
  })
})
