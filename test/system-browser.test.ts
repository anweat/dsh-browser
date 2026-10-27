import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { browserInstallAdvice, detectSystemBrowsers, planBrowser, type BrowserSearchEnv, type SystemBrowser } from '../src/system-browser.ts'
import { loadBrowserRuntime } from '../src/deps.ts'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { renderRoot } from '../src/actions/index-view.ts'

/** A machine that has exactly these files. */
function machine(platform: NodeJS.Platform, files: string[], env: NodeJS.ProcessEnv = {}, home = '/home/u'): BrowserSearchEnv {
  const present = new Set(files)
  return { platform, env, home, exists: file => present.has(file) }
}

const CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EDGE_MAC = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'

test('system browsers are found at the usual places on each platform, Chrome before Edge', () => {
  assert.deepEqual(detectSystemBrowsers(machine('darwin', [EDGE_MAC, CHROME_MAC])).map(browser => browser.channel), ['chrome', 'msedge'])
  assert.deepEqual(detectSystemBrowsers(machine('darwin', ['/Users/me/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], {}, '/Users/me')).map(browser => browser.channel), ['chrome'])
  assert.deepEqual(detectSystemBrowsers(machine('linux', ['/usr/bin/google-chrome-stable', '/opt/microsoft/msedge/msedge'])).map(browser => browser.path), ['/usr/bin/google-chrome-stable', '/opt/microsoft/msedge/msedge'])
  const win = detectSystemBrowsers(machine('win32', ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'], { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }))
  assert.deepEqual(win.map(browser => browser.channel), ['chrome'])
  assert.deepEqual(detectSystemBrowsers(machine('linux', [])), [])
})

test('a machine with no browser is reported as not ready, with steps a person can follow', () => {
  const plan = planBrowser({ channel: 'chromium', bundledPath: '/pw/chromium-1/chrome', autoInstall: false, systemBrowsers: [], exists: () => false })
  assert.equal(plan.ready, false)
  assert.equal(plan.source, 'none')
  const advice = browserInstallAdvice({ runtime: 'playwright', cliPath: '/p/node_modules/playwright/cli.js', browsersPath: '/empty' })
  for (const part of [/Google Chrome or Microsoft Edge/, /runtime\.install/, /PLAYWRIGHT_BROWSERS_PATH="\/empty" node "\/p\/node_modules\/playwright\/cli\.js" install chromium/, /executablePath/]) assert.match(advice, part)
})

test('the default channel falls back to system Chrome only while Playwright Chromium is missing', () => {
  const chrome: SystemBrowser = { channel: 'chrome', name: 'Google Chrome', path: CHROME_MAC }
  const bundled = '/pw/chromium-1/chrome'
  const base = { channel: 'chromium', bundledPath: bundled, autoInstall: false, systemBrowsers: [chrome] }
  const fallback = planBrowser({ ...base, exists: file => file === CHROME_MAC })
  assert.deepEqual([fallback.ready, fallback.source, fallback.path, fallback.launch], [true, 'system-browser', CHROME_MAC, { executablePath: CHROME_MAC }])
  assert.match(fallback.note ?? '', /Playwright Chromium is not installed, so Google Chrome is used/)
  // The Playwright Chromium wins when it is there.
  const installed = planBrowser({ ...base, exists: file => file === path.resolve(bundled) || file === CHROME_MAC })
  assert.deepEqual([installed.source, installed.launch], ['playwright-chromium', { channel: 'chromium' }])
  // autoInstall means the user chose to download it, so it is not replaced behind their back.
  assert.equal(planBrowser({ ...base, autoInstall: true, exists: () => false }).source, 'playwright-chromium')
})

test('an explicit executablePath or channel is honoured, never replaced by a fallback', () => {
  const chrome: SystemBrowser = { channel: 'chrome', name: 'Google Chrome', path: CHROME_MAC }
  const missing = planBrowser({ channel: 'chromium', executablePath: '/nope/chrome', autoInstall: false, systemBrowsers: [chrome], exists: file => file === CHROME_MAC })
  assert.deepEqual([missing.ready, missing.source], [false, 'custom-executable'])
  const edgeMissing = planBrowser({ channel: 'msedge', autoInstall: false, systemBrowsers: [chrome], exists: () => true })
  assert.deepEqual([edgeMissing.ready, edgeMissing.source, edgeMissing.launch], [false, 'channel', { channel: 'msedge' }])
  const chromeOk = planBrowser({ channel: 'chrome', autoInstall: false, systemBrowsers: [chrome], exists: () => true })
  assert.deepEqual([chromeOk.ready, chromeOk.launch], [true, { channel: 'chrome' }])
})

/** Replace the runtime's Chromium path and launch; restore both afterwards. */
async function withStubbedChromium(missingPath: string, body: (launches: Record<string, unknown>[]) => Promise<void>): Promise<void> {
  const runtime = loadBrowserRuntime('playwright')
  const pathDescriptor = Object.getOwnPropertyDescriptor(runtime.chromium, 'executablePath')
  const launchDescriptor = Object.getOwnPropertyDescriptor(runtime.chromium, 'launch')
  const launches: Record<string, unknown>[] = []
  Object.defineProperty(runtime.chromium, 'executablePath', { configurable: true, value: () => missingPath })
  Object.defineProperty(runtime.chromium, 'launch', { configurable: true, value: async (options: Record<string, unknown>) => {
    launches.push(options)
    throw new Error(`browserType.launch: Executable doesn't exist at ${missingPath}`)
  } })
  try { await body(launches) } finally {
    if (pathDescriptor) Object.defineProperty(runtime.chromium, 'executablePath', pathDescriptor); else delete runtime.chromium.executablePath
    if (launchDescriptor) Object.defineProperty(runtime.chromium, 'launch', launchDescriptor); else delete runtime.chromium.launch
  }
}

test('with no Playwright Chromium and a system Chrome, status is ready and launch uses that Chrome', async () => {
  const missing = path.join(os.tmpdir(), `dsh-browser-no-chromium-${Date.now()}`, 'chrome')
  const chrome: SystemBrowser = { channel: 'chrome', name: 'Google Chrome', path: CHROME_MAC }
  await withStubbedChromium(missing, async launches => {
    const service = new BrowserService(resolveConfig({ browserRuntime: 'playwright', autoInstall: false }), { systemBrowsers: () => [chrome], exists: file => file === CHROME_MAC })
    try {
      const status = await service.status()
      assert.equal(status.chromiumInstalled, false)
      assert.deepEqual([status.browser.ready, status.browser.source, status.browser.path], [true, 'system-browser', CHROME_MAC])
      assert.equal(status.browser.installAdvice, undefined)
      assert.doesNotMatch(status.runtimeWarnings.join(' '), /Expected Chromium executable is missing/)
      assert.deepEqual(status.systemBrowsers, [chrome])
      await assert.rejects(() => service.open('http://127.0.0.1:1/'), /Playwright Chromium is not installed, so Google Chrome is used.*could not be started.*Executable doesn't exist.*runtime\.install/s, 'the stub refuses every launch: the message names the Chrome that failed and the way out')
      assert.equal(launches.length, 1)
      assert.equal(launches[0]!.executablePath, CHROME_MAC)
      assert.equal('channel' in launches[0]!, false)
    } finally { await service.close() }
  })
})

test('with no browser at all, status and the launch error both say what to do', async () => {
  const missing = path.join(os.tmpdir(), `dsh-browser-no-browser-${Date.now()}`, 'chrome')
  await withStubbedChromium(missing, async launches => {
    const service = new BrowserService(resolveConfig({ browserRuntime: 'playwright', autoInstall: false }), { systemBrowsers: () => [], exists: () => false })
    try {
      const status = await service.status()
      assert.deepEqual([status.browser.ready, status.browser.source], [false, 'none'])
      for (const part of [/Google Chrome or Microsoft Edge/, /runtime\.install/, /install chromium/]) assert.match(status.browser.installAdvice ?? '', part)
      assert.match(status.runtimeWarnings.join(' '), /Expected Chromium executable is missing/)
      await assert.rejects(() => service.open('http://127.0.0.1:1/'), /dsh-browser: No browser is available to launch.*Google Chrome or Microsoft Edge.*runtime\.install.*install chromium/s)
      assert.deepEqual(launches.map(launch => launch.channel), ['chromium'])
    } finally { await service.close() }
  })
})

test('a configured channel that is not installed is named as the problem, not blamed on Chromium', async () => {
  const missing = path.join(os.tmpdir(), `dsh-browser-no-edge-${Date.now()}`, 'chrome')
  await withStubbedChromium(missing, async () => {
    const service = new BrowserService(resolveConfig({ browserRuntime: 'playwright', channel: 'msedge', autoInstall: false }), { systemBrowsers: () => [], exists: () => false })
    try {
      const status = await service.status()
      assert.equal(status.browser.ready, false)
      assert.match(status.browser.installAdvice ?? '', /channel is msedge but that browser is not installed/)
      await assert.rejects(() => service.open('http://127.0.0.1:1/'), /channel is msedge but that browser is not installed.*set channel to chromium/s)
    } finally { await service.close() }
  })
})

test('the browser_index root tells a new user what to do only when no browser can be launched', () => {
  const env = { mode: 'standard' as const, options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: false }
  assert.match(renderRoot({ ...env, runtime: { chromiumInstalled: false, browserReady: false } } as never), /Chromium is NOT installed and no system Chrome \/ Edge was found.*runtime\.install/)
  assert.doesNotMatch(renderRoot({ ...env, runtime: { chromiumInstalled: false, browserReady: true } } as never), /NOT installed/)
  // A caller that only knows about Chromium (an older status shape) still gets the hint.
  assert.match(renderRoot({ ...env, runtime: { chromiumInstalled: false } } as never), /Chromium is NOT installed/)
})

test('OpenCLI that is not installed is a hint, never a warning, and the opencli runner says how to install it', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-no-opencli-'))
  const saved = { path: process.env.PATH, override: process.env.DSH_BROWSER_OPENCLI, prefix: process.env.npm_config_prefix, home: process.env.HOME }
  // Nothing on PATH, no override, an empty HOME: only the plugin's own copy (the dev dependency) could be found, so point at a missing override instead.
  process.env.DSH_BROWSER_OPENCLI = path.join(home, 'nowhere', 'main.js')
  const service = new BrowserService(resolveConfig({ opencliEnabled: true, snapshotDir: path.join(home, 'snap') }), { systemBrowsers: () => [] })
  try {
    const status = await service.status()
    assert.equal(status.opencliInstalled, false)
    assert.match(status.opencliInstallHint ?? '', /npm i -g @jackwener\/opencli/)
    assert.doesNotMatch(status.runtimeWarnings.join(' '), /OpenCLI/)
    const result = await service.opencli(['list'])
    assert.equal(result.code, -1)
    assert.match(result.stderr, /not installed.*npm i -g @jackwener\/opencli/s)
  } finally {
    if (saved.override === undefined) delete process.env.DSH_BROWSER_OPENCLI; else process.env.DSH_BROWSER_OPENCLI = saved.override
    fs.rmSync(home, { recursive: true, force: true })
  }
})
