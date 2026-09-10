/**
 * BrowserService — the `browser` service provided by dsh-browser and injected
 * by consumers (web-search-pro).
 *
 * - Playwright (bundled chromium) is resolved from this plugin's own
 *   node_modules and launched lazily; the browser is reused for the plugin
 *   lifetime and disposed on unload.
 * - render / snapshot / searchResults are the drop-in replacements for
 *   web-search-pro's former PlaywrightManager (rules-aware page extraction and
 *   platform search-page list extraction run in the page itself).
 * - opencli(...) runs the bundled @jackwener/opencli (no global CLI).
 * - The interactive surface (open/click/type/hover/setFiles/evaluate/scroll/read/screenshot/closePage)
 *   drives ONE persistent context+page, giving the model multi-step browsing.
 *
 * The page-side extractors are raw JS strings, not closures: tsx/esbuild would
 * inject a __name helper into compiled closures, which does not exist in the
 * page context. Strings pass through unevaluated. Regex escapes are written
 * doubled (\\s) so the evaluated page code sees a correct \s.
 * @module dsh-browser/browser-service
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { browserRuntimeCliPath, loadBrowserRuntime, opencliEntryPath, runOpencli, runNode } from "./deps.js";
import { AuthProfileStore } from "./auth-profiles.js";
import { applyRuleSteps, resolveRulePack } from "./rule-packs.js";
import { runRecipe } from "./automation.js";
import { BUILTIN_SCRIPTS, builtinScript, executeUserscript, validateUserscript } from "./scripts.js";
import { configuredBrowserTools } from "./freedom.js";
import { filterOpencliCatalog, parseOpencliCatalog } from "./opencli-catalog.js";
import { UsageGovernor } from "./usage-policy.js";
/** Rules-aware content extractor (runs in the page). */
const EXTRACTOR_FN = `(ruleList) => {
  const doc = document
  const title = doc.title ? doc.title.trim() : ''
  let host = ''
  try { host = location.hostname } catch (e) {}
  const norm = (h) => { const x = h.toLowerCase(); return x.startsWith('www.') ? x.slice(4) : x }
  let rule = null
  for (const r of ruleList) {
    const rh = norm(r.hostname)
    if (host === rh || host.endsWith('.' + rh)) rule = r
  }
  const pick = (selectors) => {
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel)
        if (el && (el.textContent || '').trim().length > 40) return el
      } catch (e) {}
    }
    return null
  }
  const content = rule ? pick(rule.contentSelectors) : (pick(['article', 'main', '[role="main"]']) || doc.body)
  if (content && rule && rule.removeSelectors) {
    for (const sel of rule.removeSelectors) {
      try { content.querySelectorAll(sel).forEach((el) => el.remove()) } catch (e) {}
    }
  }
  const text = content ? (content.innerText || content.textContent || '') : ''
  return { title, text, html: doc.documentElement.outerHTML.slice(0, 2000000), usedRule: rule ? rule.hostname : null }
}`;
/** Platform search-page list extractor (runs in the page). */
const LIST_EXTRACTOR = `(spec) => {
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
}`;
const CRAWL_EXTRACTOR = `(maxChars) => {
  const root = document.querySelector('article, main, [role="main"]') || document.body
  const text = ((root && (root.innerText || root.textContent)) || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, maxChars)
  const links = []
  for (const anchor of document.querySelectorAll('a[href]')) {
    try {
      const url = new URL(anchor.href, location.href)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !links.includes(url.href)) links.push(url.href)
      if (links.length >= 500) break
    } catch (e) {}
  }
  return { title: document.title || '', text, links }
}`;
function uid() {
    return crypto.randomUUID();
}
function capText(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return text.slice(0, maxChars) + '\n\n(Content truncated at ' + maxChars + ' characters.)';
}
function specArg(spec) {
    return { item: spec.item, title: spec.title, link: spec.link, text: spec.text ?? '' };
}
function evaluateExtractor(page, rules) {
    return page.evaluate('(' + EXTRACTOR_FN + ')(' + JSON.stringify(rules) + ')');
}
function storageStateOptions(statePath, label, allowMissing = false) {
    if (!statePath)
        return {};
    if (!fs.existsSync(statePath)) {
        if (allowMissing)
            return {};
        throw new Error(`dsh-browser: ${label} storageState file does not exist: ${statePath}`);
    }
    if (!fs.statSync(statePath).isFile())
        throw new Error(`dsh-browser: ${label} storageState path is not a file: ${statePath}`);
    return { storageState: statePath };
}
function boundedString(value, label, max) {
    if (!value || value.length > max)
        throw new Error(`${label} must contain 1 to ${max} characters`);
    return value;
}
function boundedTimeout(value, label) {
    const resolved = value ?? 15_000;
    if (!Number.isFinite(resolved) || resolved < 1 || resolved > 30_000)
        throw new Error(`${label} must be between 1 and 30,000 ms`);
    return resolved;
}
function redactCaptureText(value, max = 2_000) {
    return value
        .replace(/\b(authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|session[-_]?id)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=[redacted]')
        .slice(0, max);
}
function redactCaptureUrl(value) {
    try {
        const parsed = new URL(value);
        for (const key of [...parsed.searchParams.keys()]) {
            if (/token|key|auth|session|cookie|password|secret/i.test(key))
                parsed.searchParams.set(key, '[redacted]');
        }
        return parsed.toString().slice(0, 2_000);
    }
    catch {
        return redactCaptureText(value);
    }
}
export class BrowserService {
    config;
    browser;
    launching;
    activeContext;
    activePage;
    activeProfile;
    activeRulePack;
    authProfiles;
    usageGovernor;
    opencliCatalogCache;
    captureConsoleEnabled = false;
    captureNetworkEnabled = false;
    capturedConsole = [];
    capturedRequests = [];
    constructor(config) {
        this.config = config;
        this.authProfiles = new AuthProfileStore(config.authProfiles);
        this.usageGovernor = new UsageGovernor(config.usagePolicy);
    }
    available() {
        return this.config.enabled;
    }
    assertEnabled() {
        if (!this.config.enabled)
            throw new Error('dsh-browser: browser service is disabled');
    }
    async ensure() {
        this.assertEnabled();
        if (this.browser && !this.browser.isConnected()) {
            this.browser = undefined;
            this.launching = undefined;
        }
        if (this.browser)
            return this.browser;
        if (!this.launching) {
            this.launching = (async () => {
                const pw = loadBrowserRuntime(this.config.browserRuntime);
                const launchOptions = { headless: this.config.headless };
                if (this.config.channel)
                    launchOptions.channel = this.config.channel;
                if (this.config.executablePath)
                    launchOptions.executablePath = this.config.executablePath;
                try {
                    this.browser = await pw.chromium.launch(launchOptions);
                }
                catch (error) {
                    const msg = String(error);
                    if (/Executable doesn't exist|playwright install|not found/i.test(msg)) {
                        if (this.config.autoInstall) {
                            await this.installChromium();
                            this.browser = await pw.chromium.launch(launchOptions);
                        }
                        else {
                            throw new Error('dsh-browser: chromium is not installed for ' + this.config.browserRuntime + '. Run the browser_install tool, or: node "' + browserRuntimeCliPath(this.config.browserRuntime) + '" install chromium');
                        }
                    }
                    else {
                        throw error;
                    }
                }
                this.browser.on?.('disconnected', () => {
                    this.browser = undefined;
                    this.launching = undefined;
                    this.activePage = undefined;
                    this.activeContext = undefined;
                });
                return this.browser;
            })().catch((error) => {
                this.launching = undefined;
                throw error;
            });
        }
        return this.launching;
    }
    /** Run `playwright install chromium` from the bundled playwright CLI. */
    installChromium() {
        this.assertEnabled();
        return runNode(browserRuntimeCliPath(this.config.browserRuntime), ['install', 'chromium'], { timeoutMs: 600_000, signal: undefined, maxOutput: 256 * 1024 });
    }
    async navigate(page, url, options, signal) {
        let response;
        for (let attempt = 0; attempt <= this.config.usagePolicy.retryLimit; attempt++) {
            response = await this.usageGovernor.run(url, () => page.goto(url, options), signal);
            const status = Number(response?.status?.() ?? 0);
            if (status >= 200 && status < 400)
                this.usageGovernor.noteResponse(url, status);
            if (![429, 502, 503, 504].includes(status))
                return response;
            const rawRetryAfter = String(response?.headers?.()?.['retry-after'] ?? '');
            const retryAfterMs = /^\d+(?:\.\d+)?$/.test(rawRetryAfter)
                ? Number(rawRetryAfter) * 1000
                : (Number.isFinite(Date.parse(rawRetryAfter)) ? Math.max(Date.parse(rawRetryAfter) - Date.now(), 0) : undefined);
            this.usageGovernor.noteResponse(url, status, retryAfterMs);
            if (attempt === this.config.usagePolicy.retryLimit)
                return response;
        }
        return response;
    }
    async transientContext(url, opts = {}) {
        let browser = await this.ensure();
        const profileId = opts.anonymous ? undefined : (opts.authProfile ?? this.config.defaultAuthProfile);
        const profile = profileId ? this.authProfiles.resolve(profileId, url) : undefined;
        const rulePack = resolveRulePack(this.config.rulePacks, opts.rulePack, url);
        const stateOptions = profile
            ? storageStateOptions(profile.storageStatePath, `auth profile ${profile.id}`, profile.persistState)
            : (!opts.anonymous ? storageStateOptions(this.config.storageStatePath, 'global') : {});
        let context;
        try {
            context = await browser.newContext(stateOptions);
        }
        catch (error) {
            if (!browser.isConnected()) {
                browser = await this.ensure();
                context = await browser.newContext(stateOptions);
            }
            else {
                throw error;
            }
        }
        try {
            if (rulePack?.initScriptPath)
                await context.addInitScript({ path: rulePack.initScriptPath });
        }
        catch (error) {
            await context.close().catch(() => { });
            throw error;
        }
        return { context, ...profile ? { profile } : {}, ...rulePack ? { rulePack } : {} };
    }
    async persistAndClose(session) {
        try {
            if (session.profile?.persistState) {
                const state = await session.context.storageState();
                fs.mkdirSync(path.dirname(session.profile.storageStatePath), { recursive: true });
                const temporary = session.profile.storageStatePath + '.tmp-' + uid().slice(0, 8);
                fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
                fs.renameSync(temporary, session.profile.storageStatePath);
            }
        }
        catch {
            // ignore storageState errors if context or browser closed/crashed
        }
        finally {
            await session.context.close().catch(() => { });
        }
    }
    // ── render / snapshot / searchResults (web-search-pro contract) ──────────
    async render(url, rules, opts = {}) {
        const session = await this.transientContext(url, opts);
        const { context } = session;
        const page = await context.newPage();
        const signal = opts.signal;
        const onAbort = () => void page.close().catch(() => { });
        if (signal?.aborted)
            onAbort();
        else
            signal?.addEventListener('abort', onAbort);
        try {
            page.setDefaultTimeout(20_000);
            await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 25_000 }, signal);
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
            await applyRuleSteps(page, session.rulePack);
            if (opts.waitMs)
                await page.waitForTimeout(opts.waitMs);
            const data = await evaluateExtractor(page, rules);
            return {
                title: String(data.title ?? ''),
                text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), opts.maxChars ?? 200_000),
                html: String(data.html ?? ''),
                ...data.usedRule ? { usedRule: String(data.usedRule) } : {},
            };
        }
        catch (error) {
            throw new Error('browser render failed for ' + url + ': ' + String(error).slice(0, 300));
        }
        finally {
            signal?.removeEventListener('abort', onAbort);
            await this.persistAndClose(session);
        }
    }
    async snapshot(url, rules, opts) {
        const session = await this.transientContext(url, opts);
        const { context } = session;
        const page = await context.newPage();
        const signal = opts.signal;
        const onAbort = () => void page.close().catch(() => { });
        if (signal?.aborted)
            onAbort();
        else
            signal?.addEventListener('abort', onAbort);
        fs.mkdirSync(opts.outDir, { recursive: true });
        const stamp = Date.now() + '-' + uid().slice(0, 8);
        const screenshotPath = opts.screenshot === false ? undefined : path.join(opts.outDir, stamp + '.png');
        const htmlPath = path.join(opts.outDir, stamp + '.html');
        try {
            page.setDefaultTimeout(25_000);
            await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal);
            await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { });
            await applyRuleSteps(page, session.rulePack);
            if (screenshotPath)
                await page.screenshot({ path: screenshotPath, fullPage: true });
            const html = await page.content();
            fs.writeFileSync(htmlPath, html, 'utf8');
            const data = await evaluateExtractor(page, rules);
            return {
                title: String(data.title ?? ''),
                text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), opts.maxChars ?? 200_000),
                ...screenshotPath ? { screenshotPath } : {},
                htmlPath,
                ...data.usedRule ? { usedRule: String(data.usedRule) } : {},
            };
        }
        catch (error) {
            throw new Error('browser snapshot failed for ' + url + ': ' + String(error).slice(0, 300));
        }
        finally {
            signal?.removeEventListener('abort', onAbort);
            await this.persistAndClose(session);
        }
    }
    async searchResults(url, spec, opts = {}) {
        const session = await this.transientContext(url, opts);
        const { context } = session;
        if (opts.cookies?.length)
            await context.addCookies(opts.cookies).catch(() => { });
        const page = await context.newPage();
        const signal = opts.signal;
        const onAbort = () => void page.close().catch(() => { });
        if (signal?.aborted)
            onAbort();
        else
            signal?.addEventListener('abort', onAbort);
        try {
            page.setDefaultTimeout(25_000);
            await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal);
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
            await applyRuleSteps(page, session.rulePack);
            if (opts.waitMs)
                await page.waitForTimeout(opts.waitMs);
            await page.mouse?.wheel(0, 2000).catch(() => { });
            await page.waitForTimeout(800);
            const data = await page.evaluate('(' + LIST_EXTRACTOR + ')(' + JSON.stringify(specArg(spec)) + ')');
            const rows = Array.isArray(data) ? data : [];
            return rows.slice(0, Math.min(Math.max(opts.count ?? 8, 1), 20)).map((r) => ({
                url: String(r.url ?? ''),
                title: String(r.title ?? ''),
                ...r.snippet ? { snippet: String(r.snippet) } : {},
            }));
        }
        catch (error) {
            throw new Error('browser platform search failed for ' + url + ': ' + String(error).slice(0, 300));
        }
        finally {
            signal?.removeEventListener('abort', onAbort);
            await this.persistAndClose(session);
        }
    }
    // ── bundled opencli ───────────────────────────────────────────────────────
    opencliAvailable() {
        if (!this.config.enabled || !this.config.opencliEnabled)
            return false;
        try {
            return fs.existsSync(opencliEntryPath());
        }
        catch {
            return false;
        }
    }
    opencli(args, opts = {}) {
        if (!this.config.enabled)
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: browser service is disabled', timedOut: false });
        if (!this.config.opencliEnabled)
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI is disabled', timedOut: false });
        if (!this.opencliAvailable())
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI entry is not installed', timedOut: false });
        if (args.length < 1 || args.length > 40 || args.some(arg => typeof arg !== 'string' || arg.length > 2_000)) {
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI requires 1 to 40 arguments, each at most 2000 characters', timedOut: false });
        }
        // OpenCLI adapters can issue real site traffic outside Playwright, so they
        // share the same approval-independent concurrency and burst buffer.
        return this.usageGovernor.run('https://opencli.local/', () => runOpencli(args, { ...opts, signal: opts.signal }), opts.signal);
    }
    opencliDoctor(signal) {
        return this.opencli(['doctor'], { timeoutMs: 30_000, signal });
    }
    async opencliCatalog(filter = {}, signal) {
        if (!this.config.opencliEnabled)
            throw new Error('dsh-browser: OpenCLI is disabled');
        if (!this.opencliCatalogCache) {
            const result = await this.opencli(['list', '-f', 'json'], { timeoutMs: 60_000, signal });
            if (result.code !== 0 || result.timedOut)
                throw new Error('OpenCLI catalog failed: ' + (result.stderr || result.stdout).slice(0, 500));
            this.opencliCatalogCache = parseOpencliCatalog(result.stdout);
        }
        return filterOpencliCatalog(this.opencliCatalogCache, filter);
    }
    async crawl(startUrls, opts = {}) {
        if (startUrls.length < 1 || startUrls.length > 5)
            throw new Error('browser crawl requires 1 to 5 start URLs');
        const normalized = startUrls.map(value => {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol))
                throw new Error('browser crawl only supports HTTP(S) URLs');
            url.hash = '';
            return url.href;
        });
        const maxPages = opts.maxPages ?? this.config.usagePolicy.maxPagesPerRun;
        const maxDepth = opts.maxDepth ?? this.config.usagePolicy.maxDepth;
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > this.config.usagePolicy.maxPagesPerRun) {
            throw new Error('browser crawl maxPages must be from 1 to configured usagePolicy.maxPagesPerRun (' + this.config.usagePolicy.maxPagesPerRun + ')');
        }
        if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > this.config.usagePolicy.maxDepth) {
            throw new Error('browser crawl maxDepth must be from 0 to configured usagePolicy.maxDepth (' + this.config.usagePolicy.maxDepth + ')');
        }
        const maxCharsPerPage = Math.min(Math.max(opts.maxCharsPerPage ?? 20_000, 1_000), 50_000);
        const sameOrigin = opts.sameOrigin ?? true;
        const allowedOrigins = new Set(normalized.map(value => new URL(value).origin));
        const queue = normalized.map(url => ({ url, depth: 0 }));
        const seen = new Set(normalized);
        const pages = [];
        const errors = [];
        const before = this.usageGovernor.snapshot();
        const started = Date.now();
        const session = await this.transientContext(normalized[0], { anonymous: true });
        try {
            while (queue.length && pages.length + errors.length < maxPages) {
                if (opts.signal?.aborted)
                    throw new Error('browser crawl aborted');
                const item = queue.shift();
                const page = await session.context.newPage();
                try {
                    page.setDefaultTimeout(30_000);
                    const response = await this.navigate(page, item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal);
                    const status = Number(response?.status?.() ?? 0);
                    if (sameOrigin && !allowedOrigins.has(new URL(page.url()).origin)) {
                        errors.push({ url: item.url, depth: item.depth, status, error: 'cross-origin redirect blocked: ' + page.url() });
                        continue;
                    }
                    if (status >= 400) {
                        errors.push({ url: item.url, depth: item.depth, status, error: 'HTTP ' + status });
                        continue;
                    }
                    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { });
                    const data = await page.evaluate('(' + CRAWL_EXTRACTOR + ')(' + maxCharsPerPage + ')');
                    pages.push({ url: page.url(), title: String(data.title ?? ''), text: String(data.text ?? ''), depth: item.depth, status });
                    if (item.depth >= maxDepth)
                        continue;
                    for (const rawLink of Array.isArray(data.links) ? data.links : []) {
                        let link;
                        try {
                            link = new URL(rawLink);
                            link.hash = '';
                        }
                        catch {
                            continue;
                        }
                        if (sameOrigin && !allowedOrigins.has(link.origin))
                            continue;
                        const href = link.href;
                        if (seen.has(href) || seen.size >= maxPages * 25)
                            continue;
                        seen.add(href);
                        queue.push({ url: href, depth: item.depth + 1 });
                    }
                }
                catch (error) {
                    errors.push({ url: item.url, depth: item.depth, error: String(error).slice(0, 500) });
                }
                finally {
                    await page.close().catch(() => { });
                }
            }
        }
        finally {
            await this.persistAndClose(session);
        }
        const after = this.usageGovernor.snapshot();
        return {
            pages,
            errors,
            stats: {
                pagesVisited: pages.length + errors.length,
                queued: queue.length,
                elapsedMs: Date.now() - started,
                waitMs: after.totalWaitMs - before.totalWaitMs,
                backoffEvents: after.backoffEvents - before.backoffEvents,
            },
            warnings: [
                'Bounded crawl: respect each site\'s terms, robots directives, copyright, privacy, and applicable law.',
                'No-approval mode skips human confirmation only; concurrency, burst, page/depth budgets, and server-pressure backoff remain active.',
            ],
        };
    }
    scriptCatalog() {
        return BUILTIN_SCRIPTS.map(script => ({
            id: script.id,
            name: script.name,
            description: script.description,
            sha256: validateUserscript(script.source).sha256,
        }));
    }
    validateUserscript(source, targetUrl) {
        return validateUserscript(source, targetUrl);
    }
    async runScript(url, source, opts = {}) {
        const validation = validateUserscript(source, url);
        if (!validation.valid)
            throw new Error('userscript validation failed: ' + validation.errors.join('; '));
        const session = await this.transientContext(url, opts);
        const page = await session.context.newPage();
        const signal = opts.signal;
        const onAbort = () => void page.close().catch(() => { });
        if (signal?.aborted)
            onAbort();
        else
            signal?.addEventListener('abort', onAbort);
        let timer;
        try {
            page.setDefaultTimeout(30_000);
            await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal);
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
            await applyRuleSteps(page, session.rulePack);
            const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 15_000, 1_000), 30_000);
            const timeout = new Promise((_resolve, reject) => {
                timer = setTimeout(() => {
                    void page.close().catch(() => { });
                    reject(new Error('userscript timed out after ' + timeoutMs + 'ms'));
                }, timeoutMs);
            });
            const executed = await Promise.race([executeUserscript(page, source, 100_000, opts.inputs), timeout]);
            return {
                url: page.url(),
                name: validation.metadata.name,
                sha256: validation.sha256,
                capabilities: validation.capabilities,
                resultJson: executed.resultJson,
                truncated: executed.truncated,
            };
        }
        finally {
            if (timer)
                clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            await this.persistAndClose(session);
        }
    }
    runBuiltinScript(url, id, opts = {}) {
        return this.runScript(url, builtinScript(id).source, opts);
    }
    runUserscript(url, source, opts = {}) {
        return this.runScript(url, source, opts);
    }
    // ── interactive surface (one persistent context + page) ──────────────────
    async ensureActivePage(targetUrl, opts = {}) {
        if (this.activePage && !this.activePage.isClosed() && this.browser?.isConnected()) {
            if (!targetUrl)
                return this.activePage;
            if ((opts.authProfile ?? this.config.defaultAuthProfile) === this.activeProfile?.id && opts.rulePack === this.activeRulePack?.id) {
                if (this.activeProfile)
                    this.authProfiles.resolve(this.activeProfile.id, targetUrl);
                if (this.activeRulePack)
                    resolveRulePack(this.config.rulePacks, this.activeRulePack.id, targetUrl);
                return this.activePage;
            }
            await this.closePage().catch(() => { });
        }
        else if (this.activePage || this.activeContext) {
            await this.closePage().catch(() => { });
        }
        if (targetUrl) {
            const session = await this.transientContext(targetUrl, opts);
            this.activeContext = session.context;
            this.activeProfile = session.profile;
            this.activeRulePack = session.rulePack;
        }
        else {
            const browser = await this.ensure();
            this.activeContext = await browser.newContext(storageStateOptions(this.config.storageStatePath, 'global'));
        }
        this.activePage = await this.activeContext.newPage();
        this.attachCapture(this.activePage);
        return this.activePage;
    }
    attachCapture(page) {
        page.on('console', (message) => {
            if (!this.captureConsoleEnabled)
                return;
            const location = message.location?.();
            this.capturedConsole.push({
                type: String(message.type?.() ?? 'log').slice(0, 40),
                text: redactCaptureText(String(message.text?.() ?? '')),
                ...location?.url ? { url: redactCaptureUrl(location.url) } : {},
                timestamp: new Date().toISOString(),
            });
            if (this.capturedConsole.length > 200)
                this.capturedConsole.splice(0, this.capturedConsole.length - 200);
        });
        page.on('response', (response) => {
            if (!this.captureNetworkEnabled)
                return;
            const status = Number(response.status?.() ?? 0);
            if (status < 400)
                return;
            const request = response.request?.();
            this.capturedRequests.push({
                method: String(request?.method?.() ?? 'GET').slice(0, 20),
                url: redactCaptureUrl(String(response.url?.() ?? '')),
                status,
                timestamp: new Date().toISOString(),
            });
            if (this.capturedRequests.length > 200)
                this.capturedRequests.splice(0, this.capturedRequests.length - 200);
        });
        page.on('requestfailed', (request) => {
            if (!this.captureNetworkEnabled)
                return;
            this.capturedRequests.push({
                method: String(request.method?.() ?? 'GET').slice(0, 20),
                url: redactCaptureUrl(String(request.url?.() ?? '')),
                failure: redactCaptureText(String(request.failure?.()?.errorText ?? 'request failed'), 500),
                timestamp: new Date().toISOString(),
            });
            if (this.capturedRequests.length > 200)
                this.capturedRequests.splice(0, this.capturedRequests.length - 200);
        });
        page.on?.('close', () => {
            if (this.activePage === page) {
                void this.closePage().catch(() => { });
            }
        });
        page.on?.('crash', () => {
            if (this.activePage === page) {
                void this.closePage().catch(() => { });
            }
        });
    }
    resetCapture(capture = []) {
        this.captureConsoleEnabled = capture.includes('console');
        this.captureNetworkEnabled = capture.includes('network');
        this.capturedConsole = [];
        this.capturedRequests = [];
    }
    resolveTarget(page, target) {
        if (!target || (typeof target !== 'string' && typeof target !== 'object'))
            throw new Error('browser target must be a selector string or locator object');
        const spec = typeof target === 'string' ? { selector: target } : target;
        const modes = [spec.selector, spec.role, spec.text, spec.label].filter(value => value !== undefined);
        if (modes.length !== 1)
            throw new Error('browser target requires exactly one of selector, role, text, or label');
        if (spec.name !== undefined && spec.role === undefined)
            throw new Error('browser target name is only valid with role');
        let root = page;
        if (spec.frame) {
            const frameModes = [spec.frame.selector, spec.frame.name, spec.frame.url].filter(value => value !== undefined);
            if (frameModes.length !== 1)
                throw new Error('browser frame requires exactly one of selector, name, or url');
            if (spec.frame.selector)
                root = page.frameLocator(boundedString(spec.frame.selector, 'frame selector', 500));
            else {
                const frame = page.frame(spec.frame.name
                    ? { name: boundedString(spec.frame.name, 'frame name', 500) }
                    : { url: boundedString(spec.frame.url, 'frame url', 2_000) });
                if (!frame)
                    throw new Error('browser target frame was not found');
                root = frame;
            }
        }
        if (spec.selector)
            return root.locator(boundedString(spec.selector, 'selector', 500));
        if (spec.role)
            return root.getByRole(boundedString(spec.role, 'role', 100), {
                ...spec.name !== undefined ? { name: boundedString(spec.name, 'role name', 2_000) } : {},
                exact: spec.exact ?? false,
            });
        if (spec.text)
            return root.getByText(boundedString(spec.text, 'text locator', 2_000), { exact: spec.exact ?? false });
        return root.getByLabel(boundedString(spec.label, 'label locator', 2_000), { exact: spec.exact ?? false });
    }
    screenshotFile(options) {
        const filename = options.filename ?? `shot-${Date.now()}-${uid().slice(0, 8)}.${options.format === 'jpeg' ? 'jpg' : 'png'}`;
        if (filename !== path.basename(filename) || !/^[\w.() -]{1,160}$/.test(filename)) {
            throw new Error('browser_screenshot filename must be a plain file name inside snapshotDir');
        }
        const extension = path.extname(filename).toLowerCase();
        const inferred = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension === '.png' ? 'png' : undefined;
        const format = options.format ?? inferred ?? 'png';
        if (inferred && inferred !== format)
            throw new Error('browser_screenshot filename extension does not match format');
        if (!inferred)
            throw new Error('browser_screenshot filename must end in .png, .jpg, or .jpeg');
        return { file: path.join(this.config.snapshotDir, filename), format };
    }
    async captureScreenshot(page, options = {}) {
        fs.mkdirSync(this.config.snapshotDir, { recursive: true });
        if (options.target && options.clip)
            throw new Error('browser_screenshot cannot combine target and clip');
        if (options.target && options.fullPage)
            throw new Error('browser_screenshot cannot combine target and fullPage');
        if (options.quality !== undefined && (!Number.isInteger(options.quality) || options.quality < 0 || options.quality > 100)) {
            throw new Error('browser_screenshot quality must be an integer from 0 to 100');
        }
        const { file, format } = this.screenshotFile(options);
        if (format === 'png' && options.quality !== undefined)
            throw new Error('browser_screenshot quality is only supported for jpeg');
        const screenshotOptions = {
            path: file,
            type: format,
            ...options.quality !== undefined ? { quality: options.quality } : {},
        };
        if (options.clip) {
            const { x, y, width, height } = options.clip;
            if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
                throw new Error('browser_screenshot clip must use finite non-negative coordinates and dimensions from 1 to 20,000');
            }
            screenshotOptions.clip = options.clip;
        }
        else if (!options.target) {
            screenshotOptions.fullPage = options.fullPage ?? true;
        }
        if (options.target)
            await this.resolveTarget(page, options.target).screenshot(screenshotOptions);
        else
            await page.screenshot(screenshotOptions);
        return file;
    }
    async readState(page, includeScreenshot) {
        const data = await evaluateExtractor(page, []);
        const state = {
            url: page.url(),
            title: String(data.title ?? ''),
            text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), 100_000),
        };
        if (includeScreenshot)
            state.screenshotPath = await this.captureScreenshot(page);
        return state;
    }
    async open(url, opts = {}) {
        const page = await this.ensureActivePage(url, opts);
        this.resetCapture(opts.capture);
        page.setDefaultTimeout(30_000);
        await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
        await applyRuleSteps(page, this.activeRulePack);
        if (opts.waitMs)
            await page.waitForTimeout(opts.waitMs);
        return this.readState(page, true);
    }
    async click(target, opts = {}) {
        const page = await this.ensureActivePage();
        await this.resolveTarget(page, target).click({ timeout: boundedTimeout(opts.timeoutMs, 'browser_click timeoutMs') });
        if (opts.waitMs !== undefined)
            await page.waitForTimeout(opts.waitMs);
        else
            await page.waitForTimeout(500);
        return this.readState(page, true);
    }
    async type(target, text, opts = {}) {
        const page = await this.ensureActivePage();
        await this.resolveTarget(page, target).fill(text, { timeout: boundedTimeout(opts.timeoutMs, 'browser_type timeoutMs') });
        return this.readState(page, false);
    }
    async wait(target, opts = {}) {
        const page = await this.ensureActivePage();
        const modes = [target !== undefined, opts.urlPattern !== undefined, opts.networkIdle === true, opts.timeMs !== undefined].filter(Boolean);
        if (modes.length !== 1)
            throw new Error('browser_wait requires exactly one target, urlPattern, networkIdle=true, or timeMs');
        const timeout = boundedTimeout(opts.timeoutMs, 'browser_wait timeoutMs');
        if (target !== undefined)
            await this.resolveTarget(page, target).waitFor({ state: opts.state ?? 'visible', timeout });
        else if (opts.urlPattern !== undefined)
            await page.waitForURL(boundedString(opts.urlPattern, 'urlPattern', 2_000), { timeout });
        else if (opts.networkIdle)
            await page.waitForLoadState('networkidle', { timeout });
        else {
            const timeMs = opts.timeMs;
            if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 10_000)
                throw new Error('browser_wait timeMs must be between 0 and 10,000');
            await page.waitForTimeout(timeMs);
        }
        return this.readState(page, false);
    }
    async press(target, key, opts = {}) {
        const page = await this.ensureActivePage();
        const value = boundedString(key, 'browser_press key', 100);
        if (target !== undefined)
            await this.resolveTarget(page, target).press(value, { timeout: boundedTimeout(opts.timeoutMs, 'browser_press timeoutMs') });
        else
            await page.keyboard.press(value);
        return this.readState(page, false);
    }
    async select(target, values, opts = {}) {
        if (values.length < 1 || values.length > 20)
            throw new Error('browser_select requires 1 to 20 values');
        values.forEach(value => boundedString(value, 'browser_select value', 2_000));
        const page = await this.ensureActivePage();
        await this.resolveTarget(page, target).selectOption([...values], { timeout: boundedTimeout(opts.timeoutMs, 'browser_select timeoutMs') });
        return this.readState(page, false);
    }
    async check(target, checked = true, opts = {}) {
        const page = await this.ensureActivePage();
        const locator = this.resolveTarget(page, target);
        if (checked)
            await locator.check({ timeout: boundedTimeout(opts.timeoutMs, 'browser_check timeoutMs') });
        else
            await locator.uncheck({ timeout: boundedTimeout(opts.timeoutMs, 'browser_check timeoutMs') });
        return this.readState(page, false);
    }
    async hover(target, opts = {}) {
        const page = await this.ensureActivePage();
        const timeoutMs = boundedTimeout(opts.timeoutMs, 'browser_hover timeoutMs');
        const waitMs = Math.min(Math.max(opts.waitMs ?? 300, 0), timeoutMs);
        await this.resolveTarget(page, target).hover({ timeout: timeoutMs });
        await page.waitForTimeout(waitMs);
        return this.readState(page, true);
    }
    async setFiles(target, files, opts = {}) {
        if (files.length === 0 || files.length > 20)
            throw new Error('browser_set_files requires 1 to 20 files');
        const resolved = files.map(file => {
            if (!path.isAbsolute(file))
                throw new Error('browser_set_files requires absolute file paths: ' + file);
            const real = fs.realpathSync(file);
            if (!fs.statSync(real).isFile())
                throw new Error('browser_set_files path is not a file: ' + file);
            return real;
        });
        const totalBytes = resolved.reduce((total, file) => total + fs.statSync(file).size, 0);
        if (totalBytes > 512 * 1024 * 1024)
            throw new Error('browser_set_files total upload size exceeds 512 MiB');
        const page = await this.ensureActivePage();
        await this.resolveTarget(page, target).setInputFiles(resolved, { timeout: boundedTimeout(opts.timeoutMs, 'browser_set_files timeoutMs') });
        return { ...await this.readState(page, true), files: resolved.map(file => path.basename(file)) };
    }
    async evaluate(expression, opts = {}) {
        const source = expression.trim();
        if (!source)
            throw new Error('browser_evaluate requires a JavaScript expression');
        if (source.length > 20_000)
            throw new Error('browser_evaluate expression exceeds 20,000 characters');
        const page = await this.ensureActivePage();
        const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 15_000, 1_000), 30_000);
        let timer;
        let timedOut = false;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                void (async () => {
                    try {
                        const session = await page.context().newCDPSession(page);
                        try {
                            await session.send('Runtime.terminateExecution');
                        }
                        finally {
                            await session.detach().catch(() => { });
                        }
                        reject(new Error('browser_evaluate timed out after ' + timeoutMs + 'ms; page JavaScript was terminated and the active page remains open'));
                    }
                    catch (error) {
                        reject(new Error('browser_evaluate timed out after ' + timeoutMs + 'ms; unable to terminate page JavaScript without closing the active page: ' + String(error).slice(0, 200)));
                    }
                })();
            }, timeoutMs);
        });
        try {
            const script = `(async () => {\nconst value = await (${source}\n);\nconst json = JSON.stringify(value);\nif (json === undefined) throw new Error('expression result is not JSON-serializable');\nreturn { resultJson: json.slice(0, 100000), truncated: json.length > 100000 };\n})()`;
            let result;
            try {
                result = await Promise.race([page.evaluate(script), timeout]);
            }
            catch (error) {
                if (timedOut)
                    throw new Error('browser_evaluate timed out after ' + timeoutMs + 'ms; page JavaScript was terminated and the active page remains open');
                throw error;
            }
            return {
                url: page.url(),
                resultJson: result.resultJson,
                truncated: result.truncated,
                capabilities: ['dom', 'page-javascript', 'page-network', 'page-storage'],
                warnings: [
                    'The expression runs with the current page origin and login state. It can mutate the page, access non-HttpOnly cookies and browser storage, and issue requests allowed by the browser.',
                    'Use this capability according to the target site rules and applicable requirements. The caller/operator is responsible for that decision; dsh-browser only executes approved browser operations.',
                    'The expression has no Node.js or direct host-filesystem access. Downloads are not persisted or returned by this tool.',
                ],
            };
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async scroll(deltaY, opts = {}) {
        const page = await this.ensureActivePage();
        await page.mouse?.wheel(0, deltaY || 2000).catch(() => { });
        await page.waitForTimeout(opts.waitMs ?? 500);
        return this.readState(page, false);
    }
    async read() {
        const page = await this.ensureActivePage();
        return this.readState(page, false);
    }
    consoleMessages(opts = {}) {
        const severities = ['debug', 'log', 'info', 'warning', 'error'];
        const threshold = opts.level ? severities.indexOf(opts.level) : 0;
        if (opts.level && threshold < 0)
            throw new Error('browser_console level must be debug, log, info, warning, or error');
        const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 200);
        const records = this.capturedConsole.filter(record => {
            const index = severities.indexOf(record.type === 'warn' ? 'warning' : record.type);
            return index < 0 || index >= threshold;
        }).slice(-limit);
        if (opts.clear)
            this.capturedConsole = [];
        return { enabled: this.captureConsoleEnabled, records };
    }
    networkRequests(opts = {}) {
        const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 200);
        const records = this.capturedRequests.slice(-limit);
        if (opts.clear)
            this.capturedRequests = [];
        return { enabled: this.captureNetworkEnabled, records };
    }
    async screenshot(options = {}) {
        const page = await this.ensureActivePage();
        return { path: await this.captureScreenshot(page, options) };
    }
    async recipe(steps, opts = {}) {
        if (!opts.url && (!this.activePage || this.activePage.isClosed()))
            throw new Error('browser recipe requires url or an active browser_open page');
        const page = await this.ensureActivePage(opts.url, opts);
        if (opts.url) {
            page.setDefaultTimeout(30_000);
            await this.navigate(page, opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal);
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
            await applyRuleSteps(page, this.activeRulePack);
            if (opts.waitMs)
                await page.waitForTimeout(opts.waitMs);
        }
        const onAbort = () => void this.closePage();
        if (opts.signal?.aborted)
            onAbort();
        else
            opts.signal?.addEventListener('abort', onAbort);
        try {
            const results = await runRecipe(page, steps, () => this.captureScreenshot(page), opts.signal);
            return { ...await this.readState(page, false), steps: results };
        }
        finally {
            opts.signal?.removeEventListener('abort', onAbort);
        }
    }
    async closePage() {
        const page = this.activePage;
        const context = this.activeContext;
        const profile = this.activeProfile;
        this.activePage = undefined;
        this.activeContext = undefined;
        this.activeProfile = undefined;
        this.activeRulePack = undefined;
        this.resetCapture();
        if (page)
            await page.close().catch(() => { });
        if (context)
            await this.persistAndClose({ context, ...profile ? { profile } : {} }).catch(() => { });
    }
    async status() {
        let chromiumInstalled = false;
        let chromiumExecutablePath;
        try {
            const pw = loadBrowserRuntime(this.config.browserRuntime);
            const expectedPath = this.config.executablePath || pw.chromium.executablePath();
            if (typeof expectedPath === 'string' && expectedPath.trim()) {
                chromiumExecutablePath = path.resolve(expectedPath);
                chromiumInstalled = fs.existsSync(chromiumExecutablePath);
            }
        }
        catch {
            chromiumInstalled = false;
        }
        let opencliInstalled = false;
        let resolvedOpencliEntryPath;
        try {
            resolvedOpencliEntryPath = path.resolve(opencliEntryPath());
            opencliInstalled = fs.existsSync(resolvedOpencliEntryPath);
        }
        catch {
            opencliInstalled = false;
        }
        const runtimeWarnings = this.config.browserRuntime === 'patchright'
            ? [
                'Patchright is Chromium-only and disables Playwright console APIs to avoid Runtime.enable detection.',
                ...(this.config.channel !== 'chrome' || this.config.headless
                    ? ['Patchright stealth is strongest with channel=chrome and headless=false; current settings favor automation/test compatibility.']
                    : []),
            ]
            : [];
        if (!chromiumInstalled && chromiumExecutablePath && (this.config.channel === 'chromium' || !!this.config.executablePath)) {
            runtimeWarnings.push(`Expected Chromium executable is missing: ${chromiumExecutablePath}. Run browser_install for ${this.config.browserRuntime}.`);
        }
        if (this.config.opencliEnabled && !opencliInstalled)
            runtimeWarnings.push('OpenCLI is enabled but its package entry is not installed.');
        return {
            enabled: this.config.enabled,
            channel: this.config.channel,
            browserRuntime: this.config.browserRuntime,
            runtimeWarnings,
            headless: this.config.headless,
            opencliEnabled: this.config.opencliEnabled,
            opencliInstalled,
            ...resolvedOpencliEntryPath ? { opencliEntryPath: resolvedOpencliEntryPath } : {},
            automationMode: this.config.automationMode,
            exposedTools: configuredBrowserTools(this.config.automationMode, this.config.automationAssets, this.config.enabled),
            directInteractionPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
            mutatingRecipePolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
            externalUserscriptPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            pageEvaluatePolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            fileUploadPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            opencliRunPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            chromiumInstalled,
            ...chromiumExecutablePath ? { chromiumExecutablePath } : {},
            usagePolicy: this.config.usagePolicy,
            usageGovernor: this.usageGovernor.snapshot(),
            authProfiles: this.authProfiles.list(),
            rulePacks: Object.keys(this.config.rulePacks).sort(),
            builtinScripts: BUILTIN_SCRIPTS.map(script => script.id),
            externalUserscriptsRequireApproval: ['standard', 'autonomous'].includes(this.config.automationMode),
            mutatingRecipesRequireApproval: this.config.automationMode === 'standard',
            ...(this.activePage && !this.activePage.isClosed() && this.browser?.isConnected() ? { activeUrl: this.activePage.url() } : {}),
            ...this.activeProfile ? { activeAuthProfile: this.activeProfile.id } : {},
        };
    }
    async close() {
        await this.closePage().catch(() => { });
        const b = this.browser;
        this.browser = undefined;
        this.launching = undefined;
        if (b) {
            try {
                await b.close();
            }
            catch { /* already closed */ }
        }
    }
}
//# sourceMappingURL=browser-service.js.map