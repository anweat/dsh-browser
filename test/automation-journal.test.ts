import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildDraftFromJournal } from '../src/automation-journal.ts'
import { AutomationAssetStore, ActivationRefusedError, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { SessionJournal, scrubCall, type JournalEntry } from '../src/journal.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'
import { resolveConfig } from '../src/config.ts'

const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }

/** Append a journal entry the way the dispatcher would: scrubbed params, retained text. */
function record(journal: SessionJournal, action: string, args: Record<string, unknown>, extra: Partial<JournalEntry> = {}): number {
  const seq = journal.allocate()
  const scrubbed = scrubCall(action, args, seq)
  journal.add({
    seq, action, targetId: 't1', params: scrubbed.params, ...scrubbed.locator ? { locator: scrubbed.locator } : {},
    outcome: { ok: true, executionStatus: 'completed' }, effects: 'observed', summary: '', ...extra,
  }, scrubbed.raw)
  return seq
}

function searchJournal(): { journal: SessionJournal; seqs: Record<string, number> } {
  const journal = new SessionJournal()
  const seqs: Record<string, number> = {}
  seqs.open = record(journal, 'target.open', { url: 'http://127.0.0.1:9/search.html' }, { url: 'http://127.0.0.1:9/search.html', generationBefore: undefined, generationAfter: 2, effects: 'none' })
  seqs.observe = record(journal, 'observe.read', { sections: ['controls'] }, { observation: true, generationBefore: 2, generationAfter: 2, effects: 'none', url: 'http://127.0.0.1:9/search.html' })
  seqs.fill = record(journal, 'act.fill', { locator: { label: 'Query' }, text: 'alpha' }, { generationBefore: 2, generationAfter: 2, url: 'http://127.0.0.1:9/search.html' })
  seqs.click = record(journal, 'act.click', { locator: { role: 'button', name: 'Search' } }, { generationBefore: 2, generationAfter: 2, url: 'http://127.0.0.1:9/search.html' })
  seqs.wait = record(journal, 'act.wait', { locator: { css: '#status' } }, { effects: 'none', generationBefore: 2, generationAfter: 2 })
  seqs.read = record(journal, 'observe.read', { locator: { css: '#results' } }, { observation: true, size: 24, effects: 'none', generationBefore: 2, generationAfter: 2, url: 'http://127.0.0.1:9/search.html' })
  return { journal, seqs }
}

test('draft_from_journal maps the explored calls to v2 steps with a source map, parameters, an extract and suggestions', () => {
  const { journal, seqs } = searchJournal()
  const { draft, report } = buildDraftFromJournal(journal, {
    name: 'Keyword search',
    parameters: [{ seq: seqs.fill!, field: 'text', name: 'keyword' }],
    extract: [{ seq: seqs.read!, as: 'items', dedupe: true }],
  })
  assert.deepEqual(draft.recipe, [
    { type: 'fill', locator: { label: 'Query' }, value: '{{keyword}}' },
    { type: 'click', locator: { role: 'button', name: 'Search' } },
    { type: 'wait', condition: 'locator', locator: { css: '#status' } },
    { type: 'extract', locator: { css: '#results' }, mode: 'text', as: 'items' },
  ])
  assert.equal(draft.schemaVersion, 2)
  assert.deepEqual(draft.inputSchema, [{ name: 'keyword', type: 'string', required: true, example: 'alpha' }])
  assert.deepEqual(draft.outputSchema, [{ name: 'items', type: 'string', dedupe: true }])
  assert.deepEqual(draft.domains, ['127.0.0.1'])
  assert.equal(draft.postconditions, undefined, 'postconditions are suggested, never written on their own')
  assert.deepEqual(report.sourceMap, { [seqs.open!]: 0, [seqs.fill!]: 1, [seqs.click!]: 2, [seqs.wait!]: 3, [seqs.read!]: 4 })
  assert.deepEqual(report.observationPoints, [seqs.observe])
  assert.equal(report.suggestedTestUrl, 'http://127.0.0.1:9/search.html')
  assert.deepEqual(report.suggestedPostconditions, [{ output: 'items', nonEmpty: true }])
  assert.equal(report.complete, true)
  assert.deepEqual(report.unmapped, [])
  assert.deepEqual(report.warnings.map(warning => warning.code), ['NO_VERIFIER'])
  assert.deepEqual(draft.origin, { kind: 'journal', fromSeq: seqs.open, toSeq: seqs.read, unmapped: 0 })
})

test('without parameters the typed text stays a literal and is offered as a candidate', () => {
  const { journal, seqs } = searchJournal()
  const { draft, report } = buildDraftFromJournal(journal, { name: 'x', extract: [{ seq: seqs.read!, as: 'items' }] })
  assert.equal((draft.recipe![0] as { value: string }).value, 'alpha')
  assert.equal(draft.inputSchema, undefined)
  assert.deepEqual(report.parameterCandidates, [{ seq: seqs.fill, field: 'text', example: 'alpha', suggestedName: 'query' }])
})

test('failed steps are excluded with a warning, caller exclusions and observations are not steps, unknown seq are refused', () => {
  const { journal, seqs } = searchJournal()
  const bad = record(journal, 'act.click', { locator: { role: 'button', name: 'Nope' } }, { outcome: { ok: false, executionStatus: 'failed', errorCode: 'LOCATOR_NOT_FOUND' }, effects: 'none' })
  const { report, draft } = buildDraftFromJournal(journal, { name: 'x', extract: [{ seq: seqs.read!, as: 'items' }], exclude: [seqs.wait!] })
  assert.deepEqual(report.excluded, [{ seq: seqs.wait, reason: 'excluded by the caller' }, { seq: bad, reason: 'failed: LOCATOR_NOT_FOUND' }])
  assert.ok(report.warnings.some(warning => warning.code === 'FAILED_STEP_EXCLUDED' && warning.seq === bad))
  assert.equal(draft.recipe!.length, 3)
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', parameters: [{ seq: 999, field: 'text', name: 'k' }] }), /not in the selected range/)
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', parameters: [{ seq: seqs.click!, field: 'text', name: 'k' }] }), /no value to turn into an input/)
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', parameters: [{ seq: seqs.fill!, field: 'values', name: 'k' }] }), /has the field "text"/)
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', extract: [{ seq: seqs.click!, as: 'y' }] }), /only an observe.read/)
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', extract: [{ seq: seqs.observe!, as: 'y' }] }), /content section/)
  assert.throws(() => buildDraftFromJournal(new SessionJournal(), { name: 'x' }), /journal of this session is empty/)
})

test('actions a recipe cannot express are unmapped with a reason, and make the draft incomplete', () => {
  const journal = new SessionJournal()
  record(journal, 'target.open', { url: 'http://127.0.0.1:9/a.html' }, { url: 'http://127.0.0.1:9/a.html', generationAfter: 2 })
  record(journal, 'act.click', { locator: { role: 'link', name: 'Popup' } }, { generationBefore: 2, generationAfter: 2, url: 'http://127.0.0.1:9/a.html' })
  const select = record(journal, 'target.select', { id: 't2' }, { targetId: 't2' })
  const onPopup = record(journal, 'act.click', { locator: { role: 'button', name: 'Inside popup' } }, { targetId: 't2' })
  const evaluate = record(journal, 'script.evaluate', { expression: 'document.title' })
  const upload = record(journal, 'act.upload', { selector: 'input', files: ['/tmp/a.pdf'] })
  const multi = record(journal, 'act.select', { selector: 's', values: ['a', 'b'] })
  const glob = record(journal, 'act.wait', { urlPattern: '**/done*' }, { effects: 'none' })
  const frame = record(journal, 'act.click', { locator: { role: 'button', name: 'In frame', frame: { name: 'pay' } } })
  const { draft, report } = buildDraftFromJournal(journal, { name: 'x' })
  assert.deepEqual(report.unmapped.map(item => [item.seq, item.action]), [[select, 'target.select'], [onPopup, 'act.click'], [evaluate, 'script.evaluate'], [upload, 'act.upload'], [multi, 'act.select'], [glob, 'act.wait'], [frame, 'act.click']])
  assert.match(report.unmapped[1]!.reason, /ran on page t2, not t1/)
  assert.match(report.unmapped[2]!.reason, /userscript/)
  assert.match(report.unmapped[4]!.reason, /several options/)
  assert.match(report.unmapped[5]!.reason, /glob/)
  assert.match(report.unmapped[6]!.reason, /name or url/)
  assert.equal(report.complete, false)
  assert.equal(draft.recipe!.length, 1)
  assert.ok(report.warnings.some(warning => warning.code === 'INCOMPLETE_DRAFT'))
  assert.equal(draft.origin!.unmapped, 7)
})

test('a value that was not retained becomes a required input; nothing sensitive reaches the draft', () => {
  const journal = new SessionJournal()
  record(journal, 'target.open', { url: 'http://127.0.0.1:9/login.html' }, { url: 'http://127.0.0.1:9/login.html', generationAfter: 2 })
  record(journal, 'act.fill', { locator: { label: 'Email' }, text: 'me@example.com' })
  const pw = record(journal, 'act.fill', { locator: { label: 'Password' }, text: 'hunter2-very-secret' })
  const token = record(journal, 'act.fill', { locator: { label: 'Code' }, text: 'sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc' })
  record(journal, 'act.click', { locator: { role: 'button', name: 'Sign in' } })
  const { draft, report } = buildDraftFromJournal(journal, { name: 'Login' })
  const text = JSON.stringify({ draft, report })
  assert.doesNotMatch(text, /hunter2|sk_live|4eC39/)
  assert.deepEqual(draft.inputSchema, [
    { name: 'secret', type: 'string', required: true, description: 'sensitive: pass at run time' },
    { name: 'secret2', type: 'string', required: true, description: 'sensitive: pass at run time' },
  ])
  assert.equal((draft.recipe![1] as { value: string }).value, '{{secret}}')
  assert.deepEqual(report.warnings.filter(warning => warning.code === 'SENSITIVE_VALUE_BECAME_INPUT').map(warning => warning.seq), [pw, token])
  // The email was short and plain: it stays a literal (and a candidate).
  assert.equal((draft.recipe![0] as { value: string }).value, 'me@example.com')
})

test('generation jumps and excluded navigations are warned about; positional locators are listed; a range that starts mid-way says so', () => {
  const journal = new SessionJournal()
  record(journal, 'target.open', { url: 'http://127.0.0.1:9/a.html' }, { url: 'http://127.0.0.1:9/a.html', generationAfter: 2 })
  record(journal, 'act.click', { locator: { role: 'link', name: 'Item', index: 1, indexReason: 'second' } }, { generationBefore: 2, generationAfter: 3, url: 'http://127.0.0.1:9/b.html' })
  const jump = record(journal, 'act.click', { locator: { role: 'button', name: 'Next' } }, { generationBefore: 5, generationAfter: 5, url: 'http://127.0.0.1:9/b.html' })
  const lost = record(journal, 'target.open', { url: 'http://127.0.0.1:9/c.html' }, { generationBefore: 5, generationAfter: 6, url: 'http://127.0.0.1:9/c.html' })
  record(journal, 'act.click', { locator: { role: 'button', name: 'Go' } }, { generationBefore: 6, generationAfter: 6, url: 'http://127.0.0.1:9/c.html' })
  const { report } = buildDraftFromJournal(journal, { name: 'x', exclude: [lost] })
  assert.ok(report.warnings.some(warning => warning.code === 'GENERATION_JUMP' && warning.seq === jump), JSON.stringify(report.warnings))
  assert.ok(report.warnings.some(warning => warning.code === 'EXCLUDED_NAVIGATION' && warning.seq === lost))
  assert.deepEqual(report.pendingDisambiguation.map(item => [item.step, item.kind]), [[1, 'positional-index']])
  const mid = buildDraftFromJournal(journal, { name: 'x', fromSeq: jump }).report
  assert.ok(mid.warnings.some(warning => warning.code === 'NO_OPENING_STEP'))
  assert.equal(mid.suggestedTestUrl, 'http://127.0.0.1:9/b.html', 'the page the first step started on')
})

test('a later target.open becomes a goto; its url can be an input; the opening url is never a step; a url with a secret is unmapped', () => {
  const journal = new SessionJournal()
  record(journal, 'target.open', { url: 'http://127.0.0.1:9/a.html' }, { url: 'http://127.0.0.1:9/a.html', generationAfter: 2 })
  const second = record(journal, 'target.open', { url: 'http://127.0.0.1:9/b.html' }, { url: 'http://127.0.0.1:9/b.html', generationBefore: 2, generationAfter: 3 })
  const secret = record(journal, 'target.open', { url: 'http://127.0.0.1:9/c.html?token=abc' }, { generationBefore: 3, generationAfter: 4 })
  record(journal, 'act.click', { locator: { role: 'button', name: 'Go' } })
  const { draft, report } = buildDraftFromJournal(journal, { name: 'x', parameters: [{ seq: second, field: 'url', name: 'next' }] })
  assert.equal((draft.recipe![0] as { url: string }).url, '{{next}}')
  assert.deepEqual(report.unmapped.map(item => item.seq), [secret])
  assert.throws(() => buildDraftFromJournal(journal, { name: 'x', parameters: [{ seq: 1, field: 'url', name: 'u' }] }), /start url is already an argument/)
})

test('the draft is saved as v2, carries its origin, and cannot be activated while it has unmapped actions (until it is saved again by hand)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-journal-draft-'))
  try {
    const policy = resolveAutomationAssetPolicy({ directory: dir, persistenceMode: 'manual', maxModelDraftWritesPerSession: 10 })
    const store = new AutomationAssetStore(policy)
    const development = new AutomationDevelopmentService(store, policy)
    const journal = new SessionJournal()
    record(journal, 'target.open', { url: 'http://127.0.0.1:9/a.html' }, { url: 'http://127.0.0.1:9/a.html', generationAfter: 2 })
    record(journal, 'act.click', { locator: { role: 'button', name: 'Go' } }, { url: 'http://127.0.0.1:9/a.html' })
    record(journal, 'script.evaluate', { expression: '1' })
    const { asset, report } = development.draftFromJournal(journal, { name: 'Half', postconditions: [{ text: 'Done' }] }, 's1')
    assert.equal(asset.schemaVersion, 2)
    assert.equal(asset.status, 'draft')
    assert.deepEqual(asset.origin, { kind: 'journal', fromSeq: 1, toSeq: 3, unmapped: 1 })
    assert.equal(report.complete, false)
    // A passed test would normally allow activation; the incomplete draft is refused anyway.
    store.noteTestResult(asset.id, true, 'http://127.0.0.1:9/a.html', 'verified', undefined, { inputs: {} })
    assert.throws(() => store.setStatus(asset.id, 'active', { expectedRevision: asset.revision }), (error: unknown) => error instanceof ActivationRefusedError && error.reason === 'incomplete-draft' && /incomplete/.test(error.message))
    // Saving it again explicitly (the model finished the recipe itself) drops the origin and the gate.
    const again = development.save({ id: asset.id, kind: 'recipe', name: 'Half', schemaVersion: 2, domains: ['127.0.0.1'], recipe: asset.recipe!, postconditions: [{ text: 'Done' }] }, 's1')
    assert.equal(again.origin, undefined)
    store.noteTestResult(again.id, true, 'http://127.0.0.1:9/a.html', 'verified', undefined, { inputs: {} })
    assert.equal(store.setStatus(again.id, 'active', { expectedRevision: again.revision }).status, 'active')
    // A complete draft_from_journal draft is not blocked.
    const ok = new SessionJournal()
    record(ok, 'target.open', { url: 'http://127.0.0.1:9/a.html' }, { url: 'http://127.0.0.1:9/a.html', generationAfter: 2 })
    record(ok, 'act.click', { locator: { role: 'button', name: 'Go' } }, { url: 'http://127.0.0.1:9/a.html' })
    const complete = development.draftFromJournal(ok, { name: 'Whole', postconditions: [{ text: 'Done' }] }, 's1')
    store.noteTestResult(complete.asset.id, true, 'http://127.0.0.1:9/a.html', 'verified', undefined, { inputs: {} })
    assert.equal(store.setStatus(complete.asset.id, 'active', { expectedRevision: complete.asset.revision }).status, 'active')
    // It counts as a draft write.
    const limited = new AutomationDevelopmentService(store, resolveAutomationAssetPolicy({ directory: dir, persistenceMode: 'manual', maxModelDraftWritesPerSession: 1 }))
    limited.draftFromJournal(ok, { name: 'One' }, 's2')
    assert.throws(() => limited.draftFromJournal(ok, { name: 'Two' }, 's2'), /write limit/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('browser_call automation.develop draft_from_journal builds from the session journal and answers with the report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-journal-action-'))
  try {
    const policy = resolveAutomationAssetPolicy({ directory: dir, persistenceMode: 'manual', maxModelDraftWritesPerSession: 10 })
    const store = new AutomationAssetStore(policy)
    const development = new AutomationDevelopmentService(store, policy)
    const { journal, seqs } = searchJournal()
    const service = { journalFor: () => journal }
    const ctx = { service: service as never, config: resolveConfig({}), assets: store, development, session: 'session:a', sessionId: 'a', agent: undefined, signal: new AbortController().signal }
    const reply = await runAction('automation.develop', {
      action: 'draft_from_journal', name: 'Keyword search',
      parameters: [{ seq: seqs.fill, field: 'text', name: 'keyword' }], extract: [{ seq: seqs.read, as: 'items' }],
      postconditions: [{ output: 'items', nonEmpty: true }],
    }, ctx, ENV)
    assert.equal(reply.ok, true, JSON.stringify(reply.error))
    const result = reply.result as { assetId: string; status: string; result: Record<string, any> }
    assert.equal(result.status, 'draft')
    assert.equal(result.result.steps, 4)
    assert.equal(result.result.complete, true)
    assert.deepEqual(result.result.inputSchema, [{ name: 'keyword', type: 'string', required: true, example: 'alpha' }])
    assert.deepEqual(result.result.warnings, [])
    const stored = store.get(result.assetId)!
    assert.deepEqual(stored.postconditions, [{ output: 'items', nonEmpty: true }])
    assert.equal(stored.revision, 1)
    // Calling again with the id replaces the draft: a new revision, not a second draft.
    const again = await runAction('automation.develop', { action: 'draft_from_journal', id: result.assetId, name: 'Keyword search', extract: [{ seq: seqs.read, as: 'items' }], postconditions: [{ output: 'items', allowEmpty: true }] }, ctx, ENV)
    assert.equal(again.ok, true, JSON.stringify(again.error))
    assert.equal(store.get(result.assetId)!.revision, 2)
    // Errors are INVALID_ARGS with the reason; read-only mode may not draft.
    const bad = await runAction('automation.develop', { action: 'draft_from_journal', name: 'x', parameters: [{ seq: 999, field: 'text', name: 'k' }] }, ctx, ENV)
    assert.equal(bad.error?.code, 'INVALID_ARGS')
    assert.match(bad.error!.message, /not in the selected range/)
    const denied = await runAction('automation.develop', { action: 'draft_from_journal', name: 'x' }, ctx, { ...ENV, mode: 'read-only' })
    assert.equal(denied.error?.code, 'POLICY_DENIED')
    const none = await runAction('automation.develop', { action: 'draft_from_journal', name: 'x' }, { ...ctx, service: {} as never }, ENV)
    assert.equal(none.error?.code, 'CAPABILITY_UNAVAILABLE')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
