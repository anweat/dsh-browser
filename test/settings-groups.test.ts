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

const { domainProblem, idProblem, isPrivateName, parseProfiles, profilePathFor, validAuthProfiles } = await import('../src/client/auth-profiles-form.ts')

test('login profile names and domains: the rules of the dialog', () => {
  assert.equal(idProblem('work-portal', []), undefined)
  assert.equal(idProblem('', []), 'authIdInvalid')
  assert.equal(idProblem('-lead', []), 'authIdInvalid')
  assert.equal(idProblem('a'.repeat(41), []), 'authIdInvalid')
  assert.equal(idProblem('has space', []), 'authIdInvalid')
  assert.equal(idProblem('constructor', []), 'authIdInvalid')
  assert.equal(idProblem('fx', ['fx']), 'authIdExists')
  for (const ok of ['example.com', '*.example.com', 'sub.example.co.uk', 'localhost', '127.0.0.1', 'xn--bcher-kva.example']) assert.equal(domainProblem(ok), undefined, ok)
  for (const bad of ['', 'https://example.com', 'example.com/path', 'example.com:8080', 'two words', '-bad.com', 'a..b', 'user@example.com']) assert.equal(domainProblem(bad), 'authDomainInvalid', bad)
  assert.equal(isPrivateName('localhost'), true)
  assert.equal(isPrivateName('*.corp'), true)
  assert.equal(isPrivateName('10.0.0.5'), true)
  assert.equal(isPrivateName('example.com'), false)
  assert.equal(profilePathFor('/home/u/auth/', 'fx'), '/home/u/auth/fx.json')
  assert.equal(profilePathFor('C:\\dsh\\auth', 'fx'), 'C:\\dsh\\auth\\fx.json')
  assert.deepEqual(parseProfiles('{"a":{"storageStatePath":"/p","allowedDomains":["x.com",3],"persistState":true},"b":5}'), { a: { storageStatePath: '/p', allowedDomains: ['x.com'], persistState: true } })
  assert.deepEqual(parseProfiles('not json'), {})
  assert.equal(validAuthProfiles({ a: { storageStatePath: '/p', allowedDomains: ['x.com'], persistState: false } }), true)
  assert.equal(validAuthProfiles({ a: { storageStatePath: '', allowedDomains: [] } }), false, 'a profile needs a state file')
  assert.equal(validAuthProfiles({ a: { storageStatePath: '/p', allowedDomains: [''] } }), false)
  assert.equal(validAuthProfiles({ a: { storageStatePath: '/p', persistState: 'yes' } }), false)
})

test('login profiles: adding, editing and removing stage one authProfiles write, and undoing the edit leaves the form clean', async () => {
  const stored = { fx: { storageStatePath: '/auth/fx.json', allowedDomains: ['alt.localhost'], persistState: false } }
  const { scope, form, props } = controller({ authProfiles: stored }, { authProfiles: stored })
  assert.deepEqual(form.snapshot().changes, [])
  props.saveAuthProfile('work', { storageStatePath: '/auth/work.json', allowedDomains: ['example.com', '*.corp.example.com'], persistState: true })
  assert.deepEqual(form.snapshot().changes, ['authProfiles'])
  assert.deepEqual(Object.keys(parseProfiles(form.snapshot().jsonFields.authProfiles!.text)).sort(), ['fx', 'work'])
  props.removeAuthProfile('work')
  assert.deepEqual(form.snapshot().changes, [], 'removing what was just added is no change')
  props.saveAuthProfile('fx', { storageStatePath: '/auth/fx.json', allowedDomains: ['alt.localhost', 'b.localhost'], persistState: true })
  props.saveAuthProfile('work', { storageStatePath: '/auth/work.json', allowedDomains: ['example.com'], persistState: false })
  await props.save()
  const write = scope.writes[0]!.ops
  assert.equal(write.length, 1)
  assert.equal(write[0]!.op, 'set')
  assert.equal(write[0]!.path[0], 'authProfiles')
  assert.deepEqual(write[0]!.value, {
    fx: { storageStatePath: '/auth/fx.json', allowedDomains: ['alt.localhost', 'b.localhost'], persistState: true },
    work: { storageStatePath: '/auth/work.json', allowedDomains: ['example.com'], persistState: false },
  })
  // Removing every profile writes an empty map (clearing would let the deployed ones come back).
  props.removeAuthProfile('fx'); props.removeAuthProfile('work')
  await props.save()
  assert.deepEqual(scope.writes[1]!.ops[0]!.value, {})
})

test('login profiles: a hand-typed authProfiles text that is not a map of well-formed profiles blocks the save', () => {
  const { form, props } = controller({}, {})
  props.edit('authProfiles', '{"x":{"storageStatePath":"","allowedDomains":[]}}')
  assert.equal(form.snapshot().invalid, true)
  props.edit('authProfiles', '{"x":{"storageStatePath":"/p","allowedDomains":["a.com"]}}')
  assert.equal(form.snapshot().invalid, false)
})
