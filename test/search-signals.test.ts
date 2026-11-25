import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPTCHA_TEXT, DRIFT_AFTER_MS, EMPTY_TEXT, HOLD_MS, LOGIN_HOST, LOGIN_PATH, LOGIN_TEXT, NO_WRITE_BACK_STATES, POLL_MS, SIGNALS_FN, SearchJudge, navigationFailure, normalizeSample, signalsArg, signalsExpression, stripUrl,
  type SearchItem, type SearchSample,
} from '../src/search-signals.ts'

const item = (n: number): SearchItem => ({ url: 'https://x.test/' + n, title: 'title ' + n })
const sample = (over: Partial<SearchSample> = {}): SearchSample => ({ items: [], captcha: false, login: false, empty: false, listLike: 0, nodes: 50, ...over })

/** Run a judge against a script of readings at 150 ms steps; returns the verdict and the time it came at. */
function run(readings: (t: number) => SearchSample | undefined, opts: { status?: number; deadline?: number; maxMs?: number } = {}) {
  const judge = new SearchJudge({ ...opts.status ? { status: opts.status } : {}, startedAt: 0, deadlineAt: opts.deadline ?? 12_000 })
  const immediate = judge.immediate()
  if (immediate) return { verdict: immediate, at: 0 }
  for (let t = 0; t <= (opts.maxMs ?? 20_000); t += POLL_MS) {
    const verdict = judge.observe(readings(t), t)
    if (verdict) return { verdict, at: t }
  }
  return { verdict: undefined, at: -1 }
}

test('results win and need two equal counts in a row; a growing list keeps waiting', () => {
  assert.deepEqual(run(() => sample({ items: [item(1), item(2)] })), { verdict: { state: 'ok', detail: 'found 2 result items and the count was stable' }, at: POLL_MS })
  const growing = run(t => sample({ items: Array.from({ length: Math.min(1 + Math.floor(t / 150), 5) }, (_, i) => item(i)) }))
  assert.equal(growing.verdict?.state, 'ok')
  assert.ok(growing.at >= 600, 'it waited until the count stopped growing: ' + growing.at)
})

test('results beat every negative signal, including a login box, a captcha, an empty note and an error status', () => {
  for (const status of [0, 403, 500, 401]) {
    const { verdict } = run(() => sample({ items: [item(1)], login: true, captcha: true, empty: true }), { status })
    assert.equal(verdict?.state, 'ok', 'status ' + status)
  }
})

test('a negative signal that shows before the list renders is not believed: the list rendering inside the hold time wins', () => {
  const { verdict, at } = run(t => t < 900 ? sample({ login: true }) : sample({ items: [item(1), item(2), item(3)] }))
  assert.equal(verdict?.state, 'ok')
  assert.ok(at < HOLD_MS + 400)
})

test('a flickering negative signal restarts its hold time', () => {
  const { verdict } = run(t => sample({ login: Math.floor(t / 600) % 2 === 0, items: t >= 6000 ? [item(1)] : [] }))
  assert.equal(verdict?.state, 'ok')
})

test('status rules: 429 at once, 5xx site_error, 401 needs_login, 403 blocked, each only after the hold time except 429', () => {
  assert.deepEqual(run(() => sample(), { status: 429 }), { verdict: { state: 'rate_limited', detail: 'main document answered HTTP 429' }, at: 0 })
  const five = run(() => sample(), { status: 500 })
  assert.equal(five.verdict?.state, 'site_error')
  assert.ok(five.at >= HOLD_MS)
  assert.match(five.verdict!.detail, /HTTP 500/)
  assert.equal(run(() => sample(), { status: 401 }).verdict?.state, 'needs_login')
  assert.equal(run(() => sample(), { status: 403 }).verdict?.state, 'blocked')
  assert.equal(run(() => sample({ captcha: true }), { status: 403 }).verdict?.state, 'captcha', '403 with a captcha on the page is a captcha')
})

test('priority captcha > login > status > empty, also when the lower signal was held first', () => {
  assert.equal(run(() => sample({ captcha: true, login: true, empty: true }), { status: 500 }).verdict?.state, 'captcha')
  assert.equal(run(() => sample({ login: true, empty: true }), { status: 500 }).verdict?.state, 'needs_login')
  assert.equal(run(() => sample({ empty: true }), { status: 500 }).verdict?.state, 'site_error')
  assert.equal(run(() => sample({ empty: true })).verdict?.state, 'empty')
  // a 403 is held from the start, the captcha only shows after 0.6 s: the verdict still waits for it and says captcha
  assert.equal(run(t => sample({ captcha: t >= 600 }), { status: 403 }).verdict?.state, 'captcha')
})

test('an explicit empty and a login wall are only believed after the hold time', () => {
  for (const [signal, state] of [['empty', 'empty'], ['login', 'needs_login'], ['captcha', 'captcha']] as const) {
    const { verdict, at } = run(() => sample({ [signal]: true }))
    assert.equal(verdict?.state, state)
    assert.ok(at >= HOLD_MS && at < HOLD_MS + 2 * POLL_MS, signal + ' at ' + at)
  }
})

test('contract_drift: not before 4 s, not while the DOM is still changing, not for nothing, and not when a signal explains the page', () => {
  const settled = (t: number) => sample({ listLike: 6, nodes: 200 })
  const calm = run(settled)
  assert.equal(calm.verdict?.state, 'contract_drift')
  assert.ok(calm.at >= DRIFT_AFTER_MS)
  assert.equal(run(t => sample({ listLike: 6, nodes: 200 + Math.floor(t / 400) }), { deadline: 9000 }).verdict?.state, 'empty_unconfirmed', 'a page that keeps changing is not judged')
  assert.equal(run(() => sample({ listLike: 2, nodes: 200 })).verdict?.state, 'empty_unconfirmed', 'two rows are not a list')
  assert.equal(run(() => sample({ listLike: 6, empty: true })).verdict?.state, 'empty', 'an explicit empty is judged long before 4 s')
})

test('nothing at all: empty_unconfirmed at the time limit; an unreadable page (navigating) is not a verdict by itself', () => {
  const nothing = run(() => sample(), { deadline: 6000 })
  assert.equal(nothing.verdict?.state, 'empty_unconfirmed')
  assert.ok(nothing.at >= 6000 && nothing.at < 6000 + POLL_MS)
  assert.equal(run(() => undefined, { deadline: 3000 }).verdict?.state, 'empty_unconfirmed')
  assert.equal(run(t => t < 2000 ? undefined : sample({ items: [item(1)] })).verdict?.state, 'ok')
})

test('at the time limit a signal that is present counts even before it was held for long enough', () => {
  const judge = new SearchJudge({ startedAt: 0, deadlineAt: 500 })
  assert.equal(judge.observe(sample({ login: true }), 400), undefined)
  assert.equal(judge.observe(sample({ login: true }), 600)?.state, 'needs_login')
})

test('details are one English line that never repeats page content', () => {
  const states = [run(() => sample({ captcha: true })), run(() => sample({ login: true })), run(() => sample({ empty: true })), run(() => sample({ listLike: 5 })), run(() => sample(), { status: 500 })]
  for (const { verdict } of states) assert.match(verdict!.detail, /^[A-Za-z0-9 ,.\-]+$/)
})

test('normalizeSample reads what a page returned and refuses garbage', () => {
  assert.equal(normalizeSample(undefined), undefined)
  assert.equal(normalizeSample('x'), undefined)
  const clean = normalizeSample({ items: [{ url: 'u', title: 't', snippet: 's' }, { url: 'v', title: 'w', snippet: '' }, null], captcha: true, login: 'yes', listLike: '4', nodes: 9 })!
  assert.deepEqual(clean.items, [{ url: 'u', title: 't', snippet: 's' }, { url: 'v', title: 'w' }, { url: '', title: '' }])
  assert.equal(clean.captcha, true)
  assert.equal(clean.login, false)
  assert.equal(clean.listLike, 4)
  assert.equal(normalizeSample({ items: Array.from({ length: 50 }, (_, i) => ({ url: 'u' + i, title: 't' })) })!.items.length, 20)
})

test('the phrase patterns read login, captcha and empty walls and ignore a bare 登录 in a header', () => {
  for (const text of ['请先登录后继续', '登录后查看更多结果', '扫码登录', 'Please sign in', 'Log in to continue']) assert.ok(LOGIN_TEXT.test(text), text)
  for (const text of ['首页 登录 注册', 'Login', 'Sign in', '登录']) assert.equal(LOGIN_TEXT.test(text), false, text)
  for (const text of ['请完成安全验证', '人机验证', 'Please verify you are human', 'captcha']) assert.ok(CAPTCHA_TEXT.test(text), text)
  assert.equal(CAPTCHA_TEXT.test('验证 结果 列表'), false)
  for (const text of ['没有找到相关结果', '暂无结果', 'No results found', '0 results for x']) assert.ok(EMPTY_TEXT.test(text), text)
  assert.equal(EMPTY_TEXT.test('找到 3 条结果'), false)
  assert.ok(LOGIN_PATH.test('/signin') && LOGIN_PATH.test('/account/login/') && LOGIN_PATH.test('/passport/') && !LOGIN_PATH.test('/search') && !LOGIN_PATH.test('/blogin-fest'))
  assert.ok(LOGIN_HOST.test('passport.example.com') && !LOGIN_HOST.test('www.example.com'))
})

test('the page-side script is plain source (no helpers a transpiler could inject) and its argument carries the optional selectors', () => {
  const expression = signalsExpression({ item: '.i', title: '.t', link: 'a', emptySelector: '.none', loginSelector: '.login', captchaSelector: '.cap' })
  assert.doesNotThrow(() => new Function('return ' + SIGNALS_FN))
  assert.doesNotThrow(() => new Function('return ' + expression))
  assert.equal(expression.includes('__name'), false)
  const arg = signalsArg({ item: '.i', title: '.t', link: 'a', emptySelector: '.none' }) as { spec: Record<string, string> }
  assert.equal(arg.spec.emptySelector, '.none')
  assert.equal(arg.spec.loginSelector, '')
})

test('stripUrl drops query and hash; navigationFailure tells timeouts from network errors; the no-write-back states are exactly the bad answers', () => {
  assert.equal(stripUrl('https://a.example.com/s?q=secret#frag'), 'https://a.example.com/s')
  assert.equal(stripUrl('not a url'), undefined)
  assert.equal(navigationFailure(new Error('page.goto: Timeout 12000ms exceeded.')).state, 'timeout')
  const net = navigationFailure(new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:9/'))
  assert.equal(net.state, 'network')
  assert.equal(net.detail.includes('127.0.0.1'), false)
  assert.deepEqual([...NO_WRITE_BACK_STATES].sort(), ['blocked', 'captcha', 'needs_login', 'network', 'rate_limited', 'site_error', 'timeout'])
})
