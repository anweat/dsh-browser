import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ActivationRefusedError, AutomationAssetStore, computeContentHash, digestInputs, resolveAutomationAssetPolicy,
  type AutomationAsset, type AutomationAssetPolicyInput,
} from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'
import { runRecipe, type AnyRecipeStep, type BrowserRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'
const timeout = (ms: number): Error => Object.assign(new Error(`Timeout ${ms}ms exceeded.\nCall log:\n  - waiting for locator('x')`), { name: 'TimeoutError' })

function fixture(overrides: AutomationAssetPolicyInput = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-versioning-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', ...overrides })
  const store = new AutomationAssetStore(policy)
  const reopen = () => new AutomationAssetStore(policy)
  return { directory, policy, store, reopen }
}

function serviceOver(behavior: Behavior = {}) {
  return {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      const { page } = fakePage(behavior)
      const run = await runRecipe(page, steps, shot, opts.signal, { legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, allowedDomains: opts.allowedDomains })
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
}

const recipe: BrowserRecipeStep[] = [{ type: 'click', selector: '#go' }, { type: 'assert', text: 'Results' }]
const draftInput = (extra: Partial<AutomationAsset> = {}) => ({ kind: 'recipe' as const, name: 'Search', domains: ['example.com'], recipe, ...extra })

async function tested(store: AutomationAssetStore, id: string, behavior: Behavior = {}) {
  return executeAutomationAsset(serviceOver(behavior), store, id, URL, {}, 'draft')
}

test('every save bumps the revision monotonically and recomputes the content hash', () => {
  const { store } = fixture()
  const first = store.saveDraft(draftInput())
  assert.equal(first.revision, 1)
  assert.match(first.contentHash!, /^[0-9a-f]{64}$/)
  const same = store.saveDraft({ ...draftInput(), id: first.id })
  assert.equal(same.revision, 2, 'saving identical content is still a new revision')
  assert.equal(same.contentHash, first.contentHash, 'same content, same hash')
  const edited = store.saveDraft({ ...draftInput({ recipe: [...recipe, { type: 'wait', condition: 'time', waitMs: 10 }] }), id: first.id })
  assert.equal(edited.revision, 3)
  assert.notEqual(edited.contentHash, first.contentHash)
  const revisions = [first, same, edited].map(entry => entry.revision)
  assert.deepEqual(revisions, [...revisions].sort((a, b) => a - b))
  assert.equal(store.get(first.id)!.revision, 3)
})

test('the content hash covers recipe, source, schema version, the three v2 contracts and domains, and nothing else', () => {
  const base: Parameters<typeof computeContentHash>[0] = { kind: 'recipe', recipe, domains: ['example.com'] }
  const hash = computeContentHash(base)
  assert.equal(computeContentHash({ ...base }), hash)
  assert.notEqual(computeContentHash({ ...base, recipe: [{ type: 'click', selector: '#other' }] }), hash, 'recipe')
  assert.notEqual(computeContentHash({ ...base, schemaVersion: 2 }), hash, 'schemaVersion (absent means 1, so 1 equals absent)')
  assert.equal(computeContentHash({ ...base, schemaVersion: 1 }), hash)
  assert.notEqual(computeContentHash({ ...base, inputSchema: [{ name: 'q', type: 'string', required: true }] }), hash, 'inputSchema')
  assert.notEqual(computeContentHash({ ...base, outputSchema: [{ name: 'rows', type: 'string' }] }), hash, 'outputSchema')
  assert.notEqual(computeContentHash({ ...base, postconditions: [{ text: 'x' }] }), hash, 'postconditions')
  assert.notEqual(computeContentHash({ ...base, domains: ['example.com', 'example.org'] }), hash, 'domains')
  assert.equal(computeContentHash({ ...base, domains: ['b.test', 'a.test'] }), computeContentHash({ ...base, domains: ['a.test', 'b.test'] }), 'domains are a set')
  const script: Parameters<typeof computeContentHash>[0] = { kind: 'userscript', source: 'return 1', domains: ['example.com'] }
  assert.notEqual(computeContentHash({ ...script, source: 'return 2' }), computeContentHash(script), 'source')
  // Key order inside a step must not matter.
  assert.equal(computeContentHash({ ...base, recipe: [{ selector: '#go', type: 'click' } as BrowserRecipeStep, recipe[1]!] }), hash)

  const { store } = fixture()
  const draft = store.saveDraft(draftInput({ description: 'a', tags: ['x'] }))
  const renamed = store.saveDraft({ ...draftInput({ description: 'b', tags: ['y'] }), id: draft.id, name: 'Renamed' })
  assert.equal(renamed.contentHash, draft.contentHash, 'name, description and tags are not content')
})

test('data written before B4 gets a hash and a legacy credential on load; no other field changes', () => {
  const { directory, policy } = fixture()
  const old = {
    version: 1, candidates: [],
    assets: [
      { id: 'passed-1', kind: 'recipe', status: 'active', name: 'Old passed', description: 'd', domains: ['example.com'], tags: ['t'], inputNames: [], recipe, revision: 4, testStatus: 'passed', testMessage: 'ok', successCount: 3, failureCount: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', lastRunAt: '2026-02-01T00:00:00.000Z' },
      { id: 'verified-1', kind: 'recipe', status: 'draft', name: 'Verified', description: '', domains: ['example.com'], tags: [], inputNames: [], recipe, revision: 2, testStatus: 'passed', evidenceLevel: 'verified', successCount: 0, failureCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
      { id: 'untested-1', kind: 'recipe', status: 'draft', name: 'Untested', description: '', domains: ['example.com'], tags: [], inputNames: [], recipe, revision: 1, testStatus: 'untested', successCount: 0, failureCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'failed-1', kind: 'recipe', status: 'draft', name: 'Failed', description: '', domains: ['example.com'], tags: [], inputNames: [], recipe, revision: 3, testStatus: 'failed', successCount: 0, failureCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  }
  fs.writeFileSync(path.join(directory, 'assets.json'), JSON.stringify(old))
  const store = new AutomationAssetStore(policy)

  for (const original of old.assets) {
    const loaded = store.get(original.id)!
    const { contentHash, testCredentials, ...rest } = loaded
    assert.deepEqual(rest, original, `${original.id}: every stored field survives untouched`)
    assert.equal(contentHash, computeContentHash(original as never))
    if (original.testStatus === 'passed') {
      assert.equal(testCredentials!.length, 1)
      const credential = testCredentials![0]!
      assert.equal(credential.legacy, true)
      assert.equal(credential.passed, true)
      assert.equal(credential.revision, original.revision, 'bound to the current revision')
      assert.equal(credential.contentHash, contentHash)
      assert.equal(credential.testedAt, original.updatedAt)
      assert.equal(credential.evidenceLevel, original.id === 'verified-1' ? 'verified' : 'legacy-unverified')
    } else assert.equal(testCredentials, undefined, `${original.id}: only a passed test becomes a credential`)
  }
  // The legacy credential is enough to activate the draft at its current revision, and nowhere else.
  assert.throws(() => store.setStatus('verified-1', 'active', { expectedRevision: 1 }), /current revision 2/)
  assert.equal(store.setStatus('verified-1', 'active', { expectedRevision: 2 }).status, 'active')
  assert.throws(() => store.setStatus('untested-1', 'active', { expectedRevision: 1 }), /pass testing/)
  // Loading twice (after the first write persisted the upgrade) adds nothing.
  const again = new AutomationAssetStore(policy)
  assert.equal(again.get('passed-1')!.testCredentials!.length, 1)
})

test('a test leaves a credential bound to the tested revision, with a digest of the inputs and never their values', async () => {
  const { store } = fixture()
  const draft = store.saveDraft({ kind: 'recipe', name: 'Q', domains: ['example.com'], recipe: [{ type: 'fill', selector: '#q', value: '{{query}}' }, { type: 'assert', text: 'Results' }] })
  await executeAutomationAsset(serviceOver(), store, draft.id, URL, { query: 'a very private query' }, 'draft')
  const asset = store.get(draft.id)!
  assert.equal(asset.testCredentials!.length, 1)
  const credential = asset.testCredentials![0]!
  assert.equal(credential.revision, draft.revision)
  assert.equal(credential.contentHash, asset.contentHash)
  assert.match(credential.inputSchemaHash, /^[0-9a-f]{64}$/)
  assert.equal(credential.schemaVersion, 1)
  assert.ok(Number.isFinite(Date.parse(credential.testedAt)))
  assert.equal(credential.inputsDigest, digestInputs({ query: 'a very private query' }))
  assert.notEqual(credential.inputsDigest, digestInputs({ query: 'other' }))
  assert.equal(credential.executionStatus, 'completed')
  assert.equal(credential.validationStatus, 'passed')
  assert.equal(credential.evidenceLevel, 'verified')
  assert.equal(credential.passed, true)
  assert.equal(JSON.stringify(credential).includes('private'), false)
  assert.equal(fs.readFileSync(path.join(store.policy.directory, 'assets.json'), 'utf8').includes('very private query'), false, 'the stored file never contains the test input')

  // A failing test is a credential too, and it is not passed.
  const failing = store.saveDraft({ ...draftInput(), id: draft.id })
  await tested(store, failing.id, { 'text=Results': { waitFor: () => { throw timeout(500) } } })
  const after = store.get(draft.id)!
  const last = after.testCredentials!.at(-1)!
  assert.equal(last.revision, failing.revision)
  assert.equal(last.passed, false)
  assert.equal(last.validationStatus, 'failed')
  assert.equal(after.testCredentials!.length, 2, 'the earlier credential stays as history')
})

test('each asset keeps only its most recent credentials (default 5, configurable)', async () => {
  const defaults = fixture()
  const draft = defaults.store.saveDraft(draftInput())
  for (let index = 0; index < 8; index += 1) await tested(defaults.store, draft.id)
  const kept = defaults.store.get(draft.id)!.testCredentials!
  assert.equal(kept.length, 5)
  assert.ok(kept.every(entry => entry.revision === draft.revision))

  const tight = fixture({ maxTestCredentials: 2 })
  const small = tight.store.saveDraft(draftInput())
  for (let index = 0; index < 4; index += 1) await tested(tight.store, small.id)
  assert.equal(tight.store.get(small.id)!.testCredentials!.length, 2)
  // Saving again carries the history over, still bounded.
  const resaved = tight.store.saveDraft({ ...draftInput(), id: small.id })
  assert.equal(resaved.testCredentials!.length, 2)
  assert.equal(resaved.testStatus, 'untested')
})

test('activation needs expectedRevision, and refuses a stale revision, a missing test, a failed latest test and changed content, each with its reason', async () => {
  const { store, directory, policy } = fixture()
  const refusal = (action: () => unknown, reason: string, message: RegExp) => {
    assert.throws(action, (error: unknown) => error instanceof ActivationRefusedError && error.reason === reason && message.test(error.message), `${reason}: ${message}`)
  }
  const draft = store.saveDraft(draftInput())

  refusal(() => store.setStatus(draft.id, 'active'), 'expected-revision-required', /expectedRevision/)
  refusal(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), 'not-tested', /pass testing.*revision 1 has no test credential/)

  await tested(store, draft.id)
  // The editor looked at revision 1; someone saved revision 2 meanwhile.
  const second = store.saveDraft({ ...draftInput({ recipe: [...recipe, { type: 'wait', condition: 'time', waitMs: 5 }] }), id: draft.id })
  refusal(() => store.setStatus(draft.id, 'active', { expectedRevision: 1 }), 'revision-mismatch', /expectedRevision 1 is not the current revision 2/)
  refusal(() => store.setStatus(draft.id, 'active', { expectedRevision: second.revision }), 'not-tested', /revision 2 has no test credential/)
  assert.equal(store.get(draft.id)!.status, 'draft', 'a refusal changes nothing')

  // A failing test of revision 2: its latest credential is not passed.
  await tested(store, draft.id, { 'text=Results': { waitFor: () => { throw timeout(500) } } })
  refusal(() => store.setStatus(draft.id, 'active', { expectedRevision: 2 }), 'test-failed', /latest test of revision 2 did not pass/)

  await tested(store, draft.id)
  // Tamper with the stored steps without changing the revision: the credential's hash no longer matches.
  const statePath = path.join(directory, 'assets.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.assets[0].recipe[0].selector = '#something-else'
  fs.writeFileSync(statePath, JSON.stringify(state))
  const tampered = new AutomationAssetStore(policy)
  refusal(() => tampered.setStatus(draft.id, 'active', { expectedRevision: 2 }), 'content-changed', /different content/)

  // Restore the content and the same credential works again.
  state.assets[0].recipe[0].selector = '#go'
  fs.writeFileSync(statePath, JSON.stringify(state))
  assert.equal(new AutomationAssetStore(policy).setStatus(draft.id, 'active', { expectedRevision: 2 }).status, 'active')
})

test('the older gates stay: at least one domain, and the active limit', async () => {
  const { store } = fixture({ maxActiveAssets: 1 })
  const noDomain = store.saveDraft({ kind: 'recipe', name: 'No domain', recipe })
  store.noteTestResult(noDomain.id, true, URL)
  assert.throws(() => store.setStatus(noDomain.id, 'active', { expectedRevision: 1 }), /at least one domain/)

  const first = store.saveDraft(draftInput({ name: 'First' }))
  const second = store.saveDraft(draftInput({ name: 'Second' }))
  for (const entry of [first, second]) store.noteTestResult(entry.id, true, URL)
  store.setStatus(first.id, 'active', { expectedRevision: 1 })
  assert.throws(() => store.setStatus(second.id, 'active', { expectedRevision: 1 }), /limit reached/)
})

test('a test that finishes after a newer save leaves a credential for the old revision and does not touch the new one', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(draftInput())
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const slow = {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      await gate
      const run = await runRecipe(fakePage({}).page, steps, shot, opts.signal, { legacy: true })
      return { url: URL, title: 'T', text: '', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  const running = executeAutomationAsset(slow, store, draft.id, URL, {}, 'draft')
  const edited = store.saveDraft({ ...draftInput({ recipe: [{ type: 'click', selector: '#different' }, ...recipe] }), id: draft.id })
  release()
  await running
  const after = store.get(draft.id)!
  assert.equal(after.revision, edited.revision)
  assert.equal(after.testStatus, 'untested', 'the new revision is not tested')
  assert.deepEqual(after.testCredentials!.map(entry => entry.revision), [draft.revision])
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: edited.revision }), /pass testing/)
})

test('a draft test can be pinned to the revision the caller saved', async () => {
  const { store } = fixture()
  const draft = store.saveDraft(draftInput())
  store.saveDraft({ ...draftInput(), id: draft.id })
  await assert.rejects(() => executeAutomationAsset(serviceOver(), store, draft.id, URL, {}, 'draft', { expectedRevision: draft.revision }), /revision mismatch/)
  assert.equal(store.get(draft.id)!.testCredentials, undefined, 'nothing ran, so no credential')
  assert.equal((await executeAutomationAsset(serviceOver(), store, draft.id, URL, {}, 'draft', { expectedRevision: 2 })).succeeded, true)
})

test('repair draft: fork records the source, the draft fails without touching the active asset, and activating it archives the source', async () => {
  const { store } = fixture()
  const original = store.saveDraft(draftInput({ name: 'Search issues', tags: ['issues'] }))
  await tested(store, original.id)
  store.setStatus(original.id, 'active', { expectedRevision: original.revision })
  assert.throws(() => store.saveDraft({ ...draftInput(), id: original.id }), /copied to a draft/)

  const repair = store.fork(original.id)
  assert.notEqual(repair.id, original.id)
  assert.equal(repair.status, 'draft')
  assert.equal(repair.sourceAssetId, original.id)
  assert.equal(repair.sourceRevision, original.revision)
  assert.equal(repair.revision, 1)
  assert.equal(repair.testStatus, 'untested')
  assert.equal(repair.testCredentials, undefined, 'the source\'s credentials do not transfer')
  assert.deepEqual(repair.recipe, original.recipe)
  assert.equal(repair.contentHash, store.get(original.id)!.contentHash)
  assert.throws(() => store.setStatus(repair.id, 'active', { expectedRevision: 1 }), /pass testing/)

  // The repair attempt breaks: the active asset is not affected and can still run.
  const broken = store.saveDraft({ ...draftInput({ recipe: [{ type: 'click', selector: '#moved' }, { type: 'assert', text: 'Results' }] }), id: repair.id })
  assert.equal(broken.sourceAssetId, original.id, 'saves keep the link')
  const failed = await tested(store, repair.id, { '#moved': { click: () => { throw timeout(500) } } })
  assert.equal(failed.succeeded, false)
  const untouched = store.get(original.id)!
  assert.equal(untouched.status, 'active')
  assert.equal(untouched.revision, original.revision)
  assert.equal(untouched.testStatus, 'passed')
  assert.equal(untouched.testCredentials!.length, 1)
  const run = await executeAutomationAsset(serviceOver(), store, original.id, URL, {}, 'active')
  assert.equal(run.succeeded, true)

  // A working repair: test passes, activation swaps them.
  const fixed = store.saveDraft({ ...draftInput({ recipe: [{ type: 'click', selector: '#new-go' }, { type: 'assert', text: 'Results' }] }), id: repair.id })
  assert.equal((await tested(store, repair.id)).succeeded, true)
  const activated = store.setStatus(repair.id, 'active', { expectedRevision: fixed.revision })
  assert.equal(activated.status, 'active')
  assert.equal(store.get(original.id)!.status, 'archived', 'replacement semantic: the source is archived in the same write')
  assert.equal(store.get(original.id)!.revision, original.revision, 'and not otherwise changed')
  assert.deepEqual(store.search('issues', 'example.com').map(entry => entry.id), [repair.id])
})

test('replacing an active asset does not count against the active limit, and an unrelated active asset is left alone', async () => {
  const { store } = fixture({ maxActiveAssets: 2 })
  const a = store.saveDraft(draftInput({ name: 'A' }))
  const b = store.saveDraft(draftInput({ name: 'B' }))
  for (const entry of [a, b]) { store.noteTestResult(entry.id, true, URL); store.setStatus(entry.id, 'active', { expectedRevision: 1 }) }
  const repair = store.fork(a.id)
  store.noteTestResult(repair.id, true, URL)
  assert.equal(store.setStatus(repair.id, 'active', { expectedRevision: 1 }).status, 'active', 'the source frees its slot')
  assert.equal(store.get(a.id)!.status, 'archived')
  assert.equal(store.get(b.id)!.status, 'active')
  const plain = store.saveDraft(draftInput({ name: 'C' }))
  store.noteTestResult(plain.id, true, URL)
  assert.throws(() => store.setStatus(plain.id, 'active', { expectedRevision: 1 }), /limit reached/)
})

test('fork goes through the draft limit, the persistence switch and the session write budget', () => {
  const { store } = fixture({ maxDrafts: 1 })
  const only = store.saveDraft(draftInput())
  assert.throws(() => store.fork(only.id), /draft limit/)
  assert.throws(() => store.fork('missing'), /not found/)

  const roomy = fixture({ maxModelDraftWritesPerSession: 1 })
  const source = roomy.store.saveDraft(draftInput())
  const development = new AutomationDevelopmentService(roomy.store, roomy.policy)
  assert.equal(development.fork(source.id, 'session').sourceAssetId, source.id)
  assert.throws(() => development.fork(source.id, 'session'), /write limit/)
})
