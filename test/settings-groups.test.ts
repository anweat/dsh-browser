/**
 * The redesigned groups, below the markup: the pure helpers they use and what the form controller does for them
 * (cross-field problems, the unsaved count, a control edit replacing typed advanced text). The markup itself is
 * checked in settings-card-render.test.ts (server-rendered) and test/e2e/settings-ui.test.ts (in Chromium).
 */
import './support/register-primitives-stub.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { fakeScope } from './e2e/ui/primitives-stub.ts'

const { BrowserSettingsController } = await import('../src/client/form.ts')
const { bytesToUnitText, unitFor, unitTextToBytes } = await import('../src/client/size-units.ts')

test('download size: the largest exact unit is shown, and text converts back to the same byte count', () => {
  assert.equal(unitFor(104_857_600), 'MiB')
  assert.equal(unitFor(1_073_741_824), 'GiB')
  assert.equal(unitFor(1_048_577), 'B')
  assert.equal(unitFor(2_048), 'KiB')
  assert.equal(unitFor(undefined), 'MiB')
  assert.equal(bytesToUnitText(104_857_600, 'MiB'), '100')
  assert.equal(bytesToUnitText(1_610_612_736, 'GiB'), '1.5')
  assert.equal(unitTextToBytes('100', 'MiB'), 104_857_600)
  assert.equal(unitTextToBytes('1.5', 'GiB'), 1_610_612_736)
  assert.equal(unitTextToBytes('', 'MiB'), '')
  assert.equal(unitTextToBytes('0', 'MiB'), undefined)
  assert.equal(unitTextToBytes('abc', 'MiB'), undefined)
  assert.equal(unitTextToBytes('-3', 'MiB'), undefined)
})

function controller(value: Record<string, unknown> = {}, user: Record<string, unknown> = value) {
  const scope = fakeScope({ value, user })
  const form = new BrowserSettingsController(scope as never)
  return { scope, form, props: form.inject() }
}

test('a custom viewport without both sizes blocks the save and names the missing field; the size from the deployment counts', async () => {
  const { scope, form, props } = controller({ viewportMode: 'window' }, {})
  props.edit('viewportMode', 'custom')
  assert.equal(form.snapshot().invalid, true)
  assert.match(form.snapshot().problems.viewportWidth ?? '', /viewportWidth/)
  assert.match(form.snapshot().problems.viewportHeight ?? '', /viewportHeight/)
  await props.save()
  assert.equal(scope.writes.length, 0, 'nothing was written')
  props.edit('viewportWidth', '1280')
  assert.deepEqual(Object.keys(form.snapshot().problems), ['viewportHeight'])
  props.edit('viewportHeight', '720')
  assert.equal(form.snapshot().invalid, false)
  await props.save()
  assert.deepEqual(scope.writes[0]!.ops.map(op => [op.op, op.path[0], op.value]), [['set', 'viewportMode', 'custom'], ['set', 'viewportWidth', 1280], ['set', 'viewportHeight', 720]])
  // A deployed size is enough: a stored `custom` with the sizes already in the section is not a problem.
  const deployed = controller({ viewportMode: 'custom', viewportWidth: 800, viewportHeight: 600 })
  assert.deepEqual(deployed.form.snapshot().problems, {})
})

test('the unsaved count lists the fields a save would write, and goes back to zero on discard or when an edit is undone', () => {
  const { form, props } = controller({ headless: true, maxSessions: 8 }, {})
  assert.deepEqual(form.snapshot().changes, [])
  props.edit('headless', 'false')
  props.edit('maxSessions', '4')
  assert.deepEqual(form.snapshot().changes, ['maxSessions', 'headless'], 'in the card\'s field order')
  props.edit('headless', 'true')
  assert.deepEqual(form.snapshot().changes, ['maxSessions'], 'putting the stored value back is no change')
  props.discard()
  assert.deepEqual(form.snapshot().changes, [])
  // Resetting a stored override counts as a change; resetting an inherited value does not.
  const stored = controller({ headless: false }, { headless: false })
  stored.props.resetField('headless')
  assert.deepEqual(stored.form.snapshot().changes, ['headless'])
})

test('editing through a control replaces what was typed in the advanced text, which is printed again from the fields', () => {
  const { form, props } = controller({ maxSessions: 8 }, {})
  props.editProperties('maxSessions = 3\nthis is not a setting line')
  assert.equal(form.snapshot().properties.invalid, true)
  props.edit('headless', 'false')
  assert.equal(form.snapshot().properties.invalid, false, 'the broken text is gone')
  assert.match(form.snapshot().properties.text, /^maxSessions = 3$/m, 'the text keeps what the fields hold')
  assert.match(form.snapshot().properties.text, /^headless = false$/m)
})
