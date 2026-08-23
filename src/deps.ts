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

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

/** Plugin package root (scratch-plugin/browser). */
export const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url))

export interface CliResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
}

let cachedGlobalRoot: string | undefined
/** `npm root -g`, computed once (falls back to the APPDATA npm dir on Windows). */
function globalNpmRoot(): string {
  if (cachedGlobalRoot) return cachedGlobalRoot
  try {
    cachedGlobalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim()
  } catch {
    cachedGlobalRoot = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules')
  }
  return cachedGlobalRoot
}

/** Walk up from a resolved file to the nearest package.json (its package root). */
function findPackageRoot(fromFile: string): string | undefined {
  let dir = path.dirname(fromFile)
  for (let i = 0; i < 20; i++) {
    const pj = path.join(dir, 'package.json')
    if (fs.existsSync(pj)) return pj
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

/** Find a dependency's package.json inside pnpm's virtual store (node_modules/.pnpm/node_modules/<name>). */
function pnpmStorePackageJson(name: string): string | undefined {
  let dir = PLUGIN_ROOT
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'node_modules', '.pnpm', 'node_modules', name, 'package.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Resolve a dependency's package.json: pnpm virtual store -> plugin-local ->
 * global npm. Packages that do NOT export `./package.json`
 * (e.g. @jackwener/opencli) are resolved via their main entry and then walked
 * up to the package root.
 */
function resolvePkgJson(name: string): string {
  const storePkg = pnpmStorePackageJson(name)
  if (storePkg) return storePkg
  const anchors = [
    path.join(PLUGIN_ROOT, 'package.json'),
    path.join(globalNpmRoot(), name, 'package.json'),
  ]
  for (const anchor of anchors) {
    const req = createRequire(anchor)
    try { return req.resolve(name + '/package.json') } catch { /* exports-restricted */ }
    try {
      const entry = req.resolve(name)
      const root = findPackageRoot(entry)
      if (root) return root
    } catch { /* not found at this anchor */ }
  }
  throw new Error('dsh-browser: ' + name + ' not found in pnpm store, plugin node_modules, or global npm. Run `npm install` in ' + PLUGIN_ROOT + ' (or install ' + name + ' globally).')
}

function pkgDir(name: string): string {
  return path.dirname(resolvePkgJson(name))
}

const cachedBrowserRuntimes = new Map<string, any>()

export type BrowserRuntimeName = 'playwright' | 'patchright'

export function browserRuntimePackage(runtime: BrowserRuntimeName): 'playwright' | 'patchright' {
  if (runtime === 'playwright' || runtime === 'patchright') return runtime
  throw new Error('browserRuntime must be one of: playwright, patchright')
}

/** Resolve a supported Playwright-compatible runtime (plugin-local, then global reuse). */
export function loadBrowserRuntime(runtime: BrowserRuntimeName): any {
  const packageName = browserRuntimePackage(runtime)
  const cached = cachedBrowserRuntimes.get(packageName)
  if (cached) return cached
  const loaded = createRequire(resolvePkgJson(packageName))(packageName)
  cachedBrowserRuntimes.set(packageName, loaded)
  return loaded
}

/** Backwards-compatible Playwright loader for consumers and status checks. */
export function loadPlaywright(): any {
  return loadBrowserRuntime('playwright')
}

/** playwright CLI entry (for `playwright install chromium`). */
export function playwrightCliPath(): string {
  return path.join(pkgDir('playwright'), 'cli.js')
}

/** CLI entry for the selected Playwright-compatible runtime. */
export function browserRuntimeCliPath(runtime: BrowserRuntimeName): string {
  return path.join(pkgDir(browserRuntimePackage(runtime)), 'cli.js')
}

/** Entry JS for the bundled/reused @jackwener/opencli (its bin/main). */
export function opencliEntryPath(): string {
  const dir = pkgDir('@jackwener/opencli')
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.opencli ?? pkg.main ?? 'dist/src/main.js')
  return path.join(dir, bin)
}

/**
 * Run a Node.js script with piped stdio capture (bundled opencli / playwright
 * CLI). Mirrors web-search-pro's runCli contract.
 */
export function runNode(
  script: string,
  args: string[],
  opts: { timeoutMs?: number; signal: AbortSignal | undefined; maxOutput?: number; cwd?: string; env?: Record<string, string> } = { signal: undefined },
): Promise<CliResult> {
  return new Promise((resolve) => {
    const maxOutput = opts.maxOutput ?? 4 * 1024 * 1024
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ChildProcess
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number, timedOut: boolean) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (child.exitCode === null) child.kill()
      resolve({ code, stdout, stderr, timedOut })
    }
    const onAbort = () => {
      if (child.exitCode === null) child.kill()
      finish(-1, false)
    }
    timer = opts.timeoutMs ? setTimeout(() => finish(-1, true), opts.timeoutMs) : undefined
    // spawn() is used without a shell, so argv must be passed verbatim. Adding
    // shell quotes here would make those quote characters part of the value.
    child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (d: Buffer) => { if (stdout.length < maxOutput) stdout += d.toString('utf8') })
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < maxOutput) stderr += d.toString('utf8') })
    child.on('error', () => finish(-1, false))
    child.on('close', (code) => finish(code ?? -1, false))
    if (opts.signal?.aborted) onAbort()
    else opts.signal?.addEventListener('abort', onAbort)
  })
}

/** Run opencli (bundled or global-reuse). */
export function runOpencli(
  args: string[],
  opts: { timeoutMs?: number; signal: AbortSignal | undefined; maxOutput?: number } = { signal: undefined },
): Promise<CliResult> {
  return runNode(opencliEntryPath(), args, opts)
}
