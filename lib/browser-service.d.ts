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
import { type BrowserRecipeStep, type RecipeStepResult } from './automation.ts';
import { type UserscriptValidation } from './scripts.ts';
import { type AutomationMode } from './freedom.ts';
import { type OpencliCatalogFilter, type OpencliCatalogItem } from './opencli-catalog.ts';
import { UsageGovernor } from './usage-policy.ts';
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
    screenshotPath?: string;
}
export interface RecipeRunResult extends InteractiveState {
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
export interface BrowserFrameSpec {
    selector?: string;
    name?: string;
    url?: string;
}
export interface BrowserLocatorSpec {
    selector?: string;
    role?: string;
    name?: string;
    text?: string;
    label?: string;
    exact?: boolean;
    frame?: BrowserFrameSpec;
}
export type BrowserTarget = string | BrowserLocatorSpec;
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
    exposedTools: string[];
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
 * session called `browser_open` last owned the page, and the other session's
 * `browser_read` / `browser_evaluate` / `browser_console` then operated on a
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
    page?: any;
    profile?: ResolvedAuthProfile;
    rulePack?: ResolvedRulePack;
    captureConsole: boolean;
    captureNetwork: boolean;
    capturedConsole: BrowserConsoleRecord[];
    capturedRequests: BrowserRequestRecord[];
    /** Monotonic tick of last use, for least-recently-used eviction. */
    lastUsed: number;
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
    private clock;
    private readonly authProfiles;
    private readonly usageGovernor;
    private opencliCatalogCache?;
    /** How many sessions may hold a context+page at once before LRU eviction. */
    private readonly sessionLimit;
    constructor(config: ResolvedConfig);
    available(): boolean;
    /**
     * The state bucket belonging to a tool execution's session.
     *
     * Tools use this for the few operations that act on the bucket itself
     * (`browser_close`) rather than passing a key into a method.
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
     * Queries (`browser_status`, `browser_console`, `browser_requests`) must go
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
    private attachCapture;
    private resetCapture;
    private resolveTarget;
    private screenshotFile;
    private captureScreenshot;
    private readState;
    open(url: string, opts?: {
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
        capture?: readonly ('console' | 'network')[];
        session?: string;
    }): Promise<InteractiveState>;
    click(target: BrowserTarget, opts?: {
        timeoutMs?: number;
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    type(target: BrowserTarget, text: string, opts?: {
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
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    select(target: BrowserTarget, values: readonly string[], opts?: {
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    check(target: BrowserTarget, checked?: boolean, opts?: {
        timeoutMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    hover(target: BrowserTarget, opts?: {
        timeoutMs?: number;
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    setFiles(target: BrowserTarget, files: readonly string[], opts?: {
        timeoutMs?: number;
        session?: string;
    }): Promise<FileUploadResult>;
    evaluate(expression: string, opts?: {
        timeoutMs?: number;
        session?: string;
    }): Promise<EvaluateResult>;
    scroll(deltaY: number, opts?: {
        waitMs?: number;
        session?: string;
    }): Promise<InteractiveState>;
    read(opts?: {
        session?: string;
    }): Promise<InteractiveState>;
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
    recipe(steps: readonly BrowserRecipeStep[], opts?: {
        url?: string;
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
        signal?: AbortSignal;
        session?: string;
    }): Promise<RecipeRunResult>;
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
export {};
