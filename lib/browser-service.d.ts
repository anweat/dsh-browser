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
import { type CliResult } from './deps.ts';
import type { ResolvedConfig } from './config.ts';
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
    screenshotPath: string;
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
export declare class BrowserService {
    private readonly config;
    private browser;
    private launching?;
    private activeContext;
    private activePage;
    private activeProfile?;
    private activeRulePack?;
    private readonly authProfiles;
    constructor(config: ResolvedConfig);
    available(): boolean;
    private ensure;
    /** Run `playwright install chromium` from the bundled playwright CLI. */
    installChromium(): Promise<CliResult>;
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
    private ensureActivePage;
    private captureScreenshot;
    private readState;
    open(url: string, opts?: {
        waitMs?: number;
        authProfile?: string;
        rulePack?: string;
    }): Promise<InteractiveState>;
    click(selector: string, opts?: {
        timeoutMs?: number;
        waitMs?: number;
    }): Promise<InteractiveState>;
    type(selector: string, text: string, opts?: {
        timeoutMs?: number;
    }): Promise<InteractiveState>;
    scroll(deltaY: number, opts?: {
        waitMs?: number;
    }): Promise<InteractiveState>;
    read(): Promise<InteractiveState>;
    screenshot(): Promise<{
        path: string;
    }>;
    closePage(): Promise<void>;
    status(): Promise<{
        enabled: boolean;
        channel: string;
        headless: boolean;
        opencliEnabled: boolean;
        chromiumInstalled: boolean;
        authProfiles: {
            id: string;
            allowedDomains: string[];
            persistState: boolean;
        }[];
        rulePacks: string[];
        activeUrl?: string;
        activeAuthProfile?: string;
    }>;
    close(): Promise<void>;
}
