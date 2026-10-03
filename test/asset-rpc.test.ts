import assert from 'node:assert/strict'
import test from 'node:test'
import { rpcFixture, URL } from './rpc-fixture.ts'

const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

const verified = [{ type: 'click', selector: '#go' }, { type: 'assert', text: 'Results' }]
const save = (call: ReturnType<typeof rpcFixture>['call'], extra: Record<string, unknown> = {}) =>
  call('save', { asset: { kind: 'recipe', name: 'Search', domains: ['example.com'], recipe: verified, ...extra } })

test('rpc: activate carries expectedRevision; a missing or stale one is refused with its reason, and the happy path activates', async () => {
  const { call, store } = rpcFixture()
  const saved = (await save(call)).value
  assert.equal(saved.revision, 1)
  const noRevision = await call('status', { id: saved.id, status: 'active' })
  assert.equal(noRevision.ok, false)
  assert.equal(noRevision.error!.details.reason, 'expected-revision-required')
  assert.equal((await call('status', { id: saved.id, status: 'active', expectedRevision: 1 })).error!.details.reason, 'not-tested')

  const tested = await call('test', { id: saved.id, url: URL, inputs: {}, expectedRevision: 1 })
  assert.equal(tested.ok, true)
  assert.equal(tested.value.testCredentials.length, 1)

  const edited = (await save(call, { id: saved.id, name: 'Search v2' })).value
  assert.equal(edited.revision, 2)
  const stale = await call('status', { id: saved.id, status: 'active', expectedRevision: 1 })
  assert.equal(stale.error!.details.reason, 'revision-mismatch')
  assert.match(stale.error!.message, /current revision 2/)
  assert.equal((await call('status', { id: saved.id, status: 'active', expectedRevision: 2 })).error!.details.reason, 'not-tested')
  assert.equal((await call('status', { id: saved.id, status: 'active', expectedRevision: 'two' })).ok, false)
  assert.equal(store.get(saved.id)!.status, 'draft')

  assert.equal((await call('test', { id: saved.id, url: URL, inputs: {}, expectedRevision: 2 })).ok, true)
  const done = await call('status', { id: saved.id, status: 'active', expectedRevision: 2 })
  assert.equal(done.ok, true)
  assert.equal(done.value.status, 'active')
  // Archiving needs no revision.
  assert.equal((await call('status', { id: saved.id, status: 'archived' })).value.status, 'archived')
})

test('rpc: a test pinned to a stale revision does not run', async () => {
  const { call } = rpcFixture()
  const saved = (await save(call)).value
  await save(call, { id: saved.id })
  const refused = await call('test', { id: saved.id, url: URL, inputs: {}, expectedRevision: 1 })
  assert.equal(refused.ok, false)
  assert.match(refused.error!.message, /revision mismatch/)
})

test('rpc: a failed assertion comes back as VALIDATION_FAILED, a v2 recipe with nothing to verify as VALIDATION_MISSING, other failures by their own code', async () => {
  const failing = rpcFixture(() => ({ 'text=Results': { waitFor: () => { throw timeout(500) } } }))
  const saved = (await save(failing.call)).value
  const failed = await failing.call('test', { id: saved.id, url: URL, inputs: {} })
  assert.equal(failed.ok, false)
  assert.equal(failed.error!.details.errorCode, 'VALIDATION_FAILED')
  assert.equal(failed.error!.details.validationStatus, 'failed')
  // The failed credential is stored even though the call failed.
  assert.equal((await failing.call('get', { id: saved.id })).value.testCredentials.at(-1).passed, false)

  const missing = rpcFixture()
  const v2 = (await save(missing.call, { schemaVersion: 2, recipe: [{ type: 'click', locator: { role: 'button', name: 'Go' } }] })).value
  const none = await missing.call('test', { id: v2.id, url: URL, inputs: {} })
  assert.equal(none.ok, false)
  assert.equal(none.error!.details.errorCode, 'VALIDATION_MISSING')
  assert.match(none.error!.message, /no assert step and no postcondition/)

  const broken = rpcFixture(() => ({ '#go': { click: () => { throw timeout(500) } } }))
  const plain = (await save(broken.call, { recipe: [{ type: 'click', selector: '#go' }] })).value
  const other = await broken.call('test', { id: plain.id, url: URL, inputs: {} })
  assert.equal(other.ok, false)
  assert.equal(other.error!.details.errorCode, 'LOCATOR_NOT_FOUND')
})

test('rpc: fork makes a repair draft of an active asset and the snapshot shows both', async () => {
  const { call } = rpcFixture()
  const saved = (await save(call)).value
  await call('test', { id: saved.id, url: URL, inputs: {} })
  await call('status', { id: saved.id, status: 'active', expectedRevision: 1 })
  const repair = await call('fork', { id: saved.id })
  assert.equal(repair.ok, true)
  assert.equal(repair.value.sourceAssetId, saved.id)
  assert.equal(repair.value.sourceRevision, 1)
  assert.equal(repair.value.status, 'draft')
  const snapshot = (await call('snapshot')).value
  assert.deepEqual(snapshot.assets.map((entry: any) => entry.status).sort(), ['active', 'draft'])
  assert.equal((await call('fork', { id: 'missing' })).ok, false)
})

// --- test with several input sets, and convert ---------------------------------------------------------------

const searchV2 = (extra: Record<string, unknown> = {}) => ({
  kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
  recipe: [{ type: 'fill', locator: { label: 'Query' }, value: '{{keyword}}' }, { type: 'extract', locator: { css: '#results' }, as: 'items' }],
  inputSchema: [{ name: 'keyword', type: 'string', required: true }], postconditions: [{ output: 'items', allowEmpty: true }],
  ...extra,
})

test('rpc: test with inputSets runs every set in a fresh context, leaves one credential with each set, and satisfies the activation rule', async () => {
  let filled = ''
  const { call, recipeOptions } = rpcFixture(() => ({ '#results': { innerText: () => 'found ' + filled }, 'label=Query': { fill: (value: string) => { filled = value } } }))
  const saved = (await call('save', { asset: searchV2() })).value
  // A single run passes its test but does not meet the default requirement of two input sets.
  assert.equal((await call('test', { id: saved.id, url: URL, inputs: { keyword: 'alpha' }, expectedRevision: 1 })).ok, true)
  const refused = await call('status', { id: saved.id, status: 'active', expectedRevision: 1 })
  assert.equal(refused.ok, false)
  assert.equal(refused.error!.details.reason, 'insufficient-input-sets')
  assert.match(refused.error!.message, /at least 2 different input sets/)

  const tested = await call('test', { id: saved.id, url: URL, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }], expectedRevision: 1 })
  assert.equal(tested.ok, true)
  assert.deepEqual(recipeOptions.slice(-2).map(entry => entry.isolated), [true, true], 'each set in a fresh context, never the session page')
  assert.equal(recipeOptions[0]!.isolated, undefined, 'a plain single run is not isolated')
  const credential = tested.value.testCredentials.at(-1)
  assert.equal(credential.passed, true)
  assert.equal(credential.inputSets.length, 2)
  assert.deepEqual(credential.inputSets.map((entry: any) => entry.passed), [true, true])
  assert.equal(credential.warnings, undefined, 'different inputs gave different outputs')
  assert.equal((await call('status', { id: saved.id, status: 'active', expectedRevision: 1 })).value.status, 'active')
})

test('rpc: identical outputs for different inputs pass with PARAMETERIZATION_SUSPECT on the credential', async () => {
  const { call } = rpcFixture(() => ({ '#results': { innerText: () => 'always the same' } }))
  const saved = (await call('save', { asset: searchV2() })).value
  const tested = await call('test', { id: saved.id, url: URL, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }] })
  assert.equal(tested.ok, true)
  const credential = tested.value.testCredentials.at(-1)
  assert.deepEqual(credential.warnings, ['PARAMETERIZATION_SUSPECT'])
  assert.equal(credential.inputSets[0].outputsDigest, credential.inputSets[1].outputsDigest)
})

test('rpc: a failing set fails the test with its number, keeps the credential of the sets that ran, and bad requests are refused up front', async () => {
  let runs = 0
  const { call, recipeRuns } = rpcFixture(() => { runs += 1; return runs === 2 ? { '#results': { waitFor: () => { throw timeout(300) }, innerText: () => { throw timeout(300) } } } : {} })
  const saved = (await call('save', { asset: searchV2() })).value
  const failed = await call('test', { id: saved.id, url: URL, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }, { keyword: 'gamma' }] })
  assert.equal(failed.ok, false)
  assert.equal(failed.error!.details.failedSet, 2)
  assert.equal(failed.error!.details.setsRun, 2)
  assert.equal(failed.error!.details.inputSets, 3)
  assert.match(failed.error!.message, /Input set 2 of 3 did not pass/)
  assert.equal(recipeRuns.length, 2, 'the third set never ran')
  const stored = (await call('get', { id: saved.id })).value
  assert.equal(stored.testStatus, 'failed')
  assert.deepEqual(stored.testCredentials.at(-1).inputSets.map((entry: any) => entry.passed), [true, false])

  const before = recipeRuns.length
  for (const bad of [[{ keyword: 'a' }], Array.from({ length: 6 }, (_, index) => ({ keyword: 'k' + index })), [{ keyword: 'a' }, { keyword: 'a' }], 'nope']) {
    const refused = await call('test', { id: saved.id, url: URL, inputSets: bad })
    assert.equal(refused.ok, false)
  }
  assert.equal((await call('test', { id: saved.id, url: URL, inputSets: [{ keyword: 'a' }, { keyword: 'b' }], inputs: { keyword: 'c' } })).ok, false, 'inputs and inputSets together')
  assert.equal(recipeRuns.length, before, 'no bad request ran anything')
})

test('rpc: convert makes a NEW v2 draft from a v1 asset, reports the steps still taking the first match, and leaves the source alone', async () => {
  const { call, store } = rpcFixture()
  const v1 = (await call('save', { asset: { kind: 'recipe', name: 'Old', domains: ['example.com'], inputNames: ['q'], recipe: [{ type: 'fill', selector: '#q', value: '{{q}}' }, { type: 'click', selector: '#go' }, { type: 'assert', text: 'Results' }] } })).value
  const converted = await call('convert', { id: v1.id })
  assert.equal(converted.ok, true)
  const { draft, pendingDisambiguation, notes } = converted.value
  assert.notEqual(draft.id, v1.id)
  assert.equal(draft.schemaVersion, 2)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.sourceAssetId, v1.id)
  assert.equal(draft.sourceRevision, v1.revision)
  assert.equal(pendingDisambiguation.length, 2, 'the fill and the click; the assert has no selector')
  assert.equal(draft.pendingDisambiguation.length, 2, 'the draft carries the list too, so the panel can show it any time')
  assert.ok(notes.length > 0)
  assert.equal(store.get(v1.id)!.revision, v1.revision)
  assert.equal(store.get(v1.id)!.schemaVersion, undefined)
  // A v2 asset, a userscript and an unknown id are refused with the reason.
  assert.match((await call('convert', { id: draft.id })).error!.message, /already schema v2/)
  const script = (await call('save', { asset: { kind: 'userscript', name: 'U', domains: ['example.com'], source: '// ==UserScript==\n// @name U\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn 1' } })).value
  assert.match((await call('convert', { id: script.id })).error!.message, /only recipe assets/)
  assert.equal((await call('convert', { id: 'missing' })).ok, false)
})
