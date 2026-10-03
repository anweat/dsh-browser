/**
 * The real asset editor (SettingsCard + AutomationAssetsController, bundled for the browser) in Chromium, talking to
 * the real RPC handler, the real asset store and a real BrowserService through a bridge. It replays the three defects the
 * seventh batch found in the old UI (research/experiments/closure-2026-10-01/assets-ui.cjs) and expects them fixed:
 *   1. with unsaved edits, Test and Activate used the saved asset id while the editor showed the edits;
 *   2. a passed asset could be activated while the editor held unsaved edits;
 *   3. selecting another asset silently replaced the unsaved edits.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { loadBrowserRuntime } from '../../src/deps.ts'
import { defaultPrompts } from '../../src/prompts.ts'
import { computeContentHash } from '../../src/automation-assets.ts'
import { registerAutomationAssetRpc } from '../../src/automation-assets-rpc.ts'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
const require = createRequire(import.meta.url)

/** Bundle the card with the rolldown that tsdown already ships; skip loudly when it is not installed. */
async function bundleCard(): Promise<{ code: string } | { skip: string }> {
  let rolldown: typeof import('rolldown')
  try {
    const fromTsdown = createRequire(require.resolve('tsdown/package.json'))
    rolldown = await import(fromTsdown.resolve('rolldown'))
  } catch (error) { return { skip: `rolldown (a dependency of tsdown) is not installed: ${String(error)}` } }
  const entry = new URL('./ui/entry.tsx', import.meta.url).pathname
  const stub = new URL('./ui/primitives-stub.ts', import.meta.url).pathname
  const bundle = await rolldown.rolldown({
    input: entry, platform: 'browser', logLevel: 'silent',
    resolve: { alias: { '@deepseek-ai/dsh-client-ui-primitives': stub } },
    transform: { define: { 'process.env.NODE_ENV': '"development"' }, jsx: { runtime: 'automatic' } },
  } as never)
  const { output } = await bundle.generate({ format: 'iife' })
  await bundle.close()
  return { code: output[0]!.code }
}

const PROMPTS_REPORT = {
  overrides: [{ key: 'rootNote', length: 42 }],
  diagnostics: [{ level: 'warn', code: 'unknown-group', key: 'groups.nope', message: 'groups.nope: no such group; ignored' }],
  budget: { l0Tokens: 325, l0Budget: 1500, layerBudget: 1000, largestLayer: { name: 'automation.develop.save', tokens: 980 }, overBudget: [] },
  skill: { enabled: true, body: 'packaged' },
}

describe('the asset editor in a real browser', { skip: detection.ok ? false : (detection as { reason: string }).reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  let uiBrowser: any
  let bundled: { code: string } | { skip: string }
  const url = (page: string) => `${server.base}/${page}`
  const rpcLog: { endpoint: string; payload: any }[] = []

  before(async () => {
    assert.ok(detection.ok)
    bundled = await bundleCard()
    if ('skip' in bundled) { console.log(`[e2e:assets-ui] SKIPPED: ${bundled.skip}`); return }
    server = await startFixtureServer()
    harness = createHarness(detection, { automationAssets: { maxModelDraftWritesPerSession: 30, modelDevelopmentEnabled: true } })
    const { chromium } = loadBrowserRuntime('playwright')
    uiBrowser = await chromium.launch({ headless: true, ...detection.channel ? { channel: detection.channel } : {}, ...detection.executablePath ? { executablePath: detection.executablePath } : {} })
  })

  after(async () => {
    await uiBrowser?.close()
    await harness?.dispose()
    await server?.close()
  })

  /** An RPC handler over the harness's store and service, as the Host would mount it. */
  function mountRpc() {
    let handler: any
    const ctx: any = {
      inject(_names: unknown, setup: (ctx: unknown) => void) { setup(ctx) },
      effect(setup: () => unknown) { setup() },
      root: { connection: { rpc: { handle(_channel: string, h: unknown) { handler = h; return async () => {} } } } },
    }
    registerAutomationAssetRpc(ctx, harness.assets, harness.service, () => PROMPTS_REPORT)
    const peer = { id: 'peer', ctx: {} as never, dispose: async () => {} }
    return (endpoint: string, payload: unknown) => handler(endpoint, payload, new AbortController().signal, peer)
  }

  async function openUi() {
    const page = await uiBrowser.newPage({ viewport: { width: 1280, height: 1100 } })
    const errors: string[] = []
    page.on('pageerror', (error: Error) => errors.push(error.message))
    const handle = mountRpc()
    await page.exposeFunction('__rpc', async (endpoint: string, payload: string) => {
      const parsed = JSON.parse(payload)
      rpcLog.push({ endpoint, payload: parsed })
      return JSON.stringify(await handle(endpoint, parsed))
    })
    await page.setContent('<!doctype html><title>asset ui</title><div id="root"></div>')
    await page.addScriptTag({ content: (bundled as { code: string }).code })
    return { page, errors }
  }

  const recipe = (answer: string) => [
    { type: 'fill', selector: '#q', value: 'ap' },
    { type: 'click', selector: '#go' },
    { type: 'assert', text: `${answer} results for ap`, timeoutMs: 600 },
  ]

  it('defect 1-3 are fixed: save-and-test tests what is on screen, activation waits for it, and switching asks first', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const A = harness.assets.saveDraft({ kind: 'recipe', name: 'Search A', domains: ['127.0.0.1'], recipe: recipe('99') as never })
    const B = harness.assets.saveDraft({ kind: 'recipe', name: 'Search B', domains: ['127.0.0.1'], recipe: recipe('2') as never })
    const { page, errors } = await openUi()
    const editor = page.locator('#dsh-browser-asset-editor')
    const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })
    const sentTo = (endpoint: string) => rpcLog.filter(entry => entry.endpoint === endpoint)

    await button(/Search A/).click()
    await page.waitForFunction(() => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes('99 results'))
    await page.getByPlaceholder('Test URL (must match an allowed domain)').fill(url('search.html'))
    assert.match(await page.locator('[data-dsh-browser-version]').innerText(), /Revision r1/)
    assert.match(await page.locator('[data-dsh-browser-version]').innerText(), new RegExp(`Content hash ${harness.assets.get(A.id)!.contentHash!.slice(0, 8)}`))
    assert.equal(await button('Runtime replay').count(), 1, 'clean editor: plain test')

    // The saved content is wrong (99 results); fix it in the editor without saving.
    const saved = await editor.inputValue()
    const fixed = saved.replace('99 results', '2 results')
    await editor.fill(fixed)
    assert.equal(await page.locator('[data-dsh-browser-dirty]').count(), 1, 'the editor says it has unsaved edits')
    assert.equal(await button('Runtime replay').count(), 0)
    assert.equal(await button('Save and test').isEnabled(), true, 'dirty: Test becomes "Save and test"')
    assert.equal(await button('Activate r1').isDisabled(), true, 'dirty: Activate is disabled and names its target revision')
    assert.equal(await button('Static validate').isDisabled(), true)

    // Defect 3: switching asks first and loses nothing.
    await button(/Search B/).click()
    await page.getByRole('alertdialog').waitFor()
    assert.equal(await editor.inputValue(), fixed, 'the unsaved edit is still in the editor')
    assert.equal(sentTo('get').filter(entry => entry.payload.id === B.id).length, 0, 'B was not even fetched')
    await button('Keep editing').click()
    assert.equal(await page.getByRole('alertdialog').count(), 0)
    assert.equal(await editor.inputValue(), fixed)

    // Defect 1: Save and test saves a new revision first and tests that exact revision.
    rpcLog.length = 0
    await button('Save and test').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-credential]')?.textContent?.includes('passed'))
    assert.deepEqual(rpcLog.map(entry => entry.endpoint).filter(name => ['save', 'test', 'status'].includes(name)), ['save', 'test'])
    assert.equal(sentTo('save')[0]!.payload.asset.id, A.id)
    assert.match(JSON.stringify(sentTo('save')[0]!.payload.asset.recipe), /2 results for ap/, 'the edited content was sent')
    assert.equal(sentTo('test')[0]!.payload.id, A.id)
    assert.equal(sentTo('test')[0]!.payload.expectedRevision, 2)
    const stored = harness.assets.get(A.id)!
    assert.equal(stored.revision, 2)
    assert.equal(stored.testStatus, 'passed', 'the edited steps passed their own assert; the saved ones could not have')
    const credential = stored.testCredentials!.at(-1)!
    assert.deepEqual([credential.revision, credential.passed, credential.contentHash], [2, true, computeContentHash(stored)])
    assert.equal(await editor.inputValue(), await editor.inputValue())
    assert.match(await editor.inputValue(), /2 results for ap/, 'the editor still shows what was tested')
    assert.equal(await page.locator('[data-dsh-browser-dirty]').count(), 0)
    assert.match(await page.locator('[data-dsh-browser-version]').innerText(), /Revision r2/)
    assert.match(await page.locator('[data-dsh-browser-credential]').innerText(), /r2 .* passed \(completed\/passed, verified\)/)
    assert.equal(await button('Runtime replay').count(), 1)

    // Defect 2: with new unsaved edits Activate is disabled and nothing reaches the backend.
    await editor.fill((await editor.inputValue()).replace('Search A', 'Search A renamed'))
    assert.equal(await button('Activate r2').isDisabled(), true)
    rpcLog.length = 0
    await button('Activate r2').click({ force: true, timeout: 500 }).catch(() => {})
    assert.equal(sentTo('status').length, 0)
    assert.equal(harness.assets.get(A.id)!.status, 'draft')

    // Confirming the switch discards the edit and loads B.
    await button(/Search B/).click()
    await page.getByRole('alertdialog').waitFor()
    await button('Discard edits and continue').click()
    await page.waitForFunction(() => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes('Search B'))
    assert.equal(harness.assets.get(A.id)!.name, 'Search A', 'the discarded edit was never saved')

    // Back on A (clean) the tested revision activates, and the request names it.
    await button(/Search A/).click()
    await page.waitForFunction(() => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes('Search A'))
    rpcLog.length = 0
    await button('Activate r2').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-version]')?.textContent?.includes('active'))
    assert.deepEqual(sentTo('status')[0]!.payload, { id: A.id, status: 'active', expectedRevision: 2 })
    assert.equal(harness.assets.get(A.id)!.status, 'active')
    assert.equal(await button('Create repair draft').count(), 1, 'an active asset offers a repair draft instead of editing')
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('JSON errors, backend errors and failed business assertions are shown differently, and nothing is lost', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const C = harness.assets.saveDraft({ kind: 'recipe', name: 'Search C', domains: ['127.0.0.1'], recipe: recipe('2') as never })
    const { page, errors } = await openUi()
    const editor = page.locator('#dsh-browser-asset-editor')
    const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })
    const notice = page.locator('[data-dsh-browser-notice]')
    await button(/Search C/).click()
    await page.waitForFunction(() => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes('Search C'))
    await page.getByPlaceholder('Test URL (must match an allowed domain)').fill(url('search.html'))

    // JSON: nothing is sent.
    const good = await editor.inputValue()
    await editor.fill(good.replace('{', '{ nope'))
    rpcLog.length = 0
    await button('Save and test').click()
    await notice.waitFor()
    assert.equal(await notice.getAttribute('data-dsh-browser-notice'), 'json')
    assert.match(await notice.innerText(), /Invalid JSON, nothing was sent/)
    assert.equal(rpcLog.filter(entry => ['save', 'test'].includes(entry.endpoint)).length, 0)

    // Business assertion: the replay ran and the assert did not hold.
    await editor.fill(good.replace('2 results', '7 results'))
    await button('Save and test').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-notice="validation"]'))
    assert.match(await notice.innerText(), /replay ran, but the business check did not hold.*\[VALIDATION_FAILED\]/s)
    assert.equal(harness.assets.get(C.id)!.testStatus, 'failed')
    assert.match(await page.locator('[data-dsh-browser-credential]').innerText(), /not passed \(failed\/failed/)
    assert.equal(await button('Activate r2').isDisabled(), true, 'a failed test never enables Activate')
    assert.match(await editor.inputValue(), /7 results/, 'the edit stays')

    // Backend: someone saved another revision after this page loaded, so the activation request is stale.
    await editor.fill(good)
    await button('Save and test').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-credential]')?.textContent?.includes('r3 ') && document.querySelector('[data-dsh-browser-credential]')?.textContent?.includes(' passed'))
    harness.assets.saveDraft({ id: C.id, kind: 'recipe', name: 'Search C', domains: ['127.0.0.1'], recipe: recipe('2') as never })
    await button('Activate r3').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-notice="backend"]'))
    assert.match(await notice.innerText(), /Backend error: .*current revision 4/)
    assert.equal(harness.assets.get(C.id)!.status, 'draft')
    assert.deepEqual(errors, [])
    await page.close()
  })

  const v2Search = (name: string, output: string) => harness.assets.saveDraft({
    kind: 'recipe', schemaVersion: 2, name, domains: ['127.0.0.1'],
    recipe: [
      { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
      { type: 'click', locator: { role: 'button', name: 'Search' } },
      { type: 'extract', locator: { css: output }, as: 'out' },
    ] as never,
    inputSchema: [{ name: 'query', type: 'string', required: true, example: 'ap' }],
    postconditions: [{ output: 'out', nonEmpty: true }],
  })

  it('several input sets: the array runs each set, the panel lists them, warns about identical outputs, and the Activate hint follows the policy', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const real = v2Search('Sets real', '#results')
    const flat = v2Search('Sets flat', 'h1')
    const { page, errors } = await openUi()
    const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })
    const inputs = page.getByLabel(/Test inputs JSON/)
    const sentTo = (endpoint: string) => rpcLog.filter(entry => entry.endpoint === endpoint)
    const select = async (name: string) => { await button(new RegExp(name)).click(); await page.waitForFunction((n: string) => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes(n), name) }

    await select('Sets real')
    await page.getByPlaceholder('Test URL (must match an allowed domain)').fill(url('search.html'))
    // One input: the test passes, but two input sets are needed, and the panel says so before the click.
    await inputs.fill('{"query":"ap"}')
    rpcLog.length = 0
    await button('Runtime replay').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-credential]')?.textContent?.includes('passed'))
    assert.deepEqual(sentTo('test')[0]!.payload, { id: real.id, url: url('search.html'), inputs: { query: 'ap' }, expectedRevision: 1 })
    assert.equal(await page.locator('[data-dsh-browser-sets]').count(), 0)
    assert.match(await page.locator('[data-dsh-browser-activation-hint]').innerText(), /at least 2 different input sets \(it covered 1\)/)
    assert.equal(await button('Activate r1').isDisabled(), true)

    // Two sets: each is listed, no warning (the outputs differ), the hint is gone and Activate is enabled.
    await inputs.fill('[{"query":"ap"},{"query":"ba"}]')
    rpcLog.length = 0
    await button('Runtime replay').click()
    await page.waitForFunction(() => document.querySelectorAll('[data-dsh-browser-set]').length === 2)
    assert.deepEqual(sentTo('test')[0]!.payload.inputSets, [{ query: 'ap' }, { query: 'ba' }])
    assert.match(await page.locator('[data-dsh-browser-set="1"]').innerText(), /Set 1 .*passed \(completed\/passed\)/)
    assert.match(await page.locator('[data-dsh-browser-set="2"]').innerText(), /Set 2 .*passed/)
    assert.equal(await page.locator('[data-dsh-browser-suspect]').count(), 0)
    assert.equal(await page.locator('[data-dsh-browser-activation-hint]').count(), 0)
    assert.equal(await button('Activate r1').isEnabled(), true)

    // A bad array is a JSON notice and nothing is sent.
    await inputs.fill('[{"query":"ap"}]')
    rpcLog.length = 0
    await button('Runtime replay').click()
    await page.locator('[data-dsh-browser-notice="json"]').waitFor()
    assert.match(await page.locator('[data-dsh-browser-notice]').innerText(), /2 to 5 input objects/)
    assert.equal(sentTo('test').length, 0)

    // Identical outputs for different inputs: still passed, with PARAMETERIZATION_SUSPECT.
    await select('Sets flat')
    await inputs.fill('[{"query":"ap"},{"query":"ba"}]')
    await button('Runtime replay').click()
    await page.locator('[data-dsh-browser-suspect]').waitFor()
    assert.match(await page.locator('[data-dsh-browser-suspect]').innerText(), /PARAMETERIZATION_SUSPECT: sets 1\/2 had different inputs but identical outputs/)
    assert.equal(await page.locator('[data-dsh-browser-set]').count(), 2)
    assert.equal(harness.assets.get(flat.id)!.testStatus, 'passed')
    assert.deepEqual(harness.assets.get(flat.id)!.testCredentials!.at(-1)!.warnings, ['PARAMETERIZATION_SUSPECT'])
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('a new recipe starts from the v2 template and saves; a v1 asset converts to a v2 draft, asking first when there are unsaved edits', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const old = harness.assets.saveDraft({ kind: 'recipe', name: 'Legacy search', domains: ['127.0.0.1'], inputNames: ['q'], recipe: [{ type: 'fill', selector: '#q', value: '{{q}}' }, { type: 'click', selector: '#go' }, { type: 'assert', text: 'results' }] as never })
    const { page, errors } = await openUi()
    const editor = page.locator('#dsh-browser-asset-editor')
    const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })

    await button('New recipe').click()
    const template = JSON.parse(await editor.inputValue())
    assert.equal(template.schemaVersion, 2)
    assert.ok(template.inputSchema.length && template.postconditions.length && template.recipe[0].locator)
    await button('Save draft').click()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-version]')?.textContent?.includes('r1'))
    assert.equal(await page.locator('[data-dsh-browser-notice]').count(), 0, 'the template saves as it is')
    assert.equal(await button('Convert to v2').count(), 0, 'a v2 asset has no convert button')

    await button(/Legacy search/).click()
    await page.waitForFunction(() => (document.querySelector('#dsh-browser-asset-editor') as HTMLTextAreaElement).value.includes('Legacy search'))
    // With an unsaved edit the conversion asks first and converts nothing.
    const saved = await editor.inputValue()
    await editor.fill(saved.replace('Legacy search', 'Legacy edited'))
    rpcLog.length = 0
    await button('Convert to v2').click()
    await page.getByRole('alertdialog').waitFor()
    assert.equal(rpcLog.filter(entry => entry.endpoint === 'convert').length, 0)
    await button('Keep editing').click()

    await button('Convert to v2').click()
    await page.getByRole('alertdialog').waitFor()
    await button('Discard edits and continue').click()
    await page.locator('[data-dsh-browser-converted]').waitFor()
    assert.match(await page.locator('[data-dsh-browser-converted]').innerText(), /Converted "Legacy search" into a new v2 draft/)
    assert.match(await page.locator('[data-dsh-browser-pending]').innerText(), /2 step\(s\) still take the first match \(pendingDisambiguation\)/)
    assert.equal(JSON.parse(await editor.inputValue()).schemaVersion, 2)
    assert.equal(await button('Convert to v2').count(), 0)
    assert.equal(harness.assets.get(old.id)!.schemaVersion, undefined, 'the original is untouched')
    assert.deepEqual(rpcLog.filter(entry => entry.endpoint === 'convert').map(entry => entry.payload), [{ id: old.id }])
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('the prompt text section renders and shows what the plugin reports: L0 estimate, overrides and diagnostics', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors } = await openUi()
    const section = page.locator('[data-dsh-browser-prompts]')
    await section.waitFor()
    await page.waitForFunction(() => document.querySelector('[data-dsh-browser-prompts-budget]') !== null)
    assert.match(await section.locator('h3').innerText(), /Prompt text/)
    assert.match(await page.locator('[data-dsh-browser-prompts-budget]').innerText(), /~325 tokens \(budget 1500\)/)
    assert.match(await page.locator('[data-dsh-browser-prompts-status]').innerText(), /1 overrides in effect: rootNote \(42\)/)
    assert.match(await page.locator('[data-dsh-browser-prompts-diagnostics]').innerText(), /groups\.nope: no such group/)
    assert.equal(await page.locator('#plugin-config-dsh-browser-prompts-rootNote').count(), 1)
    assert.equal(await page.locator('#plugin-config-dsh-browser-prompts-extras').count(), 1)
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('Export default text shows the same JSON as prompts:dump in a read-only box, with no pnpm in the section', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors } = await openUi()
    const section = page.locator('[data-dsh-browser-prompts]')
    await section.waitFor()
    assert.equal(/pnpm/i.test(await section.innerText()), false)
    assert.equal(await page.locator('[data-dsh-browser-prompts-defaults]').count(), 0, 'nothing is shown until asked for')
    await page.getByRole('button', { name: 'Export default text', exact: true }).click()
    const box = page.locator('[data-dsh-browser-prompts-defaults]')
    await box.waitFor()
    assert.equal(await box.getAttribute('readonly') !== null, true)
    const text = await box.inputValue()
    assert.deepEqual(JSON.parse(text), defaultPrompts())
    assert.equal(text, JSON.stringify(defaultPrompts(), null, 2))
    assert.equal(await page.getByRole('textbox', { name: 'Default text (read-only)' }).count(), 1, 'the box has an accessible name')
    await page.getByRole('button', { name: 'Hide', exact: true }).click()
    assert.equal(await page.locator('[data-dsh-browser-prompts-defaults]').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  })
})
