/**
 * Dependency resolution for dsh-browser, with reuse fallback.
 *
 * Resolution order (per dependency):
 *   1. THIS plugin's own node_modules — self-contained when distributed
 *      (playwright / @jackwener/opencli are declared in package.json).
 *   2. The global npm root — reuse what's already installed on the machine,
 *      so a dev box needs zero extra install.
 *
 * The Playwright BROWSER BINARY (chromium) is NOT bundled here and NOT
 * re-downloaded: playwright loads it from its shared cache (Windows:
 * %LOCALAPPDATA%\ms-playwright), which this machine already has. So
 * `channel: chromium` is pure reuse of chromium-1234.
 * @module dsh-browser/deps
 */
/** Plugin package root (scratch-plugin/browser). */
export declare const PLUGIN_ROOT: string;
export interface CliResult {
    code: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
/** Resolve the playwright module (plugin-local, then global reuse). */
export declare function loadPlaywright(): any;
/** playwright CLI entry (for `playwright install chromium`). */
export declare function playwrightCliPath(): string;
/** Entry JS for the bundled/reused @jackwener/opencli (its bin/main). */
export declare function opencliEntryPath(): string;
/**
 * Run a Node.js script with piped stdio capture (bundled opencli / playwright
 * CLI). Mirrors web-search-pro's runCli contract.
 */
export declare function runNode(script: string, args: string[], opts?: {
    timeoutMs?: number;
    signal: AbortSignal | undefined;
    maxOutput?: number;
    cwd?: string;
    env?: Record<string, string>;
}): Promise<CliResult>;
/** Run opencli (bundled or global-reuse). */
export declare function runOpencli(args: string[], opts?: {
    timeoutMs?: number;
    signal: AbortSignal | undefined;
    maxOutput?: number;
}): Promise<CliResult>;
