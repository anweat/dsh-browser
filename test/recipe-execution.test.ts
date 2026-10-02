import test from 'node:test'
import assert from 'node:assert/strict'
import { EXTRACT_MODES, WAIT_CONDITIONS, runRecipe, validateRecipe, validateRecipeEnums, type BrowserRecipeStep } from '../src/automation.ts'
import { DeadlineError, RecipeAssertionError, mapError } from '../src/actions/errors.ts'

type Behavior = Record<string, Partial<Record<string, (...args: any[]) => unknown>>>

/** A page whose locators run scripted behaviour per selector and record every call. */
function fakePage(behavior: Behavior = {}) {
  const log: string[] = []
  const locatorFor = (key: string): any => {
    const locator: any = { first: () => locator, locator: () => locator }
    for (const method of ['click', 'fill', 'pressSequentially', 'press', 'selectOption', 'check', 'uncheck', 'hover', 'waitFor', 'innerText', 'innerHTML', 'getAttribute', 'evaluateAll']) {
      locator[method] = async (...args: unknown[]) => {
        log.push(`${method}:${key}`)
        const scripted = behavior[key]?.[method]
        if (scripted) return scripted(...args)
        return method === 'innerText' || method === 'innerHTML' ? 'text' : method === 'evaluateAll' ? [] : undefined
      }
    }
    return locator
  }
  const page = {
    locator: (selector: string) => locatorFor(selector),
    getByText: (text: string) => locatorFor('text=' + text),
    waitForLoadState: async () => { log.push('waitForLoadState') },
    waitForTimeout: async () => { log.push('waitForTimeout') },
    keyboard: { press: async (key: string) => { log.push('keyboard:' + key) } },
    mouse: { wheel: async () => { log.push('wheel') } },
  }
  return { page, log }
}

const timeout = (what: string, ms = 1000): Error =>
  Object.assign(new Error(`locator.${what}: Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })
const shot = async (): Promise<string> => '/tmp/shot.png'

test('a failure on step 3 returns the two completed steps, the failed step, and the effects that already happened', async () => {
  const { page, log } = fakePage({ '#missing': { innerText: () => { throw timeout('innerText') } } })
  const steps: BrowserRecipeStep[] = [
    { type: 'fill', selector: '#q', value: 'dsh' },
    { type: 'click', selector: '#go' },
    { type: 'extract', selector: '#missing' },
    { type: 'click', selector: '#never' },
  ]
  const run = await runRecipe(page, steps, shot)
  assert.equal(run.executionStatus, 'failed')
  assert.equal(run.completedSteps.length, 2)
  assert.deepEqual(run.completedSteps.map(step => [step.step, step.action, step.ok]), [[1, 'fill', true], [2, 'click', true]])
  assert.equal(run.failedStep?.index, 3)
  assert.equal(run.failedStep?.action, 'extract')
  assert.equal(run.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  assert.match(run.failedStep!.message, /Timeout 1000ms exceeded/, 'the original message is kept')
  assert.equal(run.effects, 'observed', 'fill and click did take effect and are not rolled back')
  assert.equal(run.validationStatus, 'not_checked')
  assert.ok(!log.includes('click:#never'), 'nothing runs after the failed step')
})

test('cancelling during a step lets that step finish, stops before the next, and keeps effects', async () => {
  const controller = new AbortController()
  const { page, log } = fakePage({ '#go': { click: () => { controller.abort() } } })
  const run = await runRecipe(page, [
    { type: 'fill', selector: '#q', value: 'x' },
    { type: 'click', selector: '#go' },
    { type: 'click', selector: '#second' },
  ], shot, controller.signal)
  assert.equal(run.executionStatus, 'cancelled')
  assert.equal(run.completedSteps.length, 2, 'the step that was running completed')
  assert.equal(run.failedStep?.index, 3)
  assert.equal(run.failedStep?.errorCode, 'CANCELLED')
  assert.equal(run.effects, 'observed')
  assert.ok(!log.includes('click:#second'))
})

test('a cancel that lands after the last step is still reported as cancelled, with every step and its effects', async () => {
  const controller = new AbortController()
  const { page } = fakePage({ '#submit': { click: () => { controller.abort() } } })
  const run = await runRecipe(page, [
    { type: 'fill', selector: '#q', value: 'x' },
    { type: 'click', selector: '#submit' },
  ], shot, controller.signal)
  assert.equal(run.executionStatus, 'cancelled', 'the loop ending must not hide the cancel')
  assert.equal(run.completedSteps.length, 2)
  assert.equal(run.failedStep, undefined, 'no step failed or was skipped')
  assert.equal(run.effects, 'observed', 'the submit already happened and is not rolled back')
  assert.match(run.message!, /after the last step/)
})

test('a cancel before the first step runs nothing', async () => {
  const controller = new AbortController()
  controller.abort()
  const { page, log } = fakePage()
  const run = await runRecipe(page, [{ type: 'click', selector: '#a' }], shot, controller.signal)
  assert.equal(run.executionStatus, 'cancelled')
  assert.equal(run.effects, 'none')
  assert.deepEqual(log, [])
})

test('an expired overall deadline is reported as DEADLINE, not as a user cancel', async () => {
  const controller = new AbortController()
  const { page } = fakePage({ '#a': { click: () => { controller.abort(new DeadlineError()) } } })
  const run = await runRecipe(page, [{ type: 'click', selector: '#a' }, { type: 'click', selector: '#b' }], shot, controller.signal)
  assert.equal(run.executionStatus, 'failed')
  assert.equal(run.failedStep?.errorCode, 'DEADLINE')
  assert.equal(run.completedSteps.length, 1)
  assert.equal(run.effects, 'observed')
})

test('a step that throws because of the cancel is cancelled and its effect is unknown', async () => {
  const controller = new AbortController()
  const { page } = fakePage({ '#go': { click: () => { controller.abort(); throw new Error('Target closed') } } })
  const run = await runRecipe(page, [{ type: 'click', selector: '#go' }], shot, controller.signal)
  assert.equal(run.executionStatus, 'cancelled')
  assert.equal(run.effects, 'unknown')
  assert.equal(run.failedStep?.errorCode, 'CANCELLED')
})

test('validateRecipe rejects unknown extract modes and wait conditions, and says what is allowed', () => {
  const bad = [{ type: 'extract', selector: 'main', mode: 'markdown' }] as unknown as BrowserRecipeStep[]
  assert.throws(() => validateRecipe(bad), /unsupported extract mode "markdown".*text, html, links, attribute/)
  assert.throws(() => validateRecipeEnums(bad), /unsupported extract mode/)
  assert.throws(() => validateRecipe([{ type: 'wait', condition: 'idle' }] as unknown as BrowserRecipeStep[]), /unsupported wait condition "idle"/)
  for (const mode of EXTRACT_MODES) validateRecipe([{ type: 'extract', mode, attribute: 'href' }])
  for (const condition of WAIT_CONDITIONS) validateRecipe([{ type: 'wait', condition, value: '1', waitMs: 1 }])
  validateRecipe([{ type: 'extract', selector: 'main' }])
  const error = (() => { try { validateRecipe(bad) } catch (caught) { return caught } })()
  assert.equal(mapError(error, 'automation.run_recipe').code, 'INVALID_RECIPE')
})

test('an inline recipe with an unknown mode is refused before any step; a stored v1 asset keeps the old links behaviour and says so', async () => {
  const bad = [{ type: 'extract', selector: '.list', mode: 'markdown' }] as unknown as BrowserRecipeStep[]
  const strict = fakePage()
  await assert.rejects(() => runRecipe(strict.page, bad, shot), /unsupported extract mode/)
  assert.deepEqual(strict.log, [], 'nothing ran')

  const legacy = fakePage({ '.list': { evaluateAll: () => [{ text: 'a', url: 'http://x/a' }] } })
  const run = await runRecipe(legacy.page, bad, shot, undefined, { legacy: true })
  assert.equal(run.executionStatus, 'completed')
  assert.equal(run.legacyFallback, true)
  assert.deepEqual(JSON.parse(run.outputs[0]!.value), [{ text: 'a', url: 'http://x/a' }], 'same value the links branch always produced')
  const known = await runRecipe(fakePage().page, [{ type: 'extract', selector: 'main', mode: 'text' }], shot, undefined, { legacy: true })
  assert.equal(known.legacyFallback, undefined, 'only an unknown mode is flagged')
})

test('a legitimately empty result is told apart from a failed extraction', async () => {
  const empty = await runRecipe(fakePage({ '#results': { innerText: () => '' } }).page, [{ type: 'extract', selector: '#results', mode: 'text' }], shot)
  assert.equal(empty.executionStatus, 'completed')
  assert.equal(empty.failedStep, undefined)
  assert.deepEqual(empty.outputs, [{ step: 1, action: 'extract', value: '' }])
  assert.deepEqual(empty.completedSteps, [{ step: 1, action: 'extract', ok: true, value: '' }])

  const missing = await runRecipe(fakePage({ '#nope': { innerText: () => { throw timeout('innerText') } } }).page, [{ type: 'extract', selector: '#nope', mode: 'text' }], shot)
  assert.equal(missing.executionStatus, 'failed')
  assert.equal(missing.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  assert.deepEqual(missing.outputs, [])
})

test('a failed assert is VALIDATION_FAILED with validation failed; passing asserts make validation passed', async () => {
  const failing = fakePage({ 'text=Done': { waitFor: () => { throw timeout('waitFor', 500) } } })
  const run = await runRecipe(failing.page, [
    { type: 'click', selector: '#submit' },
    { type: 'assert', text: 'Done', timeoutMs: 500 },
  ], shot)
  assert.equal(run.executionStatus, 'failed')
  assert.equal(run.validationStatus, 'failed')
  assert.equal(run.failedStep?.errorCode, 'VALIDATION_FAILED')
  assert.match(run.failedStep!.message, /assert failed: text "Done"/)
  assert.match(run.failedStep!.message, /Timeout 500ms exceeded/, 'the Playwright message is preserved')
  assert.equal(run.effects, 'observed', 'the submit happened even though the result is not confirmed')

  const passing = await runRecipe(fakePage().page, [{ type: 'click', selector: '#a' }, { type: 'assert', selector: '#ok' }, { type: 'assert', text: 'fine' }], shot)
  assert.equal(passing.executionStatus, 'completed')
  assert.equal(passing.validationStatus, 'passed')

  const none = await runRecipe(fakePage().page, [{ type: 'click', selector: '#a' }], shot)
  assert.equal(none.validationStatus, 'not_checked')

  const partial = await runRecipe(fakePage({ '#b': { click: () => { throw new Error('boom') } } }).page, [{ type: 'assert', selector: '#ok' }, { type: 'click', selector: '#b' }, { type: 'assert', text: 'later' }], shot)
  assert.equal(partial.validationStatus, 'not_checked', 'not every assert ran, so nothing is confirmed')
})

test('an assert that fails for a reason other than "never appeared" keeps its own cause', async () => {
  const run = await runRecipe(fakePage({ '#ok': { waitFor: () => { throw new Error('Target page, context or browser has been closed') } } }).page, [{ type: 'assert', selector: '#ok' }], shot)
  assert.equal(run.failedStep?.errorCode, 'TARGET_CLOSED')
  assert.equal(run.validationStatus, 'not_checked')
})

test('a side-effecting step that times out is outcome_unknown, while a read-only step that times out is a plain failure', async () => {
  for (const [step, handler] of [
    [{ type: 'click', selector: '#pay' }, 'click'],
    [{ type: 'fill', selector: '#pay', value: '1' }, 'fill'],
    [{ type: 'press', selector: '#pay', key: 'Enter' }, 'press'],
    [{ type: 'select', selector: '#pay', value: 'a' }, 'selectOption'],
    [{ type: 'check', selector: '#pay' }, 'check'],
    [{ type: 'type', selector: '#pay', value: 'a' }, 'pressSequentially'],
  ] as [BrowserRecipeStep, string][]) {
    const run = await runRecipe(fakePage({ '#pay': { [handler]: () => { throw timeout(handler) } } }).page, [step], shot)
    assert.equal(run.executionStatus, 'outcome_unknown', step.type)
    assert.equal(run.effects, 'unknown', step.type)
    assert.equal(run.failedStep?.errorCode, 'LOCATOR_NOT_FOUND', 'the specific cause is kept next to the unknown outcome')
  }
  // A timeout without a call log (for example a navigation-style timeout) is DEADLINE but equally unknown.
  const bare = await runRecipe(fakePage({ '#pay': { click: () => { throw Object.assign(new Error('Timeout 15000ms exceeded.'), { name: 'TimeoutError' }) } } }).page, [{ type: 'click', selector: '#pay' }], shot)
  assert.equal(bare.executionStatus, 'outcome_unknown')
  assert.equal(bare.failedStep?.errorCode, 'DEADLINE')

  const read = await runRecipe(fakePage({ '#late': { waitFor: () => { throw timeout('waitFor') } } }).page, [{ type: 'wait', condition: 'selector', value: '#late' }], shot)
  assert.equal(read.executionStatus, 'failed')
  assert.equal(read.effects, 'none')
  assert.equal(read.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')

  const earlier = await runRecipe(fakePage({ '#pay': { click: () => { throw timeout('click') } } }).page, [{ type: 'fill', selector: '#q', value: 'a' }, { type: 'click', selector: '#pay' }], shot)
  assert.equal(earlier.executionStatus, 'outcome_unknown')
  assert.equal(earlier.completedSteps.length, 1, 'the fill before it is still reported')
})

test('other failures map to the shared error codes and mark effects on side-effecting steps', async () => {
  const closed = await runRecipe(fakePage({ '#a': { click: () => { throw new Error('page.click: Target page, context or browser has been closed') } } }).page, [{ type: 'click', selector: '#a' }], shot)
  assert.equal(closed.failedStep?.errorCode, 'TARGET_CLOSED')
  assert.equal(closed.executionStatus, 'failed', 'not a timeout, so not outcome_unknown')
  assert.equal(closed.effects, 'unknown')

  const blocked = Object.assign(new Error('locator.click: Timeout 15000ms exceeded.\nCall log:\n  - locator resolved to <button>\n  - element is not enabled'), { name: 'TimeoutError' })
  const notActionable = await runRecipe(fakePage({ '#a': { click: () => { throw blocked } } }).page, [{ type: 'click', selector: '#a' }], shot)
  assert.equal(notActionable.failedStep?.errorCode, 'NOT_ACTIONABLE')
  assert.equal(notActionable.executionStatus, 'outcome_unknown')

  const readClosed = await runRecipe(fakePage({ 'body': { innerText: () => { throw new Error('Target closed') } } }).page, [{ type: 'extract' }], shot)
  assert.equal(readClosed.failedStep?.errorCode, 'TARGET_CLOSED')
  assert.equal(readClosed.effects, 'none')
})

test('the recipe error codes share the single error mapping table', () => {
  assert.equal(mapError(new RecipeAssertionError('assert failed'), 'automation.run_recipe').code, 'VALIDATION_FAILED')
  assert.match(mapError(new RecipeAssertionError('assert failed'), 'x').hint!, /assert/i)
  assert.equal(mapError(new Error('x'), 'recipe.step', { signal: (() => { const c = new AbortController(); c.abort(new DeadlineError()); return c.signal })() }).code, 'DEADLINE')
  assert.equal(mapError(new Error('x'), 'recipe.step', { signal: (() => { const c = new AbortController(); c.abort(); return c.signal })() }).code, 'CANCELLED')
})
