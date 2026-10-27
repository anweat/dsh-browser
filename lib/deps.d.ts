/**
 * Dependency resolution for dsh-browser, with reuse fallback.
 *
 * Resolution order (per dependency):
 *   1. THIS plugin's own node_modules — playwright / patchright are declared in package.json.
 *   2. The global npm root — reuse what's already installed on the machine,
 *      so a dev box needs zero extra install.
 *
 * `@jackwener/opencli` is NOT declared: its install script makes pnpm 11 fail `dsh plugin add`. It is found
 * wherever it is installed (see `locateOpencli`) and is only needed by the `opencli.*` actions.
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
export type BrowserRuntimeName = 'playwright' | 'patchright';
export declare function browserRuntimePackage(runtime: BrowserRuntimeName): 'playwright' | 'patchright';
/** Resolve a supported Playwright-compatible runtime (plugin-local, then global reuse). */
export declare function loadBrowserRuntime(runtime: BrowserRuntimeName): any;
/** Backwards-compatible Playwright loader for consumers and status checks. */
export declare function loadPlaywright(): any;
/** playwright CLI entry (for `playwright install chromium`). */
export declare function playwrightCliPath(): string;
/** CLI entry for the selected Playwright-compatible runtime. */
export declare function browserRuntimeCliPath(runtime: BrowserRuntimeName): string;
/** Where `@jackwener/opencli` was found. */
export type OpencliSource = 'env' | 'plugin' | 'path' | 'global-npm' | 'common-prefix';
export interface OpencliLocation {
    /** The JavaScript entry (`bin.opencli` of its package.json). Run with Node. */
    entry: string;
    /** The package directory. */
    packageDir: string;
    source: OpencliSource;
}
/**
 * What to tell a user whose machine has no OpenCLI. OpenCLI is optional: the browser tools never need it, only the
 * `opencli.*` actions do. It is NOT a dependency of this package, because its install scripts make pnpm 11 fail
 * `dsh plugin add` (ERR_PNPM_IGNORED_BUILDS) on a profile that has not approved them.
 */
export declare const OPENCLI_INSTALL_HINT: string;
/** Everything `locateOpencli` reads from the machine, so a test can describe a machine instead of owning one. */
export interface OpencliSearchEnv {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    home: string;
    /** package.json files of the dependency, in the order the plugin's own resolution finds them. */
    pluginPackageJsons: () => string[];
    /** `npm root -g`, or undefined when npm cannot be run. */
    npmGlobalRoot: () => string | undefined;
}
/**
 * Find OpenCLI without requiring it to be a dependency of the plugin. Order: `DSH_BROWSER_OPENCLI`, the plugin's own
 * resolution (pnpm store, plugin-local, an `@jackwener/opencli` the user added to the profile), an `opencli` launcher on PATH,
 * `npm root -g`, and the usual global locations. The first hit wins. Pure apart from reading the file system.
 */
export declare function locateOpencli(search: OpencliSearchEnv): OpencliLocation | undefined;
/** Find OpenCLI on this machine. A hit is remembered while its files exist; a miss is looked up again (the user may install it while DSH runs). */
export declare function opencliLocation(): OpencliLocation | undefined;
/** What to tell the user when OpenCLI was not found: names a wrong `DSH_BROWSER_OPENCLI` first, since that one is theirs to fix. */
export declare function opencliMissingMessage(): string;
/** Entry JS of OpenCLI (its bin/main). Throws the install hint when OpenCLI is not installed. */
export declare function opencliEntryPath(): string;
/**
 * Run a Node.js script with piped stdio capture (opencli / playwright
 * CLI). Mirrors web-search-pro's runCli contract.
 */
export declare function runNode(script: string, args: string[], opts?: {
    timeoutMs?: number;
    signal: AbortSignal | undefined;
    maxOutput?: number;
    cwd?: string;
    env?: Record<string, string>;
}): Promise<CliResult>;
/** Run opencli (found by `opencliLocation`). */
export declare function runOpencli(args: string[], opts?: {
    timeoutMs?: number;
    signal: AbortSignal | undefined;
    maxOutput?: number;
}): Promise<CliResult>;
