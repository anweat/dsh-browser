/**
 * v1 recipes keep their B2 behaviour. Each case runs the same recipe over the same scripted page with
 * the live runner and with a frozen copy of the B2 runner (test/reference/automation-b2.ts), then compares
 * the report and every Playwright call, step by step, `.first()` included.
 *
 * Two differences are intended and asserted separately below: a side-effecting step whose element never
 * resolved is now `failed`/`effects: none` (B2 said outcome_unknown), and extract/screenshot values live
 * only in `outputs` (completedSteps point at them).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { runRecipe, type BrowserRecipeStep } from '../src/automation.ts'
import { runRecipe as runReference } from './reference/automation-b2.ts'
import { DeadlineError } from '../src/actions/errors.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (what: string, ms = 1000): Error =>
  Object.assign(new Error(`locator.${what}: Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

interface Case {
  name: string
  steps: BrowserRecipeStep[]
  behavior?: () => Behavior
  options?: { legacy?: boolean }
  signal?: () => AbortSignal | undefined
}

/** The live report, with extract/screenshot values put back on the steps the way B2 printed them. */
function normalizeLive(run: Awaited<ReturnType<typeof runRecipe>>) {
  return {
    ...run,
    completedSteps: run.completedSteps.map(({ output, ...step }) => ({ ...step, ...output !== undefined ? { value: run.outputs[output]!.value } : {} })),
  }
}

const cases: Case[] = [
  {
    name: 'search flow: fill, click, assert, extract text and html',
    steps: [
      { type: 'fill', selector: '#q', value: 'ap' },
      { type: 'click', selector: '#go' },
      { type: 'assert', text: '2 results for ap' },
      { type: 'extract', selector: '#results', mode: 'text' },
      { type: 'extract', selector: '#results', mode: 'html' },
    ],
    behavior: () => ({ '#results': { innerText: () => 'apple\napricot', innerHTML: () => '<li>apple</li>' } }),
  },
  {
    name: 'every step type once',
    steps: [
      { type: 'wait', condition: 'selector', value: '#a' },
      { type: 'wait', condition: 'text', value: 'Hello' },
      { type: 'wait', condition: 'load' },
      { type: 'wait', condition: 'time', waitMs: 5 },
      { type: 'type', selector: '#t', value: 'abc' },
      { type: 'press', key: 'Enter' },
      { type: 'press', key: 'Tab', selector: '#t' },
      { type: 'select', selector: '#s', value: 'x' },
      { type: 'check', selector: '#c' },
      { type: 'check', selector: '#c', checked: false },
      { type: 'hover', selector: '#h' },
      { type: 'scroll', deltaY: 300, waitMs: 1 },
      { type: 'extract', selector: '#a', mode: 'attribute', attribute: 'href' },
      { type: 'extract' },
      { type: 'screenshot' },
    ],
    behavior: () => ({ '#a': { getAttribute: () => '/next' } }),
  },
  {
    name: 'links extraction uses the container then its anchors',
    steps: [{ type: 'extract', selector: '.list', mode: 'links', limit: 2 }],
    behavior: () => ({ '.list': { evaluateAll: () => [{ text: 'a', url: 'http://x/a' }] } }),
  },
  {
    name: 'failure on step 3 keeps the completed prefix and the effects',
    steps: [{ type: 'fill', selector: '#q', value: 'dsh' }, { type: 'click', selector: '#go' }, { type: 'extract', selector: '#missing' }, { type: 'click', selector: '#never' }],
    behavior: () => ({ '#missing': { innerText: () => { throw timeout('innerText') } } }),
  },
  {
    name: 'a failed assert is VALIDATION_FAILED after the submit',
    steps: [{ type: 'click', selector: '#submit' }, { type: 'assert', text: 'Done', timeoutMs: 500 }],
    behavior: () => ({ 'text=Done': { waitFor: () => { throw timeout('waitFor', 500) } } }),
  },
  {
    name: 'a read-only wait that times out is a plain failure',
    steps: [{ type: 'wait', condition: 'selector', value: '#late', timeoutMs: 100 }],
    behavior: () => ({ '#late': { waitFor: () => { throw timeout('waitFor', 100) } } }),
  },
  {
    name: 'a step that hit a closed page',
    steps: [{ type: 'click', selector: '#a' }],
    behavior: () => ({ '#a': { click: () => { throw new Error('page.click: Target page, context or browser has been closed') } } }),
  },
  {
    name: 'an element that resolved but is disabled stays outcome_unknown',
    steps: [{ type: 'click', selector: '#a' }],
    behavior: () => ({ '#a': { click: () => { throw Object.assign(new Error('locator.click: Timeout 15000ms exceeded.\nCall log:\n  - locator resolved to <button>\n  - element is not enabled'), { name: 'TimeoutError' }) } } }),
  },
  {
    name: 'a stored asset with an unknown extract mode still runs as links (legacy)',
    steps: [{ type: 'extract', selector: '.list', mode: 'markdown' }] as unknown as BrowserRecipeStep[],
    behavior: () => ({ '.list': { evaluateAll: () => [{ text: 'a', url: 'http://x/a' }] } }),
    options: { legacy: true },
  },
  {
    name: 'a cancel before the second step',
    steps: [{ type: 'click', selector: '#a' }, { type: 'click', selector: '#b' }],
    behavior: () => ({}),
    signal: (() => { const controller = new AbortController(); return () => { controller.abort(); return controller.signal } })(),
  },
  {
    name: 'an expired deadline',
    steps: [{ type: 'click', selector: '#a' }, { type: 'click', selector: '#b' }],
    signal: () => { const controller = new AbortController(); controller.abort(new DeadlineError()); return controller.signal },
  },
]

for (const entry of cases) {
  test(`v1 compat: ${entry.name}`, async () => {
    const before = fakePage(entry.behavior?.())
    const after = fakePage(entry.behavior?.())
    const expected = await runReference(before.page, entry.steps as never, shot, entry.signal?.(), entry.options)
    const actual = normalizeLive(await runRecipe(after.page, entry.steps, shot, entry.signal?.(), entry.options))
    assert.deepEqual(after.trace, before.trace, 'the same Playwright calls in the same order, .first() included')
    assert.deepEqual(actual, expected as unknown, 'the same report')
  })
}

test('v1 compat: the first match is still used (`.first()` on every located step), not strictness', async () => {
  const { page, trace } = fakePage()
  await runRecipe(page, [{ type: 'click', selector: '.row' }, { type: 'fill', selector: '.row', value: 'x' }, { type: 'extract', selector: '.row' }], shot)
  assert.deepEqual(trace.filter(entry => entry.startsWith('first:')), ['first:.row', 'first:.row', 'first:.row'])
})

test('v1 compat, intended difference: a side-effecting step whose element never resolved is failed with effects none (B2: outcome_unknown)', async () => {
  const behavior = () => ({ '#pay': { click: () => { throw timeout('click', 15000) } } })
  const steps: BrowserRecipeStep[] = [{ type: 'click', selector: '#pay' }]
  const old = await runReference(fakePage(behavior()).page, steps, shot)
  const now = await runRecipe(fakePage(behavior()).page, steps, shot)
  assert.equal(old.executionStatus, 'outcome_unknown')
  assert.equal(now.executionStatus, 'failed')
  assert.equal(now.effects, 'none')
  assert.equal(now.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  assert.equal(old.failedStep?.errorCode, now.failedStep?.errorCode, 'the cause itself is unchanged')
})
