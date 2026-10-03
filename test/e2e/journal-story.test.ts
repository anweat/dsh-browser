/**
 * B6 in a real Chromium: the acceptance story "search a site by keyword and return de-duplicated results".
 * Explore through browser_call, draft from the journal, replay with two input sets in fresh contexts,
 * activate, then run the asset from a new session with another keyword. Also: failed steps left out,
 * unmapped actions visible, a legitimate empty result vs an extraction failure, PARAMETERIZATION_SUSPECT,
 * and no sensitive value in the journal or the draft. The calls and output bytes of the two paths are printed.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:journal-story] SKIPPED: ${detection.reason}`)

describe('exploration journal to draft to independent replay in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const page = (query = '') => `${server.base}/keyword-search.html${query}`
  const SECRET = 'hunter2-top-secret'

  /** Tool output the model would read: the envelope as JSON, in bytes. */
  const usage = { calls: 0, bytes: 0 }
  const counted = async (meter: { calls: number; bytes: number }, session: string, action: string, args: Record<string, unknown> = {}): Promise<any> => {
    const envelope = await harness.action(session, action, args)
    meter.calls += 1
    meter.bytes += Buffer.byteLength(JSON.stringify(envelope))
    return envelope
  }
  const explore = { calls: 0, bytes: 0 }
  const reuse = { calls: 0, bytes: 0 }
  let assetId = ''

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection, { automationAssets: { maxModelDraftWritesPerSession: 20, modelDevelopmentEnabled: true } })
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  it('explore -> draft_from_journal -> two input sets in fresh contexts -> activate with expectedRevision', async () => {
    const S = 'e2e-b6-explore'
    const call = (action: string, args: Record<string, unknown> = {}) => counted(explore, S, action, args)
    const open = await call('target.open', { url: page() })
    assert.equal(open.ok, true)
    assert.equal(open.seq, 1)
    const controls = await call('observe.read', { sections: ['controls'] })
    assert.equal(controls.ok, true)
    const fill = await call('act.fill', { locator: { label: 'Query' }, text: 'alpha' })
    assert.equal(fill.ok, true)
    const click = await call('act.click', { locator: { role: 'button', name: 'Search' } })
    assert.equal(click.ok, true)
    const miss = await call('act.click', { locator: { role: 'button', name: 'Export' }, timeoutMs: 1000 })
    assert.equal(miss.ok, false)
    assert.equal(miss.error.code, 'LOCATOR_NOT_FOUND')
    const wait = await call('act.wait', { locator: { selector: '#status.done' } })
    assert.equal(wait.ok, true)
    const read = await call('observe.read', { locator: { selector: '#results' } })
    assert.equal(read.ok, true)
    assert.match(read.result.text, /Alpha guide\nAlpha handbook\nAlpha guide/, 'the page really shows duplicates')
    assert.deepEqual([open, controls, fill, click, miss, wait, read].map(reply => reply.seq), [1, 2, 3, 4, 5, 6, 7])

    // The journal: every call, generations around the click, typed text only as a reference.
    const journal = harness.service.journalFor('session:' + S).entries()
    assert.equal(journal.length, 7)
    assert.deepEqual(journal[2]!.params, { text: { ref: 'v3', length: 5 } })
    assert.deepEqual(journal[2]!.locator, { label: 'Query' })
    assert.equal(journal[2]!.generationBefore, journal[2]!.generationAfter)
    assert.equal(journal[4]!.outcome.errorCode, 'LOCATOR_NOT_FOUND')
    assert.equal(journal[4]!.effects, 'none')
    assert.equal(journal[1]!.observation, true)
    assert.doesNotMatch(JSON.stringify(journal), /alpha/, 'the typed keyword is not in the journal')

    const drafted = await call('automation.develop', {
      action: 'draft_from_journal', name: 'Keyword search', description: 'Search the keyword site and list the results without repeats.',
      parameters: [{ seq: 3, field: 'text', name: 'keyword' }],
      extract: [{ seq: 7, as: 'items', dedupe: true }],
      postconditions: [{ output: 'items', allowEmpty: true }, { selector: '#status.done' }],
    })
    assert.equal(drafted.ok, true, JSON.stringify(drafted.error))
    const report = drafted.result.result
    assetId = drafted.result.assetId
    assert.equal(report.complete, true)
    assert.equal(report.steps, 4)
    assert.deepEqual(report.sourceMap, { 1: 0, 3: 1, 4: 2, 6: 3, 7: 4 })
    assert.deepEqual(report.observationPoints, [2])
    assert.deepEqual(report.excluded, [{ seq: 5, reason: 'failed: LOCATOR_NOT_FOUND' }])
    assert.deepEqual(report.warnings.map((warning: any) => warning.code), ['FAILED_STEP_EXCLUDED'])
    assert.deepEqual(report.inputSchema, [{ name: 'keyword', type: 'string', required: true, example: 'alpha' }])
    assert.equal(report.suggestedTestUrl, page())
    assert.deepEqual(report.domains, ['127.0.0.1'])
    const stored = harness.assets.get(assetId)!
    assert.equal(stored.schemaVersion, 2)
    assert.deepEqual(stored.recipe, [
      { type: 'fill', locator: { label: 'Query' }, value: '{{keyword}}' },
      { type: 'click', locator: { role: 'button', name: 'Search' } },
      { type: 'wait', condition: 'locator', locator: { css: '#status.done' } },
      { type: 'extract', locator: { css: '#results' }, mode: 'text', as: 'items' },
    ])
    assert.deepEqual(stored.outputSchema, [{ name: 'items', type: 'string', dedupe: true }])

    // Independent replay: alpha and beta, each in a new context. The session's page is not used.
    // These two reads only prove the test left the page alone; they are not part of the path being measured.
    const before = await harness.action(S, 'observe.read', { locator: { selector: '#status' } })
    const tested = await call('automation.develop', { action: 'test', id: assetId, url: report.suggestedTestUrl, inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }] })
    assert.equal(tested.ok, true, JSON.stringify(tested))
    const outcome = tested.result
    assert.equal(tested.result.testStatus, 'passed')
    assert.equal(outcome.inputSets, 2)
    assert.deepEqual(outcome.sets.map((set: any) => [set.passed, set.validationStatus, set.outputs]), [
      [true, 'passed', [{ name: 'items', value: 'Alpha guide\nAlpha handbook\nAlpha index' }]],
      [true, 'passed', [{ name: 'items', value: 'Beta primer\nBeta manual' }]],
    ])
    assert.equal(outcome.warnings, undefined)
    const after = await harness.action(S, 'observe.read', { locator: { selector: '#status' } })
    assert.equal(after.result.text, before.result.text, 'the exploring page was left alone by the test')
    assert.equal(after.result.generation, before.result.generation)

    const asset = harness.assets.get(assetId)!
    const credential = asset.testCredentials!.at(-1)!
    assert.equal(credential.passed, true)
    assert.equal(credential.revision, asset.revision)
    assert.equal(credential.inputSets!.length, 2)
    assert.equal(credential.plannedSets, 2)
    assert.equal(credential.warnings, undefined)
    assert.doesNotMatch(JSON.stringify(credential), /alpha|beta/i)
    // Activation is the user's step (not a browser_call), and it needs the revision that was tested.
    assert.equal(harness.assets.setStatus(assetId, 'active', { expectedRevision: asset.revision }).status, 'active')
  })

  it('reuse: a new session finds the asset and runs it with another keyword; an empty result is a pass, an extraction failure is not', async () => {
    const S = 'e2e-b6-reuse'
    const call = (action: string, args: Record<string, unknown> = {}) => counted(reuse, S, action, args)
    const found = await call('automation.search', { query: 'keyword search results', domain: '127.0.0.1' })
    assert.equal(found.result.items[0].id, assetId)
    assert.deepEqual(found.result.items[0].inputSchema, [{ name: 'keyword', type: 'string', required: true, example: 'alpha' }])
    const run = await call('automation.run', { id: assetId, url: page(), inputs: { keyword: 'gamma' } })
    assert.equal(run.ok, true, JSON.stringify(run))
    assert.equal(run.result.validationStatus, 'passed')
    assert.deepEqual(run.result.outputs.map((output: any) => [output.name, output.value]), [['items', 'Gamma notes\nGamma atlas']])
    console.log(`[e2e:journal-story] explore+develop: ${explore.calls} browser_call, ${explore.bytes} bytes of tool output; reuse (search + run): ${reuse.calls} browser_call, ${reuse.bytes} bytes`)
    assert.equal(reuse.calls, 2)
    assert.equal(explore.calls, 9, 'open, observe, fill, click, failed click, wait, read, draft, test')
    assert.ok(explore.calls <= 12, `explore + develop took ${explore.calls} calls`)
    assert.ok(reuse.bytes < explore.bytes)

    // A keyword with no hit: a legitimate empty result, still verified by the success marker.
    const empty = await harness.action('e2e-b6-reuse-2', 'automation.run', { id: assetId, url: page(), inputs: { keyword: 'zzz' } })
    assert.equal(empty.ok, true, JSON.stringify(empty))
    assert.equal(empty.result.validationStatus, 'passed')
    assert.deepEqual(empty.result.outputs.map((output: any) => output.value), [''])
    // The results container is gone: an extraction failure, not an empty result.
    const broken = await harness.action('e2e-b6-reuse-3', 'automation.run', { id: assetId, url: page('?broken=1'), inputs: { keyword: 'alpha' } })
    assert.equal(broken.ok, false)
    assert.equal(broken.error.code, 'LOCATOR_NOT_FOUND')
    assert.equal(broken.result.failedStep.action, 'extract')
    assert.equal(broken.result.outputs.length, 0)
  })

  it('unmapped actions are visible, the draft is incomplete and cannot be activated; the parameterization warning shows when the page ignores the input', async () => {
    const S = 'e2e-b6-unmapped'
    const call = (action: string, args: Record<string, unknown> = {}) => harness.action(S, action, args)
    await call('target.open', { url: page('?static=1') })
    await call('act.fill', { locator: { label: 'Query' }, text: 'alpha' })
    await call('act.click', { locator: { role: 'button', name: 'Search' } })
    const evaluate = await call('script.evaluate', { expression: 'document.title' })
    assert.equal(evaluate.ok, true)
    await call('act.wait', { locator: { selector: '#status.done' } })
    const read = await call('observe.read', { locator: { selector: '#results' } })
    const drafted = await call('automation.develop', {
      action: 'draft_from_journal', name: 'Static search',
      parameters: [{ seq: 2, field: 'text', name: 'keyword' }], extract: [{ seq: read.seq, as: 'items' }],
      postconditions: [{ output: 'items', nonEmpty: true }],
    })
    assert.equal(drafted.ok, true, JSON.stringify(drafted.error))
    const report = drafted.result.result
    assert.equal(report.complete, false)
    assert.deepEqual(report.unmapped.map((entry: any) => [entry.seq, entry.action]), [[evaluate.seq, 'script.evaluate']])
    assert.match(report.unmapped[0].reason, /userscript/)
    assert.ok(report.warnings.some((warning: any) => warning.code === 'INCOMPLETE_DRAFT'))
    const id = drafted.result.assetId
    const tested = await call('automation.develop', { action: 'test', id, url: page('?static=1'), inputSets: [{ keyword: 'alpha' }, { keyword: 'beta' }] })
    assert.equal(tested.ok, true, JSON.stringify(tested))
    assert.deepEqual(tested.result.warnings.map((warning: any) => warning.code), ['PARAMETERIZATION_SUSPECT'])
    assert.deepEqual(tested.result.warnings[0].sets, [[1, 2]])
    const asset = harness.assets.get(id)!
    assert.equal(asset.testStatus, 'passed', 'the suspect test still passes')
    assert.deepEqual(asset.testCredentials!.at(-1)!.warnings, ['PARAMETERIZATION_SUSPECT'])
    assert.throws(() => harness.assets.setStatus(id, 'active', { expectedRevision: asset.revision }), /incomplete/)
  })

  it('a sensitive value never reaches the journal, the draft, the stored asset, or the test result', async () => {
    const S = 'e2e-b6-secret'
    const call = (action: string, args: Record<string, unknown> = {}) => harness.action(S, action, args)
    await call('target.open', { url: page() })
    const typed = await call('act.fill', { locator: { label: 'Access' }, text: SECRET })
    assert.equal(typed.ok, true)
    const fill = await call('act.fill', { locator: { label: 'Query' }, text: 'alpha' })
    await call('act.click', { locator: { role: 'button', name: 'Search' } })
    await call('act.wait', { locator: { selector: '#status.done' } })
    const read = await call('observe.read', { locator: { selector: '#results' } })
    const journal = harness.service.journalFor('session:' + S)
    assert.deepEqual(journal.entries()[1]!.params, { text: { ref: 'v2', length: SECRET.length, sensitive: true } }, 'the page said this control is a password field')
    assert.equal(journal.rawText(2), undefined)
    assert.equal(journal.rawText(fill.seq), 'alpha')
    const drafted = await call('automation.develop', {
      action: 'draft_from_journal', name: 'Search with access key', parameters: [{ seq: fill.seq, field: 'text', name: 'keyword' }],
      extract: [{ seq: read.seq, as: 'items' }], postconditions: [{ output: 'items', nonEmpty: true }],
    })
    assert.equal(drafted.ok, true, JSON.stringify(drafted.error))
    assert.deepEqual(drafted.result.result.inputSchema, [
      { name: 'secret', type: 'string', required: true, description: 'sensitive: pass at run time' },
      { name: 'keyword', type: 'string', required: true, example: 'alpha' },
    ])
    assert.ok(drafted.result.result.warnings.some((warning: any) => warning.code === 'SENSITIVE_VALUE_BECAME_INPUT'))
    const tested = await call('automation.develop', { action: 'test', id: drafted.result.assetId, url: page(), inputSets: [{ secret: SECRET, keyword: 'alpha' }, { secret: SECRET + '-2', keyword: 'beta' }] })
    assert.equal(tested.ok, true, JSON.stringify(tested))
    // Everything the model saw or the disk holds: no secret.
    const everything = [JSON.stringify(journal.entries()), JSON.stringify(drafted), JSON.stringify(tested), JSON.stringify(harness.assets.get(drafted.result.assetId))]
    for (const text of everything) assert.doesNotMatch(text, /hunter2/)
    const directory = path.join(harness.dir, 'automations')
    for (const file of fs.readdirSync(directory)) assert.doesNotMatch(fs.readFileSync(path.join(directory, file), 'utf8'), /hunter2/, file)
  })
})
