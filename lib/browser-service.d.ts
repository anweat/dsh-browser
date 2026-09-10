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
export declare class BrowserService {
    private readonly config;
    private browser;
    private launching?;
    private activeContext;
    private activePage;
    private activeProfile?;
    private activeRulePack?;
    private readonly authProfiles;
    private readonly usageGovernor;
    private opencliCatalogCache?;
    private captureConsoleEnabled;
    private captureNetworkEnabled;
    private capturedConsole;
    private capturedRequests;
    constructor(config: ResolvedConfig);
    available(): boolean;
    private assertEnabled;
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
    }): Promise<InteractiveState>;
    click(target: BrowserTarget, opts?: {
        timeoutMs?: number;
        waitMs?: number;
    }): Promise<InteractiveState>;
    type(target: BrowserTarget, text: string, opts?: {
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    wait(target: BrowserTarget | undefined, opts?: {
        urlPattern?: string;
        networkIdle?: boolean;
        timeMs?: number;
        state?: 'visible' | 'hidden' | 'attached' | 'detached';
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    press(target: BrowserTarget | undefined, key: string, opts?: {
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    select(target: BrowserTarget, values: readonly string[], opts?: {
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    check(target: BrowserTarget, checked?: boolean, opts?: {
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    hover(target: BrowserTarget, opts?: {
        timeoutMs?: number;
        waitMs?: number;
    }): Promise<InteractiveState>;
    setFiles(target: BrowserTarget, files: readonly string[], opts?: {
        timeoutMs?: number;
    }): Promise<FileUploadResult>;
    evaluate(expression: string, opts?: {
        timeoutMs?: number;
    }): Promise<EvaluateResult>;
    scroll(deltaY: number, opts?: {
        waitMs?: number;
    }): Promise<InteractiveState>;
    read(): Promise<InteractiveState>;
    consoleMessages(opts?: {
        level?: string;
        limit?: number;
        clear?: boolean;
    }): {
        enabled: boolean;
        records: BrowserConsoleRecord[];
    };
    networkRequests(opts?: {
        limit?: number;
        clear?: boolean;
    }): {
        enabled: boolean;
        records: BrowserRequestRecord[];
    };
    screenshot(options?: BrowserScreenshotOptions): Promise<{
        path: string;
    }>;
    recipe(steps: readonly BrowserRecipeStep[], opts?: {
        url?: string;
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
        signal?: AbortSignal;
    }): Promise<RecipeRunResult>;
    closePage(): Promise<void>;
    status(): Promise<BrowserStatus>;
    close(): Promise<void>;
}
