/**
 * The three defects the seventh batch reproduced in the old asset UI, as tests of the plugin's own editor logic
 * against the real RPC handler and store:
 *   1. with unsaved edits, Test and Activate acted on the SAVED asset while the editor kept showing the edits;
 *   2. an asset with a passed test could be activated while the editor held unsaved edits;
 *   3. selecting another asset silently replaced the unsaved edits.
 * (test/e2e/assets-ui.test.ts drives the same scenarios through the real SettingsCard in Chromium.)
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { AutomationAssetsController } from '../src/client/automation-assets-client.ts'
import { credentialView, editableView, isDirty, parseEditor, serializeEditable, shortHash, stableJson } from '../src/client/asset-editor.ts'
import { rpcFixture, URL } from './rpc-fixture.ts'

const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })
const settle = () => new Promise(resolve => setTimeout(resolve, 5))

async function setup(behavior?: Parameters<typeof rpcFixture>[0]) {
  const fixture = rpcFixture(behavior)
  const controller = new AutomationAssetsController(fixture.rpc as unknown as ClientConnectionRpc)
  const api = controller.inject()
  await controller.refresh()
  const seed = async (name: string, extra: Record<string, unknown> = {}) => fixture.store.saveDraft({
    kind: 'recipe', name, domains: ['example.com'], recipe: [{ type: 'click', selector: `#${name}` }, { type: 'assert', text: 'Done' }], ...extra,
  } as never)
  const requestsOf = (endpoint: string) => fixture.requests.filter(request => request.endpoint === endpoint)
  return { ...fixture, controller, api, seed, requestsOf }
}

test('editor helpers: only editable fields are shown, formatting is not an edit, bad text says why', () => {
  const asset = { id: 'x', kind: 'recipe', status: 'draft', name: 'N', description: '', domains: ['example.com'], tags: [], inputNames: [], recipe: [{ type: 'click', selector: '#a' }], revision: 4, contentHash: 'abcdef0123456789', testStatus: 'passed', testCredentials: [], successCount: 1, failureCount: 0, createdAt: 'x', updatedAt: 'y' } as never
  assert.deepEqual(Object.keys(editableView(asset)).sort(), ['description', 'domains', 'inputNames', 'kind', 'name', 'recipe', 'tags'])
  const text = serializeEditable(asset)
  assert.equal(isDirty(text, text), false)
  assert.equal(isDirty(JSON.stringify(JSON.parse(text)), text), false, 'whitespace is not an edit')
  assert.equal(isDirty(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text)).reverse())), text), false, 'key order is not an edit')
  assert.equal(isDirty(text.replace('"N"', '"M"'), text), true)
  assert.equal(isDirty('{not json', text), true)
  assert.equal(stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}')
  assert.equal(parseEditor('{nope').ok, false)
  assert.equal(parseEditor('[]').ok, false)
  assert.match((parseEditor('{"kind":"x","name":"n"}') as { message: string }).message, /kind/)
  assert.match((parseEditor('{"kind":"recipe","name":" "}') as { message: string }).message, /name/)
  assert.equal(parseEditor(text).ok, true)
  assert.equal(shortHash('abcdef0123456789'), 'abcdef01')
  assert.equal(credentialView(asset).vouches, false)
})

test('defect 1: with unsaved edits, "save and test" saves them first and tests exactly that revision, so the credential vouches for what is on screen', async () => {
  const { controller, api, seed, requests, requestsOf, recipeRuns, store } = await setup()
  const saved = await seed('A')
  await controller.select(saved.id)
  const original = controller.snapshot().editor.text
  assert.equal(controller.dirty(), false)

  const edited = original.replace('#A', '#EDITED')
  api.editAutomationAsset(edited)
  api.setAssetTestUrl(URL)
  assert.equal(controller.dirty(), true)
  requests.length = 0
  await api.saveAndTestAutomationAsset()

  assert.deepEqual(requests.map(request => request.endpoint).filter(endpoint => ['save', 'test', 'status'].includes(endpoint)), ['save', 'test'], 'save first, then test, and never a status change')
  assert.equal(requestsOf('save')[0]!.payload.asset.id, saved.id)
  assert.equal(requestsOf('save')[0]!.payload.asset.recipe[0].selector, '#EDITED', 'the edits were sent')
  const testCall = requestsOf('test')[0]!.payload
  assert.equal(testCall.id, saved.id)
  assert.equal(testCall.expectedRevision, 2, 'the test names the revision the save produced')
  assert.equal(recipeRuns.at(-1)![0]!.type === 'click' && (recipeRuns.at(-1)![0] as { selector: string }).selector, '#EDITED', 'the replay ran the edited steps, not the saved ones')

  const state = controller.snapshot()
  assert.equal(state.selected!.revision, 2)
  assert.equal(state.selected!.testStatus, 'passed')
  assert.equal(controller.dirty(), false, 'after saving, the editor is clean')
  assert.equal(JSON.parse(state.editor.text).recipe[0].selector, '#EDITED', 'and still shows the edits')
  const view = credentialView(state.selected)
  assert.equal(view.vouches, true)
  assert.equal(view.current!.revision, 2)
  assert.equal(view.current!.contentHash, store.get(saved.id)!.contentHash)
  assert.equal(state.editor.notice, undefined)

  // Not dirty: the button just tests, no new revision.
  requests.length = 0
  await api.saveAndTestAutomationAsset()
  assert.equal(requestsOf('save').length, 0)
  assert.equal(requestsOf('test')[0]!.payload.expectedRevision, 2)
  assert.equal(controller.snapshot().selected!.revision, 2)
})

test('defect 2: activation is refused while the editor is dirty (no request), names the revision when it is sent, and a stale revision is refused by the backend', async () => {
  const { controller, api, seed, requests, requestsOf } = await setup()
  const saved = await seed('A')
  await controller.select(saved.id)
  api.setAssetTestUrl(URL)
  await api.saveAndTestAutomationAsset()
  assert.equal(credentialView(controller.snapshot().selected).vouches, true)

  api.editAutomationAsset(controller.snapshot().editor.text.replace('#A', '#B'))
  requests.length = 0
  await api.activateAutomationAsset()
  assert.equal(requestsOf('status').length, 0, 'nothing was sent')
  assert.equal(controller.snapshot().editor.notice?.kind, 'refused')
  assert.equal(controller.snapshot().selected!.status, 'draft')

  // Back to the saved text: clean again, so activation goes out, carrying the revision.
  api.editAutomationAsset(controller.snapshot().editor.baseline)
  assert.equal(controller.dirty(), false)
  await api.activateAutomationAsset()
  assert.deepEqual(requestsOf('status')[0]!.payload, { id: saved.id, status: 'active', expectedRevision: 1 })
  assert.equal(controller.snapshot().selected!.status, 'active')

  // Someone else saved a new revision after this editor loaded: the backend refuses the stale request.
  const other = await setup()
  const draft = await other.seed('S')
  await other.controller.select(draft.id)
  other.api.setAssetTestUrl(URL)
  await other.api.saveAndTestAutomationAsset()
  other.store.saveDraft({ id: draft.id, kind: 'recipe', name: 'S', domains: ['example.com'], recipe: [{ type: 'click', selector: '#elsewhere' }] } as never)
  await other.api.activateAutomationAsset()
  const notice = other.controller.snapshot().editor.notice!
  assert.equal(notice.kind, 'backend')
  assert.match(notice.message, /current revision 2/)
  assert.equal(other.controller.snapshot().selected!.status, 'draft')
})

test('defect 3: switching, creating, refreshing and forking with unsaved edits asks first and changes nothing until confirmed', async () => {
  const { controller, api, seed, requests, requestsOf } = await setup()
  const a = await seed('A')
  const b = await seed('B')
  await controller.select(a.id)
  const edited = controller.snapshot().editor.text.replace('#A', '#UNSAVED')
  api.editAutomationAsset(edited)
  requests.length = 0

  api.requestSelectAutomationAsset(b.id)
  await settle()
  assert.deepEqual(controller.snapshot().editor.confirm, { kind: 'select', id: b.id })
  assert.equal(controller.snapshot().editor.text, edited, 'the edits are still there')
  assert.equal(controller.snapshot().selected!.id, a.id)
  assert.equal(requestsOf('get').length, 0, 'the other asset was not even fetched')

  api.cancelLeaveAutomationAsset()
  assert.equal(controller.snapshot().editor.confirm, undefined)
  assert.equal(controller.snapshot().editor.text, edited)

  for (const request of [() => api.requestNewAutomationAsset('recipe'), () => api.requestRefreshAutomationAssets(), () => api.requestForkAutomationAsset(b.id)]) {
    request()
    await settle()
    assert.ok(controller.snapshot().editor.confirm, 'asked')
    assert.equal(controller.snapshot().editor.text, edited)
    api.cancelLeaveAutomationAsset()
  }
  assert.equal(requestsOf('get').length + requestsOf('fork').length + requestsOf('snapshot').length, 0, 'nothing was loaded or created while asking')

  api.requestSelectAutomationAsset(b.id)
  api.confirmLeaveAutomationAsset()
  await settle(); await settle()
  assert.equal(controller.snapshot().selected!.id, b.id)
  assert.match(controller.snapshot().editor.text, /#B/)
  assert.doesNotMatch(controller.snapshot().editor.text, /UNSAVED/)
  assert.equal(controller.dirty(), false)

  // Clean editor: no question.
  api.requestSelectAutomationAsset(a.id)
  await settle(); await settle()
  assert.equal(controller.snapshot().selected!.id, a.id)
  assert.equal(controller.snapshot().editor.confirm, undefined)

  // New: untouched template does not ask; after an edit it does; confirming starts the new draft.
  api.requestNewAutomationAsset('userscript')
  assert.equal(controller.snapshot().selected, undefined)
  assert.equal(controller.dirty(), false)
  api.requestNewAutomationAsset('recipe')
  assert.equal(JSON.parse(controller.snapshot().editor.text).kind, 'recipe', 'a fresh template is not "unsaved edits"')
  api.editAutomationAsset(controller.snapshot().editor.text.replace('New recipe', 'My recipe'))
  api.requestSelectAutomationAsset(a.id)
  assert.ok(controller.snapshot().editor.confirm)
  api.confirmLeaveAutomationAsset()
  await settle(); await settle()
  assert.equal(controller.snapshot().selected!.id, a.id)

  // Refresh confirmed discards the edits by reloading the saved asset.
  api.editAutomationAsset(controller.snapshot().editor.text.replace('#A', '#LOST'))
  api.requestRefreshAutomationAssets()
  api.confirmLeaveAutomationAsset()
  await settle(); await settle(); await settle()
  assert.doesNotMatch(controller.snapshot().editor.text, /LOST/)
})

test('a repair draft can be forked from an active asset from the editor, and the source stays active', async () => {
  const { controller, api, seed, store } = await setup()
  const a = await seed('A')
  await controller.select(a.id)
  api.setAssetTestUrl(URL)
  await api.saveAndTestAutomationAsset()
  await api.activateAutomationAsset()
  assert.equal(controller.snapshot().selected!.status, 'active')
  api.requestForkAutomationAsset(a.id)
  await settle(); await settle(); await settle()
  const repair = controller.snapshot().selected!
  assert.equal(repair.status, 'draft')
  assert.equal(repair.sourceAssetId, a.id)
  assert.equal(repair.sourceRevision, 1)
  assert.equal(store.get(a.id)!.status, 'active')
  assert.equal(controller.dirty(), false)
})

test('the three kinds of error are told apart: JSON problems send nothing, backend errors are backend, a failed business check is validation', async () => {
  const failing = await setup(() => ({ 'text=Done': { waitFor: () => { throw timeout(500) } } }))
  const a = await failing.seed('A')
  await failing.controller.select(a.id)

  // 1. JSON: nothing leaves the editor.
  failing.api.editAutomationAsset('{ "kind": "recipe", ')
  failing.api.setAssetTestUrl(URL)
  failing.requests.length = 0
  await failing.api.saveAndTestAutomationAsset()
  await failing.api.saveEditedAutomationAsset()
  assert.equal(failing.requests.length, 0)
  assert.equal(failing.controller.snapshot().editor.notice?.kind, 'json')
  failing.api.editAutomationAsset(failing.controller.snapshot().editor.baseline)
  failing.api.setAssetTestInputs('[1,2]')
  await failing.api.saveAndTestAutomationAsset()
  assert.equal(failing.controller.snapshot().editor.notice?.kind, 'json')
  assert.match(failing.controller.snapshot().editor.notice!.message, /test inputs/)
  failing.api.setAssetTestInputs('{}')
  failing.api.setAssetTestUrl('  ')
  await failing.api.saveAndTestAutomationAsset()
  assert.equal(failing.controller.snapshot().editor.notice?.kind, 'json')
  assert.equal(failing.requests.length, 0, 'still nothing sent')

  // 2. Business assertion failed (VALIDATION_FAILED): a replay happened, the credential shows it did not pass, the edits stay.
  failing.api.setAssetTestUrl(URL)
  failing.api.editAutomationAsset(failing.controller.snapshot().editor.baseline.replace('#A', '#KEPT'))
  await failing.api.saveAndTestAutomationAsset()
  const validation = failing.controller.snapshot()
  assert.equal(validation.editor.notice?.kind, 'validation')
  assert.equal(validation.editor.notice?.code, 'VALIDATION_FAILED')
  assert.equal(validation.selected!.testStatus, 'failed')
  assert.equal(credentialView(validation.selected).latest!.passed, false, 'the failed credential is on screen')
  assert.equal(credentialView(validation.selected).vouches, false)
  assert.match(validation.editor.text, /#KEPT/)
  assert.equal(failing.controller.dirty(), false, 'the save went through')
  failing.requests.length = 0
  await failing.api.activateAutomationAsset()
  assert.equal(failing.controller.snapshot().editor.notice?.kind, 'backend', 'activating without a passed test is the backend refusing')
  assert.match(failing.controller.snapshot().editor.notice!.message, /pass testing/)

  // 2b. Nothing verifies a v2 result: VALIDATION_MISSING is a validation notice too.
  const missing = await setup()
  const v2 = missing.store.saveDraft({ kind: 'recipe', schemaVersion: 2, name: 'V2', domains: ['example.com'], recipe: [{ type: 'click', locator: { role: 'button', name: 'Go' } }] } as never)
  await missing.controller.select(v2.id)
  missing.api.setAssetTestUrl(URL)
  await missing.api.saveAndTestAutomationAsset()
  assert.equal(missing.controller.snapshot().editor.notice?.kind, 'validation')
  assert.equal(missing.controller.snapshot().editor.notice?.code, 'VALIDATION_MISSING')

  // 3. Backend: a replay that cannot run its steps is neither of the above.
  const broken = await setup(() => ({ '#A': { click: () => { throw timeout(500) } } }))
  const b = await broken.seed('A', { recipe: [{ type: 'click', selector: '#A' }] })
  await broken.controller.select(b.id)
  broken.api.setAssetTestUrl(URL)
  await broken.api.saveAndTestAutomationAsset()
  assert.equal(broken.controller.snapshot().editor.notice?.kind, 'backend')
  assert.equal(broken.controller.snapshot().editor.notice?.code, 'LOCATOR_NOT_FOUND')
  // Whatever the outcome, the busy flag is released.
  assert.equal(broken.controller.snapshot().busy, false)
})

test('the plain client API keeps its shapes: test and status carry the revision only when given, validate never replaces edits', async () => {
  const { controller, api, seed, requestsOf } = await setup()
  const a = await seed('A')
  await controller.select(a.id)
  await api.testAutomationAsset(a.id, URL, {})
  assert.deepEqual(requestsOf('test')[0]!.payload, { id: a.id, url: URL, inputs: {} })
  await api.testAutomationAsset(a.id, URL, {}, 1)
  assert.deepEqual(requestsOf('test')[1]!.payload, { id: a.id, url: URL, inputs: {}, expectedRevision: 1 })
  api.editAutomationAsset(controller.snapshot().editor.text.replace('#A', '#TYPING'))
  await api.validateAutomationAsset(a.id)
  assert.match(controller.snapshot().editor.text, /#TYPING/, 'validating does not overwrite the edits')
  assert.equal(controller.dirty(), true)
})
