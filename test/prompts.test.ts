import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { Config, resolveConfig } = await import('../src/config.ts')
const { NO_PROMPTS, PROMPT_LIMITS, describePrompts, measurePromptBudget, resolvePrompts } = await import('../src/prompts.ts')
const { COMPACT_GUIDE, renderIndex } = await import('../src/actions/index-view.ts')
const { installErrorHints, mapError } = await import('../src/actions/errors.ts')
const { CALL_TOOL, INDEX_TOOL } = await import('../src/actions/registry.ts')
const { COMPLIANCE_NOTICE } = await import('../src/actions/shared.ts')
const { createSkillProvider, readSkill, registerSkillWhenAvailable } = await import('../src/skill.ts')
const { registerTools } = await import('../src/tools.ts')

/** A config handle the way the Host keeps a volatile field: a stable reference whose value is replaced in place. */
const WRITE = Symbol.for('cosmokit.volatile.write')
function liveRef<T>(value: T) {
  let current = value
  return Object.freeze({ get: () => current, [WRITE]: (next: T) => { current = next } })
}

const ENV = { mode: 'unrestricted' as const, options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: false }
const index = (args: { group?: string; action?: string; query?: string }, prompts: unknown, env: Record<string, unknown> = {}) =>
  renderIndex(args, { ...ENV, ...env, prompts: resolvePrompts(prompts) }).text

test('an unconfigured prompts section is exactly the defaults', () => {
  assert.equal(resolvePrompts(undefined), NO_PROMPTS)
  assert.equal(resolvePrompts({}), NO_PROMPTS)
  // What the schema produces for an empty config carries only the `skill.enabled` default.
  const parsed = resolveConfig(Config({}) as never).prompts.current()
  assert.deepEqual(parsed.applied, [])
  assert.deepEqual(parsed.diagnostics, [])
  assert.equal(parsed.skill.enabled, true)
  for (const args of [{}, { group: 'act' }, { action: 'act.click' }, { action: 'automation.develop' }, { action: 'automation.develop.save' }, { action: 'observe.read.controls' }, { query: 'click' }]) {
    assert.equal(index(args, undefined), renderIndex(args, ENV).text)
    assert.equal(index(args, parsed), renderIndex(args, ENV).text)
  }
})

test('each override category shows up in the output it belongs to', () => {
  const prompts = {
    rootGuide: 'GUIDE-OVERRIDE',
    rootNote: 'NOTE-OVERRIDE: prefer observe.read.',
    groups: { act: { summary: 'ACT-GROUP-OVERRIDE' } },
    actions: {
      'act.click': { summary: 'CLICK-SUMMARY-OVERRIDE', notes: 'CLICK-NOTES-OVERRIDE' },
      'automation.develop': { summary: 'DEVELOP-SUMMARY-OVERRIDE', notes: 'DEVELOP-NOTES-OVERRIDE' },
      'automation.develop.save': { summary: 'SAVE-SUMMARY-OVERRIDE', notes: 'SAVE-NOTES-OVERRIDE' },
      'observe.read.controls': { summary: 'CONTROLS-SUMMARY-OVERRIDE', notes: 'CONTROLS-TEXT-OVERRIDE' },
    },
  }
  const root = index({}, prompts)
  assert.match(root, /GUIDE-OVERRIDE/)
  assert.doesNotMatch(root, /Guide: \(1\)/)
  assert.ok(root.endsWith('NOTE-OVERRIDE: prefer observe.read.'), 'the note is the last line of the root')
  assert.match(root, /act \(\d+\) ACT-GROUP-OVERRIDE/)
  // The note also shows when the skill is available, and then replaces nothing.
  const withSkill = index({}, prompts, { skillAvailable: true })
  assert.match(withSkill, /Load skill "dsh-browser"/)
  assert.doesNotMatch(withSkill, /GUIDE-OVERRIDE/)
  assert.ok(withSkill.endsWith('NOTE-OVERRIDE: prefer observe.read.'))

  assert.match(index({ group: 'act' }, prompts), /^act - ACT-GROUP-OVERRIDE\n/)
  assert.match(index({ group: 'act' }, prompts), /act\.click - CLICK-SUMMARY-OVERRIDE \|/)
  const detail = index({ action: 'act.click' }, prompts)
  assert.match(detail, /^act\.click - CLICK-SUMMARY-OVERRIDE\n/)
  assert.match(detail, /CLICK-NOTES-OVERRIDE/)
  assert.match(index({ query: 'CLICK-SUMMARY-OVERRIDE' }, prompts), /act\.click - CLICK-SUMMARY-OVERRIDE/, 'search sees the effective summary')

  const develop = index({ action: 'automation.develop' }, prompts)
  assert.match(develop, /DEVELOP-SUMMARY-OVERRIDE/)
  assert.match(develop, /DEVELOP-NOTES-OVERRIDE/)
  assert.match(develop, /\n {2}save - SAVE-SUMMARY-OVERRIDE \|/, 'the parent view lists the sub-action with its override')
  const save = index({ action: 'automation.develop.save' }, prompts)
  assert.match(save, /^automation\.develop\.save - SAVE-SUMMARY-OVERRIDE\n/)
  assert.match(save, /SAVE-NOTES-OVERRIDE/)

  assert.match(index({ action: 'observe.read.controls' }, prompts), /^observe\.read\.controls - CONTROLS-SUMMARY-OVERRIDE\nCONTROLS-TEXT-OVERRIDE$/)
  assert.match(index({ action: 'observe.read' }, prompts), /browser_index\(\{action:"observe\.read\.controls"\}\) CONTROLS-SUMMARY-OVERRIDE/)
  // Nothing else moved.
  assert.equal(index({ action: 'act.fill' }, prompts), renderIndex({ action: 'act.fill' }, ENV).text)
})

test('tool descriptions are overridden at registration and the compliance notice cannot be dropped', () => {
  const register = (prompts: unknown) => {
    const tools: any[] = []
    registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, resolveConfig({ automationMode: 'unrestricted', prompts } as never), {} as never)
    return new Map(tools.map(tool => [tool.name, tool]))
  }
  const base = register(undefined)
  const custom = register({ tools: { browser_index: { description: 'INDEX-DESC-OVERRIDE' }, browser_call: { description: 'CALL-DESC-OVERRIDE' } } })
  assert.equal(custom.get(INDEX_TOOL).description, 'INDEX-DESC-OVERRIDE')
  assert.equal(custom.get(CALL_TOOL).description, 'CALL-DESC-OVERRIDE ' + COMPLIANCE_NOTICE)
  assert.ok(base.get(CALL_TOOL).description.endsWith(COMPLIANCE_NOTICE))
  assert.deepEqual(custom.get(INDEX_TOOL).parameters, base.get(INDEX_TOOL).parameters, 'the parameter schema is not configurable')
  assert.deepEqual(custom.get(CALL_TOOL).parameters, base.get(CALL_TOOL).parameters)
})

test('tool descriptions are fixed at registration: a later config edit applies after a restart, the rest applies at once', async () => {
  const ref = liveRef<unknown>({ tools: { browser_index: { description: 'FIRST' } }, rootNote: 'note one' })
  const tools: any[] = []
  registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, resolveConfig({ automationMode: 'unrestricted', prompts: ref } as never), {} as never)
  const indexTool = tools.find(tool => tool.name === INDEX_TOOL)
  assert.equal(indexTool.description, 'FIRST')
  assert.match((await indexTool.execute({}, {})).text, /note one$/)
  ref[WRITE]({ tools: { browser_index: { description: 'SECOND' } }, rootNote: 'note two', actions: { 'act.click': { summary: 'CLICK-LIVE' } } })
  assert.equal(indexTool.description, 'FIRST', 'documented: tool descriptions need a restart')
  assert.match((await indexTool.execute({}, {})).text, /note two$/, 'the catalog follows the config on the next call')
  assert.match((await indexTool.execute({ action: 'act.click' }, {})).text, /^act\.click - CLICK-LIVE/)
  ref[WRITE](undefined)
  assert.doesNotMatch((await indexTool.execute({}, {})).text, /note two/, 'removing the override restores the default')
})

test('error hints are read at call time, replace only the hint, and never touch code or message', () => {
  const ref = liveRef<unknown>(undefined)
  const config = resolveConfig({ prompts: ref } as never)
  const release = installErrorHints(() => config.prompts.current().errorHints)
  try {
    const failure = new Error('Timeout 1000ms exceeded.\nCall log:\n  - waiting for getByRole("button")')
    const before = mapError(failure, 'act.click')
    assert.equal(before.code, 'LOCATOR_NOT_FOUND')
    ref[WRITE]({ errorHints: { LOCATOR_NOT_FOUND: 'HINT-OVERRIDE: ask the user.', TARGET_CLOSED: 'CLOSED-OVERRIDE' } })
    const after = mapError(failure, 'act.click')
    assert.equal(after.hint, 'HINT-OVERRIDE: ask the user.')
    assert.equal(after.code, before.code)
    assert.equal(after.message, before.message)
    assert.equal(mapError(new Error('Target page, context or browser has been closed'), 'act.click').hint, 'CLOSED-OVERRIDE')
    // An error that carries its own specific hint, and a code without a fixed one, keep their text.
    assert.equal(mapError(new Error('whatever'), 'act.click').hint, 'The action failed; read the message, and re-observe the page before retrying side-effecting actions.')
    ref[WRITE](undefined)
    assert.equal(mapError(failure, 'act.click').hint, before.hint, 'back to the default')
  } finally { release() }
})

test('unknown groups, actions, error codes and keys are ignored and reported, not fatal', () => {
  const resolved = resolvePrompts({
    mystery: 1,
    groups: { act: { summary: 'ok' }, nope: { summary: 'x' }, crawl: { summary: 'ok', color: 'red' } },
    actions: { 'act.clik': { summary: 'x' }, 'act.click': { summary: 'fine', extra: true }, 'automation.develop.nope': { summary: 'x' } },
    errorHints: { NOPE: 'x', INVALID_ARGS: 'x', LOCATOR_NOT_FOUND: 'kept' },
    tools: { browser_other: { description: 'x' } },
    skill: { enabled: 'yes', surprise: 1 },
  })
  const by = (code: string) => resolved.diagnostics.filter(entry => entry.code === code).map(entry => entry.key)
  assert.deepEqual(by('unknown-key').toSorted(), ['actions.act.click.extra', 'groups.crawl.color', 'mystery', 'skill.surprise', 'tools.browser_other'])
  assert.deepEqual(by('unknown-group'), ['groups.nope'])
  assert.deepEqual(by('unknown-action').toSorted(), ['actions.act.clik', 'actions.automation.develop.nope'])
  assert.deepEqual(by('unknown-error-code'), ['errorHints.NOPE'])
  assert.deepEqual(by('not-overridable'), ['errorHints.INVALID_ARGS'])
  assert.deepEqual(by('invalid-type'), ['skill.enabled'])
  // What was valid still applies.
  assert.deepEqual(resolved.groups, { act: 'ok', crawl: 'ok' })
  assert.deepEqual(resolved.actions, { 'act.click': { summary: 'fine' } })
  assert.deepEqual(resolved.errorHints, { LOCATOR_NOT_FOUND: 'kept' })
  assert.equal(resolved.skill.enabled, true)
  assert.ok(resolved.diagnostics.every(entry => entry.level === 'warn' && entry.message.length > 0))
  // A wholly malformed section does not throw either.
  assert.equal(resolvePrompts('text').diagnostics[0]!.code, 'invalid-type')
  assert.equal(resolvePrompts([1]).diagnostics[0]!.code, 'invalid-type')
  assert.equal(resolvePrompts({ groups: 'x', actions: [], errorHints: 3, tools: 'x', skill: 7 }).diagnostics.length, 5)
})

test('an over-long value is rejected whole (never truncated) and reported, and blank values mean the default', () => {
  const limit = PROMPT_LIMITS
  const over = (length: number) => 'x'.repeat(length + 1)
  const resolved = resolvePrompts({
    tools: { browser_index: { description: over(limit.description) }, browser_call: { description: 'x'.repeat(limit.description) } },
    rootGuide: over(limit.rootGuide), rootNote: over(limit.rootNote),
    groups: { act: { summary: over(limit.summary) } },
    actions: { 'act.click': { summary: over(limit.summary), notes: over(limit.notes) }, 'act.fill': { summary: 'x'.repeat(limit.summary) } },
    errorHints: { DEADLINE: over(limit.errorHint) },
    skill: { description: over(limit.skillDescription), append: over(limit.skillAppend) },
  })
  assert.deepEqual(resolved.diagnostics.filter(entry => entry.code === 'too-long').map(entry => entry.key).toSorted(), [
    'actions.act.click.notes', 'actions.act.click.summary', 'errorHints.DEADLINE', 'groups.act.summary', 'rootGuide', 'rootNote',
    'skill.append', 'skill.description', 'tools.browser_index.description',
  ])
  assert.equal(resolved.tools.browser_index, undefined)
  assert.equal(resolved.tools.browser_call!.length, limit.description, 'exactly at the limit is accepted')
  assert.equal(resolved.actions['act.fill']!.summary!.length, limit.summary)
  assert.equal(resolved.rootNote, undefined)
  assert.deepEqual(resolved.errorHints, {})
  // Blank text is "not set", with no diagnostic.
  const blank = resolvePrompts({ rootNote: '  ', rootGuide: '', groups: { act: { summary: '' } }, actions: { 'act.click': { notes: '' } }, errorHints: { DEADLINE: ' ' }, skill: { append: '', bodyFile: '' } })
  assert.equal(blank, NO_PROMPTS)
})

test('budget: an override that pushes a layer or L0 over its budget is accepted but warned about, with the numbers', () => {
  // A layer over 1k tokens: the largest detail is already near the budget, so a long notes override tips it.
  const prompts = { actions: { 'automation.develop.save': { notes: 'n'.repeat(PROMPT_LIMITS.notes) }, 'automation.develop.draft_from_journal': { notes: 'n'.repeat(PROMPT_LIMITS.notes) } } }
  const config = resolveConfig({ automationMode: 'unrestricted', prompts } as never)
  const status = describePrompts({ prompts: config.prompts, mode: config.automationMode, options: config.automationAssets, enabled: true })
  assert.deepEqual(status.overrides.map(entry => entry.key).toSorted(), ['actions.automation.develop.draft_from_journal.notes', 'actions.automation.develop.save.notes'])
  const layer = status.diagnostics.find(entry => entry.code === 'budget-layer' && entry.key === 'automation.develop.save')
  assert.ok(layer, 'the over-budget layer is named')
  assert.match(layer!.message, /~\d+ tokens, over the 1000 per-layer budget/)
  const reported = status.budget.overBudget.find(entry => entry.name === 'automation.develop.save')!
  assert.ok(reported.tokens > 1000)
  assert.ok(layer!.message.includes(`~${reported.tokens} tokens`), 'the diagnostic carries the measured number')

  // L0: the caps keep real configs below its budget, so exercise the check on a resolved value built past them.
  const huge = { ...NO_PROMPTS, tools: { browser_index: 'd'.repeat(6000) } }
  const budget = measurePromptBudget(huge, { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true })
  assert.ok(budget.l0Tokens > 1500)
  const l0 = describePrompts({ prompts: { current: () => huge }, mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true })
  const warning = l0.diagnostics.find(entry => entry.code === 'budget-l0')!
  assert.ok(warning.message.includes(`~${budget.l0Tokens} tokens`) && warning.message.includes('1500'))

  // The defaults are within every budget and raise no warning.
  const defaults = describePrompts({ prompts: resolveConfig({} as never).prompts, mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true })
  assert.deepEqual(defaults.diagnostics, [])
  assert.deepEqual(defaults.overrides, [])
  assert.ok(defaults.budget.l0Tokens <= 400 && defaults.budget.largestLayer.tokens <= 1000)
})

test('runtime.status reports the overrides in force by key and length, and the diagnostics, never the text', async () => {
  const secret = 'SECRET-NOTE-TEXT-' + 'z'.repeat(40)
  const config = resolveConfig({ automationMode: 'standard', prompts: { rootNote: secret, groups: { nope: { summary: 'x' } }, actions: { 'act.click': { summary: 'short' } } } } as never)
  const tools: any[] = []
  const service = { status: async () => ({ enabled: true, chromiumInstalled: true, opencliInstalled: false, opencliEnabled: false }) }
  registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, config, service as never)
  const reply = await tools.find(tool => tool.name === CALL_TOOL).execute({ action: 'runtime.status' }, { signal: new AbortController().signal })
  assert.equal(reply.ok, true)
  const prompts = reply.result.prompts
  assert.deepEqual(prompts.overrides, [{ key: 'rootNote', length: secret.length }, { key: 'actions.act.click.summary', length: 5 }])
  assert.deepEqual(prompts.diagnostics.map((entry: { code: string; key: string }) => [entry.code, entry.key]), [['unknown-group', 'groups.nope']])
  assert.equal(prompts.skill.enabled, true)
  assert.equal(prompts.skill.body, 'packaged')
  assert.ok(prompts.budget.l0Tokens > 0 && prompts.budget.largestLayer.name)
  assert.equal(JSON.stringify(reply).includes(secret), false, 'the text itself is not echoed')
  // The status of an unconfigured plugin has an empty override list.
  const plain: any[] = []
  registerTools({ tools: { register: (tool: any) => plain.push(tool) } } as never, resolveConfig({ automationMode: 'standard' }), service as never)
  const clean = await plain.find(tool => tool.name === CALL_TOOL).execute({ action: 'runtime.status' }, { signal: new AbortController().signal })
  assert.deepEqual(clean.result.prompts.overrides, [])
  assert.deepEqual(clean.result.prompts.diagnostics, [])
})

// --- skill -------------------------------------------------------------------------------------------------------

function skillHost() {
  const providers: any[] = []
  const withdrawn: number[] = []
  const invalidated: number[] = []
  const effects: (() => void)[] = []
  const ctx = {
    inject(_names: string[], callback: (skillCtx: unknown) => void) {
      callback({
        skills: {
          registerProvider(create: (control: unknown) => unknown) {
            const id = providers.length
            providers.push(create({ signal: new AbortController().signal, invalidate: () => { invalidated.push(id) } }))
            return () => { withdrawn.push(id) }
          },
        },
        effect(register: () => () => void) { effects.push(register()) },
      })
    },
  }
  return { ctx, providers, withdrawn, invalidated, dispose: () => effects.forEach(dispose => dispose()) }
}

test('skill overrides: description, appended text and a replacement body file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-prompts-skill-'))
  try {
    const packaged = readSkill()
    const bodyFile = path.join(dir, 'custom.md')
    fs.writeFileSync(bodyFile, '---\nname: ignored\n---\n# House rules\n\nUse the intranet search first.\n')
    const ref = liveRef<unknown>({ skill: { description: 'SKILL-DESC-OVERRIDE', append: '## Extra\nAPPENDED-TEXT' } })
    const config = resolveConfig({ prompts: ref } as never)
    const provider = createSkillProvider(undefined, config.prompts)
    const [candidate] = await provider.list()
    assert.equal(candidate!.description, 'SKILL-DESC-OVERRIDE')
    assert.equal(candidate!.name, 'dsh-browser', 'the name is not configurable')
    const loaded = await provider.get()
    assert.equal(loaded.description, 'SKILL-DESC-OVERRIDE')
    assert.ok(loaded.content.startsWith(packaged.body.slice(0, 40)))
    assert.ok(loaded.content.endsWith('## Extra\nAPPENDED-TEXT'))
    // A body file replaces the packaged body (its front matter is dropped); append still follows it.
    ref[WRITE]({ skill: { bodyFile, append: 'APPENDED-TEXT' } })
    const replaced = await provider.get()
    assert.equal(replaced.content, '# House rules\n\nUse the intranet search first.\n\nAPPENDED-TEXT')
    assert.equal(replaced.description, packaged.description)
    // The file is read per load, so an edit to it is picked up.
    fs.writeFileSync(bodyFile, '# House rules v2\n')
    assert.match((await provider.get()).content, /^# House rules v2/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('skill.bodyFile that is relative, missing, unreadable, empty or oversized falls back to the packaged body and is reported', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-prompts-body-'))
  try {
    const packaged = readSkill()
    const status = async (bodyFile: string) => {
      const config = resolveConfig({ prompts: { skill: { bodyFile } } } as never)
      const provider = createSkillProvider(undefined, config.prompts)
      assert.equal((await provider.get()).content, packaged.body, `${bodyFile} falls back`)
      return describePrompts({ prompts: config.prompts, mode: 'standard', options: { modelDevelopmentEnabled: true }, enabled: true })
    }
    const missing = await status(path.join(dir, 'missing.md'))
    assert.deepEqual(missing.diagnostics.map(entry => entry.code), ['body-file'])
    assert.match(missing.diagnostics[0]!.message, /does not exist/)
    assert.equal(missing.skill.body, 'packaged')

    const empty = path.join(dir, 'empty.md'); fs.writeFileSync(empty, '  \n')
    assert.match((await status(empty)).diagnostics[0]!.message, /empty/)
    const big = path.join(dir, 'big.md'); fs.writeFileSync(big, 'x'.repeat(PROMPT_LIMITS.skillBodyFile + 1))
    assert.match((await status(big)).diagnostics[0]!.message, /over the limit/)
    // A directory is not readable as a file.
    assert.match((await status(dir)).diagnostics[0]!.message, /cannot be read/)
    // A relative path is refused at resolve time, so it never reaches the file system.
    const relative = resolvePrompts({ skill: { bodyFile: 'docs/skill.md' } })
    assert.deepEqual(relative.diagnostics.map(entry => entry.code), ['relative-body-file'])
    assert.equal(relative.skill.bodyFile, undefined)
    // A usable file is reported as such.
    const good = path.join(dir, 'good.md'); fs.writeFileSync(good, '# ok\n')
    const ok = describePrompts({ prompts: resolveConfig({ prompts: { skill: { bodyFile: good } } } as never).prompts, mode: 'standard', options: { modelDevelopmentEnabled: true }, enabled: true })
    assert.equal(ok.skill.body, 'file')
    assert.deepEqual(ok.diagnostics, [])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('skill.enabled=false registers no provider and the root shows the compact guide; enabling later registers it', () => {
  const ref = liveRef<unknown>({ skill: { enabled: false } })
  const host = skillHost()
  const skill = registerSkillWhenAvailable(host.ctx as never, undefined, resolveConfig({ prompts: ref } as never).prompts)
  assert.equal(host.providers.length, 0, 'nothing is registered')
  assert.equal(skill.isAvailable(), false)
  const config = resolveConfig({ automationMode: 'unrestricted', prompts: { skill: { enabled: false } } } as never)
  const tools: any[] = []
  registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, config, {} as never, undefined, { skillAvailable: skill.isAvailable, refreshSkill: skill.refresh })
  const root = (rendered: string) => { assert.ok(rendered.includes(COMPACT_GUIDE)); assert.doesNotMatch(rendered, /Load skill/) }
  return tools.find(tool => tool.name === INDEX_TOOL).execute({}, {}).then((reply: { text: string }) => {
    root(reply.text)
    // Hot enable: the next refresh registers the provider.
    ref[WRITE]({ skill: { enabled: true } })
    skill.refresh()
    assert.equal(host.providers.length, 1)
    assert.equal(skill.isAvailable(), true)
    // And hot disable withdraws it again.
    ref[WRITE]({ skill: { enabled: false } })
    skill.refresh()
    assert.deepEqual(host.withdrawn, [0])
    assert.equal(skill.isAvailable(), false)
  })
})

test('a change to the skill text tells the Host through invalidate(); an unchanged config does not', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-prompts-invalidate-'))
  try {
    const file = path.join(dir, 'body.md'); fs.writeFileSync(file, '# one\n')
    const ref = liveRef<unknown>(undefined)
    const host = skillHost()
    const skill = registerSkillWhenAvailable(host.ctx as never, undefined, resolveConfig({ prompts: ref } as never).prompts)
    assert.equal(host.providers.length, 1)
    skill.refresh(); skill.refresh()
    assert.deepEqual(host.invalidated, [], 'no change, no invalidation')
    ref[WRITE]({ skill: { description: 'changed' } })
    skill.refresh()
    assert.deepEqual(host.invalidated, [0])
    skill.refresh()
    assert.deepEqual(host.invalidated, [0], 'told once per change')
    ref[WRITE]({ skill: { description: 'changed', bodyFile: file } })
    skill.refresh()
    assert.equal(host.invalidated.length, 2, 'a new body file')
    fs.writeFileSync(file, '# one, edited with a different length\n')
    skill.refresh()
    assert.equal(host.invalidated.length, 3, 'an edited body file')
    host.dispose()
    assert.equal(skill.isAvailable(), false, 'withdrawn with the scope')
    skill.refresh()
    assert.equal(host.invalidated.length, 3, 'a disposed registration stays quiet')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
