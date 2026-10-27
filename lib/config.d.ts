/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */
import z from '@deepseek-ai/schemastery';
import type { AuthProfileConfig } from './auth-profiles.ts';
import type { RulePackConfig } from './rule-packs.ts';
import { type AutomationMode, type ToolSurface } from './freedom.ts';
import { type UsagePolicy, type UsagePolicyInput } from './usage-policy.ts';
import { type PromptsSource } from './prompts.ts';
import { type AutomationAssetPolicy, type AutomationAssetPolicyInput } from './automation-assets.ts';
import { type ContextOptions, type ViewportMode } from './context-options.ts';
import { MAX_DOWNLOAD_BYTES_LIMIT } from './config-rules.ts';
export { MAX_DOWNLOAD_BYTES_LIMIT };
/** Schema keys that are not settings (see {@link MISPLACED_KEYS}); the settings card has no control for them. */
export declare const MISPLACED_CONFIG_KEYS: readonly string[];
export declare const DEFAULT_DOWNLOAD_MAX_BYTES: number;
export declare const BROWSER_RUNTIMES: readonly ["playwright", "patchright"];
export type BrowserRuntime = typeof BROWSER_RUNTIMES[number];
export declare function resolveBrowserRuntime(value: unknown): BrowserRuntime;
/** The `prompts` configuration (see `src/prompts.ts`). Unknown keys are tolerated at parse time and reported as diagnostics. */
export interface PromptsInput {
    tools?: {
        browser_index?: {
            description?: string;
        };
        browser_call?: {
            description?: string;
        };
    };
    rootGuide?: string;
    rootNote?: string;
    groups?: Record<string, {
        summary?: string;
    }>;
    actions?: Record<string, {
        summary?: string;
        notes?: string;
    }>;
    errorHints?: Record<string, string>;
    skill?: {
        enabled?: boolean;
        description?: string;
        bodyFile?: string;
        append?: string;
    };
}
export interface Config {
    /** Whether the browser service is active. */
    enabled: boolean;
    /** Browser channel: 'chromium' (Playwright's Chromium; a system Chrome / Edge stands in when it is not installed), 'chrome' or 'msedge' (always that browser). */
    channel: string;
    /** Browser driver/runtime implementation. Patchright is Chromium-only. */
    browserRuntime?: BrowserRuntime;
    headless: boolean;
    /** Path to a Playwright storageState JSON (persisted login state). */
    storageStatePath?: string;
    /** Named, domain-scoped reusable login states. */
    authProfiles?: Record<string, AuthProfileConfig>;
    /** Optional named profile used when a caller does not select one. */
    defaultAuthProfile?: string;
    /** Domain-scoped, hash-pinned browser enhancement packs. */
    rulePacks?: Record<string, RulePackConfig>;
    /** Explicit browser executable path override (rare). */
    executablePath?: string;
    /** Whether OpenCLI (optional, installed separately) is used; with no OpenCLI installed this only affects what status reports. */
    opencliEnabled: boolean;
    /** Model-facing tool exposure and approval level. */
    automationMode: AutomationMode;
    /**
     * How browser capabilities reach the model: `indexed` (default) exposes two
     * small tools, `browser_index` + `browser_call`; `flat` registers one tool per
     * action (a much larger always-on context cost).
     */
    toolSurface?: ToolSurface;
    /** Approval-independent traffic buffering and bounded crawl budgets. */
    usagePolicy?: UsagePolicyInput;
    /** Reusable automation capture, review, activation, and retrieval policy. */
    automationAssets?: AutomationAssetPolicyInput;
    /**
     * Deployment overrides of the model-facing text (tool descriptions, root guide, catalog summaries and notes,
     * error hints, the skill). Every field is optional; the settings card button Export default text (or `prompts:dump`) shows the full structure with defaults.
     */
    prompts?: PromptsInput;
    /** Lazily run `playwright install chromium` when the browser is missing. */
    autoInstall: boolean;
    /** Directory for browser screenshots; defaults to $DSH_HOME/data/browser/snapshots. */
    snapshotDir?: string;
    /**
     * Whether a policy change made through the agent actions may name localhost, `.local`/`.internal` names and
     * loopback or private-network IPv4 addresses as allowed domains. Off by default; cloud metadata and link-local
     * addresses are refused regardless.
     */
    allowPrivateHosts?: boolean;
    /** Directory the downloads of `target.download` and browser-triggered downloads are saved to; defaults to $DSH_HOME/data/browser/downloads. */
    downloadDir?: string;
    /** Largest single download in bytes; a bigger one is stopped and removed. Default 100 MiB. */
    downloadMaxBytes?: number;
    /**
     * Viewport of every context the plugin creates: `window` (default, Playwright's own default size),
     * `720p` (1280x720), `1080p` (1920x1080) or `custom` (viewportWidth x viewportHeight).
     */
    viewportMode?: ViewportMode;
    /** Custom viewport width in CSS pixels; only read with viewportMode=custom. */
    viewportWidth?: number;
    /** Custom viewport height in CSS pixels; only read with viewportMode=custom. */
    viewportHeight?: number;
    /** User agent of every context; unset keeps the browser's own. */
    userAgent?: string;
    /** BCP 47 locale of every context (en-US, zh-CN); unset keeps the browser's own. */
    locale?: string;
    /** IANA time zone of every context (Asia/Shanghai); unset keeps the machine's. */
    timezoneId?: string;
    /** Proxy of every context: `http://host:port`, `socks5://host:port`. No account or password is supported. */
    proxyServer?: string;
    /** Comma-separated hosts that skip the proxy (`example.com,.internal.test`); needs proxyServer. */
    proxyBypass?: string;
    verbose: boolean;
    /** Optional remote debugging port to expose CDP for external tools (e.g. 9222). */
    cdpPort?: number;
    /** Additional Chromium CLI launch arguments. */
    args?: string[];
    /**
     * How many sessions may hold a browser context+page at once. Past this the
     * least-recently-used session is closed. One shared browser process serves
     * them all, so this bounds contexts, not processes.
     */
    maxSessions?: number;
}
export declare const Config: z<Config>;
export interface ResolvedConfig {
    enabled: boolean;
    channel: string;
    browserRuntime: BrowserRuntime;
    headless: boolean;
    storageStatePath?: string;
    authProfiles: Record<string, AuthProfileConfig>;
    defaultAuthProfile?: string;
    rulePacks: Record<string, RulePackConfig>;
    executablePath?: string;
    opencliEnabled: boolean;
    automationMode: AutomationMode;
    toolSurface: ToolSurface;
    usagePolicy: UsagePolicy;
    automationAssets: AutomationAssetPolicy;
    /** Live view of the `prompts` overrides: `current()` reads the configuration at call time. */
    prompts: PromptsSource;
    autoInstall: boolean;
    snapshotDir: string;
    downloadDir: string;
    downloadMaxBytes: number;
    allowPrivateHosts: boolean;
    /** `$DSH_HOME/data/browser`: where the plugin keeps the policy overlay and its auth state directory. */
    dataDir: string;
    /** The only directory an agent-set storageStatePath may live in. */
    authDir: string;
    /** The managed policy overlay file (see policy-overlay.ts). */
    policyOverlayFile: string;
    /** Context options applied to every context the plugin creates (viewport, user agent, locale, time zone, proxy). */
    contextDefaults: ContextOptions;
    /** Settings that were read but have no effect, shown in `runtime.status`. */
    configWarnings: string[];
    verbose: boolean;
    cdpPort?: number;
    args: string[];
    maxSessions: number;
}
export declare function defaultSnapshotDir(): string;
export declare function defaultBrowserDataDir(): string;
export declare function defaultDownloadDir(): string;
/**
 * `downloadDir` must be an absolute path: a relative one would depend on the host process's working directory.
 * A wrong value falls back to the default and is reported, never thrown: see {@link resolveConfig}.
 */
export declare function resolveDownloadDir(value: unknown): {
    dir: string;
    warning?: string;
};
export declare function resolveDownloadMaxBytes(value: unknown): {
    bytes: number;
    warning?: string;
};
export declare function resolveConfig(config: Config): ResolvedConfig;
