/**
 * What a platform search page tells the caller: the in-page signal reader, and the pure judge that turns a series of
 * readings into one {@link SearchPageState}. The rules are those of the P0 `searchPage` contract between dsh-browser and web-search-pro: waiting is a race
 * between signals, not a fixed sleep; results beat everything; a negative signal (captcha, login, an error status, an
 * explicit "no results") has to stay for {@link HOLD_MS} before it is believed; `contract_drift` needs a settled page.
 * @module dsh-browser/search-signals
 */

/** Structural platform-search spec (matches web-search-pro's PlatformSearchSpec). The three selectors are optional hints for the page signals. */
export interface PlatformSpec {
  item: string
  title: string
  link: string
  text?: string
  /** A visible match means the site said, in its own markup, that there are no results. */
  emptySelector?: string
  /** A visible match means the page asks for a login. */
  loginSelector?: string
  /** A visible match means the page asks for a captcha or other human verification. */
  captchaSelector?: string
}

export interface SearchItem {
  url: string
  title: string
  snippet?: string
}

export type SearchPageState =
  | 'ok'
  | 'empty'
  | 'empty_unconfirmed'
  | 'needs_login' | 'captcha' | 'blocked' | 'rate_limited' | 'site_error'
  | 'network' | 'timeout'
  | 'contract_drift'

export interface SearchPageResult {
  state: SearchPageState
  /** Only `ok` has items; same shape as `searchResults`. */
  items: SearchItem[]
  tookMs: number
  /** HTTP status of the main document. */
  status?: number
  /** Final URL without query and hash. */
  finalUrl?: string
  /** One English sentence naming the basis. Never holds cookies, tokens or page text. */
  detail?: string
  /** Id of the auth profile that was used. */
  authProfile?: string
}

/** One reading of the page (see {@link signalsScript}). */
export interface SearchSample {
  items: SearchItem[]
  captcha: boolean
  login: boolean
  empty: boolean
  /** The largest group of same-shaped link rows outside navigation, header, footer and side bars. */
  listLike: number
  /** Number of DOM elements; a page that is still rendering keeps changing it. */
  nodes: number
}

export const POLL_MS = 150
/** A captcha / login / error status / "no results" has to be seen continuously for this long before it is believed. */
export const HOLD_MS = 1200
/** `contract_drift` is never judged before this much time has passed. */
export const DRIFT_AFTER_MS = 4000
/** ...and the DOM node count must have been unchanged for this long. */
export const DOM_STABLE_MS = 1000
/** A group of this many same-shaped link rows counts as a list. */
export const LIST_ROWS = 3
export const DEFAULT_SEARCH_TIMEOUT_MS = 12_000
export const MAX_RESULTS = 20

/**
 * Phrases about HUMAN verification (a slider, a puzzle, "verifying you are human", a Cloudflare interstitial). Read on the
 * title plus the main text of pages with little text of their own. The bare word 验证码 is deliberately not one: nearly every
 * Chinese login wall says 验证码登录 / 获取验证码 / 请输入验证码 (an SMS code), and that is a login, see {@link LOGIN_TEXT}.
 */
export const CAPTCHA_TEXT = /人机验证|(您|你)是否?是?真人|(验证|确认)(您|你)是真人|安全验证|滑动验证|拖动滑块|拖动.{0,6}滑块|(点选|图形|拼图|行为|滑块)验证|请?完成.{0,4}验证|点击.{0,6}完成验证|验证您是|验证你是|verif(y|ying) (that )?you are (a )?human|are you a (robot|human)|i'?m not a robot|(solve|complete) the captcha|unusual traffic|异常流量|just a moment|attention required|checking (if the site connection is secure|your browser)/i
/** Phrases that say a page wants a login. The bare word 登录 / "login" is deliberately not one (every header has it). */
export const LOGIN_TEXT = /请先登录|请登录|登录后(查看|可见|阅读|才能|继续|浏览)|扫码登录|未登录|验证码登录|短信登录|获取验证码|短信验证码|请输入验证码|手机号登录|密码登录|sign in to (continue|view|see)|log in to (continue|view|see)|please (log|sign) in|login required/i
/** Phrases that say, in words, that the search found nothing. */
export const EMPTY_TEXT = /没有找到|没有搜到|没有相关|未找到|暂无(相关)?(搜索)?结果|无(相关)?(搜索)?结果|搜索结果为空|(共|找到|搜到)\s*0\s*[条个项]|(?<![\d.,])0\s*[条个项]\s*(相关)?(搜索)?(结果|记录)|no (results?|matches)( found)?|nothing (was )?found|0 results|did not match any/i
/** Login page addresses: a redirect to one of these is a login signal. */
export const LOGIN_PATH = /(^|\/)(sign[-_]?in|log[-_]?in|passport|sso|auth)(\/|$|\.)/i
export const LOGIN_HOST = /^(passport|login|signin|accounts?|sso|auth)\./i
/** Pages with more text of their own than this are not "a wall": phrases in them are not read as a verdict. */
export const WALL_TEXT_MAX = 600
export const EMPTY_TEXT_MAX = 3000

/** Page-side list extractor (raw JS; tsx/esbuild would inject helpers into a closure). Also used by the signal reader. */
export const LIST_EXTRACTOR = `(spec) => {
  const items = []
  const nodes = document.querySelectorAll(spec.item)
  for (let i = 0; i < nodes.length && items.length < 20; i++) {
    const el = nodes[i]
    const titleEl = spec.title ? el.querySelector(spec.title) : null
    const linkEl = spec.link ? el.querySelector(spec.link) : null
    const textEl = spec.text ? el.querySelector(spec.text) : null
    const title = (titleEl ? titleEl.textContent : el.textContent || '').trim().replace(/\\s+/g, ' ')
    let url = linkEl ? (linkEl.href || linkEl.getAttribute('href') || '') : ''
    if (url && url.startsWith('/')) url = location.origin + url
    if (!url && linkEl === null && titleEl) { const a = titleEl.closest ? titleEl.closest('a') : null; if (a) url = a.href }
    const snippet = textEl ? (textEl.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300) : ''
    if (!url || !title || title.length < 2) continue
    items.push({ url, title, snippet })
  }
  return items
}`

/**
 * The page-side reader: items plus the signals, in one evaluation. Raw JS (see {@link LIST_EXTRACTOR}); the phrase
 * patterns are passed in as [source, flags] so the same RegExp objects are tested in Node and used in the page.
 * Real-page care: only VISIBLE elements count (a hidden password input is not a login), navigation / header / footer /
 * side-bar links are not a list, and the bare word 登录 in a header is not a login signal.
 */
export const SIGNALS_FN = `(cfg) => {
  const spec = cfg.spec
  const CHROME = 'header,nav,footer,aside,[role=banner],[role=navigation],[role=contentinfo],[role=complementary]'
  const re = (p) => new RegExp(p[0], p[1])
  const visible = (el) => {
    try {
      const r = el.getBoundingClientRect()
      if (!(r.width > 0 && r.height > 0)) return false
      const s = getComputedStyle(el)
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0
    } catch (e) { return false }
  }
  const inChrome = (el) => !!(el.closest && el.closest(CHROME))
  const anyVisible = (sel) => { if (!sel) return false; try { return Array.prototype.some.call(document.querySelectorAll(sel), visible) } catch (e) { return false } }
  const extract = ${LIST_EXTRACTOR}
  const items = extract(spec)
  const body = document.body
  // The text the page has of its own: the visible text nodes outside navigation / header / footer / side bars (and scripts).
  // Phrases are read from it, never from the chrome, so a header link or a footer line can not decide.
  const seen = new Map()
  const textVisible = (el) => { let v = seen.get(el); if (v === undefined) { v = visible(el); seen.set(el, v) } return v }
  let text = ''
  if (body) {
    const parts = []
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    let node, budget = 20000
    while ((node = walker.nextNode()) && budget-- > 0) {
      const value = (node.nodeValue || '').trim()
      const parent = node.parentElement
      if (!value || !parent || parent.closest(CHROME + ',script,style,noscript,template') || !textVisible(parent)) continue
      parts.push(value)
    }
    text = parts.join(' ')
  }
  const mainLen = text.length
  const wall = mainLen < cfg.wallMax
  const hasPassword = Array.prototype.some.call(document.querySelectorAll('input[type=password]'), (el) => visible(el) && !inChrome(el))
  let captcha = false, login = false, empty = false, listLike = 0
  if (items.length === 0) {
    captcha = anyVisible(spec.captchaSelector)
    if (!captcha) {
      // A box that carries a challenge holds an iframe, canvas or image. An input, button, label, link or textarea that merely
      // has "captcha" in its id or class is the SMS-code field of a login form. A login form's own image code is not a wall either.
      const hits = document.querySelectorAll('[id*=captcha i],[class*=captcha i],[id*=geetest i],[class*=geetest i],[class*=turnstile i],[id^=challenge-],[id^=cf-challenge],iframe[src*=captcha i],iframe[title*=captcha i],iframe[src*=hcaptcha i],iframe[src*=recaptcha i],iframe[src*="cdn-cgi/challenge-platform"]')
      captcha = Array.prototype.some.call(hits, (el) => {
        if (inChrome(el) || !visible(el)) return false
        const r = el.getBoundingClientRect()
        if (r.width < 60 || r.height < 30) return false
        if (el.tagName === 'IFRAME') return true
        if (hasPassword) return false
        if (/^(INPUT|BUTTON|LABEL|A|TEXTAREA|SELECT)$/.test(el.tagName)) return !!el.querySelector('iframe,canvas,img')
        return el.id.indexOf('challenge-') === 0 || el.id.indexOf('cf-challenge') === 0 || !!el.querySelector('iframe,canvas,img')
      })
    }
    // The Cloudflare challenge script alone is no signal: it is injected into ordinary pages (a short "no results" page too). Its challenge page is recognised by title, text and markup.
    if (!captcha && wall && re(cfg.captchaText).test((document.title || '') + ' ' + text)) captcha = true
    login = anyVisible(spec.loginSelector)
      || hasPassword
      || re(cfg.loginPath).test(location.pathname) || re(cfg.loginHost).test(location.hostname)
      || (wall && re(cfg.loginText).test(text))
    empty = anyVisible(spec.emptySelector) || (mainLen < cfg.emptyMax && re(cfg.emptyText).test(text))
    // Rows of same-shaped sibling elements that each hold a real link: a list the selectors do not cover.
    const groups = new Map()
    const anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'), 0, 600)
    for (const a of anchors) {
      const label = (a.textContent || '').trim()
      const href = a.getAttribute('href') || ''
      if (label.length < 4 || !href || href.charAt(0) === '#' || /^javascript:/i.test(href) || inChrome(a) || !visible(a)) continue
      let node = a
      for (let depth = 0; depth < 5 && node.parentElement && node.parentElement !== body; depth++) {
        const parent = node.parentElement
        let perParent = groups.get(parent)
        if (!perParent) { perParent = new Map(); groups.set(parent, perParent) }
        const key = node.tagName
        let rows = perParent.get(key)
        if (!rows) { rows = new Set(); perParent.set(key, rows) }
        rows.add(node)
        node = parent
      }
    }
    groups.forEach((perParent) => perParent.forEach((rows) => { if (rows.size > listLike) listLike = rows.size }))
  }
  return { items, captcha, login, empty, listLike, nodes: document.getElementsByTagName('*').length }
}`

const asPattern = (pattern: RegExp): [string, string] => [pattern.source, pattern.flags]

/** The argument of {@link SIGNALS_FN}. */
export function signalsArg(spec: PlatformSpec): Record<string, unknown> {
  return {
    spec: { item: spec.item, title: spec.title, link: spec.link, text: spec.text ?? '', emptySelector: spec.emptySelector ?? '', loginSelector: spec.loginSelector ?? '', captchaSelector: spec.captchaSelector ?? '' },
    captchaText: asPattern(CAPTCHA_TEXT), loginText: asPattern(LOGIN_TEXT), emptyText: asPattern(EMPTY_TEXT), loginPath: asPattern(LOGIN_PATH), loginHost: asPattern(LOGIN_HOST),
    wallMax: WALL_TEXT_MAX, emptyMax: EMPTY_TEXT_MAX,
  }
}

/** Expression for `page.evaluate`. */
export function signalsExpression(spec: PlatformSpec): string {
  return '(' + SIGNALS_FN + ')(' + JSON.stringify(signalsArg(spec)) + ')'
}

/** Whatever came back from the page, made safe to judge. */
export function normalizeSample(raw: unknown): SearchSample | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const items = (Array.isArray(row.items) ? row.items : []).slice(0, MAX_RESULTS).map((entry: any): SearchItem => ({
    url: String(entry?.url ?? ''),
    title: String(entry?.title ?? ''),
    ...entry?.snippet ? { snippet: String(entry.snippet) } : {},
  }))
  return { items, captcha: row.captcha === true, login: row.login === true, empty: row.empty === true, listLike: Number(row.listLike) || 0, nodes: Number(row.nodes) || 0 }
}

/** An address without its query and hash. */
export function stripUrl(url: string): string | undefined {
  try { const parsed = new URL(url); parsed.search = ''; parsed.hash = ''; return parsed.href } catch { return undefined }
}

export interface Verdict { state: Exclude<SearchPageState, 'network' | 'timeout'>; detail: string }

type Negative = 'captcha' | 'login' | 'status' | 'empty'
const ORDER: Negative[] = ['captcha', 'login', 'status', 'empty']

/**
 * Turns readings into a verdict. Feed it every reading with the time it was taken; it answers once it can. Time is
 * passed in, so the tests drive it with a fake clock.
 */
export class SearchJudge {
  private lastCount = 0
  private stable = 0
  private readonly since: Partial<Record<Negative, number>> = {}
  private lastNodes = -1
  private nodesChangedAt: number

  constructor(private readonly opts: { status?: number; startedAt: number; deadlineAt: number }) {
    this.nodesChangedAt = opts.startedAt
  }

  /** A verdict that needs no reading: the main document was a 429. */
  immediate(): Verdict | undefined {
    return this.opts.status === 429 ? { state: 'rate_limited', detail: 'main document answered HTTP 429' } : undefined
  }

  /** Pass `undefined` when the page could not be read this time (it was navigating). */
  observe(sample: SearchSample | undefined, now: number): Verdict | undefined {
    const status = this.opts.status ?? 0
    if (sample) {
      if (sample.items.length > 0) {
        this.stable = sample.items.length === this.lastCount ? this.stable + 1 : 1
        this.lastCount = sample.items.length
        for (const key of ORDER) delete this.since[key]
        this.noteNodes(sample.nodes, now)
        if (this.stable >= 2) return { state: 'ok', detail: `found ${sample.items.length} result items and the count was stable` }
        return undefined
      }
      this.lastCount = 0
      this.stable = 0
      this.mark('captcha', sample.captcha, now)
      this.mark('login', sample.login || status === 401, now)
      this.mark('status', status === 403 || status >= 400 && status !== 401 && status !== 429, now)
      this.mark('empty', sample.empty, now)
      this.noteNodes(sample.nodes, now)
      const decided = this.decide(now, false)
      if (decided) return decided
      if (now - this.opts.startedAt >= DRIFT_AFTER_MS && now - this.nodesChangedAt >= DOM_STABLE_MS && sample.listLike >= LIST_ROWS && !ORDER.some(key => this.since[key] !== undefined)) {
        return { state: 'contract_drift', detail: `the page holds ${sample.listLike} same-shaped link rows outside navigation but the selectors read none` }
      }
    }
    if (now >= this.opts.deadlineAt) return this.expire(now)
    return undefined
  }

  /** The time limit passed: a signal that is present now counts even if it was not held long enough; otherwise nothing was confirmed. */
  expire(now: number): Verdict {
    return this.decide(now, true) ?? { state: 'empty_unconfirmed', detail: 'no results and no explanation on the page before the time limit' }
  }

  private mark(key: Negative, active: boolean, now: number): void {
    if (!active) delete this.since[key]
    else if (this.since[key] === undefined) this.since[key] = now
  }

  private noteNodes(nodes: number, now: number): void {
    if (nodes !== this.lastNodes) { this.lastNodes = nodes; this.nodesChangedAt = now }
  }

  /** Priority captcha > login > status > empty. A held signal waits while a higher one is present but not held yet. */
  private decide(now: number, final: boolean): Verdict | undefined {
    const status = this.opts.status ?? 0
    for (const key of ORDER) {
      const at = this.since[key]
      if (at === undefined) continue
      if (!final && now - at < HOLD_MS) return undefined
      switch (key) {
        case 'captcha': return { state: 'captcha', detail: 'a captcha or human-verification page was shown' }
        case 'login': return { state: 'needs_login', detail: status === 401 ? 'main document answered HTTP 401' : 'the page asks for a login' }
        case 'status': return status === 403
          ? { state: 'blocked', detail: 'main document answered HTTP 403 with no captcha on the page' }
          : { state: 'site_error', detail: `main document answered HTTP ${status}` }
        case 'empty': return { state: 'empty', detail: 'the page says there are no results' }
      }
    }
    return undefined
  }
}

/** The state a navigation failure maps to. */
export function navigationFailure(error: unknown): { state: 'network' | 'timeout'; detail: string } {
  const text = String(error)
  if (/timeout|timed out/i.test(text)) return { state: 'timeout', detail: 'the page did not finish navigating before the time limit' }
  const code = /net::(ERR_[A-Z_]+)/.exec(text)?.[1] ?? /\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT)\b/.exec(text)?.[1]
  return { state: 'network', detail: 'the page could not be loaded' + (code ? ' (' + code + ')' : '') }
}

/** States after which the login state must not be written back: the page was not a normal answer. */
export const NO_WRITE_BACK_STATES: ReadonlySet<SearchPageState> = new Set(['needs_login', 'captcha', 'blocked', 'rate_limited', 'site_error', 'network', 'timeout'])
