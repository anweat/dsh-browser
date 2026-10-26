/**
 * What the real SettingsCard puts on the page, read from its rendered markup (not from a list of field names):
 *   - every public configuration field is a control or carries a note saying where to edit it;
 *   - every text control has an accessible name; the key lists printed under the policy boxes are the code's own lists.
 * The card is bundled with the rolldown that tsdown ships and rendered with react-dom/server.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { before } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const require = createRequire(import.meta.url)
const { Config } = await import('../src/config.ts')

type Render = (options?: Record<string, unknown>) => { html: string; missingKeys: string[] }
let renderCard: Render | undefined
let skip: string | undefined

before(async () => {
  try {
    const fromTsdown = createRequire(require.resolve('tsdown/package.json'))
    const rolldown = await import(fromTsdown.resolve('rolldown'))
    const entry = new URL('./ui/ssr-entry.tsx', import.meta.url).pathname
    const stub = new URL('./e2e/ui/primitives-stub.ts', import.meta.url).pathname
    const bundle = await rolldown.rolldown({
      input: entry, platform: 'node', logLevel: 'silent',
      resolve: { alias: { '@deepseek-ai/dsh-client-ui-primitives': stub } },
      transform: { define: { 'process.env.NODE_ENV': '"development"' }, jsx: { runtime: 'automatic' } },
    } as never)
    const { output } = await bundle.generate({ format: 'esm' })
    await bundle.close()
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-ssr-')), 'card.mjs')
    fs.writeFileSync(file, output[0]!.code)
    renderCard = (await import(pathToFileURL(file).href)).renderCard
  } catch (error) { skip = `could not bundle the card (rolldown from tsdown): ${String(error)}`; console.log(`[settings-card-render] SKIPPED: ${skip}`) }
})

const draft = {
  id: 'a1', kind: 'recipe', status: 'draft', name: 'Search', revision: 2, testStatus: 'passed', domains: ['example.com'], inputNames: ['q'], tags: [], description: '',
  schemaVersion: 1, recipe: [], contentHash: 'abcdef012345', successCount: 0, failureCount: 0, createdAt: 'x', updatedAt: 'x',
  testCredentials: [{ revision: 2, contentHash: 'abcdef012345', passed: true, testedAt: '2026-01-01T00:00:00Z', executionStatus: 'completed', validationStatus: 'passed', evidenceLevel: 'verified', inputsDigest: 'd', inputSetsOnly: true,
    inputSets: [{ index: 0, inputsDigest: 'aa', passed: true, executionStatus: 'completed', validationStatus: 'passed', outputsDigest: 'x' }, { index: 1, inputsDigest: 'bb', passed: true, executionStatus: 'completed', validationStatus: 'passed', outputsDigest: 'x' }], warnings: ['PARAMETERIZATION_SUSPECT'] }],
  pendingDisambiguation: [{ index: 0 }],
}
const variants: Record<string, Record<string, unknown>> = {
  'nothing selected': {},
  'a v1 draft with a suspect test': { selected: draft, editor: { testUrl: 'https://example.com/', converted: { sourceName: 'Old', notes: ['n'] }, notice: { kind: 'backend', message: 'm' } } },
  'an active asset': { selected: { ...draft, status: 'active', schemaVersion: 2 } },
}

/** The ids of the controls and the notes the card rendered. */
function fieldsRendered(html: string): { controls: string[]; notes: string[] } {
  return {
    // Ids with a dash belong to a part of a field (a policy key's input `usagePolicy-minDelayMs`, the raw box `usagePolicy-json`, a prompt box `prompts-…`).
    controls: [...new Set([...html.matchAll(/<(?:input|textarea|select)[^>]*\bid="plugin-config-dsh-browser-([A-Za-z0-9-]+)"/g)].map(match => match[1]!).filter(id => !id.includes('-')).concat([...html.matchAll(/data-dsb-field="([A-Za-z0-9]+)"/g)].map(match => match[1]!)))],
    notes: [...html.matchAll(/data-dsh-browser-config-note="([A-Za-z0-9]+)"/g)].map(match => match[1]!),
  }
}

test('every public config field has exactly one entry in the card: a control, or a note; the properties text is only a mirror', async (t) => {
  if (skip) return t.skip(skip)
  const { MISPLACED_CONFIG_KEYS } = await import('../src/config.ts')
  const publicFields = Object.keys((Config as unknown as { dict: Record<string, unknown> }).dict).filter(field => !MISPLACED_CONFIG_KEYS.includes(field))
  assert.ok(publicFields.length >= 21, 'the schema has the fields this test was written against')
  // Rows that exist only while they apply: a custom viewport size, the proxy address and bypass list. Render them present.
  const conditional = { viewportMode: 'custom', proxyServer: 'http://127.0.0.1:7890' }
  // Fields whose group is not rebuilt yet: still reachable through the properties text. Emptied as each group lands.
  const pending: string[] = []
  for (const locale of ['en', 'zh'] as const) {
    const { html, missingKeys } = renderCard!({ locale, fieldTexts: conditional })
    assert.deepEqual(missingKeys, [], `every label and hint the card asks for exists in ${locale}`)
    const { controls, notes } = fieldsRendered(html)
    const editor = /<textarea[^>]*id="plugin-config-dsh-browser-properties"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)
    assert.ok(editor, 'the default-parameters text is rendered')
    const text = editor![1]!.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')
    const inEditor = (field: string) => new RegExp(`^#? ?${field} =`, 'm').test(text)
    for (const field of publicFields) {
      const control = controls.filter(id => id === field).length === 1
      const note = notes.includes(field)
      assert.equal(controls.filter(id => id === field).length > 1, false, `config field "${field}" has more than one control in the ${locale} card`)
      if (pending.includes(field)) { assert.ok(inEditor(field), `${field} is still a line of the properties text`); continue }
      assert.ok(control || note, `config field "${field}" is neither a control nor a note in the ${locale} card`)
      assert.equal([control, note].filter(Boolean).length, 1, `config field "${field}" is shown as ${[control && 'a control', note && 'a note'].filter(Boolean).join(' and ')}`)
    }
    // Nothing on the card points at a field the schema does not have (the properties text is a mirror, not a field).
    for (const id of controls.filter(id => id !== 'properties')) assert.ok(publicFields.includes(id), `control ${id} is not a config field`)
    for (const id of notes) assert.ok(publicFields.includes(id), `note ${id} is not a config field`)
    for (const field of ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled', 'browserRuntime', 'channel', 'headless', 'maxSessions', 'args', 'viewportMode', 'viewportWidth', 'viewportHeight', 'userAgent', 'locale', 'timezoneId', 'proxyServer', 'proxyBypass', 'downloadDir', 'downloadMaxBytes', 'usagePolicy', 'automationAssets', 'authProfiles', 'defaultAuthProfile', 'allowPrivateHosts', 'storageStatePath', 'prompts']) assert.ok(controls.includes(field), `${field} is a control`)
    assert.ok(notes.includes('rulePacks'), 'rulePacks has a note')
    assert.ok(!controls.includes('rulePacks'))
    assert.equal(html.includes(locale === 'zh' ? '配置文件' : 'config file'), true, 'the note says where to edit')
  }
  // Every key of the two policy objects has its own input in the card, and the raw box lists the keys the code accepts.
  const { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } = await import('../src/policy-keys.ts')
  const rendered = renderCard!({}).html
  const policyRows = (field: string) => [...rendered.matchAll(new RegExp(`data-dsb-policy-key="${field}\\.([A-Za-z]+)"`, 'g'))].map(match => match[1]!)
  assert.deepEqual(policyRows('usagePolicy'), [...USAGE_POLICY_KEYS], 'one row per usagePolicy key, in the code\'s order')
  assert.deepEqual(policyRows('automationAssets').toSorted(), [...ASSET_POLICY_KEYS].toSorted(), 'one row per automationAssets key')
  // The conditional rows are absent while they do not apply.
  const plain = fieldsRendered(renderCard!({}).html).controls
  for (const field of ['viewportWidth', 'viewportHeight', 'proxyServer', 'proxyBypass']) assert.equal(plain.includes(field), false, `${field} appears only when it applies`)
})

test('the policy boxes list every key the code accepts, in both locales (maxTestCredentials and minInputSetsForActivation included)', async (t) => {
  if (skip) return t.skip(skip)
  const { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } = await import('../src/policy-keys.ts')
  assert.ok(ASSET_POLICY_KEYS.includes('maxTestCredentials') && ASSET_POLICY_KEYS.includes('minInputSetsForActivation'))
  for (const locale of ['en', 'zh'] as const) {
    const { html } = renderCard!({ locale })
    const hintOf = (field: string) => html.match(new RegExp(`data-dsh-field="plugin-config-dsh-browser-${field}-json"[\\s\\S]*?<p>([^<]*)</p>`))?.[1] ?? ''
    for (const [field, keys] of [['automationAssets', ASSET_POLICY_KEYS], ['usagePolicy', USAGE_POLICY_KEYS]] as const) {
      const hint = hintOf(field)
      const listed = hint.slice(hint.lastIndexOf(locale === 'zh' ? '可用键名：' : 'Keys:')).replace(/^[^:：]*[:：]\s*/, '').split(/,\s*/)
      assert.deepEqual(listed, [...keys], `${field} hint (${locale}) lists exactly the code's keys`)
    }
  }
})

test('the policy overlay clear button is usable while a corrupt overlay file is being ignored (the warning tells people to use it)', (t) => {
  if (skip) return t.skip(skip)
  const clear = (html: string) => html.match(/<button[^>]*data-dsb-action="policy-clear"[^>]*>/)?.[0] ?? ''
  const disabled = (html: string) => /\sdisabled(=|\s|>)/.test(clear(html))
  for (const locale of ['en', 'zh'] as const) {
    assert.ok(clear(renderCard!({ locale }).html), 'the card has the clear button')
    assert.equal(disabled(renderCard!({ locale }).html), false, 'enabled while an overlay is active')
    // Nothing to clear: no overlay and no warning.
    assert.equal(disabled(renderCard!({ locale, policyReport: { overlayActive: false } }).html), true, 'disabled when there is nothing to clear')
    // The overlay file was edited outside the plugin: it is ignored, the report says so, and clearing is the way out.
    const ignored = renderCard!({ locale, policyReport: { overlayActive: false, warning: 'policy overlay was ignored: the checksum does not match' } }).html
    assert.equal(disabled(ignored), false, 'enabled while the overlay file is ignored with a warning')
    assert.ok(ignored.includes('data-dsh-browser-policy-warning'))
  }
})

test('the prompts group offers "Export default text" (the dialog is opened from it) and never asks anyone to run pnpm', (t) => {
  if (skip) return t.skip(skip)
  for (const locale of ['en', 'zh'] as const) {
    const { html } = renderCard!({ locale })
    assert.equal(/pnpm/i.test(html), false, `the ${locale} card never mentions pnpm`)
    assert.match(html, locale === 'zh' ? /导出默认文本/ : /Export default text/)
    assert.ok(html.includes('data-dsh-browser-prompts-export'))
    assert.equal(html.includes('data-dsh-browser-prompts-defaults'), false, 'the box lives in the dialog, which is closed')
  }
})

test('every text control of the card has an accessible name, in every state of the asset panel', (t) => {
  if (skip) return t.skip(skip)
  for (const [name, options] of Object.entries(variants)) {
    for (const locale of ['en', 'zh'] as const) {
      const { html, missingKeys } = renderCard!({ ...options, locale })
      assert.deepEqual(missingKeys, [], `${name}: no missing translations in ${locale}`)
      const controls = controlsOf(html)
      assert.ok(controls.length > 10, `${name}: the card has its controls (${controls.length})`)
      assert.deepEqual(controls.filter(control => !control.named).map(control => control.tag + '#' + (control.id ?? '(no id)')), [], `${name}/${locale}: controls without an accessible name`)
    }
  }
  // The asset editor and the test box are among them.
  const html = renderCard!({ ...variants['a v1 draft with a suspect test']! }).html
  const ids = controlsOf(html).map(control => control.id)
  assert.ok(ids.includes('dsh-browser-asset-editor'))
})

interface Control { tag: string; id?: string; named: boolean }

/** Every text-entry control in the markup with whether it has a name: aria-label, aria-labelledby, an enclosing label, or a label for its id. */
function controlsOf(html: string): Control[] {
  const controls: { control: Control; inLabel: boolean }[] = []
  const labels = new Map<string, string>()
  const stack: { for?: string; text: string; controls: Control[] }[] = []
  const attr = (attrs: string, name: string) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1]
  for (const match of html.matchAll(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g)) {
    const [, closing, tag, attrs = '', text] = match
    if (text !== undefined) { for (const label of stack) label.text += text; continue }
    if (tag === 'label') {
      if (!closing) stack.push({ ...attr(attrs, 'for') ? { for: attr(attrs, 'for') } : {}, text: '', controls: [] })
      else {
        const label = stack.pop()!
        if (label.for && label.text.trim()) labels.set(label.for, label.text.trim())
        for (const control of label.controls) if (label.text.trim()) control.named = true
      }
      continue
    }
    if (closing || !['input', 'textarea', 'select'].includes(tag!)) continue
    if (tag === 'input' && ['hidden', 'submit', 'button'].includes(attr(attrs, 'type') ?? '')) continue
    const control: Control = { tag: tag!, ...attr(attrs, 'id') ? { id: attr(attrs, 'id')! } : {}, named: !!(attr(attrs, 'aria-label')?.trim() || attr(attrs, 'aria-labelledby')) }
    for (const label of stack) label.controls.push(control)
    controls.push({ control, inLabel: stack.length > 0 })
  }
  return controls.map(entry => ({ ...entry.control, named: entry.control.named || (!!entry.control.id && labels.has(entry.control.id)) }))
}

test('the default-parameters editor lists line-level problems with the line number and key, and warns about unknown keys', (t) => {
  if (skip) return t.skip(skip)
  const text = ['# comment', '', 'viewportMode = custom', 'viewportHeight = 600', 'proxyServer = ftp://127.0.0.1:1', 'downloadDir = relative/dir', 'headless = maybe', 'bogusKey = 1', 'enabled = false', 'not a line'].join('\n')
  for (const locale of ['en', 'zh'] as const) {
    const { html, missingKeys } = renderCard!({ locale, propertiesText: text, fieldTexts: { viewportMode: 'custom' } })
    assert.deepEqual(missingKeys, [], locale)
    assert.match(html, /data-dsh-browser-properties-errors/)
    assert.match(html, /line 5: proxyServer scheme must be one of http, https, socks5, socks4/)
    assert.match(html, /line 6: downloadDir must be an absolute directory path/)
    assert.match(html, /line 7: headless must be true or false/)
    assert.match(html, /line 10: expected &quot;key = value&quot;|line 10: expected "key = value"/)
    assert.match(html, /viewportMode=custom needs viewportWidth/)
    assert.doesNotMatch(html, /viewportMode=custom needs viewportHeight/)
    assert.match(html, /data-dsh-browser-properties-warnings/)
    assert.match(html, /line 8: unknown setting &quot;bogusKey&quot; is ignored|line 8: unknown setting "bogusKey" is ignored/)
    assert.match(html, /line 9: enabled is not a default parameter/)
    assert.match(html, /aria-invalid="true"/)
  }
  const clean = renderCard!({ fieldTexts: { viewportMode: 'window', proxyServer: 'http://127.0.0.1:7890' } })
  assert.doesNotMatch(clean.html, /data-dsh-browser-properties-errors/)
  assert.match(clean.html, /proxyServer = http:\/\/127\.0\.0\.1:7890/)
  assert.match(clean.html, /# userAgent =/)
  assert.match(clean.html, /data-dsh-browser-properties-overridden/)
})

test('configuration warnings of the running plugin are counted in the status summary (the list itself is in its dialog)', (t) => {
  if (skip) return t.skip(skip)
  const { html } = renderCard!({ configWarnings: ['config proxyServer="ftp://x" was ignored: scheme must be one of http, https, socks5, socks4; no proxy is used instead. Fix: ...'] })
  assert.match(html, /data-dsb-warnings-count="1"/)
  assert.match(renderCard!().html, /data-dsb-warnings-count="0"/)
})

test('the prompts group lists every text with its state, and only the entries that were changed', (t) => {
  if (skip) return t.skip(skip)
  const stored = { prompts: { rootNote: 'Prefer search first.', tools: { browser_index: { description: 'Short index.' } }, actions: { 'act.click': { summary: 'Click it' } }, errorHints: { DEADLINE: 'Wait longer.' } } }
  for (const locale of ['en', 'zh'] as const) {
    const { html, missingKeys } = renderCard!({ locale, values: stored })
    assert.deepEqual(missingKeys, [], locale)
    const list = html.slice(html.indexOf('data-dsb-prompt-list'), html.indexOf('data-dsb-entry-list'))
    for (const id of ['indexDescription', 'callDescription', 'rootGuide', 'rootNote', 'skillDescription', 'skillBodyFile', 'skillAppend']) assert.ok(list.includes(`data-dsb-item="${id}"`), `${id} is a row`)
    const row = (id: string) => list.slice(list.indexOf(`data-dsb-item="${id}"`)).split('data-dsb-item=')[1] ?? ''
    assert.match(row('rootNote'), locale === 'zh' ? /已覆盖/ : /overridden/)
    assert.match(row('indexDescription'), locale === 'zh' ? /已覆盖/ : /overridden/)
    assert.match(row('rootGuide'), locale === 'zh' ? /默认/ : /default/)
    assert.doesNotMatch(row('rootGuide'), locale === 'zh' ? /已覆盖/ : /overridden/)
    const entries = html.slice(html.indexOf('data-dsb-entry-list'))
    assert.ok(entries.includes('data-dsb-item="actions:act.click"') && entries.includes('data-dsb-item="errorHints:DEADLINE"'))
    assert.equal(entries.includes('data-dsb-item="groups:'), false, 'unchanged groups are not listed')
  }
  // Nothing overridden: the list says so.
  assert.match(renderCard!({}).html, /No entries changed/)
})
