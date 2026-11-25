/**
 * What a platform search page tells the caller: the in-page signal reader, and the pure judge that turns a series of
 * readings into one {@link SearchPageState}. The rules are those of the P0 `searchPage` contract between dsh-browser and web-search-pro: waiting is a race
 * between signals, not a fixed sleep; results beat everything; a negative signal (captcha, login, an error status, an
 * explicit "no results") has to stay for {@link HOLD_MS} before it is believed; `contract_drift` needs a settled page.
 * @module dsh-browser/search-signals
 */
/** Structural platform-search spec (matches web-search-pro's PlatformSearchSpec). The three selectors are optional hints for the page signals. */
export interface PlatformSpec {
    item: string;
    title: string;
    link: string;
    text?: string;
    /** A visible match means the site said, in its own markup, that there are no results. */
    emptySelector?: string;
    /** A visible match means the page asks for a login. */
    loginSelector?: string;
    /** A visible match means the page asks for a captcha or other human verification. */
    captchaSelector?: string;
}
export interface SearchItem {
    url: string;
    title: string;
    snippet?: string;
}
export type SearchPageState = 'ok' | 'empty' | 'empty_unconfirmed' | 'needs_login' | 'captcha' | 'blocked' | 'rate_limited' | 'site_error' | 'network' | 'timeout' | 'contract_drift';
export interface SearchPageResult {
    state: SearchPageState;
    /** Only `ok` has items; same shape as `searchResults`. */
    items: SearchItem[];
    tookMs: number;
    /** HTTP status of the main document. */
    status?: number;
    /** Final URL without query and hash. */
    finalUrl?: string;
    /** One English sentence naming the basis. Never holds cookies, tokens or page text. */
    detail?: string;
    /** Id of the auth profile that was used. */
    authProfile?: string;
}
/** One reading of the page (see {@link signalsScript}). */
export interface SearchSample {
    items: SearchItem[];
    captcha: boolean;
    login: boolean;
    empty: boolean;
    /** The largest group of same-shaped link rows outside navigation, header, footer and side bars. */
    listLike: number;
    /** Number of DOM elements; a page that is still rendering keeps changing it. */
    nodes: number;
}
export declare const POLL_MS = 150;
/** A captcha / login / error status / "no results" has to be seen continuously for this long before it is believed. */
export declare const HOLD_MS = 1200;
/** `contract_drift` is never judged before this much time has passed. */
export declare const DRIFT_AFTER_MS = 4000;
/** ...and the DOM node count must have been unchanged for this long. */
export declare const DOM_STABLE_MS = 1000;
/** A group of this many same-shaped link rows counts as a list. */
export declare const LIST_ROWS = 3;
export declare const DEFAULT_SEARCH_TIMEOUT_MS = 12000;
export declare const MAX_RESULTS = 20;
/**
 * Phrases about HUMAN verification (a slider, a puzzle, "verifying you are human", a Cloudflare interstitial). Read on the
 * title plus the main text of pages with little text of their own. The bare word 验证码 is deliberately not one: nearly every
 * Chinese login wall says 验证码登录 / 获取验证码 / 请输入验证码 (an SMS code), and that is a login, see {@link LOGIN_TEXT}.
 */
export declare const CAPTCHA_TEXT: RegExp;
/** Phrases that say a page wants a login. The bare word 登录 / "login" is deliberately not one (every header has it). */
export declare const LOGIN_TEXT: RegExp;
/** Phrases that say, in words, that the search found nothing. */
export declare const EMPTY_TEXT: RegExp;
/** Login page addresses: a redirect to one of these is a login signal. */
export declare const LOGIN_PATH: RegExp;
export declare const LOGIN_HOST: RegExp;
/** Pages with more text of their own than this are not "a wall": phrases in them are not read as a verdict. */
export declare const WALL_TEXT_MAX = 600;
export declare const EMPTY_TEXT_MAX = 3000;
/** Page-side list extractor (raw JS; tsx/esbuild would inject helpers into a closure). Also used by the signal reader. */
export declare const LIST_EXTRACTOR = "(spec) => {\n  const items = []\n  const nodes = document.querySelectorAll(spec.item)\n  for (let i = 0; i < nodes.length && items.length < 20; i++) {\n    const el = nodes[i]\n    const titleEl = spec.title ? el.querySelector(spec.title) : null\n    const linkEl = spec.link ? el.querySelector(spec.link) : null\n    const textEl = spec.text ? el.querySelector(spec.text) : null\n    const title = (titleEl ? titleEl.textContent : el.textContent || '').trim().replace(/\\s+/g, ' ')\n    let url = linkEl ? (linkEl.href || linkEl.getAttribute('href') || '') : ''\n    if (url && url.startsWith('/')) url = location.origin + url\n    if (!url && linkEl === null && titleEl) { const a = titleEl.closest ? titleEl.closest('a') : null; if (a) url = a.href }\n    const snippet = textEl ? (textEl.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300) : ''\n    if (!url || !title || title.length < 2) continue\n    items.push({ url, title, snippet })\n  }\n  return items\n}";
/**
 * The page-side reader: items plus the signals, in one evaluation. Raw JS (see {@link LIST_EXTRACTOR}); the phrase
 * patterns are passed in as [source, flags] so the same RegExp objects are tested in Node and used in the page.
 * Real-page care: only VISIBLE elements count (a hidden password input is not a login), navigation / header / footer /
 * side-bar links are not a list, and the bare word 登录 in a header is not a login signal.
 */
export declare const SIGNALS_FN = "(cfg) => {\n  const spec = cfg.spec\n  const CHROME = 'header,nav,footer,aside,[role=banner],[role=navigation],[role=contentinfo],[role=complementary]'\n  const re = (p) => new RegExp(p[0], p[1])\n  const visible = (el) => {\n    try {\n      const r = el.getBoundingClientRect()\n      if (!(r.width > 0 && r.height > 0)) return false\n      const s = getComputedStyle(el)\n      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0\n    } catch (e) { return false }\n  }\n  const inChrome = (el) => !!(el.closest && el.closest(CHROME))\n  const anyVisible = (sel) => { if (!sel) return false; try { return Array.prototype.some.call(document.querySelectorAll(sel), visible) } catch (e) { return false } }\n  const extract = (spec) => {\n  const items = []\n  const nodes = document.querySelectorAll(spec.item)\n  for (let i = 0; i < nodes.length && items.length < 20; i++) {\n    const el = nodes[i]\n    const titleEl = spec.title ? el.querySelector(spec.title) : null\n    const linkEl = spec.link ? el.querySelector(spec.link) : null\n    const textEl = spec.text ? el.querySelector(spec.text) : null\n    const title = (titleEl ? titleEl.textContent : el.textContent || '').trim().replace(/\\s+/g, ' ')\n    let url = linkEl ? (linkEl.href || linkEl.getAttribute('href') || '') : ''\n    if (url && url.startsWith('/')) url = location.origin + url\n    if (!url && linkEl === null && titleEl) { const a = titleEl.closest ? titleEl.closest('a') : null; if (a) url = a.href }\n    const snippet = textEl ? (textEl.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300) : ''\n    if (!url || !title || title.length < 2) continue\n    items.push({ url, title, snippet })\n  }\n  return items\n}\n  const items = extract(spec)\n  const body = document.body\n  // The text the page has of its own: the visible text nodes outside navigation / header / footer / side bars (and scripts).\n  // Phrases are read from it, never from the chrome, so a header link or a footer line can not decide.\n  const seen = new Map()\n  const textVisible = (el) => { let v = seen.get(el); if (v === undefined) { v = visible(el); seen.set(el, v) } return v }\n  let text = ''\n  if (body) {\n    const parts = []\n    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)\n    let node, budget = 20000\n    while ((node = walker.nextNode()) && budget-- > 0) {\n      const value = (node.nodeValue || '').trim()\n      const parent = node.parentElement\n      if (!value || !parent || parent.closest(CHROME + ',script,style,noscript,template') || !textVisible(parent)) continue\n      parts.push(value)\n    }\n    text = parts.join(' ')\n  }\n  const mainLen = text.length\n  const wall = mainLen < cfg.wallMax\n  const hasPassword = Array.prototype.some.call(document.querySelectorAll('input[type=password]'), (el) => visible(el) && !inChrome(el))\n  let captcha = false, login = false, empty = false, listLike = 0\n  if (items.length === 0) {\n    captcha = anyVisible(spec.captchaSelector)\n    if (!captcha) {\n      // A box that carries a challenge holds an iframe, canvas or image. An input, button, label, link or textarea that merely\n      // has \"captcha\" in its id or class is the SMS-code field of a login form. A login form's own image code is not a wall either.\n      const hits = document.querySelectorAll('[id*=captcha i],[class*=captcha i],[id*=geetest i],[class*=geetest i],[class*=turnstile i],[id^=challenge-],[id^=cf-challenge],iframe[src*=captcha i],iframe[title*=captcha i],iframe[src*=hcaptcha i],iframe[src*=recaptcha i],iframe[src*=\"cdn-cgi/challenge-platform\"]')\n      captcha = Array.prototype.some.call(hits, (el) => {\n        if (inChrome(el) || !visible(el)) return false\n        const r = el.getBoundingClientRect()\n        if (r.width < 60 || r.height < 30) return false\n        if (el.tagName === 'IFRAME') return true\n        if (hasPassword) return false\n        if (/^(INPUT|BUTTON|LABEL|A|TEXTAREA|SELECT)$/.test(el.tagName)) return !!el.querySelector('iframe,canvas,img')\n        return el.id.indexOf('challenge-') === 0 || el.id.indexOf('cf-challenge') === 0 || !!el.querySelector('iframe,canvas,img')\n      })\n    }\n    // The Cloudflare script alone is on many ordinary pages: it only counts on a page with next to no text.\n    if (!captcha && mainLen < 200 && document.querySelector('script[src*=\"cdn-cgi/challenge-platform\"]')) captcha = true\n    if (!captcha && wall && re(cfg.captchaText).test((document.title || '') + ' ' + text)) captcha = true\n    login = anyVisible(spec.loginSelector)\n      || hasPassword\n      || re(cfg.loginPath).test(location.pathname) || re(cfg.loginHost).test(location.hostname)\n      || (wall && re(cfg.loginText).test(text))\n    empty = anyVisible(spec.emptySelector) || (mainLen < cfg.emptyMax && re(cfg.emptyText).test(text))\n    // Rows of same-shaped sibling elements that each hold a real link: a list the selectors do not cover.\n    const groups = new Map()\n    const anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]'), 0, 600)\n    for (const a of anchors) {\n      const label = (a.textContent || '').trim()\n      const href = a.getAttribute('href') || ''\n      if (label.length < 4 || !href || href.charAt(0) === '#' || /^javascript:/i.test(href) || inChrome(a) || !visible(a)) continue\n      let node = a\n      for (let depth = 0; depth < 5 && node.parentElement && node.parentElement !== body; depth++) {\n        const parent = node.parentElement\n        let perParent = groups.get(parent)\n        if (!perParent) { perParent = new Map(); groups.set(parent, perParent) }\n        const key = node.tagName\n        let rows = perParent.get(key)\n        if (!rows) { rows = new Set(); perParent.set(key, rows) }\n        rows.add(node)\n        node = parent\n      }\n    }\n    groups.forEach((perParent) => perParent.forEach((rows) => { if (rows.size > listLike) listLike = rows.size }))\n  }\n  return { items, captcha, login, empty, listLike, nodes: document.getElementsByTagName('*').length }\n}";
/** The argument of {@link SIGNALS_FN}. */
export declare function signalsArg(spec: PlatformSpec): Record<string, unknown>;
/** Expression for `page.evaluate`. */
export declare function signalsExpression(spec: PlatformSpec): string;
/** Whatever came back from the page, made safe to judge. */
export declare function normalizeSample(raw: unknown): SearchSample | undefined;
/** An address without its query and hash. */
export declare function stripUrl(url: string): string | undefined;
export interface Verdict {
    state: Exclude<SearchPageState, 'network' | 'timeout'>;
    detail: string;
}
/**
 * Turns readings into a verdict. Feed it every reading with the time it was taken; it answers once it can. Time is
 * passed in, so the tests drive it with a fake clock.
 */
export declare class SearchJudge {
    private readonly opts;
    private lastCount;
    private stable;
    private readonly since;
    private lastNodes;
    private nodesChangedAt;
    constructor(opts: {
        status?: number;
        startedAt: number;
        deadlineAt: number;
    });
    /** A verdict that needs no reading: the main document was a 429. */
    immediate(): Verdict | undefined;
    /** Pass `undefined` when the page could not be read this time (it was navigating). */
    observe(sample: SearchSample | undefined, now: number): Verdict | undefined;
    /** The time limit passed: a signal that is present now counts even if it was not held long enough; otherwise nothing was confirmed. */
    expire(now: number): Verdict;
    private mark;
    private noteNodes;
    /** Priority captcha > login > status > empty. A held signal waits while a higher one is present but not held yet. */
    private decide;
}
/** The state a navigation failure maps to. */
export declare function navigationFailure(error: unknown): {
    state: 'network' | 'timeout';
    detail: string;
};
/** States after which the login state must not be written back: the page was not a normal answer. */
export declare const NO_WRITE_BACK_STATES: ReadonlySet<SearchPageState>;
