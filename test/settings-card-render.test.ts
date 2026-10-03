/**
 * What the real SettingsCard puts on the page, read from its rendered markup (not from a list of field names):
 *   - every public configuration field is a control or carries a note saying where to edit it;
 *   - the key lists printed under the policy boxes are the code's own lists.
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
