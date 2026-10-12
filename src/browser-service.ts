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

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { browserRuntimeCliPath, loadBrowserRuntime, opencliEntryPath, runOpencli, runNode, type CliResult } from './deps.ts'
import type { ResolvedConfig } from './config.ts'
import { AuthProfileStore, hostAllowed, type ResolvedAuthProfile } from './auth-profiles.ts'
import { applyRuleSteps, resolveRulePack, type ResolvedRulePack } from './rule-packs.ts'
import { runRecipe, type AnyRecipeStep, type BrowserRecipeStep, type RecipeRunResult, type RecipeStepResult, type RunRecipeOptions } from './automation.ts'
import type { OutputSpec, Postcondition } from './automation-v2.ts'
import { BUILTIN_SCRIPTS, builtinScript, executeUserscript, validateUserscript, type UserscriptValidation } from './scripts.ts'
import { configuredBrowserActions, configuredBrowserTools, type AutomationMode } from './freedom.ts'
import { filterOpencliCatalog, parseOpencliCatalog, type OpencliCatalogFilter, type OpencliCatalogItem } from './opencli-catalog.ts'
import { UsageGovernor } from './usage-policy.ts'
import { PolicyOverlayStore, domainBase, type AuditEntry, type ChangeMeta, type Direction, type PolicyChange, type PolicyDiff } from './policy-overlay.ts'
import { installDialogGuard } from './dialogs.ts'
import { TargetStaleError, resolveLocator, withStrictLocator, type BrowserTarget } from './locator.ts'
import { SENSITIVE_NAME, SessionJournal } from './journal.ts'
import { describeScan, fitObservation, normalizeObserve, scanPage, scopeBase, type ObserveRegion, type ObserveSection } from './observe.ts'
import { describeContextOptions, differingContextOptions, effectiveContextOptions, resolveCallOptions, sameContextOptions, toPlaywrightOptions, type CallContextInput, type ContextOptions } from './context-options.ts'
import {
  DOWNLOAD_HISTORY_LIMIT, DownloadLimitError, claimDownloadPath, contentDispositionFilename, removeQuietly, resolveDownloadFilename, sanitizeDownloadName,
  streamToFile, temporaryDownloadPath, writeBufferToFile, type DownloadRecord,
} from './downloads.ts'

/**
 * How many sessions may hold a browser context+page at once. Past this, the
 * least-recently-used session is closed, so a long-lived profile cannot
 * accumulate contexts until the browser dies.
 */
const DEFAULT_MAX_SESSIONS = 8

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
  /** The session page this state describes (`t1`, `t2`, ...). Absent only when the page is already gone. */
  targetId?: string
  /**
   * The page's generation when this state was read. It changes whenever the page's main frame navigates
   * (see {@link SessionState.generationClock}); pass it back as `expectGeneration` to refuse acting on a page
   * that moved on since it was observed.
   */
  generation?: number
  screenshotPath?: string
  /** The page the action ran on closed itself (a popup's own close button): url/title/text describe the page the session fell back to, or are empty. */
  closedPage?: true
  /** target.open only: the context options in effect, when the call set any or the context was rebuilt. */
  contextOptions?: Record<string, unknown>
  /** target.open only: the session's context was replaced because the call needed different options (or login state); its pages are gone. */
  contextRebuilt?: { changed: string[]; note: string }
}

/** The page state after a recipe, plus what the run did ({@link RecipeRunResult}). */
export interface RecipeServiceResult extends InteractiveState, RecipeRunResult {
  /** Same array as `completedSteps`; kept for service consumers written before B2. */
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

export interface EvaluateResult {
  url: string
  resultJson: string
  truncated: boolean
  capabilities: string[]
  warnings: string[]
}

export interface FileUploadResult extends InteractiveState {
  files: string[]
}

/** The outcome of `target.download`: where the file is and what it is. */
export interface DownloadResult {
  id: string
  /** The URL that was asked for. */
  url: string
  /** The URL the bytes finally came from (after redirects), when it differs. */
  finalUrl?: string
  /** Absolute path of the saved file, inside `downloadDir`. */
  path: string
  /** The saved file's name (may carry a `-1` style suffix when the name was taken). */
  filename: string
  bytes: number
  sha256: string
  suggestedFilename: string
  source: 'request' | 'browser'
}

function downloadResult(record: DownloadRecord, requestedUrl: string): DownloadResult {
  return {
    id: record.id,
    url: requestedUrl,
    ...record.url !== redactCaptureUrl(requestedUrl) ? { finalUrl: record.url } : {},
    path: record.path!,
    filename: path.basename(record.path!),
    bytes: record.bytes!,
    sha256: record.sha256!,
    suggestedFilename: record.suggestedFilename,
    source: record.source,
  }
}

export type { BrowserFrameSpec, BrowserLocatorSpec, BrowserTarget } from './locator.ts'

export interface BrowserConsoleRecord {
  type: string
  text: string
  url?: string
  timestamp: string
}

export interface BrowserRequestRecord {
  method: string
  url: string
  status?: number
  failure?: string
  timestamp: string
}

export interface BrowserScreenshotOptions {
  target?: BrowserTarget
  clip?: { x: number; y: number; width: number; height: number }
  fullPage?: boolean
  format?: 'png' | 'jpeg'
  quality?: number
  filename?: string
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
  /** Tool names registered for the model under the configured toolSurface. */
  exposedTools: string[]
  /** Browser actions (`group.action`) the model can run. */
  exposedActions: string[]
  directInteractionPolicy: 'deny' | 'ask' | 'allow'
  mutatingRecipePolicy: 'deny' | 'ask' | 'allow'
  externalUserscriptPolicy: 'deny' | 'ask' | 'allow'
  pageEvaluatePolicy: 'deny' | 'ask' | 'allow'
  fileUploadPolicy: 'deny' | 'ask' | 'allow'
  downloadPolicy: 'deny' | 'ask' | 'allow'
  /** Directory downloads are saved to, and the size cap of one download. */
  downloadDir: string
  downloadMaxBytes: number
  /** Context options applied to every context (viewport, user agent, locale, time zone, proxy server); only the ones that are set. */
  contextDefaults: Record<string, unknown>
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

function boundedString(value: string | undefined, label: string, max: number): string {
  if (!value || value.length > max) throw new Error(`${label} must contain 1 to ${max} characters`)
  return value
}

function boundedTimeout(value: number | undefined, label: string): number {
  const resolved = value ?? 15_000
  if (!Number.isFinite(resolved) || resolved < 1 || resolved > 30_000) throw new Error(`${label} must be between 1 and 30,000 ms`)
  return resolved
}

function redactCaptureText(value: string, max = 2_000): string {
  return value
    .replace(/\b(authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|session[-_]?id)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=[redacted]')
    .slice(0, max)
}

function redactCaptureUrl(value: string): string {
  try {
    const parsed = new URL(value)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|key|auth|session|cookie|password|secret/i.test(key)) parsed.searchParams.set(key, '[redacted]')
    }
    return parsed.toString().slice(0, 2_000)
  } catch {
    return redactCaptureText(value)
  }
}

/**
 * The interactive page state owned by ONE session.
 *
 * A single `BrowserService` instance is provided to every consumer, so before
 * this existed two concurrent sessions shared one `activePage`: whichever
 * session called `target.open` last owned the page, and the other session's
 * `observe.read` / `script.evaluate` / `inspect.console` then operated on a
 * page it never opened — including the other session's cookies and DOM.
 *
 * State is therefore keyed by session. The browser PROCESS stays shared on
 * purpose: launching N Chromium processes costs hundreds of MB each, while one
 * process with N `BrowserContext`s is what Chromium itself does for N profiles
 * and is properly isolated (separate cookies, storage, cache, permissions).
 * "Different tabs" would not be enough — pages in the SAME context share
 * cookies and storage, so each session gets its own context, not just its own
 * page.
 */
interface SessionState {
  context?: any
  /** The ACTIVE page: the one every action targets. Always one of `pages` while set. */
  page?: any
  /** Every open page of this session's context (the page it opened plus popups), in the order they appeared. */
  pages: SessionPage[]
  /** Counter behind the `t1`, `t2`, ... target ids of this session. */
  nextTarget: number
  /**
   * Source of page generations. A page takes the next value when it is tracked and again on every main-frame
   * navigation (cross-document, reload, history back/forward, `location` assignment, `pushState`/`replaceState`,
   * hash changes), so values only grow and never repeat inside a session, not even across pages: an
   * `expectGeneration` from one page can never match another page by coincidence. Subframe navigation and
   * DOM re-rendering do not change it.
   */
  generationClock: number
  profile?: ResolvedAuthProfile
  rulePack?: ResolvedRulePack
  /** Creation options of the live context (viewport, user agent, locale, time zone, proxy); compared on the next target.open. */
  contextOptions?: ContextOptions
  /** Downloads this session saved or failed to save, newest last, capped. Memory only; the files are on disk. */
  downloads: DownloadRecord[]
  /** Counter behind the `d1`, `d2`, ... download ids of this session. */
  nextDownload: number
  /** Save jobs of browser download events, so target.download can wait for the one its navigation triggered. */
  downloadJobs: WeakMap<object, Promise<DownloadRecord>>
  /** Filename a running target.download wants for the download its navigation triggers (consumed by that one event). */
  downloadFilename?: string
  captureConsole: boolean
  captureNetwork: boolean
  capturedConsole: BrowserConsoleRecord[]
  capturedRequests: BrowserRequestRecord[]
  /** Monotonic tick of last use, for least-recently-used eviction. */
  lastUsed: number
}

/** One tracked page of a session. */
interface SessionPage {
  id: string
  page: any
  generation: number
}

function newSessionState(): SessionState {
  return {
    pages: [],
    nextTarget: 1,
    generationClock: 0,
    downloads: [],
    nextDownload: 1,
    downloadJobs: new WeakMap(),
    captureConsole: false,
    captureNetwork: false,
    capturedConsole: [],
    capturedRequests: [],
    lastUsed: 0,
  }
}

/** Bucket for callers that carry no agent identity. */
const SHARED_SESSION = 'shared'

/**
 * Session key for a tool execution.
 *
 * `ToolExecution.agent` is documented as "the agent on whose behalf the call
 * runs (set by the agent loop)". Two session identities hang off it and BOTH are
 * the session, not the turn:
 *
 * - `agent.session.id` — the live `Agent` face exposes `readonly session:
 *   Session`, and `Session.id` is a `SessionId`. This is the path the
 *   automation-asset recorder already uses in production, so it is tried first.
 * - `agent.id` — the base `Agent` contract documents `readonly id: SessionId`
 *   as "Session-backed Agent identity". Used as a fallback.
 *
 * On DSH 0.2.0-rc.2 both are present and equal (the agent loop documents `id` as the
 * "shared agent/session identity"). `ToolExecution.agent` is typed as the base `Agent`,
 * whose only guaranteed member is `id`, so reading the live face first and the base
 * contract second is a type-level hedge rather than an old-host adaptation.
 *
 * A session therefore keeps ONE page across all of its turns, and two
 * concurrent sessions never share one. Calls carrying no agent at all
 * (automation-asset replays, non-agent dispatchers) land in one shared bucket,
 * which is the pre-existing single-session behaviour rather than a new hazard.
 */
export function sessionKeyFor(agent: SessionIdentity | undefined): string {
  const live = agent?.session?.id
  if (typeof live === 'string' && live) return `session:${live}`
  const own = (agent as { readonly id?: unknown } | undefined)?.id
  if (typeof own === 'string' && own) return `session:${own}`
  return SHARED_SESSION
}

/** The two shapes a live Agent presents for session identity. */
export interface SessionIdentity {
  readonly id?: unknown
  readonly session?: { readonly id?: unknown }
}

export class BrowserService {
  private browser: any
  private launching?: Promise<any>
  /** Per-session interactive state. Replaces the former global activePage. */
  private readonly sessions = new Map<string, SessionState>()
  /** The tracked entry (target id, generation) of every page the service created. */
  private readonly pageEntries = new WeakMap<object, SessionPage>()
  private clock = 0
  private readonly authProfiles: AuthProfileStore
  private readonly usageGovernor: UsageGovernor
  /** The managed policy overlay merged over the configured authProfiles and usagePolicy (see policy-overlay.ts). */
  private readonly policyStore: PolicyOverlayStore
  private opencliCatalogCache?: OpencliCatalogItem[]
  /** Per-session exploration journals (see src/journal.ts). Released with the session, never written to disk. */
  private readonly journals = new Map<string, SessionJournal>()
  /** How many sessions may hold a context+page at once before LRU eviction. */
  private readonly sessionLimit: number

  constructor(private readonly config: ResolvedConfig) {
    this.policyStore = new PolicyOverlayStore({
      file: config.policyOverlayFile,
      authDir: config.authDir,
      snapshotDir: config.snapshotDir,
      downloadDir: config.downloadDir,
      allowPrivateHosts: config.allowPrivateHosts,
      baseline: { authProfiles: config.authProfiles, usagePolicy: config.usagePolicy },
    })
    const effective = this.policyStore.effective()
    this.authProfiles = new AuthProfileStore(effective.authProfiles)
    this.usageGovernor = new UsageGovernor(effective.usagePolicy)
    this.sessionLimit = Math.max(1, Number.isInteger(config.maxSessions) ? config.maxSessions : DEFAULT_MAX_SESSIONS)
  }

  available(): boolean {
    return this.config.enabled
  }

  // -- policy overlay: restriction settings an agent may edit ---------------------------------

  /** Pick up an overlay file that changed on disk (another process, the panel). Cheap: one stat. */
  private refreshPolicy(): void {
    if (this.policyStore.refresh()) this.applyEffectivePolicy()
  }

  private applyEffectivePolicy(): void {
    const effective = this.policyStore.effective()
    this.authProfiles.replace(effective.authProfiles)
    this.usageGovernor.setPolicy(effective.usagePolicy)
  }

  /** What a policy change would do, without doing it; `ok: false` carries why it is invalid. */
  previewPolicyChange(change: PolicyChange): { ok: true; direction: Direction; lines: string[] } | { ok: false; message: string } {
    try {
      this.refreshPolicy()
      const planned = this.policyStore.plan(change)
      return { ok: true, direction: planned.diff.direction, lines: planned.diff.lines }
    } catch (error) {
      return { ok: false, message: String(error instanceof Error ? error.message : error) }
    }
  }

  /**
   * Apply a policy change: validated, written atomically with an audit entry, effective at once. Sessions whose
   * context holds a login state this change took away are closed, so a revoked domain stops working immediately
   * instead of at the next page load.
   */
  async changePolicy(change: PolicyChange, meta: ChangeMeta): Promise<{
    revision: number; direction: Direction; diff: PolicyDiff; audit: AuditEntry; sessionsClosed: number
    before: Record<string, unknown>; after: Record<string, unknown>
  }> {
    this.assertEnabled()
    this.refreshPolicy()
    const applied = this.policyStore.apply(change, meta)
    this.applyEffectivePolicy()
    let closed = 0
    for (const state of [...this.sessions.values()]) {
      const profile = state.profile
      if (!profile) continue
      const now = this.authProfiles.get(profile.id)
      const lost = !now
        || now.storageStatePath !== profile.storageStatePath
        || profile.allowedDomains.some(domain => !hostAllowed(domainBase(domain), now.allowedDomains))
      if (lost) { await this.closePage(state).catch(() => {}); closed++ }
    }
    const summary = (policy: typeof applied.before) => ({
      authProfiles: Object.fromEntries(applied.diff.profiles.map(entry => [entry.id, policy.authProfiles[entry.id] ? { allowedDomains: policy.authProfiles[entry.id]!.allowedDomains, persistState: policy.authProfiles[entry.id]!.persistState ?? false } : null])),
      usagePolicy: Object.fromEntries(applied.diff.usage.map(entry => [entry.key, policy.usagePolicy[entry.key]])),
    })
    return { revision: applied.revision, direction: applied.diff.direction, diff: applied.diff, audit: applied.audit, sessionsClosed: closed, before: summary(applied.before), after: summary(applied.after) }
  }

  /** The effective policy, where each value comes from, and the newest audit entries. */
  policyReport(opts: { auditLimit?: number; viewerSession?: string } = {}): Record<string, unknown> {
    this.refreshPolicy()
    const overlay = this.policyStore.current()
    const effective = this.policyStore.effective()
    const baseline = this.policyStore.baseline
    const profiles = Object.entries(effective.authProfiles).sort(([a], [b]) => a.localeCompare(b)).map(([id, profile]) => {
      const entry = overlay.authProfiles[id]
      const origin = !baseline.authProfiles[id] ? 'overlay-created' : entry ? 'overlay-changed' : 'baseline'
      return {
        id, origin,
        allowedDomains: profile.allowedDomains,
        persistState: profile.persistState ?? false,
        // Only a path the overlay chose (or one inside the auth directory) is shown: a baseline path is the user's own layout.
        ...entry?.storageStatePath || profile.storageStatePath.startsWith(this.config.authDir) ? { storageStatePath: profile.storageStatePath } : {},
        ...entry ? { overriddenFields: Object.keys(entry) } : {},
      }
    })
    const limit = Math.min(Math.max(Math.trunc(opts.auditLimit ?? 10), 1), 50)
    return {
      revision: overlay.revision,
      ...overlay.revision > 0 ? { updatedAt: overlay.updatedAt } : {},
      overlayActive: Object.keys(overlay.authProfiles).length > 0 || Object.keys(overlay.usagePolicy).length > 0,
      ...this.policyStore.warning ? { warning: this.policyStore.warning } : {},
      allowPrivateHosts: this.config.allowPrivateHosts,
      authDir: this.config.authDir,
      authProfiles: profiles,
      removedByOverlay: Object.entries(overlay.authProfiles).filter(([, entry]) => entry === null).map(([id]) => id).sort(),
      usagePolicy: Object.fromEntries(Object.entries(effective.usagePolicy).map(([key, value]) => [key, { value, baseline: baseline.usagePolicy[key], overridden: Object.hasOwn(overlay.usagePolicy, key) }])),
      // An agent sees which session made a change only for its own; the settings card (no viewer) sees all.
      audit: overlay.audit.slice(-limit).map(entry => opts.viewerSession === undefined || entry.session === undefined || entry.session === opts.viewerSession
        ? entry
        : { ...entry, session: 'another session' }),
    }
  }

  /**
   * This session's exploration journal, created on first use. It outlives `target.close` (the session is
   * still the same) and is released when the session is evicted or the service closes. A session that never
   * records anything costs nothing: journals are only created by the action dispatcher.
   */
  journalFor(session: string): SessionJournal {
    let journal = this.journals.get(session)
    if (!journal) {
      journal = new SessionJournal()
      this.journals.set(session, journal)
      // Bounded like the sessions themselves: a journal whose session is long gone cannot pile up.
      while (this.journals.size > this.sessionLimit * 4) this.journals.delete(this.journals.keys().next().value!)
    }
    return journal
  }

  /** The active page of a session as `{targetId, generation, url}`, without opening or creating anything. */
  pageStamp(session: string): { targetId?: string; generation?: number; url?: string } | undefined {
    const page = this.sessions.get(session)?.page
    if (!page || page.isClosed?.()) return undefined
    let url: string | undefined
    try { url = page.url() } catch { /* mid-navigation */ }
    return { ...this.stamp(page), ...url ? { url } : {} }
  }

  /**
   * Whether the control a fill/type would hit is a secret field (password, one-time code, name that says so).
   * Best effort and quick: any trouble (no page, several matches, a slow page) answers false, and the journal
   * still treats secret-looking values and secret-looking locators as sensitive.
   */
  async inputSensitivity(target: BrowserTarget, opts: { session?: string } = {}): Promise<boolean> {
    const page = this.sessions.get(opts.session ?? SHARED_SESSION)?.page
    if (!page || page.isClosed?.()) return false
    try {
      return await resolveLocator(page, target).evaluate((element: any, source: string) => {
        const hints = [element.getAttribute('name'), element.id, element.getAttribute('autocomplete'), element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('data-testid')]
        const type = String(element.type ?? '').toLowerCase()
        const auto = String(element.getAttribute('autocomplete') ?? '').toLowerCase()
        const named = new RegExp(source, 'i')
        return type === 'password' || type === 'hidden' || /password|one-time-code|cc-/.test(auto)
          || hints.some((hint: string | null) => hint && named.test(hint.replace(/([a-z])([A-Z])/g, '$1 $2')))
      }, SENSITIVE_NAME.source, { timeout: 1_500 }) === true
    } catch {
      return false
    }
  }

  /**
   * The state bucket belonging to a tool execution's session.
   *
   * Tools use this for the few operations that act on the bucket itself
   * (`target.close`) rather than passing a key into a method.
   */
  sessionState(agent: SessionIdentity | undefined): SessionState | undefined {
    return this.peek(sessionKeyFor(agent))
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new Error('dsh-browser: browser service is disabled')
  }

  private browserConnected(browser = this.browser): boolean {
    return !!browser && (typeof browser.isConnected !== 'function' || browser.isConnected())
  }

  /**
   * The state bucket for one session, created on demand.
   *
   * Eviction is least-recently-used and never touches the caller's own bucket,
   * so a session cannot have its page closed out from under it by a burst of
   * other sessions.
   */
  private state(session = SHARED_SESSION): SessionState {
    const existing = this.sessions.get(session)
    if (existing) {
      existing.lastUsed = ++this.clock
      return existing
    }
    const state = newSessionState()
    state.lastUsed = ++this.clock
    this.sessions.set(session, state)
    void this.evictSessions(session)
    return state
  }

  /**
   * Look up an existing bucket WITHOUT creating one and WITHOUT evicting.
   *
   * Queries (`runtime.status`, `inspect.console`, `inspect.requests`) must go
   * through this, not {@link state}. Creating a bucket for a session that only
   * *asks* a question would both leak a slot and push a live session past the
   * limit, so a read could evict the very page it was trying to describe.
   */
  private peek(session = SHARED_SESSION): SessionState | undefined {
    const existing = this.sessions.get(session)
    if (existing) existing.lastUsed = ++this.clock
    return existing
  }

  /** Close the least-recently-used sessions that exceed the limit. */
  private async evictSessions(keep: string): Promise<void> {
    while (this.sessions.size > this.sessionLimit) {
      let victim: string | undefined
      let oldest = Number.POSITIVE_INFINITY
      for (const [key, value] of this.sessions) {
        if (key === keep) continue
        if (value.lastUsed < oldest) { oldest = value.lastUsed; victim = key }
      }
      if (victim === undefined) return
      const state = this.sessions.get(victim)
      this.sessions.delete(victim)
      this.journals.delete(victim)
      if (state) await this.disposeState(state)
    }
  }

  /** Close one session's page+context without persisting its auth state. */
  private async disposeState(state: SessionState): Promise<void> {
    const page = state.page
    const context = state.context
    state.page = undefined
    state.pages = []
    state.context = undefined
    state.profile = undefined
    state.rulePack = undefined
    state.contextOptions = undefined
    state.downloads = []
    state.capturedConsole = []
    state.capturedRequests = []
    state.captureConsole = false
    state.captureNetwork = false
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
  }

  /** Drop all per-session state after a browser-level failure. */
  private clearActiveState(): void {
    this.sessions.clear()
    this.journals.clear()
  }

  private handleBrowserDisconnected(browser: any): void {
    // A late event from an older process must not invalidate its replacement.
    if (this.browser !== browser) return
    this.browser = undefined
    this.launching = undefined
    this.clearActiveState()
  }

  private trackBrowser(browser: any): any {
    this.browser = browser
    browser.on?.('disconnected', () => this.handleBrowserDisconnected(browser))
    // Any dialog opened while this browser is live is auto-closed by the guard instead of
    // by playwright-core's unhandled auto-dismiss promise (see dialogs.ts).
    installDialogGuard(browser)
    return browser
  }

  private async ensure(): Promise<any> {
    this.assertEnabled()
    if (this.browserConnected()) return this.browser
    if (this.browser) this.handleBrowserDisconnected(this.browser)
    if (!this.launching) {
      this.launching = (async () => {
        const pw = loadBrowserRuntime(this.config.browserRuntime)
        const launchOptions: Record<string, unknown> = { headless: this.config.headless }
        if (this.config.channel) launchOptions.channel = this.config.channel
        if (this.config.executablePath) launchOptions.executablePath = this.config.executablePath
        const args: string[] = [...(this.config.args ?? [])]
        if (this.config.cdpPort) {
          args.push(`--remote-debugging-port=${this.config.cdpPort}`)
        }
        if (args.length > 0) {
          launchOptions.args = args
        }
        try {
          return this.trackBrowser(await pw.chromium.launch(launchOptions))
        } catch (error) {
          const msg = String(error)
          if (/Executable doesn't exist|playwright install|not found/i.test(msg)) {
            if (this.config.autoInstall) {
              await this.installChromium()
              return this.trackBrowser(await pw.chromium.launch(launchOptions))
            } else {
              throw new Error('dsh-browser: chromium is not installed for ' + this.config.browserRuntime + '. Run the runtime.install action, or: node "' + browserRuntimeCliPath(this.config.browserRuntime) + '" install chromium')
            }
          } else {
            throw error
          }
        }
      })()
    }
    const launching = this.launching
    try {
      return await launching
    } finally {
      if (this.launching === launching) this.launching = undefined
    }
  }

  /** Run `playwright install chromium` from the bundled playwright CLI. */
  installChromium(): Promise<CliResult> {
    this.assertEnabled()
    return runNode(browserRuntimeCliPath(this.config.browserRuntime), ['install', 'chromium'], { timeoutMs: 600_000, signal: undefined, maxOutput: 256 * 1024 })
  }

  private async navigate(page: any, url: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    let response: any
    for (let attempt = 0; attempt <= this.usageGovernor.policy.retryLimit; attempt++) {
      response = await this.usageGovernor.run(url, () => page.goto(url, options), signal)
      const status = Number(response?.status?.() ?? 0)
      if (status >= 200 && status < 400) this.usageGovernor.noteResponse(url, status)
      if (![429, 502, 503, 504].includes(status)) return response
      const rawRetryAfter = String(response?.headers?.()?.['retry-after'] ?? '')
      const retryAfterMs = /^\d+(?:\.\d+)?$/.test(rawRetryAfter)
        ? Number(rawRetryAfter) * 1000
        : (Number.isFinite(Date.parse(rawRetryAfter)) ? Math.max(Date.parse(rawRetryAfter) - Date.now(), 0) : undefined)
      this.usageGovernor.noteResponse(url, status, retryAfterMs)
      if (attempt === this.usageGovernor.policy.retryLimit) return response
    }
    return response
  }

  /**
   * `newContext()` arguments that do not depend on the login state: the configured viewport, user agent, locale,
   * time zone and proxy (or the per-call override that replaced them), plus downloads for interactive contexts.
   *
   * Proxy: Playwright applies `proxy` at context level on its own. Measured on Chromium 1243 (headless shell) with
   * Playwright 1.62 and Patchright 1.62, a context created with `proxy` and a browser launched WITHOUT any launch
   * `proxy` sent both page navigation and `context.request` through the proxy, so no `proxy: { server: 'per-context' }`
   * launch option is set. (Chromium bypasses the proxy for loopback hosts regardless; that is the browser's rule.)
   */
  private contextCreationOptions(options: ContextOptions, interactive: boolean): Record<string, unknown> {
    return { ...toPlaywrightOptions(options), ...interactive ? { acceptDownloads: true } : {} }
  }

  private async transientContext(url: string, opts: { authProfile?: string; rulePack?: string; anonymous?: boolean; context?: ContextOptions; interactive?: boolean } = {}): Promise<{ context: any; profile?: ResolvedAuthProfile; rulePack?: ResolvedRulePack; contextOptions: ContextOptions }> {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('browser navigation requires an HTTP(S) URL')
    this.refreshPolicy()
    const profileId = opts.anonymous ? undefined : (opts.authProfile ?? this.config.defaultAuthProfile)
    const profile = profileId ? this.authProfiles.resolve(profileId, url) : undefined
    const rulePack = resolveRulePack(this.config.rulePacks, opts.rulePack, url)
    const stateOptions = profile
      ? storageStateOptions(profile.storageStatePath, `auth profile ${profile.id}`, profile.persistState)
      : (!opts.anonymous ? storageStateOptions(this.config.storageStatePath, 'global') : {})
    let scopedState: unknown
    if (profile && stateOptions.storageState) {
      const state = JSON.parse(fs.readFileSync(stateOptions.storageState, 'utf8'))
      scopedState = {
        cookies: (state.cookies ?? []).filter((cookie: { domain: string }) => hostAllowed(cookie.domain.replace(/^\./, ''), profile.allowedDomains)),
        origins: (state.origins ?? []).filter((origin: { origin: string }) => hostAllowed(new URL(origin.origin).hostname, profile.allowedDomains)),
      }
    }
    const applied = opts.context ?? this.config.contextDefaults
    const contextOptions = { ...stateOptions, ...(scopedState ? { storageState: scopedState } : {}), ...this.contextCreationOptions(applied, opts.interactive === true) }
    let context: any
    for (let attempt = 0; attempt < 2; attempt++) {
      const browser = await this.ensure()
      try {
        context = await browser.newContext(contextOptions)
        break
      } catch (error) {
        if (attempt > 0 || this.browserConnected(browser)) throw error
        this.handleBrowserDisconnected(browser)
      }
    }
    if (!context) throw new Error('dsh-browser: browser context could not be created after reconnecting')
    try {
      if (rulePack?.initScriptPath) await context.addInitScript({ path: rulePack.initScriptPath })
    } catch (error) {
      await context.close().catch(() => {})
      throw error
    }
    return { context, contextOptions: applied, ...profile ? { profile } : {}, ...rulePack ? { rulePack } : {} }
  }

  private async persistAndClose(session: { context: any; profile?: ResolvedAuthProfile }): Promise<void> {
    try {
      if (session.profile?.persistState) {
        let state: unknown
        try {
          state = await session.context.storageState()
        } catch (error) {
          // A crashed browser cannot provide state. Filesystem failures below
          // still propagate so failed persistence is never reported as success.
          if (/target page, context or browser has been closed|browser has been closed|browser disconnected/i.test(String(error))) return
          throw error
        }
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
    this.refreshPolicy()
    const limits = this.usageGovernor.policy
    const maxPages = opts.maxPages ?? limits.maxPagesPerRun
    const maxDepth = opts.maxDepth ?? limits.maxDepth
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > limits.maxPagesPerRun) {
      throw new Error('browser crawl maxPages must be from 1 to configured usagePolicy.maxPagesPerRun (' + limits.maxPagesPerRun + ')')
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > limits.maxDepth) {
      throw new Error('browser crawl maxDepth must be from 0 to configured usagePolicy.maxDepth (' + limits.maxDepth + ')')
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
      const finalValidation = validateUserscript(source, page.url())
      if (!finalValidation.valid) throw new Error('userscript redirected outside its allowed match: ' + finalValidation.errors.join('; '))
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

  // ── interactive surface (one context + page PER SESSION) ──────────────────

  /**
   * Return the calling session's live page, creating one when needed.
   *
   * `session` is the key from {@link sessionKeyFor}. Every read and write below
   * is confined to that bucket, which is what stops one session from observing
   * or mutating another's page, cookies, console or network log.
   */
  private async ensureActivePage(targetUrl?: string, opts: { authProfile?: string; rulePack?: string; session?: string; context?: ContextOptions } = {}): Promise<any> {
    return (await this.ensurePage(targetUrl, opts)).page
  }

  /**
   * {@link ensureActivePage} plus what it had to do to the session's context. `context` carries the per-call creation
   * options of `target.open`: an option the call leaves out keeps what the live context has (a context is only
   * rebuilt for a value that is different, never because a later call said nothing), and a new context starts from
   * the configured defaults. `rebuilt` names what differed when a live page was closed to make room for the new context.
   */
  private async ensurePage(targetUrl?: string, opts: { authProfile?: string; rulePack?: string; session?: string; context?: ContextOptions } = {}): Promise<{ page: any; rebuilt?: string[] }> {
    if (targetUrl && !['http:', 'https:'].includes(new URL(targetUrl).protocol)) throw new Error('browser navigation requires an HTTP(S) URL')
    this.refreshPolicy()
    const state = this.state(opts.session)
    if (state.page && (state.page.isClosed() || !this.browserConnected())) await this.closePage(state)
    let rebuilt: string[] | undefined
    let wanted = effectiveContextOptions(this.config.contextDefaults, opts.context)
    if (state.page && !state.page.isClosed()) {
      if (!targetUrl) return { page: state.page }
      const applied = state.contextOptions ?? this.config.contextDefaults
      wanted = { ...applied, ...opts.context }
      const sameLogin = (opts.authProfile ?? this.config.defaultAuthProfile) === state.profile?.id && opts.rulePack === state.rulePack?.id
      const changedOptions = differingContextOptions(applied, wanted)
      if (sameLogin && changedOptions.length === 0) {
        if (state.profile) this.authProfiles.resolve(state.profile.id, targetUrl)
        if (state.rulePack) resolveRulePack(this.config.rulePacks, state.rulePack.id, targetUrl)
        return { page: state.page }
      }
      rebuilt = [
        ...changedOptions,
        ...(opts.authProfile ?? this.config.defaultAuthProfile) === state.profile?.id ? [] : ['authProfile'],
        ...opts.rulePack === state.rulePack?.id ? [] : ['rulePack'],
      ]
      await this.closePage(state)
    }
    if (targetUrl) {
      const session = await this.transientContext(targetUrl, { ...opts, context: wanted, interactive: true })
      state.context = session.context
      state.profile = session.profile
      state.rulePack = session.rulePack
      state.contextOptions = session.contextOptions
    } else {
      const browser = await this.ensure()
      state.context = await browser.newContext({
        ...storageStateOptions(this.config.storageStatePath, 'global'),
        ...this.contextCreationOptions(wanted, true),
      })
      state.contextOptions = wanted
    }
    // A popup (window.open, target=_blank) joins this session's page list; it never takes over the active page by itself.
    state.context.on('page', (opened: any) => { if (state.context) this.trackPage(state, opened) })
    state.page = await state.context.newPage()
    this.trackPage(state, state.page)
    return { page: state.page, ...rebuilt ? { rebuilt } : {} }
  }

  /**
   * Add a page to the session's list and wire its capture and close handling.
   * Idempotent: the context 'page' event and the explicit call both land here.
   */
  private trackPage(state: SessionState, page: any): void {
    if (state.pages.some(entry => entry.page === page)) return
    const entry: SessionPage = { id: 't' + state.nextTarget++, page, generation: ++state.generationClock }
    state.pages.push(entry)
    this.pageEntries.set(page, entry)
    // Any committed navigation of the MAIN frame outdates what was observed: Playwright emits framenavigated for
    // cross-document loads, reloads and history moves and for same-document ones (pushState, hash). Subframes do not count.
    page.on('framenavigated', (frame: unknown) => {
      if (frame === page.mainFrame?.()) entry.generation = ++state.generationClock
    })
    const gone = () => {
      state.pages = state.pages.filter(entry => entry.page !== page)
      // A page that was not the active one just leaves the list.
      if (state.page !== page) return
      // The active page closed: fall back to another open page of the same context before giving up the session.
      const fallback = state.pages[0]?.page
      if (fallback && !fallback.isClosed?.()) { state.page = fallback; return }
      const context = state.context
      const profile = state.profile
      state.page = undefined
      state.context = undefined
      state.profile = undefined
      state.rulePack = undefined
      state.contextOptions = undefined
      if (context) void this.persistAndClose({ context, ...profile ? { profile } : {} }).catch(() => {})
    }
    page.on('close', gone)
    page.on('crash', gone)
    // The listener lives and dies with the page (and so with the context); the record goes to this session's own list.
    page.on('download', (download: any) => { state.downloadJobs.set(download, this.saveBrowserDownload(state, download)) })
    page.on('console', (message: any) => {
      if (!state.captureConsole) return
      const location = message.location?.() as { url?: string } | undefined
      state.capturedConsole.push({
        type: String(message.type?.() ?? 'log').slice(0, 40),
        text: redactCaptureText(String(message.text?.() ?? '')),
        ...location?.url ? { url: redactCaptureUrl(location.url) } : {},
        timestamp: new Date().toISOString(),
      })
      if (state.capturedConsole.length > 200) state.capturedConsole.splice(0, state.capturedConsole.length - 200)
    })
    page.on('response', (response: any) => {
      if (!state.captureNetwork) return
      const status = Number(response.status?.() ?? 0)
      if (status < 400) return
      const request = response.request?.()
      state.capturedRequests.push({
        method: String(request?.method?.() ?? 'GET').slice(0, 20),
        url: redactCaptureUrl(String(response.url?.() ?? '')),
        status,
        timestamp: new Date().toISOString(),
      })
      if (state.capturedRequests.length > 200) state.capturedRequests.splice(0, state.capturedRequests.length - 200)
    })
    page.on('requestfailed', (request: any) => {
      if (!state.captureNetwork) return
      state.capturedRequests.push({
        method: String(request.method?.() ?? 'GET').slice(0, 20),
        url: redactCaptureUrl(String(request.url?.() ?? '')),
        failure: redactCaptureText(String(request.failure?.()?.errorText ?? 'request failed'), 500),
        timestamp: new Date().toISOString(),
      })
      if (state.capturedRequests.length > 200) state.capturedRequests.splice(0, state.capturedRequests.length - 200)
    })
  }

  private resetCapture(state: SessionState, capture: readonly ('console' | 'network')[] = []): void {
    state.captureConsole = capture.includes('console')
    state.captureNetwork = capture.includes('network')
    state.capturedConsole = []
    state.capturedRequests = []
  }

  private resolveTarget(page: any, target: BrowserTarget): any {
    return resolveLocator(page, target)
  }

  /**
   * Run an action on a strict locator. More than one match performs nothing and
   * fails with LOCATOR_AMBIGUOUS plus a summary of the first candidates.
   */
  private onTarget<T>(page: any, target: BrowserTarget, run: (locator: any) => Promise<T>): Promise<T> {
    return withStrictLocator(this.resolveTarget(page, target), run)
  }

  private screenshotFile(options: BrowserScreenshotOptions): { file: string; format: 'png' | 'jpeg' } {
    const filename = options.filename ?? `shot-${Date.now()}-${uid().slice(0, 8)}.${options.format === 'jpeg' ? 'jpg' : 'png'}`
    if (filename !== path.basename(filename) || !/^[\w.() -]{1,160}$/.test(filename)) {
      throw new Error('observe.screenshot filename must be a plain file name inside snapshotDir')
    }
    const extension = path.extname(filename).toLowerCase()
    const inferred = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension === '.png' ? 'png' : undefined
    const format = options.format ?? inferred ?? 'png'
    if (inferred && inferred !== format) throw new Error('observe.screenshot filename extension does not match format')
    if (!inferred) throw new Error('observe.screenshot filename must end in .png, .jpg, or .jpeg')
    return { file: path.join(this.config.snapshotDir, filename), format }
  }

  private async captureScreenshot(page: any, options: BrowserScreenshotOptions = {}): Promise<string> {
    fs.mkdirSync(this.config.snapshotDir, { recursive: true })
    if (options.target && options.clip) throw new Error('observe.screenshot cannot combine target and clip')
    if (options.target && options.fullPage) throw new Error('observe.screenshot cannot combine target and fullPage')
    if (options.quality !== undefined && (!Number.isInteger(options.quality) || options.quality < 0 || options.quality > 100)) {
      throw new Error('observe.screenshot quality must be an integer from 0 to 100')
    }
    const { file, format } = this.screenshotFile(options)
    if (format === 'png' && options.quality !== undefined) throw new Error('observe.screenshot quality is only supported for jpeg')
    const screenshotOptions: Record<string, unknown> = {
      path: file,
      type: format,
      ...options.quality !== undefined ? { quality: options.quality } : {},
    }
    if (options.clip) {
      const { x, y, width, height } = options.clip
      if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
        throw new Error('observe.screenshot clip must use finite non-negative coordinates and dimensions from 1 to 20,000')
      }
      screenshotOptions.clip = options.clip
    } else if (!options.target) {
      screenshotOptions.fullPage = options.fullPage ?? true
    }
    if (options.target) await this.onTarget(page, options.target, locator => locator.screenshot(screenshotOptions))
    else await page.screenshot(screenshotOptions)
    return file
  }

  /** `{targetId, generation}` of a tracked page (empty for a page the service does not track). */
  private stamp(page: any): { targetId?: string; generation?: number } {
    const entry = this.pageEntries.get(page)
    return entry ? { targetId: entry.id, generation: entry.generation } : {}
  }

  /**
   * Refuse to act when the page's generation is not the one the caller observed. Nothing has been done yet
   * at this point, so the caller only needs to observe again.
   */
  private assertGeneration(page: any, expected: number | undefined): void {
    if (expected === undefined) return
    const entry = this.pageEntries.get(page)
    if (!entry || entry.generation === expected) return
    throw new TargetStaleError(
      `The page ${entry.id} is at generation ${entry.generation}, not ${expected}: it navigated since it was observed, so nothing was done.`,
      { targetId: entry.id, generation: entry.generation },
    )
  }

  private async readState(page: any, includeScreenshot: boolean): Promise<InteractiveState> {
    const data = await evaluateExtractor(page, [])
    const state: InteractiveState = {
      url: page.url(),
      title: String(data.title ?? ''),
      text: capText(String(data.text ?? '').replace(/\n{3,}/g, '\n\n').trim(), 100_000),
      ...this.stamp(page),
    }
    if (includeScreenshot) state.screenshotPath = await this.captureScreenshot(page)
    return state
  }

  async open(url: string, opts: { waitMs?: number; authProfile?: string; rulePack?: string; capture?: readonly ('console' | 'network')[]; session?: string } & CallContextInput = {}): Promise<InteractiveState> {
    // Checked before anything is created or closed: a bad option must not cost the session its page.
    const wanted = resolveCallOptions(opts)
    const { page, rebuilt } = await this.ensurePage(url, { ...opts, context: wanted })
    const state = this.state(opts.session)
    this.resetCapture(state, opts.capture)
    page.setDefaultTimeout(30_000)
    await this.navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await applyRuleSteps(page, state.rulePack)
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
    const result = await this.readState(page, true)
    const applied = describeContextOptions(state.contextOptions ?? {})
    return {
      ...result,
      ...Object.keys(wanted).length > 0 || rebuilt ? { contextOptions: applied } : {},
      ...rebuilt ? { contextRebuilt: {
        changed: rebuilt,
        note: 'The session\'s previous context was closed and a new one created because ' + rebuilt.join(', ') + ' changed; its pages (popups included) are gone and cookies not kept in an auth profile were dropped.',
      } } : {},
    }
  }

  async click(target: BrowserTarget, opts: { expectGeneration?: number; timeoutMs?: number; waitMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    await this.onTarget(page, target, locator => locator.click({ timeout: boundedTimeout(opts.timeoutMs, 'act.click timeoutMs') }))
    // The click may have closed the page it hit (a popup's own close button). That is a success, not TARGET_CLOSED.
    await page.waitForTimeout(opts.waitMs ?? 500).catch((error: unknown) => { if (!page.isClosed()) throw error })
    if (page.isClosed()) {
      const fallback = this.peek(opts.session)?.page
      if (!fallback || fallback.isClosed()) return { url: '', title: '', text: '', closedPage: true }
      return { ...await this.readState(fallback, true), closedPage: true }
    }
    return this.readState(page, true)
  }

  async type(target: BrowserTarget, text: string, opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    await this.onTarget(page, target, locator => locator.fill(text, { timeout: boundedTimeout(opts.timeoutMs, 'act.fill timeoutMs') }))
    return this.readState(page, false)
  }

  /** Type key by key (pressSequentially), so per-key handlers fire; unlike `type`, which replaces the whole value. */
  async typeKeys(target: BrowserTarget, text: string, opts: { expectGeneration?: number; delayMs?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const value = boundedString(text, 'act.type text', 10_000)
    const delay = opts.delayMs ?? 0
    if (!Number.isFinite(delay) || delay < 0 || delay > 1_000) throw new Error('act.type delayMs must be between 0 and 1,000')
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    const timeout = boundedTimeout(opts.timeoutMs, 'act.type timeoutMs')
    await this.onTarget(page, target, locator => locator.pressSequentially(value, { delay, timeout }))
    return this.readState(page, false)
  }

  async clear(target: BrowserTarget, opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    const timeout = boundedTimeout(opts.timeoutMs, 'act.clear timeoutMs')
    await this.onTarget(page, target, locator => locator.clear({ timeout }))
    return this.readState(page, false)
  }

  async wait(target: BrowserTarget | undefined, opts: { urlPattern?: string; networkIdle?: boolean; timeMs?: number; state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    const modes = [target !== undefined, opts.urlPattern !== undefined, opts.networkIdle === true, opts.timeMs !== undefined].filter(Boolean)
    if (modes.length !== 1) throw new Error('act.wait requires exactly one target, urlPattern, networkIdle=true, or timeMs')
    const timeout = boundedTimeout(opts.timeoutMs, 'act.wait timeoutMs')
    if (target !== undefined) await this.onTarget(page, target, locator => locator.waitFor({ state: opts.state ?? 'visible', timeout }))
    else if (opts.urlPattern !== undefined) await page.waitForURL(boundedString(opts.urlPattern, 'urlPattern', 2_000), { timeout })
    else if (opts.networkIdle) await page.waitForLoadState('networkidle', { timeout })
    else {
      const timeMs = opts.timeMs as number
      if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 10_000) throw new Error('act.wait timeMs must be between 0 and 10,000')
      await page.waitForTimeout(timeMs)
    }
    return this.readState(page, false)
  }

  async press(target: BrowserTarget | undefined, key: string, opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    const value = boundedString(key, 'act.press key', 100)
    if (target !== undefined) await this.onTarget(page, target, locator => locator.press(value, { timeout: boundedTimeout(opts.timeoutMs, 'act.press timeoutMs') }))
    else await page.keyboard.press(value)
    return this.readState(page, false)
  }

  async select(target: BrowserTarget, values: readonly string[], opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    if (values.length < 1 || values.length > 20) throw new Error('act.select requires 1 to 20 values')
    values.forEach(value => boundedString(value, 'act.select value', 2_000))
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    await this.onTarget(page, target, locator => locator.selectOption([...values], { timeout: boundedTimeout(opts.timeoutMs, 'act.select timeoutMs') }))
    return this.readState(page, false)
  }

  async check(target: BrowserTarget, checked = true, opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    const timeout = boundedTimeout(opts.timeoutMs, 'act.check timeoutMs')
    await this.onTarget(page, target, locator => checked ? locator.check({ timeout }) : locator.uncheck({ timeout }))
    return this.readState(page, false)
  }

  async hover(target: BrowserTarget, opts: { expectGeneration?: number; timeoutMs?: number; waitMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    const timeoutMs = boundedTimeout(opts.timeoutMs, 'act.hover timeoutMs')
    const waitMs = Math.min(Math.max(opts.waitMs ?? 300, 0), timeoutMs)
    await this.onTarget(page, target, locator => locator.hover({ timeout: timeoutMs }))
    await page.waitForTimeout(waitMs)
    return this.readState(page, true)
  }

  async setFiles(target: BrowserTarget, files: readonly string[], opts: { expectGeneration?: number; timeoutMs?: number; session?: string } = {}): Promise<FileUploadResult> {
    if (files.length === 0 || files.length > 20) throw new Error('act.upload requires 1 to 20 files')
    const resolved = files.map(file => {
      if (!path.isAbsolute(file)) throw new Error('act.upload requires absolute file paths: ' + file)
      const real = fs.realpathSync(file)
      if (!fs.statSync(real).isFile()) throw new Error('act.upload path is not a file: ' + file)
      return real
    })
    const totalBytes = resolved.reduce((total, file) => total + fs.statSync(file).size, 0)
    if (totalBytes > 512 * 1024 * 1024) throw new Error('act.upload total upload size exceeds 512 MiB')
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    await this.onTarget(page, target, locator => locator.setInputFiles(resolved, { timeout: boundedTimeout(opts.timeoutMs, 'act.upload timeoutMs') }))
    return { ...await this.readState(page, true), files: resolved.map(file => path.basename(file)) }
  }

  async evaluate(expression: string, opts: { timeoutMs?: number; session?: string } = {}): Promise<EvaluateResult> {
    const source = expression.trim()
    if (!source) throw new Error('script.evaluate requires a JavaScript expression')
    if (source.length > 20_000) throw new Error('script.evaluate expression exceeds 20,000 characters')
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 15_000, 1_000), 30_000)
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        void (async () => {
          try {
            const session = await page.context().newCDPSession(page)
            try { await session.send('Runtime.terminateExecution') } finally { await session.detach().catch(() => {}) }
            reject(new Error('script.evaluate timed out after ' + timeoutMs + 'ms; page JavaScript was terminated and the active page remains open'))
          } catch (error) {
            reject(new Error('script.evaluate timed out after ' + timeoutMs + 'ms; unable to terminate page JavaScript without closing the active page: ' + String(error).slice(0, 200)))
          }
        })()
      }, timeoutMs)
    })
    try {
      const script = `(async () => {\nconst value = await (${source}\n);\nconst json = JSON.stringify(value);\nif (json === undefined) throw new Error('expression result is not JSON-serializable');\nreturn { resultJson: json.slice(0, 100000), truncated: json.length > 100000 };\n})()`
      let result: { resultJson: string; truncated: boolean }
      try {
        result = await Promise.race([page.evaluate(script), timeout]) as { resultJson: string; truncated: boolean }
      } catch (error) {
        if (timedOut) throw new Error('script.evaluate timed out after ' + timeoutMs + 'ms; page JavaScript was terminated and the active page remains open')
        throw error
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
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * The pages this session holds: the one it opened plus any popup that page
   * (or a later one) opened in the same context. Pure query: it never creates
   * a bucket and never changes the active page.
   */
  async listTargets(opts: { session?: string } = {}): Promise<{ targets: { id: string; url: string; title: string; active: boolean; generation: number }[] }> {
    const state = this.peek(opts.session)
    if (!state || !this.browserConnected()) return { targets: [] }
    const targets: { id: string; url: string; title: string; active: boolean; generation: number }[] = []
    for (const entry of [...state.pages]) {
      if (entry.page.isClosed()) continue
      let title = ''
      try { title = String(await entry.page.title()).slice(0, 200) } catch { /* a page that is mid-navigation has no title yet */ }
      targets.push({ id: entry.id, url: entry.page.url(), title, active: entry.page === state.page, generation: entry.generation })
    }
    return { targets }
  }

  /** Make one of this session's pages the active page: every later action, read, and screenshot targets it. */
  async selectTarget(id: string, opts: { session?: string } = {}): Promise<InteractiveState & { id: string }> {
    const state = this.peek(opts.session)
    const entry = state?.pages.find(candidate => candidate.id === id && !candidate.page.isClosed())
    if (!state || !entry) throw new Error(`no active page with target id ${JSON.stringify(id)} in this session; target.list shows the open pages`)
    state.page = entry.page
    await entry.page.bringToFront().catch(() => {})
    await entry.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
    return { id, ...await this.readState(entry.page, false) }
  }

  async scroll(deltaY: number, opts: { expectGeneration?: number; waitMs?: number; session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    this.assertGeneration(page, opts.expectGeneration)
    await page.mouse?.wheel(0, deltaY || 2000).catch(() => {})
    await page.waitForTimeout(opts.waitMs ?? 500)
    return this.readState(page, false)
  }

  async read(opts: { session?: string } = {}): Promise<InteractiveState> {
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    return this.readingNavigation(page, () => this.readState(page, false))
  }

  /**
   * Run a read of the page. If the page navigates under it ("Execution context was destroyed"), the read is
   * tried once more on the new document; if that fails the same way the page is still moving, which is a
   * stale observation (TARGET_STALE), not a failed action. Nothing a read does changes the page.
   */
  private async readingNavigation<T>(page: any, run: () => Promise<T>): Promise<T> {
    const destroyed = (error: unknown): boolean => /Execution context was destroyed|Cannot find context with specified id|Frame was detached|frame got detached/i.test(error instanceof Error ? error.message : String(error))
    try {
      return await run()
    } catch (error) {
      if (!destroyed(error)) throw error
    }
    await page.waitForLoadState?.('domcontentloaded', { timeout: 5_000 }).catch(() => {})
    try {
      return await run()
    } catch (error) {
      if (!destroyed(error)) throw error
      const stamp = this.stamp(page)
      throw new TargetStaleError(
        `The page ${stamp.targetId ?? ''} navigated while it was being read (Execution context was destroyed, twice): the observation is stale and nothing was changed.`,
        { targetId: stamp.targetId ?? '', generation: stamp.generation ?? 0 },
      )
    }
  }

  /**
   * Structured observation of the active page (or of one element's subtree): readable text, controls, links,
   * and tables, each section bounded by `maxItems` and the whole record by `maxBytes` (see src/observe.ts).
   * With only the default `content` section, no scope and no limits it is exactly {@link read}.
   */
  async observe(opts: {
    sections?: readonly ObserveSection[]
    target?: BrowserTarget
    region?: ObserveRegion
    maxItems?: number
    maxBytes?: number
    includeValues?: boolean
    timeoutMs?: number
    session?: string
  } = {}): Promise<Record<string, unknown>> {
    const request = normalizeObserve(opts)
    const page = await this.ensureActivePage(undefined, { session: opts.session })
    return this.readingNavigation(page, () => this.observeOnce(page, request, opts))
  }

  private async observeOnce(page: any, request: ReturnType<typeof normalizeObserve>, opts: { maxBytes?: number; maxItems?: number }): Promise<Record<string, unknown>> {
    const base = scopeBase(request.target)
    const structured = request.sections.some(section => section !== 'content')
    const wantsText = request.sections.includes('content')
    if (!structured && request.target === undefined && opts.maxBytes === undefined && opts.maxItems === undefined) return { ...await this.readState(page, false) }

    const generationBefore = this.stamp(page).generation
    let title = ''
    let url = page.url()
    let text: string | undefined
    if (wantsText) {
      if (request.target === undefined) {
        const state = await this.readState(page, false)
        title = state.title
        url = state.url
        text = state.text
      } else {
        const locator = resolveLocator(page, request.target)
        text = capText(String(await withStrictLocator(locator, l => l.innerText({ timeout: request.timeoutMs }))).replace(/\n{3,}/g, '\n\n').trim(), 100_000)
      }
    }
    if (!title) title = String(await page.title().catch(() => '')).slice(0, 500)

    const raw = structured ? await scanPage(page, request, base) : undefined
    const described = raw ? await describeScan(page, raw, request, base) : undefined
    const stamp = this.stamp(page)
    const limits = [...described?.limits ?? []]
    if (generationBefore !== stamp.generation) limits.push('the page navigated while it was being observed; observe again')
    const head: Record<string, unknown> = {
      url, title,
      ...stamp.targetId !== undefined ? { targetId: stamp.targetId } : {},
      // The generation from before the scan: if the page moved meanwhile, a guarded action based on this fails stale.
      ...generationBefore !== undefined ? { generation: generationBefore } : {},
      ...described && Object.keys(described.counts).length ? { counts: described.counts } : {},
      ...raw && raw.shadowRoots > 0 ? { scanned: { shadowRoots: raw.shadowRoots } } : {},
      ...described?.frames ? { frames: described.frames } : {},
      ...limits.length ? { limits } : {},
    }
    const fitted = fitObservation({
      head,
      ...text !== undefined ? { text } : {},
      ...described?.controls ? { controls: described.controls } : {},
      ...described?.links ? { links: described.links } : {},
      ...described?.tables ? { tables: described.tables } : {},
    }, request.maxBytes, raw?.counts ?? {}, request.maxItems)
    return { ...fitted.record, ...fitted.truncation ? { truncation: fitted.truncation } : {} }
  }

  // ── downloads (state is per session; files go only to config.downloadDir) ─────────────────

  private pushDownload(state: SessionState, record: DownloadRecord): DownloadRecord {
    state.downloads.push(record)
    if (state.downloads.length > DOWNLOAD_HISTORY_LIMIT) state.downloads.splice(0, state.downloads.length - DOWNLOAD_HISTORY_LIMIT)
    return record
  }

  private failedDownload(state: SessionState, url: string, suggestedFilename: string, source: DownloadRecord['source'], error: unknown): DownloadRecord {
    return this.pushDownload(state, {
      id: 'd' + state.nextDownload++, url: redactCaptureUrl(url), status: 'failed', source, suggestedFilename,
      error: redactCaptureText(String(error instanceof Error ? error.message : error), 500), timestamp: new Date().toISOString(),
    })
  }

  /**
   * Save one browser download event (navigation to an attachment, a click, a script-created link) into the
   * download directory and record the outcome in the session that owns the page. Never rejects: a failure is a
   * `failed` record with the partial file removed, so nothing half-written is ever reported as a result.
   */
  private async saveBrowserDownload(state: SessionState, download: any): Promise<DownloadRecord> {
    const requested = state.downloadFilename
    state.downloadFilename = undefined
    const url = String(download.url?.() ?? '')
    const suggested = String(download.suggestedFilename?.() ?? '')
    const dir = this.config.downloadDir
    let temporary: string | undefined
    try {
      fs.mkdirSync(dir, { recursive: true })
      const name = resolveDownloadFilename({ ...requested !== undefined ? { requested } : {}, suggested, url })
      temporary = temporaryDownloadPath(dir)
      const source = await download.createReadStream()
      if (!source) throw new Error('the browser did not provide the downloaded bytes: ' + String(await download.failure?.() ?? 'unknown reason'))
      const { bytes, sha256 } = await streamToFile(source, temporary, this.config.downloadMaxBytes)
      const failure = await download.failure?.()
      if (failure) throw new Error('the download failed: ' + String(failure))
      if (bytes === 0) throw new Error('the download produced zero bytes; nothing was saved')
      const saved = claimDownloadPath(dir, name, temporary)
      temporary = undefined
      return this.pushDownload(state, {
        id: 'd' + state.nextDownload++, url: redactCaptureUrl(url), status: 'saved', source: 'browser', suggestedFilename: suggested || name,
        path: saved, bytes, sha256, timestamp: new Date().toISOString(),
      })
    } catch (error) {
      removeQuietly(temporary)
      if (error instanceof DownloadLimitError) await download.cancel?.().catch(() => {})
      return this.failedDownload(state, url, suggested, 'browser', error)
    }
  }

  /**
   * `target.download`: save a URL into the download directory.
   *
   * First an HTTP request made through the session's own context (its cookies and login state, its proxy and
   * user agent); if that does not produce bytes, the URL is opened in a throwaway page of the same context and the
   * attachment download that navigation triggers is captured. A request that returns nothing is an error, never a
   * zero-byte file. The session's own page is not navigated.
   */
  async download(url: string, opts: { filename?: string; timeoutMs?: number; signal?: AbortSignal; session?: string } = {}): Promise<DownloadResult> {
    this.assertEnabled()
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('target.download requires an HTTP(S) URL') }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('target.download requires an HTTP(S) URL')
    // Both are checked before anything is fetched or created.
    const requested = opts.filename !== undefined ? sanitizeDownloadName(opts.filename, true) : undefined
    const timeoutMs = opts.timeoutMs ?? 60_000
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 150_000) throw new Error('target.download timeoutMs must be between 1,000 and 150,000 ms')
    const maxBytes = this.config.downloadMaxBytes
    const dir = this.config.downloadDir
    this.refreshPolicy()
    const state = this.state(opts.session)
    if (state.page && (state.page.isClosed() || !this.browserConnected())) await this.closePage(state)
    if (state.page && !state.page.isClosed()) {
      // The session's login state may only be sent where its auth profile is allowed to go; open() applies the same rule.
      if (state.profile) this.authProfiles.resolve(state.profile.id, url)
    } else {
      await this.ensureActivePage(url, { session: opts.session })
    }
    const context = state.context
    if (!context) throw new Error('dsh-browser: no browser context is available for the download')
    const deadline = Date.now() + timeoutMs
    const signal = opts.signal
    let requestFailure = ''
    fs.mkdirSync(dir, { recursive: true })

    // 1. A request with the session's cookies.
    let temporary: string | undefined
    try {
      const response: any = await this.usageGovernor.run(url, () => context.request.get(url, { timeout: timeoutMs, failOnStatusCode: false }), signal)
      const status = Number(response.status?.() ?? 0)
      if (status >= 200 && status < 400) this.usageGovernor.noteResponse(url, status)
      else if ([429, 502, 503, 504].includes(status)) {
        const retryAfter = String(response.headers?.()?.['retry-after'] ?? '')
        this.usageGovernor.noteResponse(url, status, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined)
      }
      if (!response.ok()) throw new Error(`the server answered HTTP ${status}`)
      const finalUrl = String(response.url?.() ?? url)
      const final = new URL(finalUrl)
      if (!['http:', 'https:'].includes(final.protocol)) throw new Error('the request ended on a non-HTTP(S) URL')
      if (state.profile) this.authProfiles.resolve(state.profile.id, finalUrl)
      const headers = response.headers?.() ?? {}
      const declared = Number(headers['content-length'])
      if (Number.isFinite(declared) && declared > maxBytes) throw new DownloadLimitError(maxBytes)
      const body: Buffer = await response.body()
      if (body.length === 0) throw new Error('the response body was empty (zero bytes)')
      const suggested = contentDispositionFilename(headers['content-disposition'])
      const name = resolveDownloadFilename({ ...requested !== undefined ? { requested } : {}, suggested, url: finalUrl })
      temporary = temporaryDownloadPath(dir)
      const { bytes, sha256 } = writeBufferToFile(body, temporary, maxBytes)
      const saved = claimDownloadPath(dir, name, temporary)
      temporary = undefined
      const record = this.pushDownload(state, {
        id: 'd' + state.nextDownload++, url: redactCaptureUrl(finalUrl), status: 'saved', source: 'request',
        suggestedFilename: suggested || name, path: saved, bytes, sha256, timestamp: new Date().toISOString(),
      })
      return downloadResult(record, url)
    } catch (error) {
      removeQuietly(temporary)
      if (signal?.aborted) throw error
      // A size or policy failure is final: another route would meet the same limit or send the login state where it must not go.
      if (error instanceof DownloadLimitError) {
        this.failedDownload(state, url, '', 'request', error)
        throw error
      }
      if (/auth profile .* is not allowed/.test(String(error))) {
        this.failedDownload(state, url, '', 'request', error)
        throw error
      }
      requestFailure = String(error instanceof Error ? error.message : error).split('\n')[0]!.slice(0, 300)
    }

    // 2. Navigation: the attachment download the URL triggers, captured from a page of the same context.
    const remaining = Math.max(deadline - Date.now(), 5_000)
    const page = await context.newPage()
    this.trackPage(state, page)
    state.downloadFilename = requested
    let recorded = false
    try {
      page.setDefaultTimeout(remaining)
      const waiting = page.waitForEvent('download', { timeout: remaining }).then((value: any) => value, () => undefined)
      let navigation: { response?: any; error?: unknown } = {}
      const navigated = this.usageGovernor.run(url, () => page.goto(url, { waitUntil: 'commit', timeout: remaining }), signal)
        .then((response: any) => { navigation = { response } }, (error: unknown) => { navigation = { error } })
      // A download makes goto fail with "Download is starting"; a page that simply loaded leaves a short grace for the event.
      const download = await Promise.race([
        waiting,
        navigated.then(() => Promise.race([waiting, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 1_500))])),
      ])
      if (signal?.aborted) throw new Error('target.download aborted')
      if (!download) {
        const reason = navigation.error
          ? 'navigation failed: ' + String((navigation.error as Error)?.message ?? navigation.error).split('\n')[0]!.slice(0, 200)
          : `the URL loaded as a page (HTTP ${Number(navigation.response?.status?.() ?? 0)}) and did not start a download`
        throw new Error(`could not download ${redactCaptureUrl(url)}: request failed (${requestFailure}); ${reason}`)
      }
      const job = state.downloadJobs.get(download)
      const record = job ? await job : undefined
      // The download listener records what it saw, failures included; only a failure it never saw is recorded below.
      recorded = !!record
      if (!record) throw new Error(`could not download ${redactCaptureUrl(url)}: the browser download was not captured`)
      if (record.status !== 'saved') throw new Error(`could not download ${redactCaptureUrl(url)}: request failed (${requestFailure}); ${record.error ?? 'download failed'}`)
      return downloadResult(record, url)
    } catch (error) {
      if (!recorded) this.failedDownload(state, url, '', 'request', error)
      throw error
    } finally {
      state.downloadFilename = undefined
      await page.close().catch(() => {})
    }
  }

  /** `inspect.downloads`: this session's download records (newest last); reading never creates a session bucket. */
  downloadRecords(opts: { limit?: number; clear?: boolean; session?: string } = {}): { downloadDir: string; records: DownloadRecord[]; total: number } {
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), DOWNLOAD_HISTORY_LIMIT)
    const state = this.peek(opts.session)
    const all = state?.downloads ?? []
    const records = all.slice(-limit).map(record => ({ ...record }))
    if (opts.clear && state) state.downloads = []
    return { downloadDir: this.config.downloadDir, records, total: all.length }
  }

  consoleMessages(opts: { level?: string; limit?: number; clear?: boolean; session?: string } = {}): { enabled: boolean; records: BrowserConsoleRecord[] } {
    const severities = ['debug', 'log', 'info', 'warning', 'error']
    const threshold = opts.level ? severities.indexOf(opts.level) : 0
    if (opts.level && threshold < 0) throw new Error('inspect.console level must be debug, log, info, warning, or error')
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 200)
    // A session that never captured has nothing to report; reading must not
    // mint it a bucket, or `inspect.console` would evict someone's page.
    const state = this.peek(opts.session) ?? newSessionState()
    const records = state.capturedConsole.filter(record => {
      const index = severities.indexOf(record.type === 'warn' ? 'warning' : record.type)
      return index < 0 || index >= threshold
    }).slice(-limit)
    if (opts.clear) state.capturedConsole = []
    return { enabled: state.captureConsole, records }
  }

  networkRequests(opts: { limit?: number; clear?: boolean; session?: string } = {}): { enabled: boolean; records: BrowserRequestRecord[] } {
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 200)
    const state = this.peek(opts.session) ?? newSessionState()
    const records = state.capturedRequests.slice(-limit)
    if (opts.clear) state.capturedRequests = []
    return { enabled: state.captureNetwork, records }
  }

  async screenshot(options: BrowserScreenshotOptions & { session?: string } = {}): Promise<{ path: string }> {
    const page = await this.ensureActivePage(undefined, { session: options.session })
    return { path: await this.captureScreenshot(page, options) }
  }

  /**
   * Run a recipe on the session's page.
   *
   * A business failure comes back as a value (`executionStatus`, `failedStep`,
   * `completedSteps`, `effects`), never as an exception; only problems before
   * any step ran (no page, navigation failure, a malformed recipe) throw.
   *
   * Cancelling stops this recipe only: the session page stays open and usable.
   * A step that is already running cannot be interrupted, so the call returns
   * once that step has returned. The caller therefore still holds the session
   * (browser_call is serialized per agent) until the page is quiet again.
   */
  async recipe(
    steps: readonly AnyRecipeStep[],
    opts: {
      url?: string; waitMs?: number; authProfile?: string; rulePack?: string; signal?: AbortSignal; session?: string; legacyRecipe?: boolean
      /** 2: strict LocatorSpec steps, goto/clear, postconditions (see src/automation-v2.ts). Default 1. */
      schemaVersion?: 1 | 2
      postconditions?: readonly Postcondition[]
      outputSchema?: readonly OutputSpec[]
      /** v2 goto may land on these domains. */
      allowedDomains?: readonly string[]
      /** v2 goto may also stay on the origin the recipe started on (inline recipes; stored assets are limited to their domains). */
      gotoSameOrigin?: boolean
      /** Run in a brand-new BrowserContext (its own cookies and storage) that is closed afterwards; the session's page is not touched. Needs `url`. */
      isolated?: boolean
    } = {},
  ): Promise<RecipeServiceResult> {
    if (opts.isolated) return this.isolatedRecipe(steps, opts)
    const existing = this.peek(opts.session)?.page
    if (!opts.url && (!existing || existing.isClosed())) throw new Error('browser recipe requires url or an active target.open page')
    const page = await this.ensureActivePage(opts.url, opts)
    return this.runRecipeOn(page, this.state(opts.session), steps, opts)
  }

  /** A recipe in its own context: nothing of the caller's session (page, cookies, storage, journal) is shared or changed. */
  private async isolatedRecipe(steps: readonly AnyRecipeStep[], opts: Parameters<BrowserService['recipe']>[1] & object): Promise<RecipeServiceResult> {
    if (!opts.url) throw new Error('an isolated recipe run requires url')
    const state = newSessionState()
    const created = await this.transientContext(opts.url, opts)
    state.context = created.context
    state.profile = created.profile
    state.rulePack = created.rulePack
    try {
      state.context.on('page', (opened: any) => { if (state.context) this.trackPage(state, opened) })
      state.page = await state.context.newPage()
      this.trackPage(state, state.page)
      return await this.runRecipeOn(state.page, state, steps, opts)
    } finally {
      await this.closePage(state).catch(() => {})
    }
  }

  private async runRecipeOn(page: any, state: SessionState, steps: readonly AnyRecipeStep[], opts: Parameters<BrowserService['recipe']>[1] & object): Promise<RecipeServiceResult> {
    if (opts.url) {
      page.setDefaultTimeout(30_000)
      await this.navigate(page, opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal)
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      await applyRuleSteps(page, state.rulePack)
      if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
    }
    const options: RunRecipeOptions = { legacy: opts.legacyRecipe }
    if (opts.schemaVersion === 2) {
      let startOrigin: string | undefined
      try { startOrigin = new URL(page.url()).origin } catch { /* about:blank has no origin */ }
      Object.assign(options, {
        schemaVersion: 2,
        ...opts.postconditions ? { postconditions: opts.postconditions } : {},
        ...opts.outputSchema ? { outputSchema: opts.outputSchema } : {},
        ...opts.allowedDomains ? { allowedDomains: opts.allowedDomains } : {},
        ...opts.gotoSameOrigin && startOrigin && startOrigin !== 'null' ? { sameOrigin: startOrigin } : {},
        // Same navigation path as target.open: usage governor, settle, rule steps.
        goto: async (target: string) => {
          await this.navigate(page, target, { waitUntil: 'domcontentloaded', timeout: 30_000 }, opts.signal)
          await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
          await applyRuleSteps(page, state.rulePack)
        },
      } satisfies RunRecipeOptions)
    }
    const run = await runRecipe(page, steps, () => this.captureScreenshot(page), opts.signal, options)
    const result = await this.readState(page, false).catch((): InteractiveState => ({ url: page.isClosed() ? '' : page.url(), title: '', text: '' }))
    return { ...result, ...run, steps: run.completedSteps }
  }

  /**
   * Close one session's page.
   *
   * `session` is the caller's bucket: a tool call closes only the page that
   * session opened. Only a caller with no session (a service consumer outside
   * the agent loop) reaches the shared bucket, which preserves the historical
   * behaviour for those consumers.
   */
  async closePage(session?: SessionState): Promise<void> {
    if (!session) return
    const page = session.page
    const context = session.context
    const profile = session.profile
    session.page = undefined
    session.pages = []
    session.context = undefined
    session.profile = undefined
    session.rulePack = undefined
    session.contextOptions = undefined
    session.capturedConsole = []
    session.capturedRequests = []
    if (page) await page.close().catch(() => {})
    if (context) await this.persistAndClose({ context, ...profile ? { profile } : {} })
  }

  async status(opts: { session?: string } = {}): Promise<BrowserStatus> {
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
      runtimeWarnings.push(`Expected Chromium executable is missing: ${chromiumExecutablePath}. Run runtime.install for ${this.config.browserRuntime}.`)
    }
    if (this.config.opencliEnabled && !opencliInstalled) runtimeWarnings.push('OpenCLI is enabled but its package entry is not installed.')
    runtimeWarnings.push(...this.config.configWarnings)
    this.refreshPolicy()
    if (this.policyStore.warning) runtimeWarnings.push(this.policyStore.warning)
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
      exposedTools: configuredBrowserTools(this.config.automationMode, this.config.automationAssets, this.config.enabled, this.config.toolSurface),
      exposedActions: configuredBrowserActions(this.config.automationMode, this.config.automationAssets, this.config.enabled),
      directInteractionPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
      mutatingRecipePolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'standard' ? 'ask' : 'allow',
      externalUserscriptPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
      pageEvaluatePolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
      fileUploadPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
      downloadPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
      downloadDir: this.config.downloadDir,
      downloadMaxBytes: this.config.downloadMaxBytes,
      contextDefaults: describeContextOptions(this.config.contextDefaults),
      opencliRunPolicy: !this.config.enabled || this.config.automationMode === 'read-only' ? 'deny' : this.config.automationMode === 'unrestricted' ? 'allow' : 'ask',
      chromiumInstalled,
      ...chromiumExecutablePath ? { chromiumExecutablePath } : {},
      usagePolicy: this.usageGovernor.policy,
      usageGovernor: this.usageGovernor.snapshot(),
      authProfiles: this.authProfiles.list(),
      rulePacks: Object.keys(this.config.rulePacks).sort(),
      builtinScripts: BUILTIN_SCRIPTS.map(script => script.id),
      externalUserscriptsRequireApproval: ['standard', 'autonomous'].includes(this.config.automationMode),
      mutatingRecipesRequireApproval: this.config.automationMode === 'standard',
      ...(() => {
        // Report only the caller's own page, so one session cannot observe that
        // another session currently has a page open. `peek` keeps this a pure
        // query: asking about a session never creates or evicts a bucket.
        const own = this.peek(opts.session)
        if (!this.browserConnected() || !own?.page || own.page.isClosed()) return {}
        return {
          activeUrl: own.page.url(),
          ...own.profile ? { activeAuthProfile: own.profile.id } : {},
        }
      })(),
    }
  }

  async close(): Promise<void> {
    // Process teardown (fiber dispose): every session's page and context goes,
    // because the browser process itself is going away.
    for (const state of [...this.sessions.values()]) await this.closePage(state)
    this.sessions.clear()
    this.journals.clear()
    const b = this.browser
    this.browser = undefined
    this.launching = undefined
    if (b) { try { await b.close() } catch { /* already closed */ } }
  }
}
