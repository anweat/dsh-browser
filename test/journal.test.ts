import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { JOURNAL_LIMIT, RAW_TEXT_MAX, SessionJournal, cardLike, effectsOf, isJournaled, locatorSuggestsSecret, redactUrl, scrubCall, tokenLike } from '../src/journal.ts'
import { runAction, type RunEnvironment } from '../src/actions/run.ts'

const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }

/** A service double: every act.* works, pages carry a generation that a click advances. */
function fakeService(opts: { sensitive?: boolean; failClick?: boolean } = {}) {
  const journals = new Map<string, SessionJournal>()
  let generation = 1
  const state = { url: 'https://example.com/start?token=abc123', title: 'Start' }
  return {
    journals,
    journalFor: (session: string) => { let journal = journals.get(session); if (!journal) { journal = new SessionJournal(); journals.set(session, journal) } return journal },
    pageStamp: () => ({ targetId: 't1', generation, url: state.url }),
    inputSensitivity: async () => opts.sensitive === true,
    async open(url: string) { generation += 1; state.url = url; return { url, title: 'Opened', text: 'hello', targetId: 't1', generation } },
    async type(_target: unknown, text: string) { return { url: state.url, title: 'T', text: 'x'.repeat(text.length), targetId: 't1', generation } },
    async click() { if (opts.failClick) throw new Error('Timeout 1000ms exceeded.\nCall log:\n  - waiting for getByRole(\'button\')'); generation += 1; return { url: state.url + '#r', title: 'Clicked', text: '', targetId: 't1', generation } },
    async read() { return { url: state.url, title: 'T', text: 'abcdef', targetId: 't1', generation } },
  }
}

const ctx = (service: unknown, session = 'session:a') => ({ service: service as never, config: resolveConfig({}), session, sessionId: 'a', agent: undefined, signal: new AbortController().signal })

test('which calls are journaled: page-touching actions, not lists, searches or drafting', () => {
  for (const name of ['target.open', 'target.select', 'target.close', 'observe.read', 'act.fill', 'act.click', 'act.wait', 'script.evaluate', 'automation.run_recipe', 'automation.run']) assert.ok(isJournaled(name), name)
  for (const name of ['target.list', 'inspect.console', 'runtime.status', 'automation.search', 'automation.develop', 'opencli.run', 'crawl.crawl']) assert.ok(!isJournaled(name), name)
})

test('typed text is a reference; only short, non-secret text is kept in memory', () => {
  const plain = scrubCall('act.fill', { locator: { label: 'Query' }, text: 'alpha' }, 3)
  assert.deepEqual(plain.params, { text: { ref: 'v3', length: 5 } })
  assert.equal(plain.raw, 'alpha')
  assert.deepEqual(plain.locator, { label: 'Query' })
  // A password-like field, a secret-looking value, a long text, and a control the page calls sensitive: no raw value.
  const named = scrubCall('act.fill', { locator: { label: 'Password' }, text: 'hunter2' }, 4)
  assert.deepEqual(named.params, { text: { ref: 'v4', length: 7, sensitive: true } })
  assert.equal(named.raw, undefined)
  const control = scrubCall('act.fill', { locator: { css: '#a1' }, text: 'plain' }, 5, true)
  assert.equal((control.params.text as { sensitive?: boolean }).sensitive, true)
  assert.equal(control.raw, undefined)
  const token = scrubCall('act.type', { selector: '#x', text: 'sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc' }, 6)
  assert.equal((token.params.text as { sensitive?: boolean }).sensitive, true)
  assert.equal(token.raw, undefined)
  assert.deepEqual(token.locator, { css: '#x' }, 'a selector argument becomes a css locator')
  const long = scrubCall('act.fill', { locator: { label: 'Notes' }, text: 'n'.repeat(RAW_TEXT_MAX + 1) }, 7)
  assert.equal((long.params.text as { length: number }).length, RAW_TEXT_MAX + 1)
  assert.equal(long.raw, undefined)
  assert.equal((long.params.text as { sensitive?: boolean }).sensitive, undefined, 'long is not the same as secret')
  assert.ok(cardLike('4242 4242 4242 4242') && !cardLike('1234 5678 9012 3456'))
  assert.ok(tokenLike('eyJhbGciOi.eyJzdWIiOiIx.abc') && !tokenLike('alpha beta'))
  assert.ok(locatorSuggestsSecret({ role: 'textbox', name: 'Card number' }) && !locatorSuggestsSecret({ label: 'Query' }))
})

test('other arguments are scrubbed too: urls lose secrets, scripts and inputs lose their content', () => {
  assert.deepEqual(redactUrl('https://u:p@example.com/a?token=abc&q=dsh'), { url: 'https://example.com/a?token=%5Bredacted%5D&q=dsh', redacted: true })
  assert.deepEqual(scrubCall('target.open', { url: 'https://example.com/?api_key=zzz' }, 1).params, { url: 'https://example.com/?api_key=%5Bredacted%5D' })
  assert.deepEqual(scrubCall('script.evaluate', { expression: 'document.cookie' }, 2).params, { expression: { ref: 'v2', length: 15 } })
  assert.deepEqual(scrubCall('automation.run', { id: 'a', url: 'https://x.test/', inputs: { password: 'p' } }, 2).params, { id: 'a', url: 'https://x.test/', inputs: { keys: ['password'] } })
  assert.deepEqual(scrubCall('act.upload', { selector: 'input', files: ['/home/me/secret/report.pdf'] }, 2).params, { files: { count: 1, names: ['report.pdf'] } })
  assert.deepEqual(scrubCall('automation.run_recipe', { steps: [{ type: 'fill', value: 'pw' }] }, 2).params, { steps: { count: 1 } })
  assert.deepEqual(scrubCall('act.select', { selector: 's', values: ['NL'] }, 2).params, { values: ['NL'] })
  assert.deepEqual(scrubCall('act.click', { locator: { role: 'button', name: 'Go' }, expectGeneration: 4, timeoutMs: 100 }, 2).params, { timeoutMs: 100 })
})

test('effects follow what the call is and how it ended', () => {
  assert.equal(effectsOf(false, { ok: true, executionStatus: 'completed' }), 'none')
  assert.equal(effectsOf(true, { ok: true, executionStatus: 'completed' }), 'observed')
  assert.equal(effectsOf(true, { ok: false, executionStatus: 'failed', errorCode: 'LOCATOR_NOT_FOUND' }), 'none')
  assert.equal(effectsOf(true, { ok: false, executionStatus: 'failed', errorCode: 'ACTION_FAILED' }), 'unknown')
  assert.equal(effectsOf(true, { ok: false, executionStatus: 'outcome_unknown', errorCode: 'DEADLINE' }), 'unknown')
})

test('the journal is bounded: the oldest entries go, seq keeps growing, raw text goes with its entry', () => {
  const journal = new SessionJournal(3)
  for (let n = 0; n < 5; n += 1) {
    const seq = journal.allocate()
    journal.add({ seq, action: 'act.fill', params: {}, outcome: { ok: true, executionStatus: 'completed' }, effects: 'observed', summary: '' }, `t${seq}`)
  }
  assert.deepEqual(journal.entries().map(entry => entry.seq), [3, 4, 5])
  assert.equal(journal.dropped, 2)
  assert.equal(journal.rawText(1), undefined)
  assert.equal(journal.rawText(5), 't5')
  assert.equal(new SessionJournal().limit, JOURNAL_LIMIT)
  assert.equal(JOURNAL_LIMIT, 200)
})

test('browser_call dispatch records every page-touching call with generations, locator, scrubbed params and outcome, and returns seq', async () => {
  const service = fakeService()
  const c = ctx(service)
  const open = await runAction('target.open', { url: 'https://example.com/start?token=abc123' }, c, ENV)
  const fill = await runAction('act.fill', { locator: { label: 'Query' }, text: 'alpha' }, c, ENV)
  const click = await runAction('act.click', { locator: { role: 'button', name: 'Search' } }, c, ENV)
  const read = await runAction('observe.read', {}, c, ENV)
  assert.deepEqual([open.seq, fill.seq, click.seq, read.seq], [1, 2, 3, 4])
  const entries = service.journals.get('session:a')!.entries()
  assert.equal(entries.length, 4)
  assert.deepEqual(entries[1], {
    seq: 2, action: 'act.fill', targetId: 't1', generationBefore: 2, generationAfter: 2,
    locator: { label: 'Query' }, params: { text: { ref: 'v2', length: 5 } },
    outcome: { ok: true, executionStatus: 'completed' }, effects: 'observed',
    summary: 'T | /start?token=%5Bredacted%5D', url: 'https://example.com/start?token=%5Bredacted%5D',
  })
  assert.equal(entries[2]!.generationBefore, 2)
  assert.equal(entries[2]!.generationAfter, 3, 'a click that navigated advances the generation')
  assert.equal(entries[3]!.observation, true)
  assert.equal(entries[3]!.size, 6)
  assert.equal(entries[0]!.params.url, 'https://example.com/start?token=%5Bredacted%5D')
  assert.doesNotMatch(JSON.stringify(entries), /alpha|abc123/, 'neither the typed text nor the url secret is in the journal')
  assert.equal(service.journals.get('session:a')!.rawText(2), 'alpha')
})

test('a failed call is recorded with its error code; calls that never ran, and non-exploration calls, are not', async () => {
  const service = fakeService({ failClick: true })
  const c = ctx(service)
  const bad = await runAction('act.fill', { text: 'x' }, c, ENV)
  assert.equal(bad.error?.code, 'INVALID_ARGS')
  assert.equal(bad.seq, undefined)
  const unknown = await runAction('act.fill', { text: 1 }, c, ENV)
  assert.equal(unknown.seq, undefined)
  const denied = await runAction('act.click', { locator: { role: 'button' } }, ctx(service), { ...ENV, mode: 'read-only' })
  assert.equal(denied.error?.code, 'POLICY_DENIED')
  const failed = await runAction('act.click', { locator: { role: 'button', name: 'Go' } }, c, ENV)
  assert.equal(failed.ok, false)
  assert.equal(failed.seq, 1)
  const entries = service.journals.get('session:a')!.entries()
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0]!.outcome, { ok: false, executionStatus: 'failed', errorCode: 'LOCATOR_NOT_FOUND' })
  assert.equal(entries[0]!.effects, 'none')
  assert.match(entries[0]!.summary, /^LOCATOR_NOT_FOUND/)
})

test('a sensitive control makes its typed text a sensitive reference with no retained value', async () => {
  const service = fakeService({ sensitive: true })
  await runAction('act.fill', { locator: { label: 'Code' }, text: 'hunter2' }, ctx(service), ENV)
  const journal = service.journals.get('session:a')!
  assert.deepEqual(journal.entries()[0]!.params, { text: { ref: 'v1', length: 7, sensitive: true } })
  assert.equal(journal.rawText(1), undefined)
})

test('a service without a journal (a double, an older service) still dispatches normally', async () => {
  const reply = await runAction('act.click', { locator: { role: 'button', name: 'Go' } }, ctx({ async click() { return { url: 'u', title: 't', text: '' } } }), ENV)
  assert.equal(reply.ok, true)
  assert.equal(reply.seq, undefined)
})

test('each session has its own journal, and the real service releases it with the session', () => {
  const service = new BrowserService(resolveConfig({ enabled: true, maxSessions: 1 } as never))
  const a = service.journalFor('session:a')
  const b = service.journalFor('session:b')
  assert.notEqual(a, b)
  assert.equal(service.journalFor('session:a'), a)
  assert.equal(service.pageStamp('session:a'), undefined, 'no page: nothing to stamp, nothing created')
})
