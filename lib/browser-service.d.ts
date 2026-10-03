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
import { type CliResult } from './deps.ts';
import type { ResolvedConfig } from './config.ts';
import { type ResolvedAuthProfile } from './auth-profiles.ts';
import { type ResolvedRulePack } from './rule-packs.ts';
import { type AnyRecipeStep, type RecipeRunResult, type RecipeStepResult } from './automation.ts';
import type { OutputSpec, Postcondition } from './automation-v2.ts';
import { type UserscriptValidation } from './scripts.ts';
import { type AutomationMode } from './freedom.ts';
import { type OpencliCatalogFilter, type OpencliCatalogItem } from './opencli-catalog.ts';
import { UsageGovernor } from './usage-policy.ts';
import { type BrowserTarget } from './locator.ts';
import { SessionJournal } from './journal.ts';
import { type ObserveRegion, type ObserveSection } from './observe.ts';
export interface RenderRule {
    hostname: string;
    contentSelectors: string[];
    removeSelectors?: string[];
}
export interface RenderResult {
    title: string;
    text: string;
    html: string;
    usedRule?: string;
}
export interface SnapshotResult {
    title: string;
    text: string;
    screenshotPath?: string;
    htmlPath: string;
    usedRule?: string;
}
/** Structural platform-search spec (matches web-search-pro's PlatformSearchSpec). */
export interface PlatformSpec {
    item: string;
    title: string;
    link: string;
    text?: string;
}
export interface SearchItem {
    url: string;
    title: string;
    snippet?: string;
}
export interface InteractiveState {
    url: string;
    title: string;
    text: string;
    /** The session page this state describes (`t1`, `t2`, ...). Absent only when the page is already gone. */
    targetId?: string;
    /**
     * The page's generation when this state was read. It changes whenever the page's main frame navigates
     * (see {@link SessionState.generationClock}); pass it back as `expectGeneration` to refuse acting on a page
     * that moved on since it was observed.
     */
    generation?: number;
    screenshotPath?: string;
    /** The page the action ran on closed itself (a popup's own close button): url/title/text describe the page the session fell back to, or are empty. */
    closedPage?: true;
}
/** The page state after a recipe, plus what the run did ({@link RecipeRunResult}). */
export interface RecipeServiceResult extends InteractiveState, RecipeRunResult {
    /** Same array as `completedSteps`; kept for service consumers written before B2. */
    steps: RecipeStepResult[];
}
export interface ScriptRunResult {
    url: string;
    name: string;
    sha256: string;
    capabilities: string[];
    resultJson: string;
    truncated: boolean;
}
export interface EvaluateResult {
    url: string;
    resultJson: string;
    truncated: boolean;
    capabilities: string[];
    warnings: string[];
}
export interface FileUploadResult extends InteractiveState {
    files: string[];
}
export type { BrowserFrameSpec, BrowserLocatorSpec, BrowserTarget } from './locator.ts';
export interface BrowserConsoleRecord {
    type: string;
    text: string;
    url?: string;
    timestamp: string;
}
export interface BrowserRequestRecord {
    method: string;
    url: string;
    status?: number;
    failure?: string;
    timestamp: string;
}
export interface BrowserScreenshotOptions {
    target?: BrowserTarget;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    fullPage?: boolean;
    format?: 'png' | 'jpeg';
    quality?: number;
    filename?: string;
}
export interface CrawlPage {
    url: string;
    title: string;
    text: string;
    depth: number;
    status: number;
}
export interface CrawlResult {
    pages: CrawlPage[];
    errors: {
        url: string;
        depth: number;
        error: string;
        status?: number;
    }[];
    stats: {
        pagesVisited: number;
        queued: number;
        elapsedMs: number;
        waitMs: number;
        backoffEvents: number;
    };
    warnings: string[];
}
export interface BrowserStatus {
    enabled: boolean;
    channel: string;
    browserRuntime: 'playwright' | 'patchright';
    runtimeWarnings: string[];
    headless: boolean;
    opencliEnabled: boolean;
    opencliInstalled: boolean;
    opencliEntryPath?: string;
    automationMode: AutomationMode;
    /** Tool names registered for the model under the configured toolSurface. */
    exposedTools: string[];
    /** Browser actions (`group.action`) the model can run. */
    exposedActions: string[];
    directInteractionPolicy: 'deny' | 'ask' | 'allow';
    mutatingRecipePolicy: 'deny' | 'ask' | 'allow';
    externalUserscriptPolicy: 'deny' | 'ask' | 'allow';
    pageEvaluatePolicy: 'deny' | 'ask' | 'allow';
    fileUploadPolicy: 'deny' | 'ask' | 'allow';
    opencliRunPolicy: 'deny' | 'ask' | 'allow';
    chromiumInstalled: boolean;
    chromiumExecutablePath?: string;
    usagePolicy: ResolvedConfig['usagePolicy'];
    usageGovernor: ReturnType<UsageGovernor['snapshot']>;
    authProfiles: {
        id: string;
        allowedDomains: string[];
        persistState: boolean;
    }[];
    rulePacks: string[];
    builtinScripts: string[];
    externalUserscriptsRequireApproval: boolean;
    mutatingRecipesRequireApproval: boolean;
    activeUrl?: string;
    activeAuthProfile?: string;
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
    context?: any;
    /** The ACTIVE page: the one every action targets. Always one of `pages` while set. */
    page?: any;
    /** Every open page of this session's context (the page it opened plus popups), in the order they appeared. */
    pages: SessionPage[];
    /** Counter behind the `t1`, `t2`, ... target ids of this session. */
    nextTarget: number;
    /**
     * Source of page generations. A page takes the next value when it is tracked and again on every main-frame
     * navigation (cross-document, reload, history back/forward, `location` assignment, `pushState`/`replaceState`,
     * hash changes), so values only grow and never repeat inside a session, not even across pages: an
     * `expectGeneration` from one page can never match another page by coincidence. Subframe navigation and
     * DOM re-rendering do not change it.
     */
    generationClock: number;
    profile?: ResolvedAuthProfile;
    rulePack?: ResolvedRulePack;
    captureConsole: boolean;
    captureNetwork: boolean;
    capturedConsole: BrowserConsoleRecord[];
    capturedRequests: BrowserRequestRecord[];
    /** Monotonic tick of last use, for least-recently-used eviction. */
    lastUsed: number;
}
/** One tracked page of a session. */
interface SessionPage {
    id: string;
    page: any;
    generation: number;
}
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
export declare function sessionKeyFor(agent: SessionIdentity | undefined): string;
/** The two shapes a live Agent presents for session identity. */
export interface SessionIdentity {
    readonly id?: unknown;
    readonly session?: {
        readonly id?: unknown;
    };
}
export declare class BrowserService {
    private readonly config;
    private browser;
    private launching?;
    /** Per-session interactive state. Replaces the former global activePage. */
    private readonly sessions;
    /** The tracked entry (target id, generation) of every page the service created. */
    private readonly pageEntries;
    private clock;
    private readonly authProfiles;
    private readonly usageGovernor;
    private opencliCatalogCache?;
    /** Per-session exploration journals (see src/journal.ts). Released with the session, never written to disk. */
    private readonly journals;
    /** How many sessions may hold a context+page at once before LRU eviction. */
    private readonly sessionLimit;
    constructor(config: ResolvedConfig);
    available(): boolean;
    /**
     * This session's exploration journal, created on first use. It outlives `target.close` (the session is
     * still the same) and is released when the session is evicted or the service closes. A session that never
     * records anything costs nothing: journals are only created by the action dispatcher.
     */
    journalFor(session: string): SessionJournal;
    /** The active page of a session as `{targetId, generation, url}`, without opening or creating anything. */
    pageStamp(session: string): {
        targetId?: string;
        generation?: number;
        url?: string;
    } | undefined;
    /**
     * Whether the control a fill/type would hit is a secret field (password, one-time code, name that says so).
     * Best effort and quick: any trouble (no page, several matches, a slow page) answers false, and the journal
     * still treats secret-looking values and secret-looking locators as sensitive.
     */
    inputSensitivity(target: BrowserTarget, opts?: {
        session?: string;
    }): Promise<boolean>;
    /**
     * The state bucket belonging to a tool execution's session.
     *
     * Tools use this for the few operations that act on the bucket itself
     * (`target.close`) rather than passing a key into a method.
     */
    sessionState(agent: SessionIdentity | undefined): SessionState | undefined;
    private assertEnabled;
    private browserConnected;
    /**
     * The state bucket for one session, created on demand.
     *
     * Eviction is least-recently-used and never touches the caller's own bucket,
     * so a session cannot have its page closed out from under it by a burst of
     * other sessions.
     */
    private state;
    /**
     * Look up an existing bucket WITHOUT creating one and WITHOUT evicting.
     *
     * Queries (`runtime.status`, `inspect.console`, `inspect.requests`) must go
     * through this, not {@link state}. Creating a bucket for a session that only
     * *asks* a question would both leak a slot and push a live session past the
     * limit, so a read could evict the very page it was trying to describe.
     */
    private peek;
    /** Close the least-recently-used sessions that exceed the limit. */
    private evictSessions;
    /** Close one session's page+context without persisting its auth state. */
    private disposeState;
    /** Drop all per-session state after a browser-level failure. */
    private clearActiveState;
    private handleBrowserDisconnected;
    private trackBrowser;
    private ensure;
    /** Run `playwright install chromium` from the bundled playwright CLI. */
    installChromium(): Promise<CliResult>;
    private navigate;
    private transientContext;
    private persistAndClose;
    render(url: string, rules: readonly RenderRule[], opts?: {
        signal?: AbortSignal;
        maxChars?: number;
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
    }): Promise<RenderResult>;
    snapshot(url: string, rules: readonly RenderRule[], opts: {
        signal?: AbortSignal;
        outDir: string;
        maxChars?: number;
        authProfile?: string;
        rulePack?: string;
        screenshot?: boolean;
    }): Promise<SnapshotResult>;
    searchResults(url: string, spec: PlatformSpec, opts?: {
        signal?: AbortSignal;
        count?: number;
        waitMs?: number;
        cookies?: {
            name: string;
            value: string;
            domain: string;
            path: string;
        }[];
        authProfile?: string;
        rulePack?: string;
    }): Promise<SearchItem[]>;
    opencliAvailable(): boolean;
    opencli(args: string[], opts?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<CliResult>;
    opencliDoctor(signal?: AbortSignal): Promise<CliResult>;
    opencliCatalog(filter?: OpencliCatalogFilter, signal?: AbortSignal): Promise<OpencliCatalogItem[]>;
    crawl(startUrls: readonly string[], opts?: {
        maxPages?: number;
        maxDepth?: number;
        sameOrigin?: boolean;
        maxCharsPerPage?: number;
        signal?: AbortSignal;
    }): Promise<CrawlResult>;
    scriptCatalog(): {
        id: string;
        name: string;
        description: string;
        sha256: string;
    }[];
    validateUserscript(source: string, targetUrl?: string): UserscriptValidation;
    private runScript;
    runBuiltinScript(url: string, id: string, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        authProfile?: string;
        rulePack?: string;
    }): Promise<ScriptRunResult>;
    runUserscript(url: string, source: string, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        authProfile?: string;
        rulePack?: string;
        inputs?: Record<string, string>;
    }): Promise<ScriptRunResult>;
    /**
     * Return the calling session's live page, creating one when needed.
     *
     * `session` is the key from {@link sessionKeyFor}. Every read and write below
     * is confined to that bucket, which is what stops one session from observing
     * or mutating another's page, cookies, console or network log.
     */
    private ensureActivePage;
    /**
     * Add a page to the session's list and wire its capture and close handling.
     * Idempotent: the context 'page' event and the explicit call both land here.
     */
    private trackPage;
    private resetCapture;
    private resolveTarget;
    /**
     * Run an action on a strict locator. More than one match performs nothing and
     * fails with LOCATOR_AMBIGUOUS plus a summary of the first candidates.
     */
    private onTarget;
    private screenshotFile;
    private captureScreenshot;
    /** `{targetId, generation}` of a tracked page (empty for a page the service does not track). */
    private stamp;
    /**
     * Refuse to act when the page's generation is not the one the caller observed. Nothing has been done yet
     * at this point, so the caller only needs to observe again.
     */
    private assertGeneration;
    private readState;
    open(url: string, opts?: {
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
        capture?: readonly ('console' | 'network')[];
        session?: string;
    }): Promise<InteractiveState>;
    click(target: BrowserTarget, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    type(target: BrowserTarget, text: string, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    /** Type key by key (pressSequentially), so per-key handlers fire; unlike `type`, which replaces the whole value. */
    typeKeys(target: BrowserTarget, text: string, opts?: {
        expectGeneration?: number;
        delayMs?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    clear(target: BrowserTarget, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    wait(target: BrowserTarget | undefined, opts?: {
        urlPattern?: string;
        networkIdle?: boolean;
        timeMs?: number;
        state?: 'visible' | 'hidden' | 'attached' | 'detached';
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    press(target: BrowserTarget | undefined, key: string, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    select(target: BrowserTarget, values: readonly string[], opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    check(target: BrowserTarget, checked?: boolean, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    hover(target: BrowserTarget, opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    setFiles(target: BrowserTarget, files: readonly string[], opts?: {
        expectGeneration?: number;
        timeoutMs?: number;
        session?: string;
    }): Promise<FileUploadResult>;
    evaluate(expression: string, opts?: {
        timeoutMs?: number;
        session?: string;
    }): Promise<EvaluateResult>;
    /**
     * The pages this session holds: the one it opened plus any popup that page
     * (or a later one) opened in the same context. Pure query: it never creates
     * a bucket and never changes the active page.
     */
    listTargets(opts?: {
        session?: string;
    }): Promise<{
        targets: {
            id: string;
            url: string;
            title: string;
            active: boolean;
            generation: number;
        }[];
    }>;
    /** Make one of this session's pages the active page: every later action, read, and screenshot targets it. */
    selectTarget(id: string, opts?: {
        session?: string;
    }): Promise<InteractiveState & {
        id: string;
    }>;
    scroll(deltaY: number, opts?: {
        expectGeneration?: number;
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    read(opts?: {
        session?: string;
    }): Promise<InteractiveState>;
    /**
     * Run a read of the page. If the page navigates under it ("Execution context was destroyed"), the read is
     * tried once more on the new document; if that fails the same way the page is still moving, which is a
     * stale observation (TARGET_STALE), not a failed action. Nothing a read does changes the page.
     */
    private readingNavigation;
    /**
     * Structured observation of the active page (or of one element's subtree): readable text, controls, links,
     * and tables, each section bounded by `maxItems` and the whole record by `maxBytes` (see src/observe.ts).
     * With only the default `content` section, no scope and no limits it is exactly {@link read}.
     */
    observe(opts?: {
        sections?: readonly ObserveSection[];
        target?: BrowserTarget;
        region?: ObserveRegion;
        maxItems?: number;
        maxBytes?: number;
        includeValues?: boolean;
        timeoutMs?: number;
        session?: string;
    }): Promise<Record<string, unknown>>;
    private observeOnce;
    consoleMessages(opts?: {
        level?: string;
        limit?: number;
        clear?: boolean;
        session?: string;
    }): {
        enabled: boolean;
        records: BrowserConsoleRecord[];
    };
    networkRequests(opts?: {
        limit?: number;
        clear?: boolean;
        session?: string;
    }): {
        enabled: boolean;
        records: BrowserRequestRecord[];
    };
    screenshot(options?: BrowserScreenshotOptions & {
        session?: string;
    }): Promise<{
        path: string;
    }>;
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
    recipe(steps: readonly AnyRecipeStep[], opts?: {
        url?: string;
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
        signal?: AbortSignal;
        session?: string;
        legacyRecipe?: boolean;
        /** 2: strict LocatorSpec steps, goto/clear, postconditions (see src/automation-v2.ts). Default 1. */
        schemaVersion?: 1 | 2;
        postconditions?: readonly Postcondition[];
        outputSchema?: readonly OutputSpec[];
        /** v2 goto may land on these domains. */
        allowedDomains?: readonly string[];
        /** v2 goto may also stay on the origin the recipe started on (inline recipes; stored assets are limited to their domains). */
        gotoSameOrigin?: boolean;
        /** Run in a brand-new BrowserContext (its own cookies and storage) that is closed afterwards; the session's page is not touched. Needs `url`. */
        isolated?: boolean;
    }): Promise<RecipeServiceResult>;
    /** A recipe in its own context: nothing of the caller's session (page, cookies, storage, journal) is shared or changed. */
    private isolatedRecipe;
    private runRecipeOn;
    /**
     * Close one session's page.
     *
     * `session` is the caller's bucket: a tool call closes only the page that
     * session opened. Only a caller with no session (a service consumer outside
     * the agent loop) reaches the shared bucket, which preserves the historical
     * behaviour for those consumers.
     */
    closePage(session?: SessionState): Promise<void>;
    status(opts?: {
        session?: string;
    }): Promise<BrowserStatus>;
    close(): Promise<void>;
}
