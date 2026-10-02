import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { findAction } from '../src/actions/registry.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { runRecipe, type BrowserRecipeStep } from '../src/automation.ts'
import { resolveConfig } from '../src/config.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }
const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (ms: number): Error => Object.assign(new Error(`locator.waitFor: Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

/** A service whose recipe() is the real runRecipe over a scripted page. */
function serviceOver(behavior: Behavior = {}) {
  return {
    async recipe(steps: BrowserRecipeStep[], opts: { signal?: AbortSignal; legacyRecipe?: boolean }) {
      const run = await runRecipe(fakePage(behavior).page, steps, shot, opts.signal, { legacy: opts.legacyRecipe })
      return { url: 'https://example.com/', title: 'T', text: 'page', ...run, steps: run.completedSteps }
    },
  }
}

function ctxFor(service: unknown, extra: Record<string, unknown> = {}, signal = new AbortController().signal) {
  return { service: service as never, config: resolveConfig({}), session: 'session:test', sessionId: 'test', agent: undefined, signal, ...extra }
}

test('run_recipe: a recipe that ran and failed is ok:false but keeps the whole report next to the error', async () => {
  const service = serviceOver({ '#nope': { innerText: () => { throw timeout(1000) } } })
  const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#a' }, { type: 'extract', selector: '#nope' }] }, ctxFor(service), ENV)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.executionStatus, 'failed')
  const result = envelope.result as any
  assert.equal(result.completedSteps.length, 1)
  assert.equal(result.failedStep.index, 2)
  assert.equal(result.failedStep.errorCode, 'LOCATOR_NOT_FOUND')
  assert.equal(result.effects, 'observed')
  assert.equal(result.title, 'T', 'page state stays in the result')
  assert.equal('steps' in result, false, 'the pre-B2 alias is not repeated in the tool result')
  assert.equal(envelope.error?.code, 'LOCATOR_NOT_FOUND')
  assert.match(envelope.error!.message, /Timeout 1000ms exceeded/)
  assert.ok(envelope.error!.hint)
})

test('run_recipe: a failed assert is ok:false with VALIDATION_FAILED; a passing recipe is ok:true', async () => {
  const failing = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#pay' }, { type: 'assert', text: 'Paid', timeoutMs: 500 }] },
    ctxFor(serviceOver({ 'text=Paid': { waitFor: () => { throw timeout(500) } } })), ENV)
  assert.equal(failing.ok, false)
  assert.equal(failing.error?.code, 'VALIDATION_FAILED')
  assert.equal((failing.result as any).validationStatus, 'failed')
  assert.match(failing.error!.hint!, /do not run them again|observe\.read/i)

  const passing = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'assert', text: 'Ready' }] }, ctxFor(serviceOver()), ENV)
  assert.equal(passing.ok, true)
  assert.equal(passing.executionStatus, 'completed')
  assert.equal(passing.error, undefined)
  assert.equal((passing.result as any).validationStatus, 'passed')
})

test('run_recipe: a side-effecting timeout after the element was found is outcome_unknown; a click on an element that never appeared is a plain failure with no effects', async () => {
  const started = Object.assign(new Error("locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('#pay')\n  - locator resolved to <button id=pay>\n  - attempting click action\n  - waiting for scheduled navigations to finish"), { name: 'TimeoutError' })
  const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#pay' }] },
    ctxFor(serviceOver({ '#pay': { click: () => { throw started } } })), ENV)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.executionStatus, 'outcome_unknown')
  assert.equal(envelope.error?.code, 'OUTCOME_UNKNOWN')
  assert.match(envelope.error!.hint!, /verify/i)
  assert.equal((envelope.result as any).effects, 'unknown')
  assert.equal((envelope.result as any).failedStep.errorCode, 'NOT_ACTIONABLE', 'the specific cause is kept next to the unknown outcome')

  const never = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#pay' }] },
    ctxFor(serviceOver({ '#pay': { click: () => { throw timeout(15000) } } })), ENV)
  assert.equal(never.ok, false)
  assert.equal(never.executionStatus, 'failed')
  assert.equal(never.error?.code, 'LOCATOR_NOT_FOUND')
  assert.equal((never.result as any).effects, 'none')
  assert.match(never.error!.message, /did not start/)
})

test('run_recipe: a cancel mid-recipe returns cancelled with the completed prefix and effects instead of an empty error', async () => {
  const controller = new AbortController()
  const service = serviceOver({ '#go': { click: () => { controller.abort() } } })
  const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#go' }, { type: 'click', selector: '#next' }] }, ctxFor(service, {}, controller.signal), ENV)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.executionStatus, 'cancelled')
  assert.equal(envelope.error?.code, 'CANCELLED')
  assert.equal((envelope.result as any).completedSteps.length, 1)
  assert.equal((envelope.result as any).effects, 'observed')
})

test('run_recipe: a malformed recipe is INVALID_RECIPE and runs nothing', async () => {
  const service = { recipe: async (steps: BrowserRecipeStep[]) => runRecipe(fakePage().page, steps, shot) }
  const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '' }] }, ctxFor(service), ENV)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error?.code, 'INVALID_RECIPE')
})

test('the deadline aborts a recipe, waits for the running step to return, and reports the prefix rather than a bare timeout', async () => {
  const action = findAction('automation.run_recipe')!
  const original = { timeoutMs: action.timeoutMs, settleMs: action.settleMs }
  action.timeoutMs = 40
  action.settleMs = 2_000
  try {
    let finished = false
    const service = serviceOver({ '#slow': { click: async () => { await new Promise(resolve => setTimeout(resolve, 150)); finished = true } } })
    const started = Date.now()
    const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#a' }, { type: 'click', selector: '#slow' }, { type: 'click', selector: '#never' }] }, ctxFor(service), ENV)
    assert.ok(finished, 'the in-flight step was waited for, not abandoned')
    assert.ok(Date.now() - started >= 140)
    assert.equal(envelope.ok, false)
    assert.equal(envelope.error?.code, 'DEADLINE')
    assert.equal((envelope.result as any).completedSteps.length, 2)
    assert.equal((envelope.result as any).failedStep.index, 3)
    assert.equal((envelope.result as any).effects, 'observed')
  } finally {
    Object.assign(action, original)
  }
})

test('a step that never returns still ends in outcome_unknown once the settle window passes', async () => {
  const action = findAction('automation.run_recipe')!
  const original = { timeoutMs: action.timeoutMs, settleMs: action.settleMs }
  action.timeoutMs = 30
  action.settleMs = 50
  try {
    const service = serviceOver({ '#stuck': { click: () => new Promise(() => {}) } })
    const envelope = await runAction('automation.run_recipe', { url: 'https://example.com/', steps: [{ type: 'click', selector: '#stuck' }] }, ctxFor(service), ENV)
    assert.equal(envelope.executionStatus, 'outcome_unknown')
    assert.equal(envelope.error?.code, 'DEADLINE')
  } finally {
    Object.assign(action, original)
  }
})

test('automation.run and automation.develop test return the structured run and the evidence level', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-tool-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' })
  const assets = new AutomationAssetStore(policy)
  const development = new AutomationDevelopmentService(assets, policy)
  const draft = assets.saveDraft({ kind: 'recipe', name: 'Pay', domains: ['example.com'], recipe: [{ type: 'click', selector: '#pay' }, { type: 'assert', text: 'Paid', timeoutMs: 500 }] })

  const failing = serviceOver({ 'text=Paid': { waitFor: () => { throw timeout(500) } } })
  const failed = await runAction('automation.develop', { action: 'test', id: draft.id, url: 'https://example.com/' }, ctxFor(failing, { assets, development }), ENV)
  assert.equal(failed.ok, false)
  assert.equal(failed.error?.code, 'VALIDATION_FAILED')
  const failedResult = failed.result as any
  assert.equal(failedResult.testStatus, 'failed')
  assert.equal(failedResult.validationStatus, 'failed')
  assert.equal(failedResult.effects, 'observed')
  assert.equal(failedResult.completedSteps.length, 1)

  const passed = await runAction('automation.develop', { action: 'test', id: draft.id, url: 'https://example.com/' }, ctxFor(serviceOver(), { assets, development }), ENV)
  assert.equal(passed.ok, true)
  const passedResult = passed.result as any
  assert.equal(passedResult.testStatus, 'passed')
  assert.equal(passedResult.evidenceLevel, 'verified')
  assert.equal(passedResult.validationStatus, 'passed')
  assert.equal(passedResult.result.title, 'T', 'page state is under result')

  assets.setStatus(draft.id, 'active')
  const run = await runAction('automation.run', { id: draft.id, url: 'https://example.com/', inputs: {} }, ctxFor(serviceOver(), { assets, development }), ENV)
  assert.equal(run.ok, true)
  assert.equal((run.result as any).assetId, draft.id)
  assert.equal((run.result as any).executionStatus, 'completed')
  assert.equal((run.result as any).evidenceLevel, 'verified')
  const bad = await runAction('automation.run', { id: draft.id, url: 'https://example.com/', inputs: {} }, ctxFor(failing, { assets, development }), ENV)
  assert.equal(bad.ok, false)
  assert.equal(bad.error?.code, 'VALIDATION_FAILED')
  assert.equal(assets.get(draft.id)?.failureCount, 1)

  const legacy = assets.saveDraft({ kind: 'recipe', name: 'Read', domains: ['example.com'], recipe: [{ type: 'extract', selector: 'main' }] })
  const legacyTest = await runAction('automation.develop', { action: 'test', id: legacy.id, url: 'https://example.com/' }, ctxFor(serviceOver(), { assets, development }), ENV)
  assert.equal(legacyTest.ok, true)
  assert.equal((legacyTest.result as any).evidenceLevel, 'legacy-unverified')
  assert.equal((legacyTest.result as any).validationStatus, 'not_checked')
  assert.equal((legacyTest.result as any).testStatus, 'passed')
})
