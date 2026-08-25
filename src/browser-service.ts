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

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { browserRuntimeCliPath, loadBrowserRuntime, opencliEntryPath, runOpencli, runNode, type CliResult } from './deps.ts'
import type { ResolvedConfig } from './config.ts'
import { AuthProfileStore, type ResolvedAuthProfile } from './auth-profiles.ts'
import { applyRuleSteps, resolveRulePack, type ResolvedRulePack } from './rule-packs.ts'
import { runRecipe, type BrowserRecipeStep, type RecipeStepResult } from './automation.ts'
import { BUILTIN_SCRIPTS, builtinScript, executeUserscript, validateUserscript, type UserscriptValidation } from './scripts.ts'
import { configuredBrowserTools, type AutomationMode } from './freedom.ts'
import { filterOpencliCatalog, parseOpencliCatalog, type OpencliCatalogFilter, type OpencliCatalogItem } from './opencli-catalog.ts'
import { UsageGovernor } from './usage-policy.ts'

export interface RenderRule {
  hostname: string
  contentSelectors: string[]
  removeSelectors?: string[]
}

export interface RenderResult {
  title: string
  text: string
  html: string
  usedRule?: string
}

export interface SnapshotResult {
  title: string
  text: string
  screenshotPath?: string
  htmlPath: string
  usedRule?: string
}

/** Structural platform-search spec (matches web-search-pro's PlatformSearchSpec). */
export interface PlatformSpec {
  item: string
  title: string
  link: string
  text?: string
}

export interface SearchItem {
  url: string
  title: string
  snippet?: string
}

export interface InteractiveState {
  url: string
  title: string
  text: string
  screenshotPath?: string
}

export interface RecipeRunResult extends InteractiveState {
  steps: RecipeStepResult[]
}

export interface ScriptRunResult {
  url: string
  name: string
  sha256: string
  capabilities: string[]
  resultJson: string
  truncated: boolean
}

export interface CrawlPage {
  url: string
  title: string
  text: string
  depth: number
  status: number
}

export interface CrawlResult {
  pages: CrawlPage[]
  errors: { url: string; depth: number; error: string; status?: number }[]
  stats: { pagesVisited: number; queued: number; elapsedMs: number; waitMs: number; backoffEvents: number }
  warnings: string[]
}

export interface BrowserStatus {
  enabled: boolean
  channel: string
  browserRuntime: 'playwright' | 'patchright'
  runtimeWarnings: string[]
  headless: boolean
  opencliEnabled: boolean
  opencliInstalled: boolean
  opencliEntryPath?: string
  automationMode: AutomationMode
  exposedTools: string[]
  directInteractionPolicy: 'deny' | 'ask' | 'allow'
  mutatingRecipePolicy: 'deny' | 'ask' | 'allow'
  externalUserscriptPolicy: 'deny' | 'ask' | 'allow'
  opencliRunPolicy: 'deny' | 'ask' | 'allow'
  chromiumInstalled: boolean
  chromiumExecutablePath?: string
  usagePolicy: ResolvedConfig['usagePolicy']
  usageGovernor: ReturnType<UsageGovernor['snapshot']>
  authProfiles: { id: string; allowedDomains: string[]; persistState: boolean }[]
  rulePacks: string[]
  builtinScripts: string[]
  externalUserscriptsRequireApproval: boolean
  mutatingRecipesRequireApproval: boolean
  activeUrl?: string
  activeAuthProfile?: string
}

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
}`

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
}`

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
}`

function uid(): string {
  return crypto.randomUUID()
}

function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n\n(Content truncated at ' + maxChars + ' characters.)'
}

function specArg(spec: PlatformSpec): Record<string, unknown> {
  return { item: spec.item, title: spec.title, link: spec.link, text: spec.text ?? '' }
}

function evaluateExtractor(page: any, rules: readonly RenderRule[]): Promise<any> {
  return page.evaluate('(' + EXTRACTOR_FN + ')(' + JSON.stringify(rules) + ')')
}

function storageStateOptions(statePath: string | undefined, label: string, allowMissing = false): { storageState?: string } {
  if (!statePath) return {}
  if (!fs.existsSync(statePath)) {
    if (allowMissing) return {}
    throw new Error(`dsh-browser: ${label} storageState file does not exist: ${statePath}`)
  }
  if (!fs.statSync(statePath).isFile()) throw new Error(`dsh-browser: ${label} storageState path is not a file: ${statePath}`)
  return { storageState: statePath }
}

export class BrowserService {
  private browser: any
  private launching?: Promise<any>
  private activeContext: any
  private activePage: any
  private activeProfile?: ResolvedAuthProfile
  private activeRulePack?: ResolvedRulePack
  private readonly authProfiles: AuthProfileStore
  private readonly usageGovernor: UsageGovernor
  private opencliCatalogCache?: OpencliCatalogItem[]

  constructor(private readonly config: ResolvedConfig) {
    this.authProfiles = new AuthProfileStore(config.authProfiles)
    this.usageGovernor = new UsageGovernor(config.usagePolicy)
  }

  available(): boolean {
    return this.config.enabled
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new Error('dsh-browser: browser service is disabled')
  }

  private async ensure(): Promise<any> {
    this.assertEnabled()
    if (this.browser) return this.browser
    if (!this.launching) {
      this.launching = (async () => {
        const pw = loadBrowserRuntime(this.config.browserRuntime)
        const launchOptions: Record<string, unknown> = { headless: this.config.headless }
        if (this.config.channel) launchOptions.channel = this.config.channel
        if (this.config.executablePath) launchOptions.executablePath = this.config.executablePath
        try {
          this.browser = await pw.chromium.launch(launchOptions)
        } catch (error) {
          const msg = String(error)
          if (/Executable doesn't exist|playwright install|not found/i.test(msg)) {
            if (this.config.autoInstall) {
              await this.installChromium()
              this.browser = await pw.chromium.launch(launchOptions)
            } else {
              throw new Error('dsh-browser: chromium is not installed for ' + this.config.browserRuntime + '. Run the browser_install tool, or: node "' + browserRuntimeCliPath(this.config.browserRuntime) + '" install chromium')
            }
          } else {
            throw error
          }
        }
        return this.browser
      })().catch((error: unknown) => {
        this.launching = undefined
        throw error
      })
    }
    return this.launching
  }

  /** Run `playwright install chromium` from the bundled playwright CLI. */
  installChromium(): Promise<CliResult> {
    this.assertEnabled()
    return runNode(browserRuntimeCliPath(this.config.browserRuntime), ['install', 'chromium'], { timeoutMs: 600_000, signal: undefined, maxOutput: 256 * 1024 })
  }

  private async navigate(page: any, url: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    let response: any
    for (let attempt = 0; attempt <= this.config.usagePolicy.retryLimit; attempt++) {
      response = await this.usageGovernor.run(url, () => page.goto(url, options), signal)
      const status = Number(response?.status?.() ?? 0)
      if (status >= 200 && status < 400) this.usageGovernor.noteResponse(url, status)
      if (![429, 502, 503, 504].includes(status)) return response
      const rawRetryAfter = String(response?.headers?.()?.['retry-after'] ?? '')
      const retryAfterMs = /^\d+(?:\.\d+)?$/.test(rawRetryAfter)
        ? Number(rawRetryAfter) * 1000
        : (Number.isFinite(Date.parse(rawRetryAfter)) ? Math.max(Date.parse(rawRetryAfter) - Date.now(), 0) : undefined)
      this.usageGovernor.noteResponse(url, status, retryAfterMs)
      if (attempt === this.config.usagePolicy.retryLimit) return response
    }
    return response
  }

  private async transientContext(url: string, opts: { authProfile?: string; rulePack?: string; anonymous?: boolean } = {}): Promise<{ context: any; profile?: ResolvedAuthProfile; rulePack?: ResolvedRulePack }> {
    const browser = await this.ensure()
    const profileId = opts.anonymous ? undefined : (opts.authProfile ?? this.config.defaultAuthProfile)
    const profile = profileId ? this.authProfiles.resolve(profileId, url) : undefined
    const rulePack = resolveRulePack(this.config.rulePacks, opts.rulePack, url)
    const stateOptions = profile
      ? storageStateOptions(profile.storageStatePath, `auth profile ${profile.id}`, profile.persistState)
      : (!opts.anonymous ? storageStateOptions(this.config.storageStatePath, 'global') : {})
    const context = await browser.newContext(stateOptions)
    try {
      if (rulePack?.initScriptPath) await context.addInitScript({ path: rulePack.initScriptPath })
    } catch (error) {
      await context.close().catch(() => {})
      throw error
    }
    return { context, ...profile ? { profile } : {}, ...rulePack ? { rulePack } : {} }
  }

  private async persistAndClose(session: { context: any; profile?: ResolvedAuthProfile }): Promise<void> {
    try {
      if (session.profile?.persistState) {
        const state = await session.context.storageState()
        fs.mkdirSync(path.dirname(session.profile.storageStatePath), { recursive: true })
        const temporary = session.profile.storageStatePath + '.tmp-' + uid().slice(0, 8)
        fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
        fs.renameSync(temporary, session.profile.storageStatePath)
      }
    } finally {
      await session.context.close().catch(() => {})
    }
  }

  // ── render / snapshot / searchResults (web-search-pro contract) ──────────

  async render(
    url: string,
    rules: readonly RenderRule[],
    opts: { signal?: AbortSignal; maxChars?: number; waitMs?: number; authProfile?: string; rulePack?: string } = {},
  ): Promise<RenderResult> {
    const session = await this.transientContext(url, opts)
    const { context } = session
    const page = await context.newPage()
    const signal = opts.signal
    const onAbort = () => void page.close().catch(() => {})
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)
    try {
      page.setDefaultTimeout(20_000)
      await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 25_000 }, signal)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      await applyRuleSteps(page, session.rulePack)
      if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
      const data = await evaluateExtractor(page, rules)
      return {
        title: String(data.title ?? ''),
        text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), opts.maxChars ?? 200_000),
        html: String(data.html ?? ''),
        ...data.usedRule ? { usedRule: String(data.usedRule) } : {},
      }
    } catch (error) {
      throw new Error('browser render failed for ' + url + ': ' + String(error).slice(0, 300))
    } finally {
      signal?.removeEventListener('abort', onAbort)
      await this.persistAndClose(session)
    }
  }

  async snapshot(
    url: string,
    rules: readonly RenderRule[],
    opts: { signal?: AbortSignal; outDir: string; maxChars?: number; authProfile?: string; rulePack?: string; screenshot?: boolean },
  ): Promise<SnapshotResult> {
    const session = await this.transientContext(url, opts)
    const { context } = session
    const page = await context.newPage()
    const signal = opts.signal
    const onAbort = () => void page.close().catch(() => {})
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)
    fs.mkdirSync(opts.outDir, { recursive: true })
    const stamp = Date.now() + '-' + uid().slice(0, 8)
    const screenshotPath = opts.screenshot === false ? undefined : path.join(opts.outDir, stamp + '.png')
    const htmlPath = path.join(opts.outDir, stamp + '.html')
    try {
      page.setDefaultTimeout(25_000)
      await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await applyRuleSteps(page, session.rulePack)
      if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true })
      const html = await page.content()
      fs.writeFileSync(htmlPath, html, 'utf8')
      const data = await evaluateExtractor(page, rules)
      return {
        title: String(data.title ?? ''),
        text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), opts.maxChars ?? 200_000),
        ...screenshotPath ? { screenshotPath } : {},
        htmlPath,
        ...data.usedRule ? { usedRule: String(data.usedRule) } : {},
      }
    } catch (error) {
      throw new Error('browser snapshot failed for ' + url + ': ' + String(error).slice(0, 300))
    } finally {
      signal?.removeEventListener('abort', onAbort)
      await this.persistAndClose(session)
    }
  }

  async searchResults(
    url: string,
    spec: PlatformSpec,
    opts: { signal?: AbortSignal; count?: number; waitMs?: number; cookies?: { name: string; value: string; domain: string; path: string }[]; authProfile?: string; rulePack?: string } = {},
  ): Promise<SearchItem[]> {
    const session = await this.transientContext(url, opts)
    const { context } = session
    if (opts.cookies?.length) await context.addCookies(opts.cookies).catch(() => {})
    const page = await context.newPage()
    const signal = opts.signal
    const onAbort = () => void page.close().catch(() => {})
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)
    try {
      page.setDefaultTimeout(25_000)
      await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      await applyRuleSteps(page, session.rulePack)
      if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
      await page.mouse?.wheel(0, 2000).catch(() => {})
      await page.waitForTimeout(800)
      const data = await page.evaluate('(' + LIST_EXTRACTOR + ')(' + JSON.stringify(specArg(spec)) + ')')
      const rows = Array.isArray(data) ? data : []
      return rows.slice(0, Math.min(Math.max(opts.count ?? 8, 1), 20)).map((r: any) => ({
        url: String(r.url ?? ''),
        title: String(r.title ?? ''),
        ...r.snippet ? { snippet: String(r.snippet) } : {},
      }))
    } catch (error) {
      throw new Error('browser platform search failed for ' + url + ': ' + String(error).slice(0, 300))
    } finally {
      signal?.removeEventListener('abort', onAbort)
      await this.persistAndClose(session)
    }
  }

  // ── bundled opencli ───────────────────────────────────────────────────────

  opencliAvailable(): boolean {
    if (!this.config.enabled || !this.config.opencliEnabled) return false
    try { return fs.existsSync(opencliEntryPath()) } catch { return false }
  }

  opencli(args: string[], opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<CliResult> {
    if (!this.config.enabled) return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: browser service is disabled', timedOut: false })
    if (!this.config.opencliEnabled) return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI is disabled', timedOut: false })
    if (!this.opencliAvailable()) return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI entry is not installed', timedOut: false })
    if (args.length < 1 || args.length > 40 || args.some(arg => typeof arg !== 'string' || arg.length > 2_000)) {
      return Promise.resolve({ code: -1, stdout: '', stderr: 'dsh-browser: OpenCLI requires 1 to 40 arguments, each at most 2000 characters', timedOut: false })
    }
    // OpenCLI adapters can issue real site traffic outside Playwright, so they
    // share the same approval-independent concurrency and burst buffer.
    return this.usageGovernor.run(
      'https://opencli.local/',
      () => runOpencli(args, { ...opts, signal: opts.signal }),
      opts.signal,
    )
  }

  opencliDoctor(signal?: AbortSignal): Promise<CliResult> {
    return this.opencli(['doctor'], { timeoutMs: 30_000, signal })
  }

  async opencliCatalog(filter: OpencliCatalogFilter = {}, signal?: AbortSignal): Promise<OpencliCatalogItem[]> {
    if (!this.config.opencliEnabled) throw new Error('dsh-browser: OpenCLI is disabled')
    if (!this.opencliCatalogCache) {
      const result = await this.opencli(['list', '-f', 'json'], { timeoutMs: 60_000, signal })
      if (result.code !== 0 || result.timedOut) throw new Error('OpenCLI catalog failed: ' + (result.stderr || result.stdout).slice(0, 500))
      this.opencliCatalogCache = parseOpencliCatalog(result.stdout)
    }
    return filterOpencliCatalog(this.opencliCatalogCache, filter)
  }

  async crawl(startUrls: readonly string[], opts: { maxPages?: number; maxDepth?: number; sameOrigin?: boolean; maxCharsPerPage?: number; signal?: AbortSignal } = {}): Promise<CrawlResult> {
    if (startUrls.length < 1 || startUrls.length > 5) throw new Error('browser crawl requires 1 to 5 start URLs')
    const normalized = startUrls.map(value => {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('browser crawl only supports HTTP(S) URLs')
      url.hash = ''
      return url.href
    })
    const maxPages = opts.maxPages ?? this.config.usagePolicy.maxPagesPerRun
    const maxDepth = opts.maxDepth ?? this.config.usagePolicy.maxDepth
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > this.config.usagePolicy.maxPagesPerRun) {
      throw new Error('browser crawl maxPages must be from 1 to configured usagePolicy.maxPagesPerRun (' + this.config.usagePolicy.maxPagesPerRun + ')')
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > this.config.usagePolicy.maxDepth) {
      throw new Error('browser crawl maxDepth must be from 0 to configured usagePolicy.maxDepth (' + this.config.usagePolicy.maxDepth + ')')
    }
    const maxCharsPerPage = Math.min(Math.max(opts.maxCharsPerPage ?? 20_000, 1_000), 50_000)
    const sameOrigin = opts.sameOrigin ?? true
    const allowedOrigins = new Set(normalized.map(value => new URL(value).origin))
    const queue = normalized.map(url => ({ url, depth: 0 }))
    const seen = new Set(normalized)
    const pages: CrawlPage[] = []
    const errors: CrawlResult['errors'] = []
    const before = this.usageGovernor.snapshot()
    const started = Date.now()
    const session = await this.transientContext(normalized[0]!, { anonymous: true })
    try {
      while (queue.length && pages.length + errors.length < maxPages) {
        if (opts.signal?.aborted) throw new Error('browser crawl aborted')
        const item = queue.shift()!
        const page = await session.context.newPage()
        try {
          page.setDefaultTimeout(30_000)
          const response = await this.navigate(page, item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal)
          const status = Number(response?.status?.() ?? 0)
          if (sameOrigin && !allowedOrigins.has(new URL(page.url()).origin)) {
            errors.push({ url: item.url, depth: item.depth, status, error: 'cross-origin redirect blocked: ' + page.url() })
            continue
          }
          if (status >= 400) {
            errors.push({ url: item.url, depth: item.depth, status, error: 'HTTP ' + status })
            continue
          }
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
          const data = await page.evaluate('(' + CRAWL_EXTRACTOR + ')(' + maxCharsPerPage + ')') as { title?: string; text?: string; links?: string[] }
          pages.push({ url: page.url(), title: String(data.title ?? ''), text: String(data.text ?? ''), depth: item.depth, status })
          if (item.depth >= maxDepth) continue
          for (const rawLink of Array.isArray(data.links) ? data.links : []) {
            let link: URL
            try { link = new URL(rawLink); link.hash = '' } catch { continue }
            if (sameOrigin && !allowedOrigins.has(link.origin)) continue
            const href = link.href
            if (seen.has(href) || seen.size >= maxPages * 25) continue
            seen.add(href)
            queue.push({ url: href, depth: item.depth + 1 })
          }
        } catch (error) {
          errors.push({ url: item.url, depth: item.depth, error: String(error).slice(0, 500) })
        } finally {
          await page.close().catch(() => {})
        }
      }
    } finally {
      await this.persistAndClose(session)
    }
    const after = this.usageGovernor.snapshot()
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
    }
  }

  scriptCatalog(): { id: string; name: string; description: string; sha256: string }[] {
    return BUILTIN_SCRIPTS.map(script => ({
      id: script.id,
      name: script.name,
      description: script.description,
      sha256: validateUserscript(script.source).sha256,
    }))
  }

  validateUserscript(source: string, targetUrl?: string): UserscriptValidation {
    return validateUserscript(source, targetUrl)
  }

  private async runScript(
    url: string,
    source: string,
    opts: { signal?: AbortSignal; timeoutMs?: number; authProfile?: string; rulePack?: string; inputs?: Record<string, string> } = {},
  ): Promise<ScriptRunResult> {
    const validation = validateUserscript(source, url)
    if (!validation.valid) throw new Error('userscript validation failed: ' + validation.errors.join('; '))
    const session = await this.transientContext(url, opts)
    const page = await session.context.newPage()
    const signal = opts.signal
    const onAbort = () => void page.close().catch(() => {})
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      page.setDefaultTimeout(30_000)
      await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, signal)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      await applyRuleSteps(page, session.rulePack)
      const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 15_000, 1_000), 30_000)
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          void page.close().catch(() => {})
          reject(new Error('userscript timed out after ' + timeoutMs + 'ms'))
        }, timeoutMs)
      })
      const executed = await Promise.race([executeUserscript(page, source, 100_000, opts.inputs), timeout])
      return {
        url: page.url(),
        name: validation.metadata.name,
        sha256: validation.sha256,
        capabilities: validation.capabilities,
        resultJson: executed.resultJson,
        truncated: executed.truncated,
      }
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      await this.persistAndClose(session)
    }
  }

  runBuiltinScript(
    url: string,
    id: string,
    opts: { signal?: AbortSignal; timeoutMs?: number; authProfile?: string; rulePack?: string } = {},
  ): Promise<ScriptRunResult> {
    return this.runScript(url, builtinScript(id).source, opts)
  }

  runUserscript(
    url: string,
    source: string,
    opts: { signal?: AbortSignal; timeoutMs?: number; authProfile?: string; rulePack?: string; inputs?: Record<string, string> } = {},
  ): Promise<ScriptRunResult> {
    return this.runScript(url, source, opts)
  }

  // ── interactive surface (one persistent context + page) ──────────────────

  private async ensureActivePage(targetUrl?: string, opts: { authProfile?: string; rulePack?: string } = {}): Promise<any> {
    if (this.activePage && !this.activePage.isClosed()) {
      if (!targetUrl) return this.activePage
      if ((opts.authProfile ?? this.config.defaultAuthProfile) === this.activeProfile?.id && opts.rulePack === this.activeRulePack?.id) {
        if (this.activeProfile) this.authProfiles.resolve(this.activeProfile.id, targetUrl)
        if (this.activeRulePack) resolveRulePack(this.config.rulePacks, this.activeRulePack.id, targetUrl)
        return this.activePage
      }
      await this.closePage()
    }
    if (targetUrl) {
      const session = await this.transientContext(targetUrl, opts)
      this.activeContext = session.context
      this.activeProfile = session.profile
      this.activeRulePack = session.rulePack
    } else {
      const browser = await this.ensure()
      this.activeContext = await browser.newContext(storageStateOptions(this.config.storageStatePath, 'global'))
    }
    this.activePage = await this.activeContext.newPage()
    return this.activePage
  }

  private async captureScreenshot(page: any): Promise<string> {
    fs.mkdirSync(this.config.snapshotDir, { recursive: true })
    const file = path.join(this.config.snapshotDir, 'shot-' + Date.now() + '-' + uid().slice(0, 8) + '.png')
    await page.screenshot({ path: file, fullPage: true })
    return file
  }

  private async readState(page: any, includeScreenshot: boolean): Promise<InteractiveState> {
    const data = await evaluateExtractor(page, [])
    const state: InteractiveState = {
      url: page.url(),
      title: String(data.title ?? ''),
      text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), 100_000),
    }
    if (includeScreenshot) state.screenshotPath = await this.captureScreenshot(page)
    return state
  }

  async open(url: string, opts: { waitMs?: number; authProfile?: string; rulePack?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(url, opts)
    page.setDefaultTimeout(30_000)
    await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await applyRuleSteps(page, this.activeRulePack)
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
    return this.readState(page, true)
  }

  async click(selector: string, opts: { timeoutMs?: number; waitMs?: number } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage()
    await page.waitForSelector(selector, { timeout: opts.timeoutMs ?? 15_000 })
    await page.click(selector)
    if (opts.waitMs !== undefined) await page.waitForTimeout(opts.waitMs)
    else await page.waitForTimeout(500)
    return this.readState(page, true)
  }

  async type(selector: string, text: string, opts: { timeoutMs?: number } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage()
    await page.waitForSelector(selector, { timeout: opts.timeoutMs ?? 15_000 })
    await page.fill(selector, text)
    return this.readState(page, false)
  }

  async scroll(deltaY: number, opts: { waitMs?: number } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage()
    await page.mouse?.wheel(0, deltaY || 2000).catch(() => {})
    await page.waitForTimeout(opts.waitMs ?? 500)
    return this.readState(page, false)
  }

  async read(): Promise<InteractiveState> {
    const page = await this.ensureActivePage()
    return this.readState(page, false)
  }

  async screenshot(): Promise<{ path: string }> {
    const page = await this.ensureActivePage()
    return { path: await this.captureScreenshot(page) }
  }

  async recipe(
    steps: readonly BrowserRecipeStep[],
    opts: { url?: string; waitMs?: number; authProfile?: string; rulePack?: string; signal?: AbortSignal } = {},
  ): Promise<RecipeRunResult> {
    if (!opts.url && (!this.activePage || this.activePage.isClosed())) throw new Error('browser recipe requires url or an active browser_open page')
    const page = await this.ensureActivePage(opts.url, opts)
    if (opts.url) {
      page.setDefaultTimeout(30_000)
      await this.navigate(page, opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      await applyRuleSteps(page, this.activeRulePack)
      if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
    }
    const onAbort = () => void this.closePage()
    if (opts.signal?.aborted) onAbort()
    else opts.signal?.addEventListener('abort', onAbort)
    try {
      const results = await runRecipe(page, steps, () => this.captureScreenshot(page), opts.signal)
      return { ...await this.readState(page, false), steps: results }
    } finally {
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  async closePage(): Promise<void> {
    if (this.activePage) { await this.activePage.close().catch(() => {}) }
    this.activePage = undefined
    if (this.activeContext) await this.persistAndClose({ context: this.activeContext, ...this.activeProfile ? { profile: this.activeProfile } : {} })
    this.activeContext = undefined
    this.activeProfile = undefined
    this.activeRulePack = undefined
  }

  async status(): Promise<BrowserStatus> {
    let chromiumInstalled = false
    let chromiumExecutablePath: string | undefined
    try {
      const pw = loadBrowserRuntime(this.config.browserRuntime)
      const expectedPath = this.config.executablePath || pw.chromium.executablePath()
      if (typeof expectedPath === 'string' && expectedPath.trim()) {
        chromiumExecutablePath = path.resolve(expectedPath)
        chromiumInstalled = fs.existsSync(chromiumExecutablePath)
      }
    } catch { chromiumInstalled = false }
    let opencliInstalled = false
    let resolvedOpencliEntryPath: string | undefined
    try {
      resolvedOpencliEntryPath = path.resolve(opencliEntryPath())
      opencliInstalled = fs.existsSync(resolvedOpencliEntryPath)
    } catch { opencliInstalled = false }
    const runtimeWarnings = this.config.browserRuntime === 'patchright'
      ? [
          'Patchright is Chromium-only and disables Playwright console APIs to avoid Runtime.enable detection.',
          ...(this.config.channel !== 'chrome' || this.config.headless
            ? ['Patchright stealth is strongest with channel=chrome and headless=false; current settings favor automation/test compatibility.']
            : []),
        ]
      : []
    if (!chromiumInstalled && chromiumExecutablePath && (this.config.channel === 'chromium' || !!this.config.executablePath)) {
      runtimeWarnings.push(`Expected Chromium executable is missing: ${chromiumExecutablePath}. Run browser_install for ${this.config.browserRuntime}.`)
    }
    if (this.config.opencliEnabled && !opencliInstalled) runtimeWarnings.push('OpenCLI is enabled but its package entry is not installed.')
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
      ...(this.activePage && !this.activePage.isClosed() ? { activeUrl: this.activePage.url() } : {}),
      ...this.activeProfile ? { activeAuthProfile: this.activeProfile.id } : {},
    }
  }

  async close(): Promise<void> {
    await this.closePage()
    const b = this.browser
    this.browser = undefined
    this.launching = undefined
    if (b) { try { await b.close() } catch { /* already closed */ } }
  }
}
