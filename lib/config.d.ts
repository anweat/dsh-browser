/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */
import z from '@deepseek-ai/schemastery';
export interface Config {
    /** Whether the browser service is active. */
    enabled: boolean;
    /** Browser channel: 'chromium' (bundled, self-contained) or 'msedge'. */
    channel: string;
    headless: boolean;
    /** Path to a Playwright storageState JSON (persisted login state). */
    storageStatePath?: string;
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
    executablePath?: string;
    opencliEnabled: boolean;
    autoInstall: boolean;
    snapshotDir: string;
    verbose: boolean;
}
export declare function defaultSnapshotDir(): string;
export declare function resolveConfig(config: Config): ResolvedConfig;
