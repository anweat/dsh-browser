/**
 * A call whose arguments are invalid must not raise an approval first (real incident: act.select sent `value`
 * instead of `values`; the Host asked, the user allowed, and only then the tool answered INVALID_ARGS).
 *
 * The hook lets such a call through unasked, which is only safe because the executor refuses it again with the
 * same check. The tests below pin both halves: the decision order, and that every call let through for its
 * arguments is stopped by `runAction` before any executor runs.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { mock } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import plugin from '../src/index.ts'
import { browserCallDecision, browserPolicyDecision } from '../src/approval-policy.ts'
import { ACTIONS, findAction, validateActionArgs } from '../src/actions/registry.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { argsRejectedByExecutor, resolveBrowserCall } from '../src/actions/surface.ts'
import { resolveConfig } from '../src/config.ts'
import { AUTOMATION_MODES, isBrowserActionExposed, type AutomationMode } from '../src/freedom.ts'

const SCRIPT = '// ==UserScript==\n// @name S\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1'

/** Valid arguments for every action that can ask for approval; a new asking action fails the coverage test below until it is added. */
const VALID: Record<string, Record<string, unknown>> = {
  'runtime.install': {},
  'act.click': { selector: '#go' },
  'act.fill': { selector: '#q', text: 'abc' },
  'act.type': { selector: '#q', text: 'abc' },
  'act.clear': { selector: '#q' },
  'act.press': { key: 'Enter' },
  'act.select': { locator: { selector: 'select[name="slot"]' }, values: ['pm'] },
  'act.check': { selector: '#agree' },
  'act.hover': { selector: '#menu' },
  'act.scroll': { deltaY: 300 },
  'act.upload': { selector: '#file', files: ['/tmp/report.txt'] },
  'script.evaluate': { expression: 'document.title' },
  'script.run_userscript': { url: 'https://example.com/', source: SCRIPT },
  'automation.develop': { action: 'save', kind: 'recipe', name: 'Draft' },
  'automation.run': { id: 'asset-1', url: 'https://example.com/' },
  'automation.run_recipe': { steps: [{ type: 'click', selector: '#go' }] },
  'opencli.run': { args: ['status'] },
}

/** An action that asks at least in standard mode for some arguments. */
const asking = ACTIONS.filter(action => action.approval !== 'none')

/** Ways to get the arguments of one action wrong: an unknown key, every key misspelled in turn, and a non-object. */
function invalidVariants(valid: Record<string, unknown>): unknown[] {
  const variants: unknown[] = [{ ...valid, bogusArgument: 1 }, 'oops', ['a']]
  for (const key of Object.keys(valid)) {
    const { [key]: moved, ...rest } = valid
    variants.push({ ...rest, [key + '_']: moved })
  }
  return variants
}

/** A service that fails the test if an executor reaches for it: invalid arguments must stop before any page, file or process is touched. */
function untouchableContext() {
  const service = new Proxy({}, { get(_target, property) { throw new Error(`the executor reached for service.${String(property)}`) } })
  return { service: service as never, config: resolveConfig({}), session: 'session:test', sessionId: 'test', agent: undefined, signal: new AbortController().signal }
}

const envFor = (mode: AutomationMode): RunEnvironment => ({ mode, options: { modelDevelopmentEnabled: true }, enabled: true })

test('every action that can ask for approval has valid arguments in this test, and they really are valid', () => {
  assert.deepEqual(Object.keys(VALID).sort(), asking.map(action => action.name).sort())
  for (const [name, args] of Object.entries(VALID)) {
    assert.deepEqual(validateActionArgs(findAction(name)!, args).errors, [], name)
    assert.equal(argsRejectedByExecutor(name, args), false, name)
  }
})

test('valid arguments are still asked about in standard mode, exactly as before', () => {
  for (const [name, args] of Object.entries(VALID)) {
    const decision = browserCallDecision(name, args, 'standard')
    assert.equal(decision.kind, 'ask', name)
    assert.deepEqual(decision, browserPolicyDecision(name, args, 'standard'), `${name}: the same decision as the unchanged policy`)
  }
  // The incident, corrected: the prompt shows the values.
  assert.deepEqual(browserCallDecision('act.select', { locator: { selector: 'select[name="slot"]' }, values: ['pm'] }, 'standard'),
    { kind: 'ask', reason: 'Run a direct Playwright page interaction: act.select selector="select[name=\\"slot\\"]" (values pm)' })
})

test('invalid arguments are let through unasked in every mode that exposes the action', () => {
  // The incident: `value` where the schema says `values`.
  const incident = { locator: { selector: 'select[name="slot"]' }, value: 'pm' }
  assert.equal(browserPolicyDecision('act.select', incident, 'standard').kind, 'ask', 'the old policy asked about this call')
  assert.deepEqual(browserCallDecision('act.select', incident, 'standard'), { kind: 'allow' })
  for (const [name, valid] of Object.entries(VALID)) {
    for (const bad of invalidVariants(valid)) {
      for (const mode of AUTOMATION_MODES) {
        const decision = browserCallDecision(name, bad, mode)
        // `isBrowserActionExposed` is the mode's own switch for an action: off means deny, on means the arguments get the say.
        if (!isBrowserActionExposed(name, mode, bad)) assert.equal(decision.kind, 'deny', `${name} ${mode}: the mode still denies ${JSON.stringify(bad)}`)
        else assert.deepEqual(decision, { kind: 'allow' }, `${name} ${mode}: ${JSON.stringify(bad)}`)
      }
    }
  }
})

test('a mode that disables the action still denies it, before the arguments are looked at', () => {
  for (const action of asking.filter(entry => !entry.readOnly && entry.name !== 'automation.develop')) {
    const bad = { ...VALID[action.name], bogusArgument: 1 }
    const decision = browserCallDecision(action.name, bad, 'read-only')
    assert.equal(decision.kind, 'deny', `${action.name} stays denied in read-only whatever the arguments`)
    assert.deepEqual(decision, browserPolicyDecision(action.name, bad, 'read-only'), `${action.name}: the very same denial`)
  }
  // automation.run_recipe is exposed in read-only (its read-only steps run); its denial of mutating steps is an argument rule,
  // so with arguments that fail the schema the steps cannot be judged and the executor answers INVALID_ARGS.
  const recipeBad = { ...VALID['automation.run_recipe'], bogusArgument: 1 }
  assert.equal(browserCallDecision('automation.run_recipe', VALID['automation.run_recipe'], 'read-only').kind, 'deny')
  assert.deepEqual(browserCallDecision('automation.run_recipe', recipeBad, 'read-only'), { kind: 'allow' })
  // automation.develop: only get and validate are readable in read-only; everything else, including a missing or unknown operation, is denied.
  for (const args of [{}, { action: 'bogus' }, { action: 'save', bogusArgument: 1 }, { action: 'test' }, { action: 'fork', id: 1 }]) {
    const decision = browserCallDecision('automation.develop', args, 'read-only')
    assert.equal(decision.kind, 'deny', JSON.stringify(args))
    assert.match((decision as { reason: string }).reason, /disabled by automationMode=read-only/)
  }
  // get is exposed, so an invalid get is a plain INVALID_ARGS at the executor.
  assert.deepEqual(browserCallDecision('automation.develop', { action: 'get', bogusArgument: 1 }, 'read-only'), { kind: 'allow' })
  // Valid arguments in a disabling mode are denied as before.
  assert.equal(browserCallDecision('act.select', VALID['act.select'], 'read-only').kind, 'deny')
  assert.equal(browserCallDecision('act.select', VALID['act.select'], 'standard').kind, 'ask')
})

test('automation.develop: a missing or unknown operation is invalid arguments, a known one is judged by its operation as before', () => {
  for (const args of [{}, { action: 'bogus' }, { action: 5 }, { id: 'x' }, { action: 'test', bogusArgument: 1 }, undefined, null]) {
    assert.equal(argsRejectedByExecutor('automation.develop', args), true, JSON.stringify(args))
    assert.deepEqual(browserCallDecision('automation.develop', args, 'standard'), { kind: 'allow' }, JSON.stringify(args))
  }
  assert.equal(browserCallDecision('automation.develop', { action: 'save', kind: 'recipe', name: 'D' }, 'standard').kind, 'ask')
  assert.equal(browserCallDecision('automation.develop', { action: 'test', id: 'a', url: 'https://example.com/' }, 'standard').kind, 'ask')
  assert.equal(browserCallDecision('automation.develop', { action: 'get', id: 'a' }, 'standard').kind, 'allow')
})

test('the rules that read arguments themselves are unchanged once the schema passes', () => {
  // Schema-valid, rejected by the rule itself: still denied, not waved through.
  assert.equal(browserCallDecision('act.upload', { selector: '#f', files: [] }, 'standard').kind, 'deny')
  assert.equal(browserCallDecision('script.evaluate', { expression: '  ' }, 'standard').kind, 'deny')
  assert.equal(browserCallDecision('script.evaluate', { expression: 'x'.repeat(20_001) }, 'standard').kind, 'deny')
  assert.equal(browserCallDecision('script.run_userscript', { url: 'https://example.com/', source: 'no header' }, 'standard').kind, 'deny')
  // The same rules when the schema fails: the executor, not the policy, answers.
  assert.deepEqual(browserCallDecision('act.upload', { selector: '#f' }, 'standard'), { kind: 'allow' })
  assert.deepEqual(browserCallDecision('script.evaluate', {}, 'standard'), { kind: 'allow' })
})

test('whatever is let through for its arguments is refused by runAction: INVALID_ARGS with the schema, no executor runs, nothing is touched', async () => {
  const executors = ACTIONS.map(action => mock.method(action, 'execute', async () => ({ ran: action.name })))
  try {
    for (const mode of AUTOMATION_MODES) {
      for (const [name, valid] of Object.entries(VALID)) {
        for (const bad of invalidVariants(valid)) {
          const decision = browserCallDecision(name, bad, mode)
          if (decision.kind !== 'allow') continue
          const reply = await runAction(name, bad, untouchableContext(), envFor(mode))
          assert.equal(reply.ok, false, `${name} ${mode} ${JSON.stringify(bad)}`)
          assert.equal(reply.executionStatus, 'failed')
          assert.equal(reply.error?.code, 'INVALID_ARGS', `${name} ${mode} ${JSON.stringify(bad)}`)
          assert.ok(reply.error?.schema?.startsWith(name + '('), 'the reply carries the compact schema')
        }
      }
    }
    for (const executor of executors) assert.equal(executor.mock.callCount(), 0, 'no executor ran for any of those calls')
    // Control: the same harness does run an executor for valid arguments, so the zero above means something.
    const control = await runAction('act.click', { selector: '#go' }, untouchableContext(), envFor('standard'))
    assert.deepEqual(control, { ok: true, action: 'act.click', executionStatus: 'completed', result: { ran: 'act.click' } })
    assert.equal(executors[ACTIONS.indexOf(findAction('act.click')!)]!.mock.callCount(), 1)
  } finally {
    for (const executor of executors) executor.mock.restore()
  }
})

test('the hook and the executor agree on every sample: rejected for arguments exactly when runAction answers INVALID_ARGS', async () => {
  const executors = ACTIONS.map(action => mock.method(action, 'execute', async () => ({})))
  try {
    const samples: [string, unknown][] = []
    for (const action of ACTIONS) {
      const valid = VALID[action.name] ?? {}
      samples.push([action.name, valid], [action.name, undefined], [action.name, null], ...invalidVariants(valid).map(bad => [action.name, bad] as [string, unknown]))
    }
    for (const [name, args] of samples) {
      const before = executors[ACTIONS.findIndex(action => action.name === name)]!.mock.callCount()
      const reply = await runAction(name, args, untouchableContext(), envFor('unrestricted')).catch(error => ({ ok: false, error: { code: 'THREW', message: String(error) } }))
      const ran = executors[ACTIONS.findIndex(action => action.name === name)]!.mock.callCount() > before
      const invalid = reply.error?.code === 'INVALID_ARGS'
      // Actions with required arguments answer INVALID_ARGS to undefined/null too, and the hook must say the same.
      assert.equal(argsRejectedByExecutor(name, args), invalid, `${name} ${JSON.stringify(args)}`)
      assert.equal(ran, !invalid, `${name} ${JSON.stringify(args)}: it runs exactly when it was not rejected`)
    }
  } finally {
    for (const executor of executors) executor.mock.restore()
  }
})

test('browser_call and flat tools resolve to the same action and arguments the executor validates', () => {
  // browser_call passes `args` through; a missing args is an empty object for the hook and undefined for the executor, and both validate it the same.
  const call = resolveBrowserCall('browser_call', { action: 'act.select' })
  assert.deepEqual(call, { kind: 'action', action: 'act.select', args: {} })
  assert.equal(argsRejectedByExecutor('act.select', {}), argsRejectedByExecutor('act.select', undefined))
  assert.equal(argsRejectedByExecutor('act.fill', {}), argsRejectedByExecutor('act.fill', null))
  // A flat tool is its action with the call's own arguments.
  assert.deepEqual(resolveBrowserCall('browser_act_select', { values: ['a'] }), { kind: 'action', action: 'act.select', args: { values: ['a'] } })
})

test('the real Host hook: invalid arguments are not asked about, valid ones are, on browser_call and on a flat tool', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-invalid-'))
  const root = new Context()
  root.provide('tools', { register() { return () => {} } })
  const fiber = root.plugin(plugin as never, { snapshotDir, automationMode: 'standard' } as never)
  await new Promise(resolve => setTimeout(resolve, 40))
  const decide = async (name: string, args: unknown) => await (root as any).serial('tools/pre-execute', { name, arguments: args }, async () => ({ kind: 'allow' })) as { kind: string; reason?: string }
  try {
    const wrong = { locator: { selector: 'select[name="slot"]' }, value: 'pm' }
    const right = { locator: { selector: 'select[name="slot"]' }, values: ['pm'] }
    assert.deepEqual(await decide('browser_call', { action: 'act.select', args: wrong }), { kind: 'allow' })
    assert.deepEqual(await decide('browser_act_select', wrong), { kind: 'allow' })
    for (const [name, args] of [['browser_call', { action: 'act.select', args: right }], ['browser_act_select', right]] as const) {
      const asked = await decide(name, args)
      assert.equal(asked.kind, 'ask', name)
      assert.match(asked.reason!, /act\.select selector="select\[name=\\"slot\\"\]" \(values pm\)/)
    }
    // Other shapes of wrong: no args at all, args that is not an object, an unknown action (unchanged: UNKNOWN_ACTION at the executor).
    assert.deepEqual(await decide('browser_call', { action: 'act.fill' }), { kind: 'allow' })
    assert.deepEqual(await decide('browser_call', { action: 'act.fill', args: 'text' }), { kind: 'allow' })
    assert.deepEqual(await decide('browser_call', { action: 'act.nope', args: {} }), { kind: 'allow' })
    assert.deepEqual(await decide('browser_call', { action: 'automation.develop', args: {} }), { kind: 'allow' })
  } finally { fiber.dispose() }

  // read-only still denies a disabled action even with wrong arguments.
  const readOnly = new Context()
  readOnly.provide('tools', { register() { return () => {} } })
  const roFiber = readOnly.plugin(plugin as never, { snapshotDir, automationMode: 'read-only' } as never)
  await new Promise(resolve => setTimeout(resolve, 40))
  try {
    const decision = await (readOnly as any).serial('tools/pre-execute', { name: 'browser_call', arguments: { action: 'act.select', args: { value: 'pm' } } }, async () => ({ kind: 'allow' })) as { kind: string; reason?: string }
    assert.equal(decision.kind, 'deny')
  } finally { roFiber.dispose() }
})
