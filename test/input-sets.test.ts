import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { executeDraftInputSets } from '../src/automation-execution.ts'
import { runRecipe, type AnyRecipeStep } from '../src/automation.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { resolveConfig } from '../src/config.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'
const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-inputsets-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', maxModelDraftWritesPerSession: 20 })
  const store = new AutomationAssetStore(policy)
  return { directory, store, development: new AutomationDevelopmentService(store, policy) }
}

/** recipe() runs the real recipe over a scripted page chosen per call; `behaviorFor` sees the materialized steps. */
function serviceOver(behaviorFor: (steps: AnyRecipeStep[], call: number) => Behavior) {
  const calls: { isolated?: boolean; session?: string; url?: string }[] = []
  const service = {
    async recipe(steps: AnyRecipeStep[], opts: { signal?: AbortSignal; isolated?: boolean; session?: string; url?: string } & Record<string, unknown>) {
      calls.push({ isolated: opts.isolated, session: opts.session, url: opts.url })
      const run = await runRecipe(fakePage(behaviorFor(steps, calls.length)).page, steps, shot, opts.signal, opts as never)
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  return { service, calls }
}

const searchDraft = (store: AutomationAssetStore) => store.saveDraft({
  kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
  recipe: [{ type: 'fill', locator: { label: 'Query' }, value: '{{keyword}}' }, { type: 'click', locator: { role: 'button', name: 'Search' } }, { type: 'extract', locator: { css: '#results' }, as: 'items' }] as never,
  inputSchema: [{ name: 'keyword', type: 'string', required: true }], postconditions: [{ output: 'items', allowEmpty: true }],
})

/** The page answers with what was typed: the input drives the output. */
const echo = (steps: AnyRecipeStep[]): Behavior => ({ '#results': { innerText: () => 'found ' + (steps[0] as { value: string }).value } })

test('every input set runs in its own fresh context, all must pass, and the credential records each set by digest only', async () => {
  const { store } = fixture()
  const draft = searchDraft(store)
  const { service, calls } = serviceOver(echo)
  const result = await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'alpha' }, { keyword: 'beta' }], { session: 'session:a' })
  assert.equal(result.succeeded, true)
  assert.equal(result.sets.length, 2)
  assert.deepEqual(calls.map(call => call.isolated), [true, true], 'never the session page')
  assert.deepEqual(result.sets.map(entry => entry.produced), [[{ name: 'items', value: 'found alpha' }], [{ name: 'items', value: 'found beta' }]])
  assert.equal(result.suspect, false)
  assert.equal(result.asset.testStatus, 'passed')
  assert.match(result.asset.testMessage!, /2 input sets, each in a fresh context/)
  const credential = result.asset.testCredentials!.at(-1)!
  assert.equal(credential.passed, true)
  assert.equal(credential.plannedSets, 2)
  assert.equal(credential.inputSets!.length, 2)
  assert.notEqual(credential.inputSets![0]!.inputsDigest, credential.inputSets![1]!.inputsDigest)
  assert.notEqual(credential.inputSets![0]!.outputsDigest, credential.inputSets![1]!.outputsDigest)
  assert.equal(credential.warnings, undefined)
  assert.doesNotMatch(JSON.stringify(credential), /alpha|beta|found/, 'digests, never values')
  assert.equal(store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }).status, 'active')
})

test('one failing set fails the test, stops the rest, and leaves a failed credential', async () => {
  const { store } = fixture()
  const draft = searchDraft(store)
  const { service, calls } = serviceOver((steps, call) => call === 2 ? { '#results': { innerText: () => { throw Object.assign(new Error("Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('#results')"), { name: 'TimeoutError' }) } } } : echo(steps))
  const result = await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'alpha' }, { keyword: 'beta' }, { keyword: 'gamma' }], {})
  assert.equal(result.succeeded, false)
  assert.equal(calls.length, 2, 'the third set was not run')
  assert.equal(result.sets[1]!.passed, false)
  assert.equal(result.sets[1]!.execution.failedStep?.errorCode, 'LOCATOR_NOT_FOUND')
  const credential = result.asset.testCredentials!.at(-1)!
  assert.equal(credential.passed, false)
  assert.equal(credential.plannedSets, 3)
  assert.equal(credential.inputSets!.length, 2)
  assert.equal(result.asset.testStatus, 'failed')
  assert.match(result.asset.testMessage!, /Input set 2 of 3/)
  assert.throws(() => store.setStatus(draft.id, 'active', { expectedRevision: draft.revision }), /did not pass|must pass testing/)
})

test('identical outputs for different inputs pass with PARAMETERIZATION_SUSPECT, recorded on the credential', async () => {
  const { store } = fixture()
  const draft = searchDraft(store)
  const { service } = serviceOver(() => ({ '#results': { innerText: () => 'always the same' } }))
  const result = await executeDraftInputSets(service, store, draft.id, URL, [{ keyword: 'alpha' }, { keyword: 'beta' }, { keyword: 'gamma' }], {})
  assert.equal(result.succeeded, true, 'still passes')
  assert.equal(result.suspect, true)
  assert.deepEqual(result.identicalOutputs, [[0, 1], [0, 2], [1, 2]])
  assert.deepEqual(result.asset.testCredentials!.at(-1)!.warnings, ['PARAMETERIZATION_SUSPECT'])
  assert.match(result.asset.testMessage!, /PARAMETERIZATION_SUSPECT/)
})

test('input sets are validated before anything runs: count, types, duplicates, and the missing verifier', async () => {
  const { store } = fixture()
  const draft = searchDraft(store)
  const { service, calls } = serviceOver(echo)
  const run = (sets: unknown) => executeDraftInputSets(service, store, draft.id, URL, sets, {})
  await assert.rejects(run([{ keyword: 'a' }]), /2 to 5 input objects/)
  await assert.rejects(run(Array.from({ length: 6 }, (_, n) => ({ keyword: 'k' + n }))), /2 to 5/)
  await assert.rejects(run([{ keyword: 'a' }, { nope: 'b' }]), /undeclared automation inputs/)
  await assert.rejects(run([{ keyword: 'a' }, { keyword: 'a' }]), /must differ/)
  assert.equal(calls.length, 0, 'the browser was never touched')
  const noVerifier = store.saveDraft({ kind: 'recipe', schemaVersion: 2, name: 'Typed', domains: ['example.com'], recipe: [{ type: 'fill', locator: { label: 'Q' }, value: '{{k}}' }] as never, inputSchema: [{ name: 'k', type: 'string' }] })
  const reply = await executeDraftInputSets(service, store, noVerifier.id, URL, [{ k: 'a' }, { k: 'b' }], {})
  assert.equal(reply.succeeded, false)
  assert.match(reply.verifierMissing!.message, /no assert step and no postcondition/)
  assert.equal(reply.asset.testStatus, 'failed')
})

test('browser_call test with inputSets answers per set, with the suspect warning; inputs and inputSets together are refused', async () => {
  const { store, development } = fixture()
  const draft = searchDraft(store)
  const { service } = serviceOver(echo)
  const ctx = { service, config: resolveConfig({}), assets: store, development, session: 'session:a', sessionId: 'a', agent: undefined, signal: new AbortController().signal } as never
  const reply = await runAction('automation.develop', { action: 'test', id: draft.id, url: URL, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }] }, ctx, ENV)
  assert.equal(reply.ok, true, JSON.stringify(reply.error))
  const result = reply.result as Record<string, any>
  assert.equal(result.testStatus, 'passed')
  assert.equal(result.inputSets, 2)
  assert.deepEqual(result.sets.map((entry: any) => [entry.set, entry.passed, entry.outputs]), [[1, true, [{ name: 'items', value: 'found alpha' }]], [2, true, [{ name: 'items', value: 'found beta' }]]])
  assert.equal(result.warnings, undefined)
  assert.equal(result.completedSteps, undefined, 'steps are not repeated per set')
  const both = await runAction('automation.develop', { action: 'test', id: draft.id, url: URL, inputs: { keyword: 'a' }, inputSets: [{ keyword: 'a' }, { keyword: 'b' }] }, ctx, ENV)
  assert.equal(both.error?.code, 'INVALID_ARGS')
  const same = serviceOver(() => ({ '#results': { innerText: () => 'same' } }))
  const suspect = await runAction('automation.develop', { action: 'test', id: draft.id, url: URL, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }] }, { ...(ctx as object), service: same.service } as never, ENV)
  assert.equal(suspect.ok, true)
  assert.equal((suspect.result as any).warnings[0].code, 'PARAMETERIZATION_SUSPECT')
  assert.deepEqual((suspect.result as any).warnings[0].sets, [[1, 2]])
  // A single run keeps the old behaviour: the session page, one result, no sets.
  const single = await runAction('automation.develop', { action: 'test', id: draft.id, url: URL, inputs: { keyword: 'alpha' } }, ctx, ENV)
  assert.equal(single.ok, true)
  assert.equal((single.result as any).sets, undefined)
  assert.ok((single.result as any).completedSteps)
})
