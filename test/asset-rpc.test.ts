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
