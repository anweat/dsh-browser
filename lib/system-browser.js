/**
 * Which browser the plugin launches, and what to tell a user who has none.
 *
 * Playwright's Chromium is NOT downloaded when this plugin is installed (neither `playwright` nor `patchright` has an
 * install script), so a new user has no Playwright browser. A system Google Chrome or Microsoft Edge works just as well
 * through the Playwright API, so with the default `channel: chromium` the plugin uses one automatically when the
 * Playwright Chromium is missing. An explicit `executablePath` or a non-default `channel` is always honoured as given.
 * @module dsh-browser/system-browser
 */
import fs from 'node:fs';
import path from 'node:path';
export function realBrowserSearchEnv() {
    return {
        platform: process.platform,
        env: process.env,
        home: process.env.HOME ?? process.env.USERPROFILE ?? '',
        exists: file => { try {
            return fs.statSync(file).isFile();
        }
        catch {
            return false;
        } },
    };
}
/** Candidate install locations, in the order they are tried. Google Chrome before Edge. */
function candidates(search) {
    const chrome = (file) => ({ channel: 'chrome', name: 'Google Chrome', path: file });
    const edge = (file) => ({ channel: 'msedge', name: 'Microsoft Edge', path: file });
    if (search.platform === 'darwin') {
        return [
            chrome('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
            chrome(path.join(search.home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')),
            edge('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
            edge(path.join(search.home, 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')),
        ];
    }
    if (search.platform === 'win32') {
        const bases = [search.env.PROGRAMFILES, search.env['PROGRAMFILES(X86)'], search.env.LOCALAPPDATA].filter((base) => !!base);
        return [
            ...bases.map(base => chrome(path.win32.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))),
            ...bases.map(base => edge(path.win32.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))),
        ];
    }
    return [
        chrome('/opt/google/chrome/chrome'), chrome('/usr/bin/google-chrome'), chrome('/usr/bin/google-chrome-stable'),
        edge('/opt/microsoft/msedge/msedge'), edge('/usr/bin/microsoft-edge'), edge('/usr/bin/microsoft-edge-stable'),
    ];
}
/** Installed system browsers, best first (at most one per channel). */
export function detectSystemBrowsers(search = realBrowserSearchEnv()) {
    const found = [];
    for (const candidate of candidates(search)) {
        if (found.some(browser => browser.channel === candidate.channel))
            continue;
        if (search.exists(candidate.path))
            found.push(candidate);
    }
    return found;
}
export function planBrowser(input) {
    if (input.executablePath) {
        const ready = input.exists(path.resolve(input.executablePath));
        return {
            ready, source: 'custom-executable', path: input.executablePath, launch: { executablePath: input.executablePath },
            note: ready ? 'Using the configured executablePath.' : `The configured executablePath does not exist: ${input.executablePath}`,
        };
    }
    if (input.channel && input.channel !== 'chromium') {
        // An explicit channel is honoured as given: Playwright finds Chrome / Edge itself. We only know the two common ones.
        const system = input.systemBrowsers.find(browser => browser.channel === input.channel);
        const known = input.channel === 'chrome' || input.channel === 'msedge';
        const ready = known ? system !== undefined : true;
        return {
            ready, source: 'channel', ...system ? { path: system.path } : {}, launch: { channel: input.channel },
            note: ready ? `Using the configured channel ${input.channel}.` : `channel is ${input.channel} but that browser is not installed.`,
        };
    }
    const bundledExists = input.bundledPath !== undefined && input.exists(path.resolve(input.bundledPath));
    if (bundledExists)
        return { ready: true, source: 'playwright-chromium', path: path.resolve(input.bundledPath), launch: { channel: input.channel || 'chromium' } };
    if (input.autoInstall) {
        return {
            ready: true, source: 'playwright-chromium', ...input.bundledPath ? { path: path.resolve(input.bundledPath) } : {}, launch: { channel: input.channel || 'chromium' },
            note: 'Playwright Chromium is not installed yet; autoInstall will download it on first use.',
        };
    }
    const system = input.systemBrowsers[0];
    if (system) {
        return {
            ready: true, source: 'system-browser', path: system.path, launch: { executablePath: system.path },
            note: `Playwright Chromium is not installed, so ${system.name} is used (nothing to download).`,
        };
    }
    return { ready: false, source: 'none', ...input.bundledPath ? { path: path.resolve(input.bundledPath) } : {}, launch: { channel: input.channel || 'chromium' } };
}
/**
 * What to do when no browser can be launched. Written for a person following it and for a model relaying it: every
 * option is a command or a place to click, nothing says "install the dependencies".
 */
export function browserInstallAdvice(options) {
    const cli = options.cliPath ? `node "${options.cliPath}" install chromium` : `npx ${options.runtime} install chromium`;
    const withPath = options.browsersPath ? `PLAYWRIGHT_BROWSERS_PATH="${options.browsersPath}" ${cli}` : cli;
    return 'No browser is available to launch. Do one of: '
        + '(1) install Google Chrome or Microsoft Edge (picked up automatically, nothing else to configure); '
        + '(2) run the runtime.install action, which downloads Playwright Chromium (about 150 MB); '
        + `(3) or in a terminal: ${withPath} ; `
        + '(4) or set executablePath (or channel) in the browser plugin settings.';
}
//# sourceMappingURL=system-browser.js.map