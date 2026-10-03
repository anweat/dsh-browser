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
    /** Browser channel: 'chromium' (bundled, self-contained) or 'msedge'. */
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
    /** Whether the bundled OpenCLI is enabled. */
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
    verbose: boolean;
    cdpPort?: number;
    args: string[];
    maxSessions: number;
}
export declare function defaultSnapshotDir(): string;
export declare function resolveConfig(config: Config): ResolvedConfig;
