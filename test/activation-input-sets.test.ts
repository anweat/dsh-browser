import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ActivationRefusedError, AutomationAssetStore, resolveAutomationAssetPolicy, type AutomationAssetPolicyInput } from '../src/automation-assets.ts'
import { inputSetsCovered } from '../src/activation-rules.ts'
import { executeAutomationAsset, executeDraftInputSets } from '../src/automation-execution.ts'
import { runRecipe, type AnyRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'

function fixture(policy: AutomationAssetPolicyInput = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-activation-'))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', ...policy }))
  const service = {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      const behavior: Behavior = { '#results': { innerText: () => 'found ' + (steps[0] as { value: string }).value } }
      const run = await runRecipe(fakePage(behavior).page, steps, shot, opts.signal, opts as never)
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  return { directory, store, service }
}

const withInput = (store: AutomationAssetStore) => store.saveDraft({
  kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
  recipe: [{ type: 'fill', locator: { label: 'Query' }, value: '{{keyword}}' }, { type: 'click', locator: { role: 'button', name: 'Search' } }, { type: 'extract', locator: { css: '#results' }, as: 'items' }] as never,
  inputSchema: [{ name: 'keyword', type: 'string', required: true }], postconditions: [{ output: 'items', allowEmpty: true }],
})
const withoutInput = (store: AutomationAssetStore) => store.saveDraft({
  kind: 'recipe', schemaVersion: 2, name: 'Fixed page', domains: ['example.com'],
  recipe: [{ type: 'click', locator: { role: 'button', name: 'Go' } }, { type: 'extract', locator: { css: '#results' }, as: 'items' }] as never,
  postconditions: [{ output: 'items', allowEmpty: true }],
})

test('minInputSetsForActivation: default 2, bounded to 1-5, other values fall back or clamp', () => {
  const resolve = (value: unknown) => resolveAutomationAssetPolicy({ minInputSetsForActivation: value as never }).minInputSetsForActivation
  assert.equal(resolveAutomationAssetPolicy().minInputSetsForActivation, 2)
  assert.deepEqual([resolve(1), resolve(3), resolve(5), resolve(0), resolve(9), resolve(-4), resolve('x'), resolve(2.5), resolve(undefined)], [1, 3, 5, 1, 5, 1, 2, 2, 2])
})

test('an asset with inputs needs a passing test covering min input sets: one run is refused with the reason, two sets activate', async () => {
  const { store, service } = fixture()
  const draft = withInput(store)
  await executeAutomationAsset(service, store, draft.id, URL, { keyword: 'alpha' }, 'draft', { expectedRevision: 1 })
  assert.equal(store.get(draft.id)!.testStatus, 'passed')
  let refusal: unknown
  try { store.setStatus(draft.id, 'active', { expectedRevision: 1 }) } catch (error) { refusal = error }
  assert.ok(refusal instanceof ActivationRefusedError)
  assert.equal((refusal as ActivationRefusedError).reason, 'insufficient-input-sets')
  assert.match((refusal as Error).message, /at least 2 different input sets/)
  assert.match((refusal as Error).message, /covered 1\b/)
  assert.match((refusal as Error).message, /minInputSetsForActivation/)
  assert.equal(store.get(draft.id)!.status, 'draft')

  const replay = await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'alpha' }, { keyword: 'beta' }], { expectedRevision: 1 })
  assert.equal(replay.succeeded, true)
  assert.equal(store.setStatus(draft.id, 'active', { expectedRevision: 1 }).status, 'active')
})

test('an asset without inputs is not affected, and a policy of 1 accepts a single run for one with inputs', async () => {
  const strict = fixture()
  const plain = withoutInput(strict.store)
  await executeAutomationAsset(strict.service, strict.store, plain.id, URL, {}, 'draft', { expectedRevision: 1 })
  assert.equal(strict.store.setStatus(plain.id, 'active', { expectedRevision: 1 }).status, 'active')

  const relaxed = fixture({ minInputSetsForActivation: 1 })
  const draft = withInput(relaxed.store)
  await executeAutomationAsset(relaxed.service, relaxed.store, draft.id, URL, { keyword: 'alpha' }, 'draft', { expectedRevision: 1 })
  assert.equal(relaxed.store.setStatus(draft.id, 'active', { expectedRevision: 1 }).status, 'active')
})

test('a higher requirement counts the sets that passed: 2 of a required 3 is refused, 3 activates', async () => {
  const { store, service } = fixture({ minInputSetsForActivation: 3 })
  const draft = withInput(store)
  await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'a' }, { keyword: 'b' }], { expectedRevision: 1 })
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: 1 }), (error: unknown) => error instanceof ActivationRefusedError && error.reason === 'insufficient-input-sets' && /covered 2\b/.test(error.message))
  await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'a' }, { keyword: 'b' }, { keyword: 'c' }], { expectedRevision: 1 })
  assert.equal(store.setStatus(draft.id, 'active', { expectedRevision: 1 }).status, 'active')
})

test('a legacy credential counts as enough, so data from before input sets can still be activated after the upgrade', () => {
  const { directory } = fixture()
  const id = 'aaaaaaaa-0000-4000-8000-000000000001'
  const now = new Date().toISOString()
  fs.mkdirSync(directory, { recursive: true })
  // Written the way pre-B4 stored it: a passed testStatus and no credentials at all, with a declared input.
  fs.writeFileSync(path.join(directory, 'assets.json'), JSON.stringify({
    version: 1, candidates: [], assets: [{
      id, kind: 'recipe', status: 'draft', name: 'Old search', description: '', domains: ['example.com'], tags: [], inputNames: ['keyword'],
      recipe: [{ type: 'fill', selector: '#q', value: '{{keyword}}' }, { type: 'assert', text: 'Results' }],
      revision: 1, testStatus: 'passed', successCount: 0, failureCount: 0, createdAt: now, updatedAt: now,
    }],
  }))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  const credential = store.get(id)!.testCredentials!.at(-1)!
  assert.equal(credential.legacy, true)
  assert.equal(inputSetsCovered(credential), Number.POSITIVE_INFINITY)
  assert.equal(store.setStatus(id, 'active', { expectedRevision: 1 }).status, 'active')
})

test('the snapshot the panel reads carries the policy value, so it can say what activation needs', () => {
  const { store } = fixture({ minInputSetsForActivation: 4 })
  assert.equal(store.snapshot().policy.minInputSetsForActivation, 4)
})
