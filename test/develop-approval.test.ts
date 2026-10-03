import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ACTIONS, findAction, findSubAction, traitsFor } from '../src/actions/registry.ts'
import { renderIndex, type IndexEnvironment } from '../src/actions/index-view.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { browserPolicyDecision, recipeStepsDecision } from '../src/approval-policy.ts'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { runRecipe, type AnyRecipeStep, type BrowserRecipeStep } from '../src/automation.ts'
import { resolveConfig } from '../src/config.ts'
import { browserActionsForMode, configuredBrowserActions, isBrowserActionExposed } from '../src/freedom.ts'
import { registerTools } from '../src/tools.ts'
import { Context } from '@deepseek-ai/cordis'
import plugin from '../src/index.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const AUTONOMOUS_STEPS: BrowserRecipeStep[] = [{ type: 'fill', selector: '#q', value: 'x' }, { type: 'click', selector: '#go' }]
const READ_STEPS: BrowserRecipeStep[] = [{ type: 'extract', selector: 'main', mode: 'text' }]
const MODES = ['read-only', 'standard', 'autonomous', 'unrestricted'] as const

const develop = (action: string, mode: (typeof MODES)[number], kind?: 'recipe' | 'userscript', steps?: readonly AnyRecipeStep[]) =>
  browserPolicyDecision('automation.develop', { action, id: 'draft' }, mode, kind, steps).kind
const runRecipeDecision = (steps: readonly AnyRecipeStep[], mode: (typeof MODES)[number]) => browserPolicyDecision('automation.run_recipe', { steps }, mode).kind

test('approval table: develop test of a recipe draft follows run_recipe in autonomous, and nowhere else changes', () => {
  // autonomous: the same steps, the same answer as run_recipe (mutating or not)
  for (const steps of [AUTONOMOUS_STEPS, READ_STEPS]) {
    assert.equal(runRecipeDecision(steps, 'autonomous'), 'allow')
    assert.equal(develop('test', 'autonomous', 'recipe', steps), 'allow', 'a recipe draft is replayed without asking, exactly as run_recipe would run its steps')
    assert.equal(develop('test', 'autonomous', 'recipe', steps), runRecipeDecision(steps, 'autonomous'))
  }
  // a userscript draft still asks; so does a draft nobody could look up
  assert.equal(develop('test', 'autonomous', 'userscript'), 'ask')
  assert.equal(develop('test', 'autonomous', undefined), 'ask')
  assert.equal(develop('test', 'autonomous', 'recipe'), 'ask', 'recipe kind without its steps cannot be judged')
  // standard and read-only are as they were
  assert.equal(develop('test', 'standard', 'recipe', READ_STEPS), 'ask', 'standard asks even for read-only steps')
  assert.equal(develop('test', 'standard', 'recipe', AUTONOMOUS_STEPS), 'ask')
  assert.equal(develop('test', 'standard', 'userscript'), 'ask')
  assert.equal(develop('test', 'read-only', 'recipe', READ_STEPS), 'deny')
  assert.equal(develop('test', 'read-only', 'userscript'), 'deny')
  // unrestricted is unchanged
  assert.equal(develop('test', 'unrestricted', 'userscript'), 'allow')
  assert.equal(develop('test', 'unrestricted', 'recipe', AUTONOMOUS_STEPS), 'allow')
})

test('approval table: the other develop operations are unchanged (get/validate free, writes ask in standard, denied read-only)', () => {
  for (const sub of ['get', 'validate']) for (const mode of MODES) assert.equal(develop(sub, mode), 'allow', `${sub} in ${mode}`)
  for (const sub of ['save', 'convert', 'fork']) {
    assert.equal(develop(sub, 'read-only'), 'deny', sub)
    assert.equal(develop(sub, 'standard'), 'ask', sub)
    assert.equal(develop(sub, 'autonomous'), 'allow', sub)
    assert.equal(develop(sub, 'unrestricted'), 'allow', sub)
  }
  // run_recipe itself is untouched
  assert.equal(runRecipeDecision(AUTONOMOUS_STEPS, 'read-only'), 'deny')
  assert.equal(runRecipeDecision(AUTONOMOUS_STEPS, 'standard'), 'ask')
  assert.equal(runRecipeDecision(READ_STEPS, 'standard'), 'allow')
  assert.equal(runRecipeDecision(READ_STEPS, 'read-only'), 'allow')
  assert.equal(browserPolicyDecision('automation.run', { id: 'a' }, 'autonomous', 'recipe').kind, 'allow')
  assert.equal(browserPolicyDecision('automation.run', { id: 'a' }, 'autonomous', 'userscript').kind, 'ask')
})

test('the step rule is one function: run_recipe and develop test both go through it', () => {
  for (const mode of MODES) {
    for (const steps of [AUTONOMOUS_STEPS, READ_STEPS]) {
      assert.equal(runRecipeDecision(steps, mode), recipeStepsDecision('automation.run_recipe', steps, mode).kind, `run_recipe ${mode}`)
    }
  }
  assert.equal(recipeStepsDecision('x', AUTONOMOUS_STEPS, 'standard').kind, 'ask')
  assert.equal(recipeStepsDecision('x', AUTONOMOUS_STEPS, 'read-only').kind, 'deny')
})

test('the real Host hook looks the draft up: a recipe draft is not asked in autonomous, a userscript draft is, standard asks, read-only denies', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-hook-'))
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-hook-snap-'))
  const seed = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  const recipe = seed.saveDraft({ kind: 'recipe', name: 'R', domains: ['example.com'], recipe: AUTONOMOUS_STEPS })
  const script = seed.saveDraft({ kind: 'userscript', name: 'S', domains: ['example.com'], source: '// ==UserScript==\n// @name S\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1' })
  const decide = async (mode: string, id: string, action = 'test') => {
    const root = new Context()
    root.provide('tools', { register() { return () => {} } })
    root.provide('settings', {})
    const fiber = root.plugin(plugin as never, { snapshotDir, automationMode: mode, automationAssets: { directory, persistenceMode: 'manual' } } as never)
    await new Promise(resolve => setTimeout(resolve, 40))
    try {
      const exec = { name: 'browser_call', arguments: { action: 'automation.develop', args: { action, id, url: 'https://example.com/' } } }
      return ((await (root as any).serial('tools/pre-execute', exec, async () => ({ kind: 'allow' }))) as { kind: string }).kind
    } finally { fiber.dispose() }
  }
  assert.equal(await decide('autonomous', recipe.id), 'allow')
  assert.equal(await decide('autonomous', script.id), 'ask')
  assert.equal(await decide('autonomous', 'missing'), 'ask')
  assert.equal(await decide('standard', recipe.id), 'ask')
  assert.equal(await decide('read-only', recipe.id), 'deny')
  assert.equal(await decide('unrestricted', script.id), 'allow')
  assert.equal(await decide('standard', recipe.id, 'get'), 'allow')
})

test('classification is per sub-action: only get and validate are read-only and concurrency safe; test, save, convert, fork are not', () => {
  const action = findAction('automation.develop')!
  assert.deepEqual({ readOnly: action.readOnly, mutating: action.mutating, concurrencySafe: action.concurrencySafe }, { readOnly: false, mutating: true, concurrencySafe: false }, 'the action-level flags are the strict ones')
  for (const sub of ['get', 'validate']) {
    assert.deepEqual(traitsFor(action, { action: sub }), { readOnly: true, mutating: false, concurrencySafe: true }, sub)
  }
  for (const sub of ['save', 'test', 'convert', 'fork']) {
    assert.deepEqual(traitsFor(action, { action: sub }), { readOnly: false, mutating: true, concurrencySafe: false }, sub)
  }
  // Unknown or missing operations get the strict flags.
  assert.equal(traitsFor(action, { action: 'nope' }).readOnly, false)
  assert.equal(traitsFor(action, {}).concurrencySafe, false)
  assert.equal(traitsFor(action, undefined).mutating, true)
  // Actions without sub-actions are unaffected.
  const click = findAction('act.click')!
  assert.deepEqual(traitsFor(click, { anything: 1 }), { readOnly: click.readOnly, mutating: click.mutating, concurrencySafe: click.concurrencySafe })
  // Every declared operation is complete and consistent with the action's enum.
  const enumValues = action.params.action!.enum!
  assert.deepEqual(Object.keys(action.subActions!.items).sort(), [...enumValues].sort())
  for (const [name, sub] of Object.entries(action.subActions!.items)) {
    for (const param of sub.params) assert.ok(param in action.params, `${name}: ${param} is a real parameter`)
    for (const param of sub.required ?? []) assert.ok(sub.params.includes(param), `${name}: required ${param} is used`)
  }
})

test('read-only mode still offers get and validate and nothing else of develop, at every layer', async () => {
  assert.ok(browserActionsForMode('read-only').includes('automation.develop'), 'listed: some operations are read-only')
  assert.equal(isBrowserActionExposed('automation.develop', 'read-only', { action: 'get' }), true)
  assert.equal(isBrowserActionExposed('automation.develop', 'read-only', { action: 'validate' }), true)
  for (const sub of ['save', 'test', 'convert', 'fork']) assert.equal(isBrowserActionExposed('automation.develop', 'read-only', { action: sub }), false, sub)
  assert.equal(isBrowserActionExposed('automation.develop', 'read-only', {}), false)
  assert.ok(configuredBrowserActions('read-only', { modelDevelopmentEnabled: true }).includes('automation.develop'))

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-ro-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })
  const assets = new AutomationAssetStore(policy)
  const development = new AutomationDevelopmentService(assets, policy)
  const draft = assets.saveDraft({ kind: 'recipe', name: 'R', domains: ['example.com'], recipe: READ_STEPS })
  const ro: RunEnvironment = { mode: 'read-only', options: { modelDevelopmentEnabled: true }, enabled: true }
  const ctx = { service: {} as never, config: resolveConfig({}), session: 's', sessionId: 's', agent: undefined, signal: new AbortController().signal, assets, development }
  const get = await runAction('automation.develop', { action: 'get', id: draft.id }, ctx, ro)
  assert.equal(get.ok, true)
  for (const sub of ['save', 'test', 'convert', 'fork']) {
    const denied = await runAction('automation.develop', { action: sub, id: draft.id, kind: 'recipe', name: 'x', url: 'https://example.com/' }, ctx, ro)
    assert.equal(denied.ok, false, sub)
    assert.equal(denied.error?.code, 'POLICY_DENIED', sub)
    assert.match(denied.error!.message, new RegExp(`action=${sub}`), 'the refusal names the operation')
  }
  assert.equal(assets.snapshot().assets.length, 1, 'nothing was written')
  const overview = renderIndex({ action: 'automation.develop' }, { mode: 'read-only', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: true }).text
  assert.match(overview, /save - .*\[not in read-only\]/)
  assert.doesNotMatch(overview.split('\n').find(line => line.startsWith('  get - '))!, /not in read-only/)
})

test('flat tool concurrency follows the operation; a deadline on test reports an unknown outcome, one on get does not', async () => {
  const registered: any[] = []
  registerTools({ tools: { register: (tool: any) => registered.push(tool) } } as never, resolveConfig({ automationMode: 'unrestricted', toolSurface: 'flat' }), {} as never)
  const flat = registered.find(tool => tool.name === 'browser_automation_develop')
  assert.equal(flat.isConcurrencySafe({ action: 'get', id: 'x' }), true)
  assert.equal(flat.isConcurrencySafe({ action: 'validate', id: 'x' }), true)
  assert.equal(flat.isConcurrencySafe({ action: 'test', id: 'x', url: 'https://example.com/' }), false)
  assert.equal(flat.isConcurrencySafe({ action: 'save', kind: 'recipe', name: 'x' }), false)
  assert.equal(flat.isConcurrencySafe({}), false)
  const indexed: any[] = []
  registerTools({ tools: { register: (tool: any) => indexed.push(tool) } } as never, resolveConfig({ automationMode: 'unrestricted' }), {} as never)
  assert.equal(indexed.find(tool => tool.name === 'browser_call').isConcurrencySafe(), false)

  const slow = findAction('automation.develop')!
  const original = slow.timeoutMs
  const originalSettle = slow.settleMs
  slow.timeoutMs = 30
  slow.settleMs = 0
  try {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-deadline-'))
    const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })
    const assets = new AutomationAssetStore(policy)
    const development = new AutomationDevelopmentService(assets, policy)
    const draft = assets.saveDraft({ kind: 'recipe', name: 'R', domains: ['example.com'], recipe: READ_STEPS })
    const hang = new Promise<never>(() => {})
    const ctx = { service: { recipe: () => hang } as never, config: resolveConfig({}), session: 's', sessionId: 's', agent: undefined, signal: new AbortController().signal, assets, development }
    const env: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }
    const tested = await runAction('automation.develop', { action: 'test', id: draft.id, url: 'https://example.com/' }, ctx, env)
    assert.equal(tested.error?.code, 'DEADLINE')
    assert.equal(tested.executionStatus, 'outcome_unknown', 'a test replays the recipe: the outcome of a timeout is unknown')
    const get = await runAction('automation.develop', { action: 'get', id: draft.id }, { ...ctx, service: {} as never }, { ...env })
    assert.equal(get.ok, true)
  } finally {
    slow.timeoutMs = original
    slow.settleMs = originalSettle
  }
})

function serviceOver(behavior: Behavior = {}) {
  return {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      const { page } = fakePage(behavior)
      const run = await runRecipe(page, steps, async () => '/tmp/s.png', opts.signal, { legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, outputSchema: opts.outputSchema, allowedDomains: opts.allowedDomains })
      return { url: 'https://example.com/', title: 'T', text: 'page', ...run, steps: run.completedSteps }
    },
  }
}

function developFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-develop-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', maxModelDraftWritesPerSession: 10 })
  const assets = new AutomationAssetStore(policy)
  const development = new AutomationDevelopmentService(assets, policy)
  const env: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }
  const ctx = (service: unknown) => ({ service: service as never, config: resolveConfig({}), session: 's', sessionId: 's', agent: undefined, signal: new AbortController().signal, assets, development })
  return { assets, env, ctx }
}

test('develop test: a v2 recipe with no assert and no postcondition is ok:false VALIDATION_MISSING with a hint, never ok:true with a failed test', async () => {
  const { assets, env, ctx } = developFixture()
  const draft = assets.saveDraft({ kind: 'recipe', schemaVersion: 2, name: 'No check', domains: ['example.com'], recipe: [{ type: 'click', locator: { role: 'button', name: 'Go' } }] })
  const envelope = await runAction('automation.develop', { action: 'test', id: draft.id, url: 'https://example.com/' }, ctx(serviceOver()), env)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error?.code, 'VALIDATION_MISSING')
  assert.match(envelope.error!.message, /no assert step and no postcondition/)
  assert.match(envelope.error!.hint!, /assert step or a postcondition/)
  assert.equal(envelope.executionStatus, 'completed', 'the steps ran')
  const result = envelope.result as any
  assert.equal(result.testStatus, 'failed')
  assert.equal(result.validationStatus, 'not_checked')
  assert.equal(result.revision, draft.revision)
  assert.match(result.contentHash, /^[0-9a-f]{64}$/)
  assert.equal(assets.get(draft.id)!.testCredentials!.at(-1)!.passed, false)

  // With a postcondition it passes and the envelope is ok.
  const checked = assets.saveDraft({ kind: 'recipe', schemaVersion: 2, name: 'No check', domains: ['example.com'], id: draft.id, recipe: [{ type: 'click', locator: { role: 'button', name: 'Go' } }], postconditions: [{ text: 'Done' }] })
  const ok = await runAction('automation.develop', { action: 'test', id: checked.id, url: 'https://example.com/' }, ctx(serviceOver()), env)
  assert.equal(ok.ok, true, JSON.stringify(ok))
  assert.equal((ok.result as any).testStatus, 'passed')
  assert.equal((ok.result as any).revision, checked.revision)
})

test('develop fork: an active asset gets an editable copy that records its source; the active asset keeps running when the copy fails', async () => {
  const { assets, env, ctx } = developFixture()
  const original = assets.saveDraft({ kind: 'recipe', name: 'Search', domains: ['example.com'], recipe: [{ type: 'click', selector: '#go' }, { type: 'assert', text: 'Results' }] })
  const passed = await runAction('automation.develop', { action: 'test', id: original.id, url: 'https://example.com/' }, ctx(serviceOver()), env)
  assert.equal(passed.ok, true)
  assets.setStatus(original.id, 'active', { expectedRevision: assets.get(original.id)!.revision })

  const forked = await runAction('automation.develop', { action: 'fork', id: original.id }, ctx({}), env)
  assert.equal(forked.ok, true, JSON.stringify(forked))
  const summary = (forked.result as any).result
  assert.equal(summary.sourceAssetId, original.id)
  assert.equal(summary.sourceRevision, original.revision)
  assert.equal(summary.status, 'draft')
  assert.equal(summary.revision, 1)

  // Break the copy and test it: it fails, the original is still active and still runs.
  const broken = await runAction('automation.develop', { action: 'save', id: summary.id, kind: 'recipe', name: 'Search', domains: ['example.com'], recipe: [{ type: 'click', selector: '#moved' }, { type: 'assert', text: 'Results' }] }, ctx({}), env)
  assert.equal(broken.ok, true, JSON.stringify(broken))
  const failing = serviceOver({ '#moved': { click: () => { throw Object.assign(new Error("Timeout 500ms exceeded.\nCall log:\n  - waiting for locator('#moved')"), { name: 'TimeoutError' }) } } })
  const failedTest = await runAction('automation.develop', { action: 'test', id: summary.id, url: 'https://example.com/' }, ctx(failing), env)
  assert.equal(failedTest.ok, false)
  assert.equal(assets.get(original.id)!.status, 'active')
  const run = await runAction('automation.run', { id: original.id, url: 'https://example.com/' }, ctx(serviceOver()), env)
  assert.equal(run.ok, true, JSON.stringify(run))

  assert.equal((await runAction('automation.develop', { action: 'fork' }, ctx({}), env)).error?.code, 'INVALID_ARGS')
  assert.equal((await runAction('automation.develop', { action: 'fork', id: 'missing' }, ctx({}), env)).error?.code, 'NOT_FOUND')
})

test('the detail of automation.develop is split: an overview, then one schema per sub-action, each within 1k tokens', () => {
  const env: IndexEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: false }
  const develop = findAction('automation.develop')!
  const subs = Object.keys(develop.subActions!.items)
  const overview = renderIndex({ action: 'automation.develop' }, env).text
  assert.ok(overview.length <= 3_500, `overview ${overview.length}`)
  for (const sub of subs) assert.match(overview, new RegExp(`\\n  ${sub} - `))
  assert.match(overview, /common args:/)
  assert.match(overview, /browser_index\(\{action:"automation\.develop\.<sub>"\}\)/)
  assert.doesNotMatch(overview, /\$recipeStep/, 'the step schemas live in save, not in the overview')
  let largest = 0
  for (const sub of subs) {
    const detail = renderIndex({ action: `automation.develop.${sub}` }, env)
    assert.equal(detail.level, 'action')
    assert.ok(detail.text.startsWith(`automation.develop.${sub} - `), sub)
    assert.match(detail.text, new RegExp(`action: "${sub}"`), `${sub} names the selector value`)
    assert.ok(detail.text.length <= 3_500, `${sub} is ${detail.text.length} chars`)
    largest = Math.max(largest, detail.text.length)
  }
  // Each operation shows its own parameters only.
  const test = renderIndex({ action: 'automation.develop.test' }, env).text
  assert.match(test, /url: string - inside the draft domains/)
  assert.doesNotMatch(test, /recipe\?|\$recipeStep/)
  const fork = renderIndex({ action: 'automation.develop.fork' }, env).text
  assert.match(fork, /id: string/)
  assert.doesNotMatch(fork, /url|recipe/)
  const save = renderIndex({ action: 'automation.develop.save' }, env).text
  for (const needed of ['kind: ', 'name: ', '$recipeStep', '$postcondition', '$inputSpec', '$outputSpec']) assert.ok(save.includes(needed), needed)
  assert.ok(largest > 3_000, 'the largest detail is save (sanity check that the budget test sees it)')
  // Unknown sub-action falls through to the existing hint.
  assert.match(renderIndex({ action: 'automation.develop.nope' }, env).text, /Unknown action "automation\.develop\.nope"/)
  assert.equal(findSubAction('automation.develop.save')?.sub, 'save')
  assert.equal(findSubAction('act.click'), undefined)
  // Every action detail in the registry, sub-actions included, stays inside the per-layer budget.
  for (const action of ACTIONS) {
    const names = [action.name, ...Object.keys(action.subActions?.items ?? {}).map(sub => `${action.name}.${sub}`)]
    for (const name of names) assert.ok(renderIndex({ action: name }, env).text.length <= 3_500, `${name} exceeds 1k tokens`)
  }
  // search finds develop by a sub-action word
  assert.match(renderIndex({ query: 'fork repair' }, env).text, /automation\.develop/)
})
