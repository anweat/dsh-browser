/**
 * Session-level behaviour of downloads and context options, driven through a fake browser so no Chromium is
 * needed: approval tiers, per-session state, the 50-record cap, zero-byte and over-limit handling, and when a
 * context is reused or rebuilt. The real-browser counterparts live in test/e2e/context-and-downloads.test.ts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { browserCallDecision, browserPolicyDecision } from '../src/approval-policy.ts'
import { mapError } from '../src/actions/errors.ts'
import { findAction } from '../src/actions/registry.ts'
import { validateArgs } from '../src/actions/schema.ts'

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-dls-'))

function fakeDownload(opts: { url?: string; name?: string; body: Buffer[]; failure?: string | null }) {
  const calls = { cancelled: 0 }
  return {
    calls,
    url: () => opts.url ?? 'https://files.test/a.bin',
    suggestedFilename: () => opts.name ?? 'a.bin',
    createReadStream: async () => Readable.from(opts.body),
    failure: async () => opts.failure ?? null,
    cancel: async () => { calls.cancelled++ },
  }
}

function service(overrides: Record<string, unknown> = {}) {
  const dir = tempDir()
  const svc = new BrowserService(resolveConfig({ enabled: true, downloadDir: dir, ...overrides } as never))
  const internals = svc as unknown as {
    state(session: string): { downloads: unknown[]; downloadJobs: WeakMap<object, unknown> }
    saveBrowserDownload(state: unknown, download: unknown): Promise<Record<string, any>>
  }
  return { svc, dir, internals }
}

test('target.open asks only for proxyServer and userAgent; viewport, locale and timezoneId are free', () => {
  const open = (args: Record<string, unknown>, mode: Parameters<typeof browserPolicyDecision>[2]) => browserPolicyDecision('target.open', { url: 'https://e.test/', ...args }, mode)
  for (const mode of ['read-only', 'standard', 'autonomous', 'unrestricted'] as const) {
    assert.deepEqual(open({ viewport: { width: 400, height: 800 }, locale: 'en-US', timezoneId: 'UTC' }, mode), { kind: 'allow' }, mode)
    assert.deepEqual(open({}, mode), { kind: 'allow' }, mode)
  }
  assert.equal(open({ proxyServer: 'http://127.0.0.1:7890' }, 'read-only').kind, 'deny')
  assert.equal(open({ userAgent: 'X' }, 'read-only').kind, 'deny')
  assert.equal(open({ proxyServer: 'http://127.0.0.1:7890' }, 'unrestricted').kind, 'allow')
  for (const mode of ['standard', 'autonomous'] as const) {
    const proxied = open({ proxyServer: 'http://127.0.0.1:7890', userAgent: 'MyAgent/1' }, mode) as { kind: string; reason: string }
    assert.equal(proxied.kind, 'ask', mode)
    assert.match(proxied.reason, /proxyServer=http:\/\/127\.0\.0\.1:7890/)
    assert.match(proxied.reason, /userAgent="MyAgent\/1"/)
    assert.match(proxied.reason, /https:\/\/e\.test\//)
  }
})

test('target.download is in the same tier as act.upload and names the URL', () => {
  const args = { url: 'https://files.test/report.pdf', filename: 'r.pdf' }
  assert.equal(browserPolicyDecision('target.download', args, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('target.download', args, 'unrestricted').kind, 'allow')
  for (const mode of ['standard', 'autonomous'] as const) {
    const decision = browserPolicyDecision('target.download', args, mode) as { kind: string; reason: string }
    assert.equal(decision.kind, 'ask')
    assert.match(decision.reason, /https:\/\/files\.test\/report\.pdf/)
    assert.match(decision.reason, /as r\.pdf/)
  }
  // The same tier as upload: ask where upload asks, deny where upload denies.
  for (const mode of ['read-only', 'standard', 'autonomous', 'unrestricted'] as const) {
    assert.equal(browserPolicyDecision('target.download', args, mode).kind, browserPolicyDecision('act.upload', { selector: '#f', files: ['/a'] }, mode).kind, mode)
  }
  // Bad arguments are let through to the executor, which answers INVALID_ARGS.
  assert.deepEqual(browserCallDecision('target.download', { url: 'https://x.test/', bogus: 1 }, 'standard'), { kind: 'allow' })
  assert.deepEqual(browserCallDecision('target.open', { url: 'https://x.test/', proxy: 'x' }, 'standard'), { kind: 'allow' })
})

test('the new arguments have a schema: nested viewport needs both sides, unknown keys are refused', () => {
  const open = findAction('target.open')!
  assert.deepEqual(validateArgs(open.params, { url: 'https://e.test/', viewport: { width: 390, height: 844 }, locale: 'en-US' }).errors, [])
  assert.ok(validateArgs(open.params, { url: 'https://e.test/', viewport: { width: 390 } }).errors.length > 0)
  assert.ok(validateArgs(open.params, { url: 'https://e.test/', proxy: 'x' }).errors.length > 0)
  const download = findAction('target.download')!
  assert.deepEqual(validateArgs(download.params, { url: 'https://e.test/f', filename: 'f.bin', timeoutMs: 5000 }).errors, [])
  assert.deepEqual(validateArgs(download.params, {}).errors, ['url: required'])
})

test('a browser download event is saved under the rules and recorded in its own session only', async () => {
  const { svc, dir, internals } = service()
  const a = internals.state('session:a')
  const b = internals.state('session:b')
  const body = Buffer.from('payload-bytes')
  const record = await internals.saveBrowserDownload(a, fakeDownload({ name: '../evil/../report.txt', body: [body] }))
  assert.equal(record.status, 'saved')
  assert.equal(path.dirname(record.path), path.resolve(dir), 'only inside downloadDir')
  assert.equal(path.basename(record.path), 'report.txt')
  assert.equal(record.bytes, body.length)
  assert.equal(fs.readFileSync(record.path, 'utf8'), 'payload-bytes')
  const again = await internals.saveBrowserDownload(a, fakeDownload({ name: 'report.txt', body: [body] }))
  assert.equal(path.basename(again.path), 'report-1.txt')

  assert.equal(svc.downloadRecords({ session: 'session:a' }).records.length, 2)
  assert.deepEqual(svc.downloadRecords({ session: 'session:b' }).records, [], 'the other session sees nothing')
  assert.deepEqual(svc.downloadRecords({ session: 'session:nobody' }).records, [])
  assert.equal(b.downloads.length, 0)
  const limited = svc.downloadRecords({ session: 'session:a', limit: 1 })
  assert.equal(limited.records.length, 1)
  assert.equal(limited.total, 2)
  svc.downloadRecords({ session: 'session:a', clear: true })
  assert.deepEqual(svc.downloadRecords({ session: 'session:a' }).records, [])
  assert.ok(fs.existsSync(record.path), 'clear drops records, not files')
})

test('a zero-byte download is a failed record and leaves no file; a failed one too', async () => {
  const { svc, dir, internals } = service()
  const state = internals.state('session:z')
  const empty = await internals.saveBrowserDownload(state, fakeDownload({ body: [] }))
  assert.equal(empty.status, 'failed')
  assert.match(empty.error, /zero bytes/)
  const broken = await internals.saveBrowserDownload(state, fakeDownload({ body: [Buffer.from('x')], failure: 'net::ERR_CONNECTION_RESET' }))
  assert.equal(broken.status, 'failed')
  assert.match(broken.error, /ERR_CONNECTION_RESET/)
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing is left behind, not even a temporary file')
  assert.equal(svc.downloadRecords({ session: 'session:z' }).records.every(record => record.status === 'failed' && record.path === undefined), true)
})

test('a download over downloadMaxBytes is cancelled, removed and recorded as failed', async () => {
  const { dir, internals } = service({ downloadMaxBytes: 1000 })
  const state = internals.state('session:big')
  const download = fakeDownload({ body: [Buffer.alloc(600), Buffer.alloc(600)] })
  const record = await internals.saveBrowserDownload(state, download)
  assert.equal(record.status, 'failed')
  assert.match(record.error, /larger than downloadMaxBytes \(1000 bytes\)/)
  assert.equal(download.calls.cancelled, 1)
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('a session keeps its newest 50 download records, and credential-looking URL parameters are masked', async () => {
  const { svc, internals } = service()
  const state = internals.state('session:cap')
  for (let index = 0; index < 55; index++) {
    await internals.saveBrowserDownload(state, fakeDownload({ url: `https://files.test/f${index}?token=secret${index}`, name: `f${index}.txt`, body: [Buffer.from('x')] }))
  }
  const all = svc.downloadRecords({ session: 'session:cap', limit: 50 })
  assert.equal(all.total, 50)
  assert.equal(all.records[0]!.suggestedFilename, 'f5.txt')
  assert.equal(all.records.at(-1)!.suggestedFilename, 'f54.txt')
  assert.match(all.records[0]!.url, /token=%5Bredacted%5D|token=\[redacted\]/)
  assert.equal(JSON.stringify(all).includes('secret'), false)
})

test('target.download refuses bad input before touching the network or a browser', async () => {
  const { svc } = service()
  await assert.rejects(svc.download('ftp://files.test/a', { session: 's' }), /requires an HTTP\(S\) URL/)
  await assert.rejects(svc.download('not a url', { session: 's' }), /requires an HTTP\(S\) URL/)
  await assert.rejects(svc.download('https://files.test/a', { filename: '../x', session: 's' }), /filename must be a plain file name/)
  await assert.rejects(svc.download('https://files.test/a', { filename: 'CON', session: 's' }), /reserved device name/)
  await assert.rejects(svc.download('https://files.test/a', { timeoutMs: 5, session: 's' }), /timeoutMs must be between/)
  assert.equal(mapError(await svc.download('https://files.test/a', { filename: '..', session: 's' }).catch(error => error), 'target.download').code, 'INVALID_ARGS')
})

/** A browser double that records what newContext was asked for. */
function fakeBrowser() {
  const created: { options: Record<string, any>; closed: boolean }[] = []
  const browser = {
    isConnected: () => true,
    on() {},
    async newContext(options: Record<string, any>) {
      const entry = { options, closed: false }
      created.push(entry)
      return {
        on() {},
        async addInitScript() {},
        async newPage() {
          return { on() {}, isClosed: () => entry.closed, async close() {}, mainFrame: () => ({}), url: () => 'about:blank', setDefaultTimeout() {}, async waitForLoadState() {}, async waitForTimeout() {} }
        },
        async close() { entry.closed = true },
        async storageState() { return {} },
      }
    },
  }
  return { browser, created }
}

test('a context is reused for the same options and rebuilt, with the reason, for a different one', async () => {
  const { svc } = service()
  const { browser, created } = fakeBrowser()
  ;(svc as any).browser = browser
  const ensure = (session: string, context?: Record<string, unknown>, url = 'https://e.test/') => (svc as any).ensurePage(url, { session, context }) as Promise<{ page: any; rebuilt?: string[] }>

  const first = await ensure('s1', { viewport: { width: 390, height: 844 }, locale: 'en-US' })
  assert.equal(created.length, 1)
  assert.deepEqual(created[0]!.options.viewport, { width: 390, height: 844 })
  assert.equal(created[0]!.options.locale, 'en-US')
  assert.equal(created[0]!.options.acceptDownloads, true)
  assert.equal(first.rebuilt, undefined)

  // Same options, and an omitted option, reuse the context.
  assert.equal((await ensure('s1', { viewport: { width: 390, height: 844 } })).rebuilt, undefined)
  assert.equal((await ensure('s1', undefined)).rebuilt, undefined)
  assert.equal(created.length, 1)

  // A different value rebuilds: the old context is closed, the new one keeps what the call left out.
  const rebuilt = await ensure('s1', { viewport: { width: 800, height: 600 } })
  assert.deepEqual(rebuilt.rebuilt, ['viewport'])
  assert.equal(created.length, 2)
  assert.equal(created[0]!.closed, true)
  assert.deepEqual(created[1]!.options.viewport, { width: 800, height: 600 })
  assert.equal(created[1]!.options.locale, 'en-US', 'an option the call left out is carried over')

  const proxied = await ensure('s1', { proxy: { server: 'http://127.0.0.1:7890' } })
  assert.deepEqual(proxied.rebuilt, ['proxyServer'])
  assert.deepEqual(created[2]!.options.proxy, { server: 'http://127.0.0.1:7890' })

  // Another session is untouched by all of that, and starts from the configured defaults.
  await ensure('s2')
  assert.equal(created.length, 4)
  assert.equal(created[3]!.options.viewport, undefined)
  assert.equal(created[3]!.options.proxy, undefined)
  assert.equal(created[2]!.closed, false)
})

test('configured defaults reach every context; the plain default passes no creation options at all', async () => {
  const plain = service()
  const a = fakeBrowser()
  ;(plain.svc as any).browser = a.browser
  await (plain.svc as any).ensurePage('https://e.test/', { session: 's' })
  assert.deepEqual(Object.keys(a.created[0]!.options).sort(), ['acceptDownloads'], 'only downloads are added; nothing about viewport, agent, locale, zone or proxy')

  const configured = service({ viewportMode: '1080p', locale: 'de-DE', timezoneId: 'Europe/Berlin', userAgent: 'Bot/1', proxyServer: 'socks5://127.0.0.1:1080', proxyBypass: 'a.test' })
  const b = fakeBrowser()
  ;(configured.svc as any).browser = b.browser
  await (configured.svc as any).ensurePage('https://e.test/', { session: 's' })
  assert.deepEqual(b.created[0]!.options, {
    acceptDownloads: true,
    viewport: { width: 1920, height: 1080 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    userAgent: 'Bot/1',
    proxy: { server: 'socks5://127.0.0.1:1080', bypass: 'a.test' },
  })
  // A matching per-call option does not rebuild; a different one does.
  assert.equal(((await (configured.svc as any).ensurePage('https://e.test/', { session: 's', context: { locale: 'de-DE' } })) as any).rebuilt, undefined)
  assert.deepEqual(((await (configured.svc as any).ensurePage('https://e.test/', { session: 's', context: { locale: 'fr-FR' } })) as any).rebuilt, ['locale'])
})

test('an invalid per-call option is refused before the live page is touched', async () => {
  const { svc } = service()
  const { browser, created } = fakeBrowser()
  ;(svc as any).browser = browser
  await (svc as any).ensurePage('https://e.test/', { session: 's' })
  await assert.rejects(svc.open('https://e.test/', { session: 's', viewport: { width: 5, height: 5 } } as never), /viewport width must be an integer/)
  await assert.rejects(svc.open('https://e.test/', { session: 's', proxyServer: 'http://u:p@h:1' } as never), /must not contain credentials/)
  assert.equal(created.length, 1)
  assert.equal(created[0]!.closed, false, 'the session kept its page')
})

test('a download over the size cap maps to ACTION_FAILED with a precise hint, never CANCELLED', async () => {
  const { DownloadLimitError } = await import('../src/downloads.ts')
  for (const error of [new DownloadLimitError(1000), new Error('could not download https://x.test/f: request failed (x); the download is larger than downloadMaxBytes (1000 bytes); the transfer was stopped and nothing was saved')]) {
    const body = mapError(error, 'target.download', { signal: new AbortController().signal })
    assert.equal(body.code, 'ACTION_FAILED')
    assert.match(body.hint!, /not a cancellation/)
    assert.match(body.hint!, /raise downloadMaxBytes/)
  }
  // The old wording would have been read as a cancellation; the message itself no longer says "aborted".
  assert.doesNotMatch(new DownloadLimitError(1).message, /abort/)
  assert.equal(mapError(new Error('the operation was aborted'), 'target.download').code, 'CANCELLED')
})

test('target.open always echoes the full parameter set in effect, tagged with where each value comes from', async () => {
  const { svc } = service({ viewportMode: '720p', locale: 'de-DE' })
  const { browser } = fakeBrowser()
  ;(svc as any).browser = browser
  // navigation and page reads need a real page; stub them so open() runs its own logic on the fake.
  ;(svc as any).navigate = async () => ({})
  ;(svc as any).readState = async () => ({ url: 'https://e.test/', title: 't', text: '' })
  const first = await svc.open('https://e.test/', { session: 'S' }) as any
  assert.deepEqual(first.contextOptions, { viewport: { width: 1280, height: 720 }, locale: 'de-DE' })
  assert.deepEqual(first.contextSources, { viewport: 'default', locale: 'default' })
  const second = await svc.open('https://e.test/', { session: 'S', viewport: { width: 390, height: 844 }, userAgent: 'Mobile/1' } as never) as any
  assert.deepEqual(second.contextOptions, { viewport: { width: 390, height: 844 }, locale: 'de-DE', userAgent: 'Mobile/1' })
  assert.deepEqual(second.contextSources, { viewport: 'call', locale: 'default', userAgent: 'call' })
  assert.deepEqual(second.contextRebuilt.changed, ['viewport', 'userAgent'])
  // A later call that says nothing keeps the context's values and says they came from the earlier call.
  const third = await svc.open('https://e.test/', { session: 'S' }) as any
  assert.deepEqual(third.contextSources, { viewport: 'session', locale: 'default', userAgent: 'session' })
  assert.equal(third.contextRebuilt, undefined)
})

test('the target.open and target.download details name the defaults in force; the always-on layers do not grow', async () => {
  const config = resolveConfig({ viewportMode: 'custom', viewportWidth: 1024, viewportHeight: 768, proxyServer: 'socks5://127.0.0.1:1080', downloadDir: process.platform === 'win32' ? 'C:\\dl' : '/var/dl', downloadMaxBytes: 5000, automationMode: 'unrestricted' } as never)
  const { registerTools } = await import('../src/tools.ts')
  const tools = new Map<string, any>()
  registerTools({ tools: { register: (tool: any) => tools.set(tool.name, tool) } } as never, config, {} as never, undefined)
  const index = (args: Record<string, unknown>) => tools.get('browser_index').execute(args, { signal: new AbortController().signal }).then((value: any) => value.text as string)
  const open = await index({ action: 'target.open' })
  assert.match(open, /Current defaults \(a parameter you leave out uses them; give only the keys you change\): viewport 1024x768/)
  assert.match(open, /proxyServer socks5:\/\/127\.0\.0\.1:1080/)
  assert.ok(open.length < 3500, `the detail layer stays inside its budget (${open.length} characters)`)
  const download = await index({ action: 'target.download' })
  assert.match(download, /Defaults in force: downloadDir .*dl, downloadMaxBytes 5000/)
  // Other actions and the group listing are unchanged.
  assert.doesNotMatch(await index({ action: 'act.click' }), /Current defaults/)
  assert.doesNotMatch(await index({ group: 'target' }), /Current defaults|Defaults in force/)
})
