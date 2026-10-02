/**
 * Shared harness for the real-browser e2e suite.
 *
 * Nothing here downloads a browser. `detectBrowser()` only looks for one that
 * is already on the machine and reports a reason when it finds none, so the
 * suite can skip loudly instead of failing on a CI box without Chromium.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserService } from '../../src/browser-service.ts'
import { resolveConfig } from '../../src/config.ts'
import { loadBrowserRuntime } from '../../src/deps.ts'
import { registerTools } from '../../src/tools.ts'

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

export type BrowserDetection =
  | { ok: true; channel: string; executablePath?: string; description: string }
  | { ok: false; reason: string }

const SYSTEM_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

/**
 * Find a browser that is already installed. Order: explicit override, the
 * Playwright Chromium bundled for this plugin's Playwright version, system
 * Chrome. Never installs anything.
 */
export function detectBrowser(): BrowserDetection {
  const override = process.env.DSH_E2E_EXECUTABLE
  if (override) {
    return fs.existsSync(override)
      ? { ok: true, channel: '', executablePath: override, description: `DSH_E2E_EXECUTABLE=${override}` }
      : { ok: false, reason: `DSH_E2E_EXECUTABLE points at a missing file: ${override}` }
  }
  let bundled: string | undefined
  let loadError: string | undefined
  try {
    bundled = loadBrowserRuntime('playwright').chromium.executablePath()
  } catch (error) {
    loadError = String(error)
  }
  if (bundled && fs.existsSync(bundled)) return { ok: true, channel: 'chromium', description: `Playwright Chromium at ${bundled}` }
  const system = SYSTEM_CHROME_PATHS.find(candidate => fs.existsSync(candidate))
  if (system) return { ok: true, channel: 'chrome', description: `system Chrome at ${system}` }
  return {
    ok: false,
    reason: `no usable browser: Playwright Chromium ${bundled ? `not installed at ${bundled}` : `unavailable (${loadError ?? 'no executable path'})`}, and no system Chrome found. `
      + 'This suite never downloads a browser; install one with `node scripts/install-browser.mjs` or set DSH_E2E_EXECUTABLE=/path/to/chrome.',
  }
}

/**
 * Serve `fixtures/` over plain HTTP on an ephemeral loopback port.
 *
 * `/hit?who=<name>` counts a request per name, so a test can prove from the
 * server side whether a click really reached the backend (`hits()`).
 */
export async function startFixtureServer(): Promise<{ base: string; close: () => Promise<void>; hits: () => Record<string, number>; resetHits: () => void }> {
  let counts: Record<string, number> = {}
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.invalid')
    const pathname = decodeURIComponent(url.pathname)
    if (pathname === '/hit') {
      const who = url.searchParams.get('who') ?? 'unnamed'
      counts[who] = (counts[who] ?? 0) + 1
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
      res.end('ok')
      return
    }
    const file = path.normalize(path.join(FIXTURE_DIR, pathname === '/' ? 'index.html' : pathname))
    if (!file.startsWith(FIXTURE_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(fs.readFileSync(file))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }),
    hits: () => ({ ...counts }),
    resetHits: () => { counts = {} },
  }
}

export interface Harness {
  service: BrowserService
  /** Call a registered model tool exactly as the agent loop would, as one session. */
  call: (session: string | undefined, name: string, args?: Record<string, unknown>, signal?: AbortSignal) => Promise<any>
  /** `browser_call({ action, args })` as one session; returns the whole result envelope. Pass `signal` to cancel it like the Host would. */
  action: (session: string | undefined, action: string, args?: Record<string, unknown>, signal?: AbortSignal) => Promise<any>
  /** Like {@link action} but asserts the envelope is ok and returns its `result`. */
  result: (session: string | undefined, action: string, args?: Record<string, unknown>) => Promise<any>
  /** `browser_index(args)` as one session; returns the text the model would read. */
  index: (args?: Record<string, unknown>) => Promise<string>
  /** Names of every tool the plugin registered. */
  toolNames: () => string[]
  dir: string
  dispose: () => Promise<void>
}

/** Build the real BrowserService and the real tool layer around one headless browser. */
export function createHarness(detection: Extract<BrowserDetection, { ok: true }>, overrides: Record<string, unknown> = {}): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-e2e-'))
  const config = resolveConfig({
    enabled: true,
    headless: true,
    verbose: false,
    autoInstall: false,
    automationMode: 'unrestricted',
    snapshotDir: dir,
    storageStatePath: undefined,
    ...detection.channel ? { channel: detection.channel } : {},
    ...detection.executablePath ? { executablePath: detection.executablePath } : {},
    ...overrides,
  } as never)
  const service = new BrowserService(config)
  const tools = new Map<string, any>()
  registerTools({ tools: { register: (tool: any) => tools.set(tool.name, tool) } } as never, config, service)
  return {
    service,
    dir,
    toolNames: () => [...tools.keys()],
    async call(session, name, args = {}, signal) {
      const tool = tools.get(name)
      if (!tool) throw new Error(`tool not registered: ${name}`)
      const agent = session === undefined ? undefined : { id: session, session: { id: session } }
      return tool.execute(args, { signal: signal ?? new AbortController().signal, ...agent ? { agent } : {} })
    },
    async action(session, action, args = {}, signal) {
      return this.call(session, 'browser_call', { action, args }, signal)
    },
    async result(session, action, args = {}) {
      const envelope = await this.action(session, action, args)
      if (!envelope.ok) throw new Error(`${action} failed: ${JSON.stringify(envelope.error)}`)
      return envelope.result
    },
    async index(args = {}) {
      return (await this.call(undefined, 'browser_index', args)).text
    },
    async dispose() {
      await service.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
