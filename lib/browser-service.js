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
 * - The interactive surface (open/click/type/scroll/read/screenshot/closePage)
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
import { loadPlaywright, runOpencli, runNode, playwrightCliPath } from "./deps.js";
import { AuthProfileStore } from "./auth-profiles.js";
import { applyRuleSteps, resolveRulePack } from "./rule-packs.js";
import { runRecipe } from "./automation.js";
import { BUILTIN_SCRIPTS, builtinScript, executeUserscript, validateUserscript } from "./scripts.js";
import { browserToolsForMode } from "./freedom.js";
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
export class BrowserService {
    config;
    browser;
    launching;
    activeContext;
    activePage;
    activeProfile;
    activeRulePack;
    authProfiles;
    constructor(config) {
        this.config = config;
        this.authProfiles = new AuthProfileStore(config.authProfiles);
    }
    available() {
        return this.config.enabled;
    }
    async ensure() {
        if (this.browser)
            return this.browser;
        if (!this.launching) {
            this.launching = (async () => {
                const pw = loadPlaywright();
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
                            throw new Error('dsh-browser: chromium is not installed. Run the browser_install tool, or: node "' + playwrightCliPath() + '" install chromium');
                        }
                    }
                    else {
                        throw error;
                    }
                }
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
        return runNode(playwrightCliPath(), ['install', 'chromium'], { timeoutMs: 600_000, signal: undefined, maxOutput: 256 * 1024 });
    }
    async transientContext(url, opts = {}) {
        const browser = await this.ensure();
        const profileId = opts.authProfile ?? this.config.defaultAuthProfile;
        const profile = profileId ? this.authProfiles.resolve(profileId, url) : undefined;
        const rulePack = resolveRulePack(this.config.rulePacks, opts.rulePack, url);
        const context = await browser.newContext(profile?.storageStatePath
            ? { storageState: profile.storageStatePath }
            : (this.config.storageStatePath ? { storageState: this.config.storageStatePath } : {}));
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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
        return this.config.opencliEnabled;
    }
    opencli(args, opts = {}) {
        if (!this.config.opencliEnabled)
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI is disabled', timedOut: false });
        if (args.length < 1 || args.length > 40 || args.some(arg => typeof arg !== 'string' || arg.length > 2_000)) {
            return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI requires 1 to 40 arguments, each at most 2000 characters', timedOut: false });
        }
        return runOpencli(args, { ...opts, signal: opts.signal });
    }
    opencliDoctor(signal) {
        return this.opencli(['doctor'], { timeoutMs: 30_000, signal });
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
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
            await applyRuleSteps(page, session.rulePack);
            const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 15_000, 1_000), 30_000);
            const timeout = new Promise((_resolve, reject) => {
                timer = setTimeout(() => {
                    void page.close().catch(() => { });
                    reject(new Error('userscript timed out after ' + timeoutMs + 'ms'));
                }, timeoutMs);
            });
            const executed = await Promise.race([executeUserscript(page, source), timeout]);
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
        if (this.activePage && !this.activePage.isClosed()) {
            if (!targetUrl)
                return this.activePage;
            if ((opts.authProfile ?? this.config.defaultAuthProfile) === this.activeProfile?.id && opts.rulePack === this.activeRulePack?.id) {
                if (this.activeProfile)
                    this.authProfiles.resolve(this.activeProfile.id, targetUrl);
                if (this.activeRulePack)
                    resolveRulePack(this.config.rulePacks, this.activeRulePack.id, targetUrl);
                return this.activePage;
            }
            await this.closePage();
        }
        if (targetUrl) {
            const session = await this.transientContext(targetUrl, opts);
            this.activeContext = session.context;
            this.activeProfile = session.profile;
            this.activeRulePack = session.rulePack;
        }
        else {
            const browser = await this.ensure();
            this.activeContext = await browser.newContext(this.config.storageStatePath ? { storageState: this.config.storageStatePath } : {});
        }
        this.activePage = await this.activeContext.newPage();
        return this.activePage;
    }
    async captureScreenshot(page) {
        fs.mkdirSync(this.config.snapshotDir, { recursive: true });
        const file = path.join(this.config.snapshotDir, 'shot-' + Date.now() + '-' + uid().slice(0, 8) + '.png');
        await page.screenshot({ path: file, fullPage: true });
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
        page.setDefaultTimeout(30_000);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => { });
        await applyRuleSteps(page, this.activeRulePack);
        if (opts.waitMs)
            await page.waitForTimeout(opts.waitMs);
        return this.readState(page, true);
    }
    async click(selector, opts = {}) {
        const page = await this.ensureActivePage();
        await page.waitForSelector(selector, { timeout: opts.timeoutMs ?? 15_000 });
        await page.click(selector);
        if (opts.waitMs !== undefined)
            await page.waitForTimeout(opts.waitMs);
        else
            await page.waitForTimeout(500);
        return this.readState(page, true);
    }
    async type(selector, text, opts = {}) {
        const page = await this.ensureActivePage();
        await page.waitForSelector(selector, { timeout: opts.timeoutMs ?? 15_000 });
        await page.fill(selector, text);
        return this.readState(page, false);
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
    async screenshot() {
        const page = await this.ensureActivePage();
        return { path: await this.captureScreenshot(page) };
    }
    async recipe(steps, opts = {}) {
        if (!opts.url && (!this.activePage || this.activePage.isClosed()))
            throw new Error('browser recipe requires url or an active browser_open page');
        const page = await this.ensureActivePage(opts.url, opts);
        if (opts.url) {
            page.setDefaultTimeout(30_000);
            await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
        if (this.activePage) {
            await this.activePage.close().catch(() => { });
        }
        this.activePage = undefined;
        if (this.activeContext)
            await this.persistAndClose({ context: this.activeContext, ...this.activeProfile ? { profile: this.activeProfile } : {} });
        this.activeContext = undefined;
        this.activeProfile = undefined;
        this.activeRulePack = undefined;
    }
    async status() {
        let chromiumInstalled = false;
        try {
            const pw = loadPlaywright();
            chromiumInstalled = !!pw.chromium.executablePath();
        }
        catch {
            chromiumInstalled = false;
        }
        return {
            enabled: this.config.enabled,
            channel: this.config.channel,
            headless: this.config.headless,
            opencliEnabled: this.config.opencliEnabled,
            automationMode: this.config.automationMode,
            exposedTools: browserToolsForMode(this.config.automationMode),
            directInteractionPolicy: this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
            mutatingRecipePolicy: this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
            externalUserscriptPolicy: this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            opencliRunPolicy: this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
            chromiumInstalled,
            authProfiles: this.authProfiles.list(),
            rulePacks: Object.keys(this.config.rulePacks).sort(),
            builtinScripts: BUILTIN_SCRIPTS.map(script => script.id),
            externalUserscriptsRequireApproval: ['standard', 'autonomous'].includes(this.config.automationMode),
            mutatingRecipesRequireApproval: this.config.automationMode === 'standard',
            ...(this.activePage && !this.activePage.isClosed() ? { activeUrl: this.activePage.url() } : {}),
            ...this.activeProfile ? { activeAuthProfile: this.activeProfile.id } : {},
        };
    }
    async close() {
        await this.closePage();
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