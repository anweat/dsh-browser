import test from 'node:test'
import assert from 'node:assert/strict'
import { LocatorAmbiguousError, describeCandidates, resolveLocator, validateLocatorSpec, withStrictLocator } from '../src/locator.ts'
import { mapError } from '../src/actions/errors.ts'
import { fakePage } from './fake-page.ts'

const strict = (): Error => new Error("locator.click: Error: strict mode violation: getByRole('button') resolved to 2 elements:\n    1) <button>Save</button>")

test('a locator spec is checked for exactly one mode, and index needs a reason', () => {
  assert.throws(() => validateLocatorSpec({}), /exactly one of/)
  assert.throws(() => validateLocatorSpec({ role: 'button', text: 'x' }), /exactly one of/)
  assert.throws(() => validateLocatorSpec({ name: 'x', css: 'a' }), /name is only valid with role/)
  assert.throws(() => validateLocatorSpec({ css: 'a', index: 1 }), /index requires indexReason/)
  assert.throws(() => validateLocatorSpec({ css: 'a', indexReason: 'because' }), /indexReason is only valid with index/)
  assert.throws(() => validateLocatorSpec({ css: 'a', index: -1, indexReason: 'x' }), /index must be an integer/)
  assert.throws(() => validateLocatorSpec({ css: 'a', index: 0, indexReason: 'x', explicitFirst: true }), /cannot combine index and explicitFirst/)
  assert.throws(() => validateLocatorSpec({ css: 'a', bogus: 1 }), /unsupported field "bogus"/)
  assert.throws(() => validateLocatorSpec({ css: 'a', framePath: [] }), /framePath must list/)
  assert.throws(() => validateLocatorSpec({ css: 'a', frame: { selector: 'i' }, framePath: ['i'] }), /cannot combine frame and framePath/)
  validateLocatorSpec({ role: 'button', name: 'Save', exact: true })
  validateLocatorSpec({ testId: 'save', framePath: ['iframe#a', 'iframe#b'], index: 2, indexReason: 'the third card' })
  validateLocatorSpec({ css: 'a', explicitFirst: true })
})

test('the same spec builds the same Playwright locator for every caller, strict unless told otherwise', () => {
  const { page, trace } = fakePage()
  resolveLocator(page, '#a')
  resolveLocator(page, { role: 'button', name: 'Save' })
  resolveLocator(page, { css: '#a' })
  assert.deepEqual(trace, [], 'a strict locator takes no first() or nth()')
  resolveLocator(page, { role: 'button', index: 1, indexReason: 'footer' })
  resolveLocator(page, { css: '#b', explicitFirst: true })
  assert.deepEqual(trace, ['nth:role=button:1', 'first:#b'])
  const framed = fakePage({ 'frame(iframe#a)>frame(iframe#b)>testid=ok': { click: () => 'clicked' } })
  const locator = resolveLocator(framed.page, { testId: 'ok', framePath: ['iframe#a', 'iframe#b'] })
  return locator.click().then((value: unknown) => assert.equal(value, 'clicked'))
})

test('a strict violation becomes LOCATOR_AMBIGUOUS with the first candidates, and nothing was acted on', async () => {
  const rows = Array.from({ length: 5 }, (_unused, index) => ({ index, role: 'button', name: 'Save', text: 'Save', visible: index !== 3 }))
  const { page, log } = fakePage({ 'role=button:Save': { click: () => { throw strict() }, count: () => 7, evaluateAll: () => rows } })
  const locator = resolveLocator(page, { role: 'button', name: 'Save' })
  const error = await withStrictLocator(locator, loc => loc.click()).catch(caught => caught)
  assert.ok(error instanceof LocatorAmbiguousError)
  assert.equal(error.ambiguity.total, 7)
  assert.equal(error.ambiguity.items.length, 5)
  assert.deepEqual(error.ambiguity.items[3], { index: 3, role: 'button', name: 'Save', text: 'Save', visible: false })
  assert.match(error.message, /matched 7 elements, so nothing was done/)
  assert.match(error.message, /#0 button "Save" visible/)
  assert.match(error.message, /#3 button "Save" hidden/)
  assert.match(error.message, /…2 more/)
  assert.match(error.message, /strict mode violation/, 'the Playwright cause is kept')
  assert.deepEqual(log.filter(entry => entry.startsWith('click')), ['click:role=button:Save'], 'one attempt, no retry on another element')

  const body = mapError(error, 'act.click')
  assert.equal(body.code, 'LOCATOR_AMBIGUOUS')
  assert.equal(body.candidates?.total, 7)
  assert.match(body.hint!, /indexReason/)
})

test('an error that is not a strict violation passes through untouched', async () => {
  const { page } = fakePage({ '#a': { click: () => { throw new Error('boom') } } })
  await assert.rejects(() => withStrictLocator(resolveLocator(page, '#a'), loc => loc.click()), /^Error: boom$/)
})

test('describeCandidates survives a locator that cannot be summarized', async () => {
  const { page } = fakePage({ '#x': { count: () => { throw new Error('gone') }, evaluateAll: () => { throw new Error('gone') } } })
  assert.deepEqual(await describeCandidates(resolveLocator(page, '#x')), { total: 0, items: [] })
})
