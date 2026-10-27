/**
 * Real-browser e2e for context creation options (viewport, user agent, locale, time zone, proxy; per-call rebuild)
 * and for download saving (target.download, inspect.downloads). Same rules as the rest of the suite: skipped with a
 * printed reason when no browser is installed, nothing is ever downloaded.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createHarness, detectBrowser, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e] context-and-downloads SKIPPED: ${detection.reason}`)

const FILE = Buffer.from('DSH download fixture\n' + 'x'.repeat(4096))
const BIG = Buffer.alloc(300_000, 7)
const sha = (body: Buffer) => crypto.createHash('sha256').update(body).digest('hex')

interface Fixture { base: string; hits: Record<string, number>; close: () => Promise<void> }

/** A server with a cookie-gated file, empty/oversized/missing attachments, and an attachment only a real navigation gets. */
async function startDownloadServer(): Promise<Fixture> {
  const hits: Record<string, number> = {}
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.invalid')
    hits[url.pathname] = (hits[url.pathname] ?? 0) + 1
    const cookie = String(req.headers.cookie ?? '')
    const attachment = (name: string, body: Buffer, extra: Record<string, string> = {}) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"`, ...extra })
      res.end(body)
    }
    switch (url.pathname) {
      case '/login':
        res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sid=abc123; Path=/' })
        return res.end('<title>Logged in</title><p>ok</p>')
      case '/whoami':
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end(`<title>whoami</title><p id="c">${cookie.includes('sid=abc123') ? 'cookie:yes' : 'cookie:no'}</p>`)
      case '/file.bin': return attachment('data.bin', FILE)
      case '/secret.bin':
        if (!cookie.includes('sid=abc123')) { res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('login required') }
        return attachment('secret.bin', FILE)
      case '/empty': return attachment('empty.bin', Buffer.alloc(0))
      case '/big': return attachment('big.bin', BIG)
      case '/big-chunked':
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="chunked.bin"' })
        res.write(BIG.subarray(0, 100_000)); res.write(BIG.subarray(100_000)); return res.end()
      case '/evil-name': return attachment('../../escape.txt', FILE)
      case '/nav-only':
        // Only a document navigation gets the file; a plain request is refused.
        if (req.headers['sec-fetch-dest'] !== 'document') { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('navigate to get it') }
        return attachment('nav.bin', FILE)
      case '/page.html':
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end('<title>Click page</title><a id="dl" href="/file.bin" download>Download</a><p id="v"></p>')
      case '/gone':
        res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nope')
      default:
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end('<title>Plain</title><p>plain</p>')
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return { base: `http://127.0.0.1:${port}`, hits, close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }) }
}

/** An HTTP forward proxy that answers every request itself and remembers what it was asked for. */
async function startProxy(): Promise<{ port: number; seen: string[]; close: () => Promise<void> }> {
  const seen: string[] = []
  const server = http.createServer((req, res) => {
    seen.push(String(req.url))
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<title>via-proxy</title><p>served by the test proxy</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as { port: number }).port, seen, close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }) }
}

describe('dsh-browser context options and downloads e2e', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let small: Harness
  let server: Fixture
  let proxy: Awaited<ReturnType<typeof startProxy>>
  const S1 = 'e2e-ctx-1'
  const S2 = 'e2e-ctx-2'
  const url = (p: string) => server.base + p
  const key = (session: string) => `session:${session}`
  const downloadsOf = (h: Harness) => path.join(h.dir, 'downloads')
  const eval_ = async (session: string, expression: string) => JSON.parse((await harness.result(session, 'script.evaluate', { expression })).resultJson)
  const listDir = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []

  before(async () => {
    assert.ok(detection.ok)
    server = await startDownloadServer()
    proxy = await startProxy()
    harness = createHarness(detection)
    small = createHarness(detection, { downloadMaxBytes: 100_000 })
  })

  after(async () => {
    await harness?.dispose()
    await small?.dispose()
    await server?.close()
    await proxy?.close()
  })

  it('viewport is applied to the real window', async () => {
    await harness.result(S1, 'target.open', { url: url('/plain'), viewport: { width: 800, height: 600 } })
    assert.deepEqual(await eval_(S1, '[window.innerWidth, window.innerHeight]'), [800, 600])
  })

  it('userAgent, locale and timezoneId are applied', async () => {
    const opened = await harness.result('e2e-ctx-ua', 'target.open', { url: url('/plain'), userAgent: 'DshE2E/1.0', locale: 'de-DE', timezoneId: 'Asia/Tokyo' })
    assert.deepEqual(opened.contextOptions, { userAgent: 'DshE2E/1.0', locale: 'de-DE', timezoneId: 'Asia/Tokyo' })
    assert.equal(await eval_('e2e-ctx-ua', 'navigator.userAgent'), 'DshE2E/1.0')
    assert.equal(await eval_('e2e-ctx-ua', 'navigator.language'), 'de-DE')
    assert.equal(await eval_('e2e-ctx-ua', 'Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Tokyo')
  })

  it('a different option rebuilds the context: the old page is closed, the new one works, unsaved cookies are gone', async () => {
    const session = 'e2e-ctx-rebuild'
    await harness.result(session, 'target.open', { url: url('/login'), viewport: { width: 700, height: 500 } })
    const state = (harness.service as any).sessions.get(key(session))
    const oldPage = state.page
    const oldContext = state.context
    await eval_(session, '(window.marker = "old-page", 1)')
    assert.equal((await harness.result(session, 'target.open', { url: url('/whoami') })).contextRebuilt, undefined, 'no option given: the context is kept')
    assert.match((await harness.result(session, 'observe.read')).text, /cookie:yes/)

    const same = await harness.result(session, 'target.open', { url: url('/whoami'), viewport: { width: 700, height: 500 } })
    assert.equal(same.contextRebuilt, undefined, 'the same option reuses the context')
    assert.equal(oldPage.isClosed(), false)

    const rebuilt = await harness.result(session, 'target.open', { url: url('/whoami'), viewport: { width: 640, height: 480 } })
    assert.deepEqual(rebuilt.contextRebuilt.changed, ['viewport'])
    assert.match(rebuilt.contextRebuilt.note, /closed/)
    assert.equal(oldPage.isClosed(), true, 'the previous page was closed')
    assert.notEqual((harness.service as any).sessions.get(key(session)).context, oldContext)
    assert.match(rebuilt.text, /cookie:no/, 'cookies that no auth profile persists went with the old context')
    assert.equal(await eval_(session, 'window.marker ?? null'), null)
    assert.deepEqual(await eval_(session, '[window.innerWidth, window.innerHeight]'), [640, 480])
    // The session still works: another page of the same context.
    assert.match((await harness.result(session, 'target.open', { url: url('/plain') })).text, /plain/)
  })

  it('an option left out keeps the context\'s value; target.close returns to the defaults', async () => {
    const session = 'e2e-ctx-keep'
    await harness.result(session, 'target.open', { url: url('/plain'), viewport: { width: 512, height: 384 } })
    await harness.result(session, 'target.open', { url: url('/plain?again') })
    assert.deepEqual(await eval_(session, '[window.innerWidth, window.innerHeight]'), [512, 384])
    await harness.result(session, 'target.close')
    await harness.result(session, 'target.open', { url: url('/plain') })
    assert.notEqual(await eval_(session, 'window.innerWidth'), 512)
  })

  it('an invalid option is INVALID_ARGS and the live page is untouched', async () => {
    const session = 'e2e-ctx-invalid'
    await harness.result(session, 'target.open', { url: url('/plain') })
    const page = (harness.service as any).sessions.get(key(session)).page
    for (const args of [{ viewport: { width: 5, height: 5 } }, { locale: 'not a locale' }, { timezoneId: 'Mars/Base' }, { proxyServer: 'http://user:pw@127.0.0.1:1' }]) {
      const envelope = await harness.action(session, 'target.open', { url: url('/plain'), ...args })
      assert.equal(envelope.ok, false, JSON.stringify(args))
      assert.equal(envelope.error.code, 'INVALID_ARGS', JSON.stringify(args))
    }
    assert.equal(page.isClosed(), false)
  })

  it('a per-call proxy is used by the context although the browser was launched without a global proxy', async () => {
    const session = 'e2e-ctx-proxy'
    const opened = await harness.result(session, 'target.open', { url: 'http://proxy-target.example/hello', proxyServer: `http://127.0.0.1:${proxy.port}` })
    assert.equal(opened.title, 'via-proxy')
    assert.deepEqual(opened.contextOptions, { proxyServer: `http://127.0.0.1:${proxy.port}` })
    assert.ok(proxy.seen.some(entry => entry.includes('proxy-target.example/hello')), `the proxy saw it: ${proxy.seen.join(', ')}`)
    // Another session is not behind that proxy.
    const direct = await harness.result('e2e-ctx-direct', 'target.open', { url: url('/plain') })
    assert.equal(direct.title, 'Plain')
  })

  it('target.download saves with the session\'s login state; bytes, sha256 and name are right, and a taken name is not overwritten', async () => {
    await harness.result(S1, 'target.open', { url: url('/login') })
    const first = await harness.result(S1, 'target.download', { url: url('/secret.bin') })
    assert.equal(path.dirname(first.path), downloadsOf(harness))
    assert.equal(path.basename(first.path), 'secret.bin')
    assert.equal(first.bytes, FILE.length)
    assert.equal(first.sha256, sha(FILE))
    assert.equal(first.suggestedFilename, 'secret.bin')
    assert.equal(first.source, 'request')
    assert.deepEqual(fs.readFileSync(first.path), FILE)
    const second = await harness.result(S1, 'target.download', { url: url('/secret.bin') })
    assert.equal(path.basename(second.path), 'secret-1.bin')
    assert.deepEqual(fs.readFileSync(first.path), FILE, 'the first file is untouched')
    const named = await harness.result(S1, 'target.download', { url: url('/file.bin'), filename: 'mine.dat' })
    assert.equal(path.basename(named.path), 'mine.dat')
    assert.equal(named.suggestedFilename, 'data.bin')

    const listed = await harness.result(S1, 'inspect.downloads')
    assert.equal(listed.downloadDir, downloadsOf(harness))
    assert.deepEqual(listed.records.map((record: any) => path.basename(record.path)), ['secret.bin', 'secret-1.bin', 'mine.dat'])
    assert.ok(listed.records.every((record: any) => record.status === 'saved' && record.sha256 === sha(FILE)))
  })

  it('another session has its own cookies and its own, empty, download list', async () => {
    assert.deepEqual((await harness.result(S2, 'inspect.downloads')).records, [])
    const envelope = await harness.action(S2, 'target.download', { url: url('/secret.bin') })
    assert.equal(envelope.ok, false, 'S2 never logged in: the gated file is refused')
    assert.match(envelope.error.message, /401/)
    const records = (await harness.result(S2, 'inspect.downloads')).records
    assert.equal(records.length, 1)
    assert.equal(records[0].status, 'failed')
    assert.equal(records[0].path, undefined)
    assert.equal((await harness.result(S1, 'inspect.downloads')).records.some((record: any) => record.status === 'failed'), false, 'S2\'s failure is not in S1\'s list')
  })

  it('filenames: a path or traversal is INVALID_ARGS; a hostile server-suggested name is reduced into the directory', async () => {
    const before = listDir(downloadsOf(harness))
    for (const filename of ['../x.bin', '/etc/passwd', 'a\\b', '..', 'NUL']) {
      const envelope = await harness.action(S1, 'target.download', { url: url('/file.bin'), filename })
      assert.equal(envelope.ok, false, filename)
      assert.equal(envelope.error.code, 'INVALID_ARGS', filename)
    }
    assert.deepEqual(listDir(downloadsOf(harness)), before, 'nothing was written')
    const evil = await harness.result(S1, 'target.download', { url: url('/evil-name') })
    assert.equal(path.dirname(evil.path), downloadsOf(harness))
    assert.equal(path.basename(evil.path), 'escape.txt')
    assert.equal(fs.existsSync(path.join(harness.dir, 'escape.txt')), false)
  })

  it('zero bytes and error statuses are errors, never files', async () => {
    const session = 'e2e-ctx-failures'
    const before = listDir(downloadsOf(harness))
    const empty = await harness.action(session, 'target.download', { url: url('/empty') })
    assert.equal(empty.ok, false)
    assert.match(empty.error.message, /zero bytes|empty/)
    const gone = await harness.action(session, 'target.download', { url: url('/gone') })
    assert.equal(gone.ok, false)
    assert.match(gone.error.message, /404/)
    assert.deepEqual(listDir(downloadsOf(harness)), before, 'no file, no temporary file')
    const records = (await harness.result(session, 'inspect.downloads')).records
    assert.ok(records.length >= 2 && records.every((record: any) => record.status === 'failed'))
  })

  it('a URL that only gives the file to a real navigation is captured from the browser download', async () => {
    const result = await harness.result('e2e-ctx-nav', 'target.download', { url: url('/nav-only') })
    assert.equal(result.source, 'browser')
    assert.equal(path.basename(result.path), 'nav.bin')
    assert.equal(result.sha256, sha(FILE))
    assert.deepEqual(fs.readFileSync(result.path), FILE)
  })

  it('a download over downloadMaxBytes is an error and leaves nothing (declared and chunked)', async () => {
    for (const route of ['/big', '/big-chunked']) {
      const envelope = await small.action('e2e-ctx-big', 'target.download', { url: url(route) })
      assert.equal(envelope.ok, false, route)
      assert.match(envelope.error.message, /larger than downloadMaxBytes \(100000 bytes\)/, route)
    }
    assert.deepEqual(listDir(downloadsOf(small)), [])
    const ok = await small.result('e2e-ctx-big', 'target.download', { url: url('/file.bin') })
    assert.equal(ok.bytes, FILE.length, 'a small file still works under the same cap')
  })

  it('a download started by a click is saved and listed by inspect.downloads', async () => {
    const session = 'e2e-ctx-click'
    await harness.result(session, 'target.open', { url: url('/page.html') })
    await harness.result(session, 'act.click', { selector: '#dl' })
    let record: any
    for (let attempt = 0; attempt < 50 && !record; attempt++) {
      record = (await harness.result(session, 'inspect.downloads')).records.find((entry: any) => entry.status === 'saved')
      if (!record) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(record, 'the click-triggered download shows up')
    assert.equal(record.source, 'browser')
    assert.equal(record.sha256, sha(FILE))
    assert.equal(path.dirname(record.path), downloadsOf(harness))
    assert.deepEqual(fs.readFileSync(record.path), FILE)
    // target.open results never carry a download path.
    const reopened = await harness.result(session, 'target.open', { url: url('/plain') })
    assert.equal(JSON.stringify(reopened).includes(downloadsOf(harness)), false)
    // clear drops the records, not the files.
    const cleared = await harness.result(session, 'inspect.downloads', { clear: true })
    assert.ok(cleared.records.length >= 1)
    assert.deepEqual((await harness.result(session, 'inspect.downloads')).records, [])
    assert.ok(fs.existsSync(record.path))
  })

  it('an auth profile keeps its login state off URLs outside its allowed domains', async () => {
    const stateFile = path.join(harness.dir, 'profile-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
    const port = new URL(server.base).port
    const scoped = createHarness(detection, { authProfiles: { scoped: { storageStatePath: stateFile, allowedDomains: ['allowed.localhost'], persistState: false } } })
    try {
      await scoped.result('e2e-ctx-profile', 'target.open', { url: `http://allowed.localhost:${port}/plain`, authProfile: 'scoped' })
      const hitsBefore = { ...server.hits }
      const refused = await scoped.action('e2e-ctx-profile', 'target.download', { url: url('/file.bin') })
      assert.equal(refused.ok, false)
      assert.equal(refused.error.code, 'POLICY_DENIED')
      assert.match(refused.error.message, /not allowed for 127\.0\.0\.1/)
      assert.deepEqual(server.hits, hitsBefore, 'nothing was sent to the unauthorized host')
      const allowed = await scoped.result('e2e-ctx-profile', 'target.download', { url: `http://allowed.localhost:${port}/file.bin` })
      assert.equal(allowed.sha256, sha(FILE))
    } finally {
      await scoped.dispose()
    }
  })
})

describe('an invalid configuration still loads, falls back and says why', { skip: detection.ok ? false : detection.reason }, () => {
  let broken: Harness
  let server: Fixture

  before(async () => {
    assert.ok(detection.ok)
    server = await startDownloadServer()
    // What a settings-card save used to be able to write: each of these made the plugin fail to load.
    broken = createHarness(detection, {
      viewportMode: 'custom', proxyServer: 'ftp://127.0.0.1:1', locale: 'not a locale', timezoneId: 'Mars/Base',
      downloadMaxBytes: 0, viewport: { width: 1, height: 2 },
    })
  })

  after(async () => {
    await broken?.dispose()
    await server?.close()
  })

  it('the browser works with the defaults, and runtime.status lists every ignored value with its reason', async () => {
    const opened = await broken.result('e2e-broken-1', 'target.open', { url: server.base + '/plain' })
    assert.equal(opened.title, 'Plain', 'no proxy was applied: the page loaded directly')
    const status = await broken.result('e2e-broken-1', 'runtime.status')
    const warnings: string[] = status.runtimeWarnings
    for (const key of ['viewportMode', 'proxyServer', 'locale', 'timezoneId', 'downloadMaxBytes', '"viewport"']) {
      assert.ok(warnings.some(warning => warning.includes(key)), `a warning names ${key}:\n${warnings.join('\n')}`)
    }
    assert.ok(warnings.every(warning => !warning.includes('ERR_') && warning.length < 600))
    assert.equal(status.downloadMaxBytes, 100 * 1024 * 1024)
    assert.deepEqual(status.contextDefaults, {})
    const report = await broken.result('e2e-broken-1', 'inspect.policy')
    assert.equal(report.revision, 0)
  })
})
