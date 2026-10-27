/**
 * Which browser the plugin launches, and what to tell a user who has none.
 *
 * Playwright's Chromium is NOT downloaded when this plugin is installed (neither `playwright` nor `patchright` has an
 * install script), so a new user has no Playwright browser. A system Google Chrome or Microsoft Edge works just as well
 * through the Playwright API, so with the default `channel: chromium` the plugin uses one automatically when the
 * Playwright Chromium is missing. An explicit `executablePath` or a non-default `channel` is always honoured as given.
 * @module dsh-browser/system-browser
 */
export interface SystemBrowser {
    /** Playwright channel name of this browser. */
    channel: 'chrome' | 'msedge';
    /** Human name for messages. */
    name: string;
    path: string;
}
/** What detection reads from the machine, so a test can describe a machine instead of owning one. */
export interface BrowserSearchEnv {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    home: string;
    exists: (file: string) => boolean;
}
export declare function realBrowserSearchEnv(): BrowserSearchEnv;
/** Installed system browsers, best first (at most one per channel). */
export declare function detectSystemBrowsers(search?: BrowserSearchEnv): SystemBrowser[];
export type BrowserSource = 'custom-executable' | 'channel' | 'playwright-chromium' | 'system-browser' | 'none';
/** How the plugin will start a browser right now. Computed without launching anything. */
export interface BrowserPlan {
    /** A launch is expected to find a browser. `none` means the user has to install one. */
    ready: boolean;
    source: BrowserSource;
    /** The browser that will run, when known. */
    path?: string;
    /** Playwright `launch()` options this plan adds (`channel` / `executablePath`); empty for the default Chromium. */
    launch: {
        channel?: string;
        executablePath?: string;
    };
    /** One sentence for status output, present when the plan is not the plain Playwright Chromium. */
    note?: string;
}
export interface PlanInput {
    channel: string;
    executablePath?: string | undefined;
    /** `chromium.executablePath()` of the selected runtime, when it has one. */
    bundledPath?: string | undefined;
    autoInstall: boolean;
    systemBrowsers: SystemBrowser[];
    exists: (file: string) => boolean;
}
export declare function planBrowser(input: PlanInput): BrowserPlan;
/**
 * What to do when no browser can be launched. Written for a person following it and for a model relaying it: every
 * option is a command or a place to click, nothing says "install the dependencies".
 */
export declare function browserInstallAdvice(options: {
    runtime: string;
    cliPath?: string;
    browsersPath?: string;
}): string;
