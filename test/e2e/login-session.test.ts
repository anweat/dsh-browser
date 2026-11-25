/**
 * Real-browser tests of the login-state carrier and of `searchPage`, against a loopback "site" that is the same
 * process for every host name (`<name>.localhost` resolves to loopback in Chromium). No real site, no account.
 *
 * - persistState write-back: two sites in one file, a "please log in + cookies cleared" answer, a one-time rotating
 *   token under concurrency, IndexedDB.
 * - searchPage: every state, with the pages that fooled the old fixed-sleep search.
 *
 * Run with `pnpm run test:e2e`; skipped, with the reason printed, when no browser is installed.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { loadBrowserRuntime } from '../../src/deps.ts'
import type { PlatformSpec } from '../../src/index.ts'
import { createHarness, detectBrowser, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e] login-session SKIPPED: ${detection.reason}`)

const rnd = () => crypto.randomBytes(6).toString('hex')
const results = (n: number) => '<div class=list>' + Array.from({ length: n }, (_, i) => `<div class=item><a class=t href="/item/${i}">Title ${i}</a><p class=s>Snippet ${i}</p></div>`).join('') + '</div>'
const NAV = '<nav>' + Array.from({ length: 12 }, (_, i) => `<a href="/section/${i}">Section number ${i}</a>`).join('') + '</nav>'
const SPEC: PlatformSpec = { item: '.item', title: '.t', link: '.t', text: '.s' }

interface Site { sids: Set<string>; family?: { cur: string; dead: boolean }; revoked: number; refreshOk: number; refreshBad: number; kickNext: boolean }

async function startSite() {
  const sites = new Map<string, Site>()
  const siteOf = (host: string) => { let site = sites.get(host); if (!site) { site = { sids: new Set(), revoked: 0, refreshOk: 0, refreshBad: 0, kickNext: false }; sites.set(host, site) } return site }
  const server = http.createServer(async (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0]!.toLowerCase()
    const site = siteOf(host)
    const url = new URL(req.url ?? '/', 'http://' + req.headers.host)
    const cookies = Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)] }))
    const html = (body: string, { status = 200, headers = {} as Record<string, string | string[]> } = {}) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end('<!doctype html><meta charset=utf-8><title>fixture</title>' + body) }
    if (url.pathname === '/login') {
      const sid = rnd(), rt = rnd()
      site.sids.add(sid)
      site.family = { cur: rt, dead: false }
      return html(`<h1>logged in</h1><script>
        localStorage.setItem('ls','1')
        const o=indexedDB.open('auth',1); o.onupgradeneeded=()=>o.result.createObjectStore('t')
        o.onsuccess=()=>{const tx=o.result.transaction('t','readwrite'); tx.objectStore('t').put('1','tok'); tx.oncomplete=()=>{document.body.dataset.ready='1'}}
      </script>`, { headers: { 'set-cookie': [`sid=${sid}; Path=/; HttpOnly`, `rt=${rt}; Path=/; HttpOnly; Max-Age=2592000`] } })
    }
    if (url.pathname === '/probe') { // what of the login is still there, read by the page itself
      return html(`<pre id=out></pre><script>(async()=>{
        const idb=await new Promise(r=>{const o=indexedDB.open('auth',1);let fresh=false;o.onupgradeneeded=()=>{fresh=true;o.result.createObjectStore('t')};o.onsuccess=()=>{if(fresh)return r(false);const q=o.result.transaction('t').objectStore('t').get('tok');q.onsuccess=()=>r(q.result==='1');q.onerror=()=>r(false)};o.onerror=()=>r(false)})
        document.getElementById('out').textContent=JSON.stringify({sessionCookie:${JSON.stringify(site.sids.has(cookies.sid ?? ''))},localStorage:localStorage.getItem('ls')==='1',indexedDB:idb})
      })()</script>`)
    }
    if (url.pathname === '/search') { // a one-time rotating token: reusing an old one revokes the whole login
      await new Promise(resolve => setTimeout(resolve, 120))
      const family = site.family
      if (site.kickNext) { // risk control answers once with "please log in" and clears the cookies; the account itself is fine
        site.kickNext = false
        return html('<div class=login-box>请先登录</div><input type=password>', { headers: { 'set-cookie': ['rt=; Path=/; Max-Age=0', 'sid=; Path=/; Max-Age=0'] } })
      }
      if (!family || family.dead || cookies.rt !== family.cur) {
        if (family && cookies.rt && cookies.rt !== family.cur && !family.dead) { family.dead = true; site.revoked++ }
        site.refreshBad++
        return html('<div class=login-box>请先登录</div><input type=password>')
      }
      family.cur = rnd(); site.refreshOk++
      return html(results(5), { headers: { 'set-cookie': `rt=${family.cur}; Path=/; HttpOnly; Max-Age=2592000` } })
    }
    if (url.pathname === '/v') {
      const kind = url.searchParams.get('k')
      switch (kind) {
        case 'ok': return html(results(5))
        case 'many': return html(results(30))
        case 'lazy': return html(`<div id=root>${results(3)}</div><script>let done=false;addEventListener('wheel',()=>{if(done)return;done=true;document.getElementById('root').insertAdjacentHTML('beforeend',${JSON.stringify(results(5))})})</script>`)
        case 'late': return html(NAV + '<div id=root></div><script>setTimeout(()=>{document.getElementById("root").innerHTML=' + JSON.stringify(results(5)) + '},3000)</script>')
        case 'poll': return html(results(5) + '<script>setInterval(()=>fetch("/ping"),100)</script>')
        case 'empty': return html(NAV + '<main><p>没有找到相关结果</p></main><footer><a href="/about/us">About this site</a></footer>')
        case 'emptyselector': return html(NAV + '<main><div class=zero>Nothing here, sorry</div></main>')
        case 'nothing': return html('')
        case 'navonly': return html(NAV + '<main><p>Welcome back.</p></main><footer><a href="/terms/of/use">Terms of use</a><a href="/privacy/notice">Privacy notice</a><a href="/help/center">Help center</a></footer>')
        case 'resultslogin': return html('<header><a href="/login">登录</a></header>' + results(4) + '<div class=modal><input type=password placeholder=password><button>登录</button></div>')
        case 'login': return html('<div class=modal><h2>登录后查看更多结果</h2><input type=password placeholder=password><button>登录</button></div>')
        case 'loginredirect': res.writeHead(302, { location: '/signin?next=/v' }); return res.end()
        case 'hiddenpw': return html('<main><p>Welcome back.</p><form style="display:none"><input type=password></form><input type=password hidden></main>')
        case 'headerlogin': return html('<header><a href="/signin">登录</a> <a href="/register">注册</a></header><main><p>Welcome back.</p></main>')
        case 'captcha': return html('<div id=captcha-box><p>请完成安全验证</p><iframe src="/ping" title="captcha" width=300 height=80></iframe></div>')
        case 'drift': return html(NAV + '<main>' + Array.from({ length: 6 }, (_, i) => `<article class="x9f${i}"><h3><a href="/item/${i}">A redesigned result title ${i}</a></h3><p>Summary text ${i}</p></article>`).join('') + '</main>')
        case '401': return html('<p>unauthorized</p>', { status: 401 })
        case '403': return html('<p>forbidden</p>', { status: 403 })
        case '429': return html('too many requests', { status: 429, headers: { 'retry-after': '0' } })
        case '500': return html('<p>oops</p>', { status: 500 })
        case 'cloudflare': res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><html><head><title>Just a moment...</title></head><body><div id="challenge-stage"><div class="spinner" style="width:80px;height:80px">&nbsp;</div></div><h1>Verifying you are human. This may take a few seconds.</h1><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>')
        case 'cloudflaretext': res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>Just a moment...</title><p>Verifying you are human. This may take a few seconds.</p>')
        case 'zerocount': return html(NAV + '<main><p>共找到 0 条结果</p></main>')
        case 'smslogin': return html('<main><h2>验证码登录</h2><div class="captcha-row"><input type=tel placeholder="手机号"><input id="captcha-code" class="captcha-input" placeholder="请输入验证码"><button class="captcha-btn">获取验证码</button></div><button>登录</button></main>')
        case 'pwsms': return html('<main><div class=captcha-row><input type=password><input class="captcha-input" placeholder="短信验证码"><button class="captcha-btn">获取验证码</button></div></main>')
        case 'slider': return html('<header><a href="/signin">登录</a></header><main><div class="captcha-box"><iframe src="/ping" title="slider" width=300 height=80></iframe></div></main>')
        case '404': return html('<main><p>页面未找到</p><p>没有找到相关结果</p></main>', { status: 404 })
        case '410': return html('<main><p>Gone</p></main>', { status: 410 })
        case 'chromephrases': return html('<header><a href="/signin">请先登录</a></header><main><p>Welcome back.</p></main><footer><p>没有找到相关结果 · 安全验证 · 请先登录</p></footer>')
        case 'divdrift': return html(NAV + '<main><div>' + Array.from({ length: 7 }, (_, i) => `<div class="c${i}x"><h3><a href="/item/${i}">A plain div result title ${i}</a></h3></div>`).join('') + '</div></main><footer><a href="/terms/of/use">Terms of use</a></footer>')
        case 'emptyrecs': return html(NAV + '<main><p>没有找到相关结果</p><section><h4>猜你喜欢</h4>' + Array.from({ length: 6 }, (_, i) => `<div><a href="/rec/${i}">Recommended read number ${i}</a></div>`).join('') + '</section></main>')
        case 'cfscriptempty': return html(NAV + '<main><p>没有找到相关结果</p><script src="/cdn-cgi/challenge-platform/h/b/scripts/jsd/main.js"></script></main>')
        case 'hang': return // never answers
        default: return html('?')
      }
    }
    if (url.pathname === '/signin') return html('<h2>登录</h2><form><input name=user><input type=password></form>')
    if (url.pathname === '/ping') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('pong') }
    res.writeHead(404); res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    at: (name: string, pathAndQuery: string) => `http://${name}.localhost:${port}${pathAndQuery}`,
    site: (name: string) => siteOf(name + '.localhost'),
    port,
    stop: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

describe('login state and searchPage in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let site: Awaited<ReturnType<typeof startSite>>
  let harness: Harness
  let dir: string
  const files = (name: string) => path.join(dir, name + '.json')
  const read = (name: string) => JSON.parse(fs.readFileSync(files(name), 'utf8')) as { cookies: { name: string; value: string; domain: string }[]; origins: { origin: string; indexedDB?: unknown[]; localStorage?: unknown[] }[] }
  const profile = (file: string, host: string, persistState = true) => ({ storageStatePath: files(file), allowedDomains: [host + '.localhost'], persistState })
  const login = (name: string, profileId: string) => harness.service.render(site.at(name, '/login'), [], { authProfile: profileId, waitMs: 600 })
  const search = (name: string, profileId: string, count = 5) => harness.service.searchResults(site.at(name, '/search'), SPEC, { authProfile: profileId, count })
  const page = (kind: string, spec: PlatformSpec = SPEC, opts: Record<string, unknown> = {}) => harness.service.searchPage(site.at('sp', '/v?k=' + kind), spec, opts as never)

  before(async () => {
    assert.ok(detection.ok)
    site = await startSite()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-login-session-'))
    harness = createHarness(detection, {
      allowPrivateHosts: true,
      usagePolicy: { minDelayMs: 0, burst: 20, maxConcurrency: 2 },
      authProfiles: {
        shareda: profile('shared', 'sa'), sharedb: profile('shared', 'sb'),
        kick: profile('kick', 'kick'), rot: profile('rot', 'rot'), idb: profile('idb', 'idb'), live: profile('live', 'live'),
      },
    })
  })

  after(async () => {
    await harness?.dispose()
    await site?.stop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('two sites in one file: a profile that covers only one of them leaves the other alone, and the rotated token is saved', async () => {
    await login('sa', 'shareda')
    await login('sb', 'sharedb')
    assert.deepEqual([...new Set(read('shared').cookies.map(c => c.domain))].sort(), ['sa.localhost', 'sb.localhost'])
    const before = JSON.stringify(read('shared').cookies.filter(c => c.domain === 'sb.localhost'))
    assert.equal((await search('sa', 'shareda')).length, 5)
    const after = read('shared')
    assert.equal(JSON.stringify(after.cookies.filter(c => c.domain === 'sb.localhost')), before, 'the other site is byte-equivalent')
    assert.equal((await search('sa', 'shareda')).length, 5, 'the rotated token of site a was written back')
    assert.equal((await search('sb', 'sharedb')).length, 5)
    const both = await Promise.all([search('sa', 'shareda'), search('sb', 'sharedb'), search('sa', 'shareda'), search('sb', 'sharedb')])
    assert.deepEqual(both.map(items => items.length), [5, 5, 5, 5], 'two profiles on one file, concurrently')
    assert.equal(site.site('sa').revoked + site.site('sb').revoked, 0)
    assert.ok(fs.existsSync(files('shared') + '.bak'), 'the previous generation is kept')
    if (process.platform !== 'win32') assert.equal(fs.statSync(files('shared')).mode & 0o777, 0o600)
  })

  it('a transient "please log in" answer that clears the cookies is reported as needs_login and does not cost the login', async () => {
    await login('kick', 'kick')
    const before = fs.readFileSync(files('kick'), 'utf8')
    site.site('kick').kickNext = true
    const answer = await harness.service.searchPage(site.at('kick', '/search'), SPEC, { authProfile: 'kick' })
    assert.equal(answer.state, 'needs_login')
    assert.deepEqual(answer.items, [])
    assert.equal(answer.authProfile, 'kick')
    assert.equal(fs.readFileSync(files('kick'), 'utf8'), before, 'the good state is still in the file')
    assert.equal((await search('kick', 'kick')).length, 5, 'and the next search is logged in')
    assert.equal(site.site('kick').family!.dead, false)
    const status = (await harness.service.status()).authProfiles.find(entry => entry.id === 'kick')!
    assert.equal(status.writeBack?.outcome, 'written')
  })

  it('a one-time rotating token survives 3 concurrent searches x 3 rounds: 9 of 9', async () => {
    await login('rot', 'rot')
    let ok = 0
    for (let round = 0; round < 3; round++) {
      const got = await Promise.all([0, 1, 2].map(() => search('rot', 'rot').catch(() => [])))
      ok += got.filter(items => items.length > 0).length
    }
    assert.equal(ok, 9)
    assert.equal(site.site('rot').revoked, 0)
  })

  it('IndexedDB and localStorage survive a persistState round trip into a fresh context', async () => {
    await login('idb', 'idb')
    const first = read('idb')
    assert.ok(first.origins.some(origin => Array.isArray(origin.indexedDB) && origin.indexedDB.length > 0), 'the login wrote IndexedDB into the file')
    await search('idb', 'idb')
    await harness.service.render(site.at('idb', '/ping'), [], { authProfile: 'idb' })
    const origin = read('idb').origins.find(entry => entry.indexedDB)
    assert.ok(origin && origin.indexedDB!.length > 0, 'a later operation that never touched IndexedDB keeps it')
    const runtime = loadBrowserRuntime('playwright')
    const browser = await runtime.chromium.launch({ headless: true, ...detection.ok && detection.executablePath ? { executablePath: detection.executablePath } : { channel: detection.ok ? detection.channel : undefined } })
    try {
      const context = await browser.newContext({ storageState: files('idb') })
      const probe = await context.newPage()
      await probe.goto(site.at('idb', '/probe'))
      await probe.waitForFunction(() => document.getElementById('out')?.textContent)
      assert.deepEqual(JSON.parse((await probe.textContent('#out'))!), { sessionCookie: true, localStorage: true, indexedDB: true })
      await context.close()
    } finally { await browser.close() }
  })

  it('a render of an error page does not write the state either', async () => {
    await login('live', 'live')
    const before = fs.readFileSync(files('live'), 'utf8')
    const rendered = await harness.service.render(site.at('live', '/v?k=403'), [], { authProfile: 'live' })
    assert.match(rendered.text, /forbidden/)
    assert.equal(fs.readFileSync(files('live'), 'utf8'), before)
  })

  describe('searchPage', () => {
    const cases: { kind: string; state: string; maxMs?: number; minMs?: number; opts?: Record<string, unknown>; spec?: PlatformSpec; why: string }[] = [
      { kind: 'ok', state: 'ok', why: 'a normal list' },
      { kind: 'late', state: 'ok', minMs: 2800, maxMs: 6500, why: 'the list renders after 3 s while the navigation already has links' },
      { kind: 'poll', state: 'ok', maxMs: 4000, why: 'a page that polls forever does not delay the answer' },
      { kind: 'resultslogin', state: 'ok', why: 'results win over a login box' },
      { kind: 'empty', state: 'empty', maxMs: 4000, why: 'an explicit "no results" beside a nav full of links is empty, not contract_drift' },
      { kind: 'emptyselector', state: 'empty', maxMs: 4000, spec: { ...SPEC, emptySelector: '.zero' }, why: 'the site named its own empty marker' },
      { kind: 'drift', state: 'contract_drift', minMs: 3900, why: 'a list the selectors cannot read' },
      { kind: 'nothing', state: 'empty_unconfirmed', opts: { timeoutMs: 3500 }, why: 'nothing at all' },
      { kind: 'navonly', state: 'empty_unconfirmed', opts: { timeoutMs: 5200 }, why: 'only navigation and footer links are no list' },
      { kind: 'hiddenpw', state: 'empty_unconfirmed', opts: { timeoutMs: 3500 }, why: 'a hidden password input is no login signal' },
      { kind: 'headerlogin', state: 'empty_unconfirmed', opts: { timeoutMs: 3500 }, why: 'the word 登录 in a header is no login signal' },
      { kind: 'cloudflare', state: 'captcha', maxMs: 4500, why: 'a Cloudflare challenge (HTTP 403, markup, title and wording)' },
      { kind: 'cloudflaretext', state: 'captcha', maxMs: 4500, why: 'a 403 whose only sign is "Verifying you are human"' },
      { kind: 'zerocount', state: 'empty', maxMs: 4000, why: '共找到 0 条结果' },
      { kind: 'smslogin', state: 'needs_login', maxMs: 4500, why: 'an SMS-code login with captcha-named inputs is a login, not a captcha' },
      { kind: 'pwsms', state: 'needs_login', maxMs: 4500, why: 'a password form with SMS-code wording' },
      { kind: 'slider', state: 'captcha', maxMs: 4500, why: 'a real iframe captcha beside a login link' },
      { kind: '404', state: 'site_error', maxMs: 4500, why: 'a 404 that says 页面未找到 is not an empty result' },
      { kind: '410', state: 'site_error', maxMs: 4500, why: 'HTTP 410' },
      { kind: 'chromephrases', state: 'empty_unconfirmed', opts: { timeoutMs: 3500 }, why: 'phrases in a header link or a footer line decide nothing' },
      { kind: 'divdrift', state: 'contract_drift', minMs: 3900, maxMs: 6000, why: 'a plain div list with a nav and a footer around it' },
      { kind: 'emptyrecs', state: 'empty', maxMs: 4000, why: 'an explicit empty followed by a recommendations list' },
      { kind: 'cfscriptempty', state: 'empty', maxMs: 4000, why: 'the Cloudflare script is injected into ordinary pages' },
      { kind: 'login', state: 'needs_login', maxMs: 4500, why: 'a login wall' },
      { kind: 'loginredirect', state: 'needs_login', maxMs: 4500, why: 'a redirect to a sign-in page' },
      { kind: 'captcha', state: 'captcha', maxMs: 4500, why: 'a verification page' },
      { kind: '401', state: 'needs_login', maxMs: 4500, why: 'HTTP 401' },
      { kind: '403', state: 'blocked', maxMs: 4500, why: 'HTTP 403 without a captcha' },
      { kind: '429', state: 'rate_limited', maxMs: 2500, why: 'HTTP 429 at once' },
      { kind: '500', state: 'site_error', maxMs: 4500, why: 'HTTP 500' },
    ]
    for (const entry of cases) {
      it(`${entry.kind} -> ${entry.state}: ${entry.why}`, async () => {
        const answer = await page(entry.kind, entry.spec, entry.opts)
        assert.equal(answer.state, entry.state, answer.detail)
        assert.equal(answer.items.length > 0, entry.state === 'ok')
        assert.ok(answer.detail && answer.detail.length > 0)
        if (entry.maxMs) assert.ok(answer.tookMs < entry.maxMs, `took ${answer.tookMs} ms`)
        if (entry.minMs) assert.ok(answer.tookMs >= entry.minMs, `took ${answer.tookMs} ms`)
        assert.ok(answer.finalUrl && !answer.finalUrl.includes('?'), 'the final URL has no query: ' + answer.finalUrl)
      })
    }

    it('the main document status and a result list are reported; the list has the shape of searchResults', async () => {
      const answer = await page('ok', SPEC, { count: 3 })
      assert.equal(answer.status, 200)
      assert.equal(answer.items.length, 3)
      assert.deepEqual(Object.keys(answer.items[0]!).sort(), ['snippet', 'title', 'url'])
      assert.match(answer.items[0]!.url, /\/item\/0$/)
    })

    it('network and timeout are states, not throws', async () => {
      const refused = await harness.service.searchPage('http://127.0.0.1:9/v', SPEC, { timeoutMs: 3000 })
      assert.equal(refused.state, 'network')
      assert.equal(refused.detail!.includes('127.0.0.1'), false)
      const hung = await harness.service.searchPage(site.at('sp', '/v?k=hang'), SPEC, { timeoutMs: 1500 })
      assert.equal(hung.state, 'timeout')
    })

    it('configuration errors and cancellation still throw', async () => {
      await assert.rejects(() => harness.service.searchPage(site.at('sp', '/v?k=ok'), SPEC, { authProfile: 'nope' }), /unknown auth profile/)
      await assert.rejects(() => harness.service.searchPage(site.at('other', '/v?k=ok'), SPEC, { authProfile: 'live' }), /not allowed/)
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 300)
      await assert.rejects(() => harness.service.searchPage(site.at('sp', '/v?k=nothing'), SPEC, { signal: controller.signal, timeoutMs: 8000 }), /aborted|failed/)
    })

    it('searchResults keeps its public behaviour on top of searchPage', async () => {
      const items = await harness.service.searchResults(site.at('sp', '/v?k=ok'), SPEC, { count: 8 })
      assert.equal(items.length, 5)
      assert.equal((await harness.service.searchResults(site.at('sp', '/v?k=many'), SPEC, { count: 50 })).length, 20, 'the 20-item cap')
      assert.equal((await harness.service.searchResults(site.at('sp', '/v?k=many'), SPEC, { count: 4 })).length, 4)
      assert.equal((await harness.service.searchResults(site.at('sp', '/v?k=lazy'), SPEC, { count: 8 })).length, 8, 'one scroll loads the rest of a lazy list')
      assert.deepEqual(await harness.service.searchResults(site.at('sp', '/v?k=empty'), SPEC), [])
      assert.deepEqual(await harness.service.searchResults(site.at('sp', '/v?k=403'), SPEC), [])
      await assert.rejects(() => harness.service.searchResults('http://127.0.0.1:9/v', SPEC), /browser platform search failed for http:\/\/127\.0\.0\.1:9\/v/)
    })

    it('opts.waitMs and opts.cookies still apply', async () => {
      const started = Date.now()
      await harness.service.searchResults(site.at('sp', '/v?k=ok'), SPEC, { waitMs: 700, cookies: [{ name: 'x', value: '1', domain: 'sp.localhost', path: '/' }] })
      assert.ok(Date.now() - started >= 700)
    })
  })
})
