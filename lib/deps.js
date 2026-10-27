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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
/** Plugin package root (scratch-plugin/browser). */
export const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
let cachedGlobalRoot;
/** `npm root -g`, computed once (falls back to the APPDATA npm dir on Windows). */
function globalNpmRoot() {
    if (cachedGlobalRoot)
        return cachedGlobalRoot;
    try {
        cachedGlobalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim();
    }
    catch {
        cachedGlobalRoot = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules');
    }
    return cachedGlobalRoot;
}
/** Walk up from a resolved file to the nearest package.json (its package root). */
function findPackageRoot(fromFile) {
    let dir = path.dirname(fromFile);
    for (let i = 0; i < 20; i++) {
        const pj = path.join(dir, 'package.json');
        if (fs.existsSync(pj))
            return pj;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
    return undefined;
}
/** Find a dependency's package.json inside pnpm's virtual store (node_modules/.pnpm/node_modules/<name>). */
function pnpmStorePackageJson(name) {
    let dir = PLUGIN_ROOT;
    for (let i = 0; i < 12; i++) {
        const candidate = path.join(dir, 'node_modules', '.pnpm', 'node_modules', name, 'package.json');
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
/**
 * Resolve a dependency's package.json: pnpm virtual store -> plugin-local ->
 * global npm. Packages that do NOT export `./package.json`
 * (e.g. @jackwener/opencli) are resolved via their main entry and then walked
 * up to the package root.
 */
function resolvePkgJson(name) {
    const storePkg = pnpmStorePackageJson(name);
    if (storePkg)
        return storePkg;
    const anchors = [
        path.join(PLUGIN_ROOT, 'package.json'),
        path.join(globalNpmRoot(), name, 'package.json'),
    ];
    for (const anchor of anchors) {
        const req = createRequire(anchor);
        try {
            return req.resolve(name + '/package.json');
        }
        catch { /* exports-restricted */ }
        try {
            const entry = req.resolve(name);
            const root = findPackageRoot(entry);
            if (root)
                return root;
        }
        catch { /* not found at this anchor */ }
    }
    throw new Error('dsh-browser: ' + name + ' not found in pnpm store, plugin node_modules, or global npm. Run `npm install` in ' + PLUGIN_ROOT + ' (or install ' + name + ' globally).');
}
function pkgDir(name) {
    return path.dirname(resolvePkgJson(name));
}
const cachedBrowserRuntimes = new Map();
export function browserRuntimePackage(runtime) {
    if (runtime === 'playwright' || runtime === 'patchright')
        return runtime;
    throw new Error('browserRuntime must be one of: playwright, patchright');
}
/** Resolve a supported Playwright-compatible runtime (plugin-local, then global reuse). */
export function loadBrowserRuntime(runtime) {
    const packageName = browserRuntimePackage(runtime);
    const cached = cachedBrowserRuntimes.get(packageName);
    if (cached)
        return cached;
    const loaded = createRequire(resolvePkgJson(packageName))(packageName);
    cachedBrowserRuntimes.set(packageName, loaded);
    return loaded;
}
/** Backwards-compatible Playwright loader for consumers and status checks. */
export function loadPlaywright() {
    return loadBrowserRuntime('playwright');
}
/** playwright CLI entry (for `playwright install chromium`). */
export function playwrightCliPath() {
    return path.join(pkgDir('playwright'), 'cli.js');
}
/** CLI entry for the selected Playwright-compatible runtime. */
export function browserRuntimeCliPath(runtime) {
    return path.join(pkgDir(browserRuntimePackage(runtime)), 'cli.js');
}
/**
 * What to tell a user whose machine has no OpenCLI. OpenCLI is optional: the browser tools never need it, only the
 * `opencli.*` actions do. It is NOT a dependency of this package, because its install scripts make pnpm 11 fail
 * `dsh plugin add` (ERR_PNPM_IGNORED_BUILDS) on a profile that has not approved them.
 */
export const OPENCLI_INSTALL_HINT = 'OpenCLI is not installed (it is optional: only the opencli.* actions need it). Install it with `npm i -g @jackwener/opencli` and restart DSH. '
    + 'If DSH cannot see your PATH (desktop app), set DSH_BROWSER_OPENCLI to the path of its main.js.';
const OPENCLI_PACKAGE = '@jackwener/opencli';
/** Read `bin.opencli` (or `main`) of an opencli package directory and return its existing entry file. */
function opencliEntryOf(packageDir) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
        if (pkg?.name !== OPENCLI_PACKAGE)
            return undefined;
        const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.opencli ?? pkg.main ?? 'dist/src/main.js');
        const entry = path.join(packageDir, bin);
        return fs.existsSync(entry) ? entry : undefined;
    }
    catch {
        return undefined;
    }
}
/** The opencli package directory a `main.js` / launcher path belongs to: walk up to the nearest package.json named for it. */
function opencliPackageDirOf(file) {
    let dir = path.dirname(file);
    for (let i = 0; i < 8; i++) {
        if (opencliEntryOf(dir))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
    return undefined;
}
/** `DSH_BROWSER_OPENCLI` may name the package directory, its main.js, or the `opencli` launcher. */
function opencliFromPath(target) {
    let resolved;
    try {
        resolved = fs.realpathSync(target);
    }
    catch {
        return undefined;
    }
    let stat;
    try {
        stat = fs.statSync(resolved);
    }
    catch {
        return undefined;
    }
    const packageDir = stat.isDirectory() ? (opencliEntryOf(resolved) ? resolved : undefined) : opencliPackageDirOf(resolved);
    const entry = packageDir ? opencliEntryOf(packageDir) : undefined;
    return packageDir && entry ? { entry, packageDir, source: 'env' } : undefined;
}
/** Launchers named `opencli` on PATH: a symlink into the package on Unix, a `.cmd` shim next to `node_modules` on Windows. */
function opencliFromPathVariable(env, platform) {
    const delimiter = platform === 'win32' ? ';' : ':';
    const names = platform === 'win32' ? ['opencli.cmd', 'opencli.exe', 'opencli'] : ['opencli'];
    for (const raw of (env.PATH ?? env.Path ?? env.path ?? '').split(delimiter)) {
        const dir = raw.trim().replace(/^"|"$/g, '');
        if (!dir)
            continue;
        for (const name of names) {
            const launcher = path.join(dir, name);
            if (!fs.existsSync(launcher))
                continue;
            // Unix: the launcher is a symlink to <package>/dist/src/main.js. Windows: the npm shim sits beside node_modules.
            const viaLink = opencliPackageDirOf(safeRealpath(launcher) ?? launcher);
            const packageDir = viaLink ?? (opencliEntryOf(path.join(dir, 'node_modules', OPENCLI_PACKAGE)) ? path.join(dir, 'node_modules', OPENCLI_PACKAGE) : undefined);
            const entry = packageDir ? opencliEntryOf(packageDir) : undefined;
            if (packageDir && entry)
                return { entry, packageDir, source: 'path' };
        }
    }
    return undefined;
}
function safeRealpath(file) {
    try {
        return fs.realpathSync(file);
    }
    catch {
        return undefined;
    }
}
/** Global `node_modules` directories a desktop app (which does not inherit the shell's PATH) is likely to need. */
function commonGlobalRoots(env, platform, home) {
    const roots = [];
    const prefix = env.npm_config_prefix ?? env.NPM_CONFIG_PREFIX;
    if (prefix)
        roots.push(platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules'));
    if (platform === 'win32') {
        if (env.APPDATA)
            roots.push(path.join(env.APPDATA, 'npm', 'node_modules'));
        return roots;
    }
    roots.push('/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules', path.join(home, '.npm-global', 'lib', 'node_modules'), path.join(home, '.local', 'lib', 'node_modules'), path.join(home, '.bun', 'install', 'global', 'node_modules'), path.join(home, '.volta', 'tools', 'image', 'packages', 'opencli', 'lib', 'node_modules'));
    // Version managers keep one global root per Node version: take them all, newest directory name first.
    const managed = [path.join(home, '.nvm', 'versions', 'node'), path.join(home, '.local', 'share', 'fnm', 'node-versions'), path.join(home, 'Library', 'Application Support', 'fnm', 'node-versions'), path.join(home, '.fnm', 'node-versions')];
    for (const base of managed) {
        let versions;
        try {
            versions = fs.readdirSync(base).sort().reverse();
        }
        catch {
            continue;
        }
        for (const version of versions) {
            roots.push(path.join(base, version, 'lib', 'node_modules'), path.join(base, version, 'installation', 'lib', 'node_modules'));
        }
    }
    return roots;
}
/**
 * Find OpenCLI without requiring it to be a dependency of the plugin. Order: `DSH_BROWSER_OPENCLI`, the plugin's own
 * resolution (pnpm store, plugin-local, an `@jackwener/opencli` the user added to the profile), an `opencli` launcher on PATH,
 * `npm root -g`, and the usual global locations. The first hit wins. Pure apart from reading the file system.
 */
export function locateOpencli(search) {
    const override = search.env.DSH_BROWSER_OPENCLI?.trim();
    if (override) {
        const found = opencliFromPath(override);
        if (found)
            return found;
        // An explicit override that does not resolve is reported by the caller; do not silently use another copy.
        return undefined;
    }
    for (const pkgJson of search.pluginPackageJsons()) {
        const packageDir = path.dirname(pkgJson);
        const entry = opencliEntryOf(packageDir);
        if (entry)
            return { entry, packageDir, source: 'plugin' };
    }
    const viaPath = opencliFromPathVariable(search.env, search.platform);
    if (viaPath)
        return viaPath;
    const globalRoot = search.npmGlobalRoot();
    if (globalRoot) {
        const packageDir = path.join(globalRoot, OPENCLI_PACKAGE);
        const entry = opencliEntryOf(packageDir);
        if (entry)
            return { entry, packageDir, source: 'global-npm' };
    }
    for (const root of commonGlobalRoots(search.env, search.platform, search.home)) {
        const packageDir = path.join(root, OPENCLI_PACKAGE);
        const entry = opencliEntryOf(packageDir);
        if (entry)
            return { entry, packageDir, source: 'common-prefix' };
    }
    return undefined;
}
/** The plugin's own copies of opencli: pnpm's virtual store, then module resolution from the plugin root (the profile's hoisted node_modules). */
function pluginOpencliPackageJsons() {
    const found = [];
    const store = pnpmStorePackageJson(OPENCLI_PACKAGE);
    if (store)
        found.push(store);
    const req = createRequire(path.join(PLUGIN_ROOT, 'package.json'));
    try {
        found.push(req.resolve(OPENCLI_PACKAGE + '/package.json'));
    }
    catch { /* exports-restricted or absent */ }
    try {
        const root = findPackageRoot(req.resolve(OPENCLI_PACKAGE));
        if (root)
            found.push(root);
    }
    catch { /* absent */ }
    return found;
}
let npmRootAsked = false;
let npmRootValue;
/** `npm root -g`, asked once per process (a spawn per status call would be slow), without the bogus Windows fallback when APPDATA is not set. */
function npmGlobalRootOrUndefined() {
    if (npmRootAsked)
        return npmRootValue;
    npmRootAsked = true;
    try {
        const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim();
        if (root)
            npmRootValue = root;
    }
    catch { /* npm is not on PATH (a desktop app launched from the Dock has a minimal one) */ }
    if (!npmRootValue && process.platform === 'win32' && process.env.APPDATA)
        npmRootValue = path.join(process.env.APPDATA, 'npm', 'node_modules');
    return npmRootValue;
}
let cachedOpencli;
/** Find OpenCLI on this machine. A hit is remembered while its files exist; a miss is looked up again (the user may install it while DSH runs). */
export function opencliLocation() {
    const key = process.env.DSH_BROWSER_OPENCLI?.trim() ?? '';
    if (cachedOpencli && cachedOpencli.key === key && fs.existsSync(cachedOpencli.location.entry))
        return cachedOpencli.location;
    const location = locateOpencli({
        platform: process.platform,
        env: process.env,
        home: process.env.HOME ?? process.env.USERPROFILE ?? '',
        pluginPackageJsons: pluginOpencliPackageJsons,
        npmGlobalRoot: npmGlobalRootOrUndefined,
    });
    cachedOpencli = location ? { key, location } : undefined;
    return location;
}
/** What to tell the user when OpenCLI was not found: names a wrong `DSH_BROWSER_OPENCLI` first, since that one is theirs to fix. */
export function opencliMissingMessage() {
    const override = process.env.DSH_BROWSER_OPENCLI?.trim();
    return override ? `DSH_BROWSER_OPENCLI=${override} is not an OpenCLI package directory, its main.js or the opencli launcher: fix or unset it. ${OPENCLI_INSTALL_HINT}` : OPENCLI_INSTALL_HINT;
}
/** Entry JS of OpenCLI (its bin/main). Throws the install hint when OpenCLI is not installed. */
export function opencliEntryPath() {
    const location = opencliLocation();
    if (!location)
        throw new Error(opencliMissingMessage());
    return location.entry;
}
/** Electron's process.execPath points to the desktop app, not a Node CLI. */
function nodeExecutable(env) {
    const override = env.DSH_BROWSER_NODE?.trim();
    if (override)
        return override;
    if (/(?:^|[/\\])node(?:\.exe)?$/i.test(process.execPath))
        return process.execPath;
    const searchPath = env.PATH ?? env.Path ?? env.path ?? '';
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const filename = process.platform === 'win32' ? 'node.exe' : 'node';
    for (const entry of searchPath.split(delimiter)) {
        const dir = entry.trim().replace(/^"|"$/g, '');
        if (!dir)
            continue;
        const candidate = path.join(dir, filename);
        try {
            if (fs.statSync(candidate).isFile())
                return candidate;
        }
        catch { /* try next PATH entry */ }
    }
    return undefined;
}
/**
 * Run a Node.js script with piped stdio capture (opencli / playwright
 * CLI). Mirrors web-search-pro's runCli contract.
 */
export function runNode(script, args, opts = { signal: undefined }) {
    const env = { ...process.env, ...opts.env };
    const executable = nodeExecutable(env);
    if (!executable) {
        return Promise.resolve({
            code: -1, stdout: '',
            stderr: 'dsh-browser: Node.js executable not found; install Node.js or set DSH_BROWSER_NODE to its full path',
            timedOut: false,
        });
    }
    return new Promise((resolve) => {
        const maxOutput = opts.maxOutput ?? 4 * 1024 * 1024;
        let stdout = '';
        let stderr = '';
        let settled = false;
        let child;
        let timer;
        const finish = (code, timedOut) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            opts.signal?.removeEventListener('abort', onAbort);
            if (child.exitCode === null)
                child.kill();
            resolve({ code, stdout, stderr, timedOut });
        };
        const onAbort = () => {
            if (child.exitCode === null)
                child.kill();
            finish(-1, false);
        };
        timer = opts.timeoutMs ? setTimeout(() => finish(-1, true), opts.timeoutMs) : undefined;
        // spawn() is used without a shell, so argv must be passed verbatim. Adding
        // shell quotes here would make those quote characters part of the value.
        child = spawn(executable, [script, ...args], {
            env,
            cwd: opts.cwd,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout?.on('data', (d) => { if (stdout.length < maxOutput)
            stdout += d.toString('utf8'); });
        child.stderr?.on('data', (d) => { if (stderr.length < maxOutput)
            stderr += d.toString('utf8'); });
        child.on('error', (error) => {
            stderr += 'dsh-browser: failed to start Node.js: ' + error.message;
            finish(-1, false);
        });
        child.on('close', (code) => finish(code ?? -1, false));
        if (opts.signal?.aborted)
            onAbort();
        else
            opts.signal?.addEventListener('abort', onAbort);
    });
}
/** Run opencli (found by `opencliLocation`). */
export function runOpencli(args, opts = { signal: undefined }) {
    return runNode(opencliEntryPath(), args, opts);
}
//# sourceMappingURL=deps.js.map