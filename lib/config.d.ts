/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */
import z from '@deepseek-ai/schemastery';
import type { AuthProfileConfig } from './auth-profiles.ts';
import type { RulePackConfig } from './rule-packs.ts';
export interface Config {
    /** Whether the browser service is active. */
    enabled: boolean;
    /** Browser channel: 'chromium' (bundled, self-contained) or 'msedge'. */
    channel: string;
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
    /** Lazily run `playwright install chromium` when the browser is missing. */
    autoInstall: boolean;
    /** Directory for browser screenshots; defaults to $DSH_HOME/data/browser/snapshots. */
    snapshotDir?: string;
    verbose: boolean;
}
export declare const Config: z<Config>;
export interface ResolvedConfig {
    enabled: boolean;
    channel: string;
    headless: boolean;
    storageStatePath?: string;
    authProfiles: Record<string, AuthProfileConfig>;
    defaultAuthProfile?: string;
    rulePacks: Record<string, RulePackConfig>;
    executablePath?: string;
    opencliEnabled: boolean;
    autoInstall: boolean;
    snapshotDir: string;
    verbose: boolean;
}
export declare function defaultSnapshotDir(): string;
export declare function resolveConfig(config: Config): ResolvedConfig;
