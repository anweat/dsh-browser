/**
 * The redesigned settings card in a real browser: the real SettingsCard with the real form controller over a fake settings
 * scope, driven the way a person drives it (open a group, pick from a drop-down, open a dialog, save, cancel). What is
 * asserted at the end is what the Host would have been asked to write, so these tests hold the saved structure fixed
 * while the layout changes. The Host's own components (Modal, Switch, ...) are stubs here; test/e2e/ui/primitives-stub.ts
 * lists what the stubs keep faithful. The look in the real Host is checked separately against a real profile.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadBrowserRuntime } from '../../src/deps.ts'
import { detectBrowser } from './support.ts'
import { bundleEntry } from './ui-support.ts'
import { defaultPrompts, promptsDumpText } from '../../src/prompts.ts'
import { promptsDumpYaml } from '../../src/prompts-yaml.ts'

const detection = detectBrowser()

const POLICY = {
  revision: 3, updatedAt: '2026-01-01T00:00:00Z', overlayActive: true, allowPrivateHosts: false, authDir: '/data/browser/auth',
  authProfiles: [
    { id: 'fx', origin: 'baseline', allowedDomains: ['alt.localhost'], persistState: false },
    { id: 'agent-made', origin: 'overlay-created', allowedDomains: ['a.test'], persistState: true, storageStatePath: '/data/browser/auth/agent-made.json' },
  ],
  removedByOverlay: [], usagePolicy: { minDelayMs: { value: 2000, baseline: 750, overridden: true } },
  audit: [{ revision: 3, at: '2026-01-01T00:00:00Z', source: 'agent', session: 'session:x', action: 'runtime.set_usage_policy', reason: 'rate limited', direction: 'tighten', changes: ['usagePolicy.minDelayMs: 750 -> 2000 (stricter)'] }],
}
const PROMPTS_REPORT = {
  overrides: [], diagnostics: [],
  budget: { l0Tokens: 325, l0Budget: 1500, layerBudget: 1000, largestLayer: { name: 'root', tokens: 120 }, overBudget: [] },
  skill: { enabled: true, body: 'packaged' },
}
const FX = { storageStatePath: '/data/browser/auth/fx.json', allowedDomains: ['alt.localhost'], persistState: false }

describe('the settings card in a real browser', { skip: detection.ok ? false : (detection as { reason: string }).reason }, () => {
  let uiBrowser: any
  let bundled: { code: string } | { skip: string }

  before(async () => {
    assert.ok(detection.ok)
    bundled = await bundleEntry('settings-entry.tsx')
    if ('skip' in bundled) { console.log(`[e2e:settings-ui] SKIPPED: ${bundled.skip}`); return }
    const { chromium } = loadBrowserRuntime('playwright')
    uiBrowser = await chromium.launch({ headless: true, ...detection.channel ? { channel: detection.channel } : {}, ...detection.executablePath ? { executablePath: detection.executablePath } : {} })
  })
  after(async () => { await uiBrowser?.close() })

  const RUNTIME_OK = { browser: { ready: true, source: 'playwright-chromium' }, systemBrowsers: [], chromiumInstalled: true, opencli: { enabled: true, installed: true, source: 'path' } }

  /** A card over these stored values (all of them in the user layer unless `user` says otherwise). */
  async function openCard(init: { value?: Record<string, unknown>; user?: Record<string, unknown>; base?: Record<string, unknown>; locale?: 'en' | 'zh'; accept?: boolean; writable?: boolean; runtime?: unknown } = {}, width = 1100) {
    const page = await uiBrowser.newPage({ viewport: { width, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', (error: Error) => errors.push(error.message))
    await page.exposeFunction('__rpc', async (endpoint: string) => {
      const reply = endpoint === 'policy' ? POLICY : endpoint === 'prompts' ? PROMPTS_REPORT : endpoint === 'snapshot' ? { policy: {}, candidates: [], assets: [] } : endpoint === 'promptsDefaults' ? { json: promptsDumpText() } : endpoint === 'promptsDefaultsYaml' ? { yaml: promptsDumpYaml('en') } : endpoint === 'runtime' ? (init.runtime ?? RUNTIME_OK) : {}
      return JSON.stringify({ ok: true, value: reply })
    })
    await page.setContent('<!doctype html><title>settings ui</title><div id="root"></div>')
    const value = init.value ?? {}
    await page.evaluate((state: unknown) => { (window as any).__init = state }, { ...init, value, user: init.user ?? value })
    await page.addScriptTag({ content: (bundled as { code: string }).code })
    const open = async (group: string) => { await page.locator(`[data-dsb-group="${group}"] > summary`).click() }
    const writes = (): Promise<{ ops: { op: string; path: string[]; value?: unknown }[] }[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__scope.writes)))
    const unsaved = () => page.locator('[data-dsb-unsaved]').innerText()
    const save = async () => { await page.getByRole('button', { name: init.locale === 'zh' ? '保存' : 'Save', exact: true }).click(); await page.waitForFunction(() => (window as any).__scope.writes.length > 0) }
    return { page, errors, open, writes, unsaved, save }
  }

  it('login profiles: edit one in its dialog, cancel loses nothing, done stages it, and the page Save writes the whole map', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: { authProfiles: { fx: FX } } })
    await open('access')
    const row = page.locator('[data-dsb-item="fx"]')
    assert.match(await row.innerText(), /fx[\s\S]*1 domain/)
    assert.equal(await page.locator('[data-dsb-item="agent-made"]').count(), 1, 'the overlay-created profile is listed, without an edit button')
    assert.equal(await page.locator('[data-dsb-item="agent-made"]').getByRole('button', { name: 'Edit' }).count(), 0)

    // Cancel: nothing staged.
    await row.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit profile' })
    await dialog.getByLabel('Allowed domains').fill('b.localhost')
    await dialog.getByLabel('Allowed domains').press('Enter')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await unsaved(), 'No unsaved changes')

    // Done: staged, listed, one unsaved item; the dialog showed the state file as read-only text with its rule.
    await row.getByRole('button', { name: 'Edit' }).click()
    assert.equal(await dialog.locator('[data-dsb-auth-path]').innerText(), '/data/browser/auth/fx.json')
    await dialog.getByLabel('Allowed domains').fill('b.localhost')
    await dialog.getByLabel('Allowed domains').press('Enter')
    await dialog.getByRole('switch', { name: 'Save login state' }).check()
    await dialog.getByRole('button', { name: 'Done' }).click()
    assert.equal(await unsaved(), '1 unsaved')
    assert.match(await row.innerText(), /2 domain/)
    assert.equal((await writes()).length, 0, 'nothing is written until the page Save')
    await save()
    const [write] = await writes()
    assert.deepEqual(write!.ops, [{ op: 'set', path: ['authProfiles'], value: { fx: { storageStatePath: '/data/browser/auth/fx.json', allowedDomains: ['alt.localhost', 'b.localhost'], persistState: true } } }])
    await page.waitForFunction(() => document.querySelector('[data-dsb-unsaved]')!.textContent === 'No unsaved changes')
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('login profiles: a new profile is checked as it is typed, takes its path from the login-state directory, and shows up in the default-profile drop-down', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: { authProfiles: { fx: FX } } })
    await open('access')
    await page.getByRole('button', { name: 'Add profile' }).click()
    const dialog = page.getByRole('dialog', { name: 'New login profile' })
    const done = dialog.getByRole('button', { name: 'Done' })
    assert.equal(await done.isDisabled(), true, 'nothing yet')
    await dialog.getByLabel('Name', { exact: true }).fill('fx')
    assert.match(await dialog.innerText(), /already exists|A profile with this name exists/)
    await dialog.getByLabel('Name', { exact: true }).fill('bad name!')
    assert.match(await dialog.innerText(), /Use letters, digits/)
    await dialog.getByLabel('Name', { exact: true }).fill('work-portal')
    await dialog.getByLabel('Allowed domains').fill('https://portal.example.com')
    await dialog.getByLabel('Allowed domains').press('Enter')
    assert.match(await dialog.innerText(), /Host names only/, 'a URL is refused as a domain')
    await dialog.getByLabel('Allowed domains').fill('*.corp.example.com')
    await dialog.getByLabel('Allowed domains').press('Enter')
    assert.equal(await dialog.locator('[data-dsb-auth-path]').innerText(), '/data/browser/auth/work-portal.json')
    await done.click()
    assert.equal(await unsaved(), '1 unsaved')
    // The drop-down offers the new profile; choosing it stages the default.
    const select = page.locator('#plugin-config-dsh-browser-defaultAuthProfile')
    assert.deepEqual(await select.locator('option').allInnerTexts(), ['(none)', 'fx', 'work-portal'])
    await select.selectOption('work-portal')
    assert.equal(await unsaved(), '2 unsaved')
    await save()
    const [write] = await writes()
    assert.deepEqual(write!.ops.map(op => op.path[0]).sort(), ['authProfiles', 'defaultAuthProfile'])
    const profiles = write!.ops.find(op => op.path[0] === 'authProfiles')!.value as Record<string, unknown>
    assert.deepEqual(profiles['work-portal'], { storageStatePath: '/data/browser/auth/work-portal.json', allowedDomains: ['*.corp.example.com'], persistState: false })
    assert.deepEqual(write!.ops.find(op => op.path[0] === 'defaultAuthProfile')!.value, 'work-portal')
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('login profiles: deleting asks for a second click, and removing the last one writes an empty map', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, open, writes, save } = await openCard({ value: { authProfiles: { fx: FX } } })
    await open('access')
    await page.locator('[data-dsb-item="fx"]').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit profile' })
    await dialog.getByRole('button', { name: 'Delete this profile' }).click()
    assert.equal(await page.getByRole('dialog').count(), 1, 'the first click only asks')
    await dialog.getByRole('button', { name: 'Confirm delete' }).click()
    assert.equal(await page.locator('[data-dsb-item="fx"]').count(), 0)
    await save()
    assert.deepEqual((await writes())[0]!.ops, [{ op: 'set', path: ['authProfiles'], value: {} }])
    await page.close()
  })

  it('the policy overlay: the page shows one status line; the change log is in a dialog', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, open } = await openCard({ value: {} })
    await open('access')
    assert.match(await page.locator('[data-dsb-policy-status]').innerText(), /Overlay active, revision 3/)
    assert.equal(await page.locator('[data-dsh-browser-policy-audit]').count(), 0, 'the audit trail is not on the page')
    await page.getByRole('button', { name: 'View change log' }).click()
    const dialog = page.getByRole('dialog', { name: 'Policy overlay change log' })
    assert.match(await dialog.locator('[data-dsh-browser-policy-audit]').innerText(), /runtime\.set_usage_policy[\s\S]*tighten[\s\S]*rate limited/)
    assert.match(await dialog.locator('[data-dsh-browser-policy-profiles]').innerText(), /agent-made[\s\S]*overlay-created|agent-made[\s\S]*Created by overlay|agent-made/)
    await dialog.getByRole('button', { name: 'Close' }).last().click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.close()
  })

  it('usage limits: a number with its unit and range, an out-of-range text is refused with a reason, the save writes only what differs', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const stored = { minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1000, cooldownMs: 30000 }
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: { usagePolicy: stored }, user: {} })
    await open('limits')
    const row = page.locator('[data-dsb-policy-key="usagePolicy.minDelayMs"]')
    assert.match(await row.innerText(), /Minimum gap[\s\S]*Range 0–60000 · default 750/)
    assert.equal(await row.locator('input').inputValue(), '750')
    const input = row.locator('input')
    await input.fill('90000')
    assert.match(await row.innerText(), /Out of range/)
    assert.match(await page.locator('[data-dsb-savebar]').innerText(), /invalid/)
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true)
    await input.fill('2000')
    assert.equal(await unsaved(), '1 unsaved')
    assert.match(await row.innerText(), /Overridden/)
    await save()
    assert.deepEqual((await writes())[0]!.ops, [{ op: 'set', path: ['usagePolicy'], value: { minDelayMs: 2000 } }])
    // The reset puts the default back.
    await row.getByRole('button', { name: 'Restore default' }).click()
    assert.equal(await input.inputValue(), '750')
    // The raw JSON box is folded away and is the same staged data (the stub of the Host's field does not follow state, so read the state).
    assert.equal(await page.locator('[data-dsb-fold="limits-raw"] #plugin-config-dsh-browser-usagePolicy-json').count(), 1)
    assert.equal(await page.evaluate(() => (window as any).__settings.snapshot().jsonFields.usagePolicy.text), '{}')
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('the save bar floats only while there are unsaved edits, so before anything is edited it never sits over a group heading', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, unsaved } = await openCard({ value: {}, user: {} }, 900)
    await page.setViewportSize({ width: 900, height: 420 })
    const bar = page.locator('[data-dsb-savebar]')
    const topmostIsInside = (selector: string) => page.evaluate((sel) => {
      const el = document.querySelector(sel)!
      const box = el.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return !!hit && el.contains(hit)
    }, selector)

    // Clean: the bar is part of the page flow. Scroll every heading to the bottom edge of the window: each one is what a click would reach.
    assert.equal(await bar.evaluate(el => getComputedStyle(el).position), 'static', 'nothing to save: the bar does not float over the content')
    const ids = await page.locator('[data-dsb-group]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-dsb-group')!))
    assert.ok(ids.length >= 5, 'the card has several groups')
    for (const id of ids) {
      const summary = `[data-dsb-group="${id}"] > summary`
      await page.evaluate((sel) => document.querySelector(sel)!.scrollIntoView({ block: 'end' }), summary)
      assert.equal(await topmostIsInside(summary), true, `heading ${id} is clickable at the bottom edge of the window`)
    }
    // The first click on such a heading opens the group.
    const last = ids[ids.length - 1]!
    await page.evaluate((sel) => document.querySelector(sel)!.scrollIntoView({ block: 'end' }), `[data-dsb-group="${last}"] > summary`)
    await open(last)
    assert.equal(await page.locator(`[data-dsb-group="${last}"]`).evaluate(el => (el as HTMLDetailsElement).open), true)
    await page.locator(`[data-dsb-group="${last}"] > summary`).click()

    // Unsaved edits: now the bar floats (Save stays in reach while scrolling), and going back to clean puts it back in the flow.
    await open('limits')
    await page.locator('[data-dsb-policy-key="usagePolicy.minDelayMs"] input').fill('2000')
    assert.equal(await unsaved(), '1 unsaved')
    assert.equal(await bar.evaluate(el => getComputedStyle(el).position), 'sticky')
    await page.getByRole('button', { name: 'Discard', exact: true }).click()
    assert.equal(await unsaved(), 'No unsaved changes')
    assert.equal(await bar.evaluate(el => getComputedStyle(el).position), 'static')
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('prompts: a text is edited beside its default, start-from-default and restore work, Cancel stages nothing, and the page Save writes one prompts object', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: {}, user: {} })
    await open('prompts')
    const defaults = defaultPrompts() as { rootGuide: string }
    const row = page.locator('[data-dsb-item="rootNote"]')
    assert.match(await row.innerText(), /default/)
    // Cancel: nothing staged.
    await row.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit: Root note' })
    await dialog.getByLabel('Your override').fill('Prefer search first.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await unsaved(), 'No unsaved changes')
    // Save in the dialog stages one prompts change.
    await row.getByRole('button', { name: 'Edit' }).click()
    await dialog.getByLabel('Your override').fill('Prefer search first.')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    assert.equal(await unsaved(), '1 unsaved')
    assert.match(await row.innerText(), /overridden[\s\S]*20 chars/)
    // A text with a default: the default is shown, start-from-default copies it, and saving it unchanged is no override.
    const guide = page.locator('[data-dsb-item="rootGuide"]')
    await guide.getByRole('button', { name: 'Edit' }).click()
    const guideDialog = page.getByRole('dialog', { name: /Edit: Compact guide/ })
    await page.waitForFunction(() => (document.querySelector('[data-dsb-prompt-default]') as HTMLElement | null)?.textContent?.startsWith('Guide:'))
    assert.equal(await guideDialog.locator('[data-dsb-prompt-default]').innerText(), defaults.rootGuide)
    await guideDialog.getByRole('button', { name: 'Start from default' }).click()
    assert.equal(await guideDialog.getByLabel('Your override').inputValue(), defaults.rootGuide)
    assert.match(await guideDialog.innerText(), /Same as the default text/)
    await guideDialog.getByRole('button', { name: 'Save', exact: true }).click()
    assert.equal(await unsaved(), '1 unsaved', 'the default itself stages nothing')
    // Too long: refused with the cap.
    await guide.getByRole('button', { name: 'Edit' }).click()
    await guideDialog.getByLabel('Your override').fill('x'.repeat(1501))
    assert.match(await guideDialog.innerText(), /1501\/1500/)
    assert.equal(await guideDialog.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true)
    await guideDialog.getByRole('button', { name: 'Cancel' }).click()
    await save()
    assert.deepEqual((await writes())[0]!.ops, [{ op: 'set', path: ['prompts'], value: { rootNote: 'Prefer search first.' } }])
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('prompts: group, action and error-hint entries are listed only when changed, edited in their dialog beside the default, and removed again', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: {}, user: {} })
    await open('prompts')
    assert.match(await page.locator('[data-dsb-entry-list]').innerText(), /No entries changed/)
    await page.getByRole('button', { name: 'Add entry' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add an entry' })
    assert.equal(await dialog.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'a key and text first')
    await dialog.getByLabel('Key', { exact: true }).fill('act.click')
    await page.waitForFunction(() => /click/i.test(document.querySelector('[role=dialog] pre')?.textContent ?? ''))
    assert.match(await dialog.locator('pre').first().innerText(), /click/i, 'the default summary of the action is shown')
    await dialog.getByLabel('Summary · Your override').fill('Click or tap an element.')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    assert.equal(await unsaved(), '1 unsaved')
    const entry = page.locator('[data-dsb-item="actions:act.click"]')
    assert.match(await entry.innerText(), /act\.click[\s\S]*action[\s\S]*Click or tap an element\./)
    // An error hint, and an unknown key is only noted.
    await page.getByRole('button', { name: 'Add entry' }).click()
    await dialog.getByLabel('Kind').selectOption('errorHints')
    await dialog.getByLabel('Key', { exact: true }).fill('NOT_A_CODE')
    assert.match(await dialog.innerText(), /no such key|defaults have no such key/i)
    await dialog.getByLabel('Hint text · Your override').fill('Try again later.')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    assert.equal(await unsaved(), '1 unsaved', 'still one field: prompts')
    await save()
    assert.deepEqual((await writes())[0]!.ops, [{ op: 'set', path: ['prompts'], value: { actions: { 'act.click': { summary: 'Click or tap an element.' } }, errorHints: { NOT_A_CODE: 'Try again later.' } } }])
    // Remove one: back to a single entry.
    await entry.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('dialog', { name: /Edit entry: act\.click/ }).getByRole('button', { name: 'Remove override' }).click()
    assert.equal(await page.locator('[data-dsb-item="actions:act.click"]').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('text mode: the text is a view of the controls (comments in front of every key, in the card\'s language) and typing in it stages the same fields', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const { page, errors, open, writes, unsaved, save } = await openCard({ value: { maxSessions: 8, channel: 'chromium' }, user: { maxSessions: 8 }, locale: 'zh' })
    await open('advanced')
    const box = page.locator('#plugin-config-dsh-browser-properties')
    const text = async () => await box.inputValue()
    assert.match(await text(), /# 同时持有页面的会话数，1–64；超出时关闭最久未使用的。默认 8\nmaxSessions = 8\n/)
    assert.match(await text(), /# 视口：window = 浏览器默认[^\n]*\n# viewportMode = window\n/)
    // A control edit prints the text again.
    await open('browser')
    await page.locator('#plugin-config-dsh-browser-channel').selectOption('chrome')
    assert.match(await text(), /\nchannel = chrome\n/)
    // Typing in the text stages the fields: a changed value, a deleted line (back to the default), a comment line that is not data.
    await box.fill((await text()).replace('maxSessions = 8', 'maxSessions = 3').replace('channel = chrome', '# channel = chromium'))
    assert.match(await unsaved(), /1 项未保存/, 'one field is staged: maxSessions (the channel went back to what is stored)')
    await save()
    assert.deepEqual((await writes())[0]!.ops, [{ op: 'set', path: ['maxSessions'], value: 3 }])
    // A broken line is reported with its line number and blocks the save.
    await box.fill('not a setting line')
    assert.match(await page.locator('[data-dsh-browser-properties-errors]').innerText(), /^第 ?1 ?行|line 1/)
    assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true)
    assert.deepEqual(errors, [])
    await page.close()
  })

  it('the runtime notices: no browser is a warning with the steps, a system Chrome and a missing OpenCLI are notices in the same dialog', async (t) => {
    if ('skip' in bundled) return t.skip(bundled.skip)
    const none = await openCard({ runtime: { ...RUNTIME_OK, browser: { ready: false, source: 'none', installAdvice: 'No browser is available to launch. Do one of: (1) install Google Chrome or Microsoft Edge; (2) run the runtime.install action.' }, chromiumInstalled: false } })
    await none.page.locator('[data-dsb-summary]').getByText('No browser available').waitFor()
    assert.equal(await none.page.locator('[data-dsb-warnings-count]').getAttribute('data-dsb-warnings-count'), '1')
    await none.page.locator('[data-dsb-warnings-count]').click()
    assert.match(await none.page.locator('[data-dsb-runtime-warning]').innerText(), /install Google Chrome or Microsoft Edge[\s\S]*runtime\.install/)
    assert.deepEqual(none.errors, [])

    const quiet = await openCard({ value: { opencliEnabled: true }, runtime: { ...RUNTIME_OK, browser: { ready: true, source: 'system-browser', note: 'Playwright Chromium is not installed, so Google Chrome is used (nothing to download).' }, chromiumInstalled: false, opencli: { enabled: true, installed: false, hint: 'OpenCLI is not installed (optional). Install it with `npm i -g @jackwener/opencli`.' } } })
    await quiet.page.locator('[data-dsb-summary]').getByText('OpenCLI not installed').waitFor()
    assert.equal(await quiet.page.locator('[data-dsb-warnings-count]').getAttribute('data-dsb-warnings-count'), '0')
    await quiet.page.locator('[data-dsb-summary]').getByText('Browser: system Chrome / Edge').waitFor()
    await quiet.page.locator('[data-dsb-warnings-count]').click()
    const notices = await quiet.page.locator('[data-dsb-runtime-notices]').innerText()
    assert.match(notices, /Google Chrome is used/)
    assert.match(notices, /npm i -g @jackwener\/opencli/)
    assert.deepEqual(quiet.errors, [])
  })

})
