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
    controls: [...html.matchAll(/<(?:input|textarea)[^>]*\bid="plugin-config-dsh-browser-([A-Za-z0-9-]+)"/g)].map(match => match[1]!),
    notes: [...html.matchAll(/data-dsh-browser-config-note="([A-Za-z0-9]+)"/g)].map(match => match[1]!),
  }
}

test('every public config field is a control in the rendered card, or is named with a note that says where to edit it', (t) => {
  if (skip) return t.skip(skip)
  const publicFields = Object.keys((Config as unknown as { dict: Record<string, unknown> }).dict)
  assert.ok(publicFields.length >= 21, 'the schema has the fields this test was written against')
  for (const locale of ['en', 'zh'] as const) {
    const { html, missingKeys } = renderCard!({ locale })
    assert.deepEqual(missingKeys, [], `every label and hint the card asks for exists in ${locale}`)
    const { controls, notes } = fieldsRendered(html)
    for (const field of publicFields) {
      const control = field === 'prompts' ? controls.some(id => id.startsWith('prompts-')) : controls.includes(field)
      const note = notes.includes(field)
      assert.ok(control || note, `config field "${field}" is neither a control nor a note in the ${locale} card`)
      assert.ok(!(control && note), `config field "${field}" is both`)
    }
    // Nothing on the card points at a field the schema does not have.
    for (const id of controls.filter(id => !id.startsWith('prompts-'))) assert.ok(publicFields.includes(id), `control ${id} is not a config field`)
    for (const id of notes) assert.ok(publicFields.includes(id), `note ${id} is not a config field`)
    // The ones that used to go missing.
    for (const field of ['maxSessions', 'args']) assert.ok(controls.includes(field), `${field} has a control`)
    for (const field of ['authProfiles', 'rulePacks']) {
      assert.ok(notes.includes(field), `${field} has a note`)
      assert.ok(!controls.includes(field))
    }
    assert.equal(html.includes(locale === 'zh' ? '配置文件' : 'config file'), true, 'the note says where to edit')
  }
})

test('the policy boxes list every key the code accepts, in both locales (maxTestCredentials and minInputSetsForActivation included)', async (t) => {
  if (skip) return t.skip(skip)
  const { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } = await import('../src/policy-keys.ts')
  assert.ok(ASSET_POLICY_KEYS.includes('maxTestCredentials') && ASSET_POLICY_KEYS.includes('minInputSetsForActivation'))
  for (const locale of ['en', 'zh'] as const) {
    const { html } = renderCard!({ locale })
    const hintOf = (field: string) => html.match(new RegExp(`data-dsh-field="plugin-config-dsh-browser-${field}"[\\s\\S]*?<p>([^<]*)</p>`))?.[1] ?? ''
    for (const [field, keys] of [['automationAssets', ASSET_POLICY_KEYS], ['usagePolicy', USAGE_POLICY_KEYS]] as const) {
      const hint = hintOf(field)
      const listed = hint.slice(hint.lastIndexOf(locale === 'zh' ? '可用键名：' : 'Keys:')).replace(/^[^:：]*[:：]\s*/, '').split(/,\s*/)
      assert.deepEqual(listed, [...keys], `${field} hint (${locale}) lists exactly the code's keys`)
    }
  }
})

test('the prompt section offers "Export default text" and no longer asks anyone to run pnpm', (t) => {
  if (skip) return t.skip(skip)
  for (const locale of ['en', 'zh'] as const) {
    const { html } = renderCard!({ locale })
    assert.equal(/pnpm/i.test(html), false, `the ${locale} card never mentions pnpm`)
    assert.match(html, locale === 'zh' ? /导出默认文本/ : /Export default text/)
    assert.ok(html.includes('data-dsh-browser-prompts-export'))
    // Once loaded, the defaults sit in a read-only box that has a name.
    const loaded = renderCard!({ locale, promptsDefaults: '{"rootNote":""}' }).html
    const box = loaded.match(/<textarea[^>]*data-dsh-browser-prompts-defaults[^>]*>/)?.[0] ?? ''
    assert.match(box, /aria-label="[^"]+"/, 'the box has a name')
    assert.match(box, /readonly/i, 'and is read-only')
    assert.ok(loaded.includes('data-dsh-browser-prompts-defaults'))
    assert.ok(loaded.includes('rootNote'))
  }
})

test('every text control of the card has an accessible name, in every state of the asset panel', (t) => {
  if (skip) return t.skip(skip)
  for (const [name, options] of Object.entries(variants)) {
    for (const locale of ['en', 'zh'] as const) {
      const { html, missingKeys } = renderCard!({ ...options, locale })
      assert.deepEqual(missingKeys, [], `${name}: no missing translations in ${locale}`)
      const controls = controlsOf(html)
      assert.ok(controls.length > 20, `${name}: the card has its controls (${controls.length})`)
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
