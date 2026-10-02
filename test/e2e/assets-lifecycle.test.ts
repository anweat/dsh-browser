/**
 * The asset life cycle through the real tool layer and a real browser: save, test, activate with expectedRevision, run;
 * an untested edit cannot be activated; a failing repair draft leaves the active asset running, and activating a good
 * one replaces it. (Activation is the user's action, so it goes through the store, as the Host's RPC does.)
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ActivationRefusedError } from '../../src/automation-assets.ts'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:assets-lifecycle] SKIPPED: ${detection.reason}`)

describe('asset versions and activation protection in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const S = 'e2e-assets-lifecycle'
  const url = (page: string) => `${server.base}/${page}`

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection, { automationAssets: { maxModelDraftWritesPerSession: 30, modelDevelopmentEnabled: true } })
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  const search = (button = 'Search', extra: Record<string, unknown> = {}) => ({
    action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Search fixture', domains: ['127.0.0.1'],
    recipe: [
      { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
      { type: 'click', locator: { role: 'button', name: button }, ...button === 'Search' ? {} : { timeoutMs: 600 } },
      { type: 'extract', locator: { css: '#results' }, as: 'results' },
    ],
    inputSchema: [{ name: 'query', type: 'string', example: 'ap' }],
    outputSchema: [{ name: 'results', type: 'string' }],
    postconditions: [{ output: 'results', nonEmpty: true }],
    ...extra,
  })
  const refused = (id: string, expectedRevision: number | undefined, reason: string, message: RegExp) =>
    assert.throws(() => harness.assets.setStatus(id, 'active', { expectedRevision }), (error: unknown) => error instanceof ActivationRefusedError && error.reason === reason && message.test(error.message))

  it('save -> test -> activate with expectedRevision -> run goes end to end, and an edit after the test cannot be activated', async () => {
    const saved = await harness.result(S, 'automation.develop', search())
    const id = saved.assetId as string
    assert.equal(saved.result.revision, 1)
    refused(id, 1, 'not-tested', /pass testing/)

    const tested = await harness.action(S, 'automation.develop', { action: 'test', id, url: url('search.html'), inputs: { query: 'ap' } })
    assert.equal(tested.ok, true, JSON.stringify(tested))
    assert.equal(tested.result.testStatus, 'passed')
    assert.equal(tested.result.revision, 1)
    assert.match(tested.result.contentHash, /^[0-9a-f]{64}$/)
    const credential = harness.assets.get(id)!.testCredentials!.at(-1)!
    assert.deepEqual([credential.revision, credential.passed, credential.validationStatus, credential.evidenceLevel], [1, true, 'passed', 'verified'])
    assert.equal(credential.inputsDigest.length, 16, 'inputs are kept as a digest')

    // Activation names the revision; a request that names another is refused.
    refused(id, undefined, 'expected-revision-required', /expectedRevision/)
    refused(id, 2, 'revision-mismatch', /current revision 1/)
    assert.equal(harness.assets.setStatus(id, 'active', { expectedRevision: 1 }).status, 'active')

    const ran = await harness.action(S, 'automation.run', { id, url: url('search.html'), inputs: { query: 'ap' } })
    assert.equal(ran.ok, true, JSON.stringify(ran))
    assert.equal(ran.result.validationStatus, 'passed')
    assert.deepEqual(ran.result.outputs.map((output: any) => [output.name, output.value]), [['results', 'apple\napricot']])

    // A second asset: test it, then change it. The edit is a new revision with no passing test, so activation is refused.
    const second = (await harness.result(S, 'automation.develop', search('Search', { name: 'Edited after test' }))).assetId as string
    assert.equal((await harness.action(S, 'automation.develop', { action: 'test', id: second, url: url('search.html'), inputs: { query: 'ap' } })).ok, true)
    const edited = await harness.result(S, 'automation.develop', search('Search', { id: second, name: 'Edited after test', domains: ['127.0.0.1', 'localhost'] }))
    assert.equal(edited.result.revision, 2)
    assert.equal(edited.result.testStatus, 'untested')
    refused(second, 1, 'revision-mismatch', /current revision 2/)
    refused(second, 2, 'not-tested', /revision 2 has no test credential/)
    assert.equal(harness.assets.get(second)!.status, 'draft')
    // Once the new revision passes its own test it can be activated.
    assert.equal((await harness.action(S, 'automation.develop', { action: 'test', id: second, url: url('search.html'), inputs: { query: 'ap' } })).ok, true)
    assert.equal(harness.assets.setStatus(second, 'active', { expectedRevision: 2 }).status, 'active')
  })

  it('a repair draft whose test fails leaves the active asset running; activating a working one archives the source', async () => {
    const original = (await harness.result(S, 'automation.develop', search('Search', { name: 'Repair me' }))).assetId as string
    assert.equal((await harness.action(S, 'automation.develop', { action: 'test', id: original, url: url('search.html'), inputs: { query: 'ba' } })).ok, true)
    harness.assets.setStatus(original, 'active', { expectedRevision: 1 })

    const forked = await harness.result(S, 'automation.develop', { action: 'fork', id: original })
    const repair = forked.assetId as string
    assert.equal(forked.result.sourceAssetId, original)
    assert.equal(forked.result.sourceRevision, 1)

    // The page "changed": the repair attempt points at a button that does not exist. Its test fails; nothing else moves.
    await harness.result(S, 'automation.develop', search('Find', { id: repair, name: 'Repair me' }))
    const broken = await harness.action(S, 'automation.develop', { action: 'test', id: repair, url: url('search.html'), inputs: { query: 'ba' } })
    assert.equal(broken.ok, false)
    assert.ok(['LOCATOR_NOT_FOUND', 'DEADLINE', 'NOT_ACTIONABLE'].includes(broken.error.code), broken.error.code)
    assert.equal(harness.assets.get(repair)!.testStatus, 'failed')
    assert.equal(harness.assets.get(original)!.status, 'active')
    assert.equal(harness.assets.get(original)!.testStatus, 'passed')
    refused(repair, harness.assets.get(repair)!.revision, 'test-failed', /did not pass/)
    const stillRuns = await harness.action(S, 'automation.run', { id: original, url: url('search.html'), inputs: { query: 'ba' } })
    assert.equal(stillRuns.ok, true, JSON.stringify(stillRuns))
    assert.deepEqual(stillRuns.result.outputs.map((output: any) => output.value), ['banana'])

    // A working repair: test passes, activation swaps.
    const fixed = await harness.result(S, 'automation.develop', search('Search', { id: repair, name: 'Repair me', description: 'fixed locator' }))
    assert.equal((await harness.action(S, 'automation.develop', { action: 'test', id: repair, url: url('search.html'), inputs: { query: 'ba' } })).ok, true)
    harness.assets.setStatus(repair, 'active', { expectedRevision: fixed.result.revision })
    assert.equal(harness.assets.get(original)!.status, 'archived')
    assert.equal((await harness.action(S, 'automation.run', { id: original, url: url('search.html'), inputs: { query: 'ba' } })).ok, false, 'the archived source no longer runs')
    assert.equal((await harness.action(S, 'automation.run', { id: repair, url: url('search.html'), inputs: { query: 'ba' } })).ok, true)
  })

  it('a v2 test with nothing to verify is ok:false VALIDATION_MISSING in a real browser too', async () => {
    const draft = (await harness.result(S, 'automation.develop', {
      action: 'save', kind: 'recipe', schemaVersion: 2, name: 'No check', domains: ['127.0.0.1'],
      recipe: [{ type: 'fill', locator: { label: 'Query' }, value: 'x' }],
    })).assetId as string
    const tested = await harness.action(S, 'automation.develop', { action: 'test', id: draft, url: url('search.html') })
    assert.equal(tested.ok, false)
    assert.equal(tested.error.code, 'VALIDATION_MISSING')
    assert.equal(tested.result.testStatus, 'failed')
    assert.equal(tested.result.executionStatus, 'completed')
    refused(draft, 1, 'test-failed', /did not pass/)
  })
})
