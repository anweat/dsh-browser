import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { validateRecipe, recipeNeedsApproval } from '../src/automation.ts'
import { BUILTIN_SCRIPTS, matchUserscriptPattern, validateUserscript } from '../src/scripts.ts'
import { browserPolicyDecision } from '../src/approval-policy.ts'
import { loadBrowserRuntime, runNode } from '../src/deps.ts'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { ALL_BROWSER_TOOL_NAMES, browserToolsForMode, configuredBrowserTools, resolveAutomationMode } from '../src/freedom.ts'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'

const VALID_SCRIPT = `// ==UserScript==
// @name Read Heading
// @match http://127.0.0.1/*
// @grant none
// ==/UserScript==
return { heading: document.querySelector('h1')?.textContent || '', input: __DSH_INPUTS__.query || '' }`

test('userscript metadata is scoped, hashed, and capability-reported', () => {
  const validation = validateUserscript(VALID_SCRIPT, 'http://127.0.0.1/page')
  assert.equal(validation.valid, true)
  assert.equal(validation.metadata.name, 'Read Heading')
  assert.match(validation.sha256, /^[a-f\d]{64}$/)
  assert.deepEqual(validation.capabilities, ['dom-read'])
  assert.equal(matchUserscriptPattern('*://*.example.com/*', 'https://sub.example.com/a?q=1'), true)
  assert.equal(matchUserscriptPattern('https://example.com/private/*', 'https://example.com/public/a'), false)
})

test('userscript validation rejects remote requires, grants, and wrong hosts', () => {
  const unsafe = VALID_SCRIPT
    .replace('// @grant none', '// @grant GM_xmlhttpRequest\n// @require https://evil.invalid/a.js')
  assert.match(validateUserscript(unsafe, 'http://127.0.0.1/').errors.join(' '), /@require/)
  assert.match(validateUserscript(unsafe, 'http://127.0.0.1/').errors.join(' '), /@grant/)
  assert.match(validateUserscript(VALID_SCRIPT, 'https://example.com/').errors.join(' '), /outside/)
})

test('browser status reports a missing runtime Chromium executable truthfully', async () => {
  const runtime = loadBrowserRuntime('playwright')
  const descriptor = Object.getOwnPropertyDescriptor(runtime.chromium, 'executablePath')
  const missingPath = path.join(os.tmpdir(), `dsh-browser-missing-chromium-${Date.now()}`, 'chrome.exe')
  Object.defineProperty(runtime.chromium, 'executablePath', { configurable: true, value: () => missingPath })
  const service = new BrowserService(resolveConfig({ browserRuntime: 'playwright', autoInstall: false }))
  const channelService = new BrowserService(resolveConfig({ browserRuntime: 'playwright', channel: 'chrome', autoInstall: false }))
  try {
    const status = await service.status()
    assert.equal(status.chromiumInstalled, false)
    assert.equal(status.chromiumExecutablePath, path.resolve(missingPath))
    assert.match(status.runtimeWarnings.join(' '), /Expected Chromium executable is missing/)
    const channelStatus = await channelService.status()
    assert.equal(channelStatus.chromiumInstalled, false)
    assert.doesNotMatch(channelStatus.runtimeWarnings.join(' '), /Expected Chromium executable is missing/)
  } finally {
    await service.close()
    await channelService.close()
    if (descriptor) Object.defineProperty(runtime.chromium, 'executablePath', descriptor)
    else delete runtime.chromium.executablePath
  }
})

test('built-in scripts are valid, read-only, and have stable ids', () => {
  assert.deepEqual(BUILTIN_SCRIPTS.map(script => script.id), ['article-clean', 'links', 'jsonld', 'forms'])
  for (const script of BUILTIN_SCRIPTS) {
    const validation = validateUserscript(script.source, 'https://example.com/')
    assert.equal(validation.valid, true, script.id + ': ' + validation.errors.join('; '))
    assert.deepEqual(validation.capabilities, ['dom-read'])
  }
})

test('recipes bound steps and distinguish read-only from mutating flows', () => {
  const readonly = [
    { type: 'wait' as const, condition: 'selector' as const, value: 'main' },
    { type: 'wait' as const, condition: 'time' as const, waitMs: 5 },
    { type: 'extract' as const, selector: 'main', mode: 'text' as const },
  ]
  validateRecipe(readonly)
  assert.equal(recipeNeedsApproval(readonly), false)
  assert.equal(recipeNeedsApproval([...readonly, { type: 'click' as const, selector: 'button' }]), true)
  assert.throws(() => validateRecipe([{ type: 'scroll', deltaY: 999_999 }]), /deltaY/)
  assert.throws(() => validateRecipe(Array.from({ length: 26 }, () => ({ type: 'screenshot' as const }))), /25/)
})

test('approval policy asks for arbitrary userscripts, OpenCLI, and mutating recipes', () => {
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['reddit', 'search', 'dsh'] }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'extract', selector: 'main' }] }).kind, 'allow')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: 'alert(1)', url: 'https://example.com/' }).kind, 'deny')
  assert.equal(browserPolicyDecision('web_deps', { action: 'check' }, 'standard').kind, 'allow')
  assert.equal(browserPolicyDecision('web_deps', { action: 'install', backend: 'yt-dlp' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('web_cache_clear', {}, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('web_rule', { action: 'upsert' }, 'standard').kind, 'ask')
})

test('automation modes expose predictable tool sets and retain validation when approval is disabled', () => {
  assert.equal(ALL_BROWSER_TOOL_NAMES.length, 21)
  assert.equal(browserToolsForMode('read-only').length, 14)
  assert.equal(browserToolsForMode('standard').length, 21)
  assert.equal(browserToolsForMode('autonomous').length, 21)
  assert.equal(browserToolsForMode('unrestricted').length, 21)
  assert.equal(browserToolsForMode('read-only').includes('browser_userscript_run'), false)
  assert.equal(browserToolsForMode('read-only').includes('browser_recipe_run'), true)
  assert.equal(browserToolsForMode('read-only').includes('browser_automation_search'), true)
  assert.equal(browserToolsForMode('read-only').includes('browser_automation_develop'), true)
  assert.equal(browserToolsForMode('read-only').includes('browser_automation_run'), false)
  assert.equal(configuredBrowserTools('standard', { modelDevelopmentEnabled: false }).includes('browser_automation_develop'), false)
  assert.deepEqual(configuredBrowserTools('standard', { modelDevelopmentEnabled: true }, false), [])

  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_automation_run', { id: 'asset' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_automation_run', { id: 'asset' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_automation_run', { id: 'asset' }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_automation_develop', { action: 'get' }, 'read-only').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_automation_develop', { action: 'save' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_automation_develop', { action: 'save' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_automation_develop', { action: 'test' }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_automation_develop', { action: 'test' }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['browser', 'research', 'state'] }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_install', {}, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['browser', 'research', 'state'] }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_install', {}, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('web_deps', { action: 'install' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('web_deps', { action: 'install' }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('web_deps', { action: 'install' }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('web_cache_clear', {}, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('web_cache_clear', {}, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('web_rule', { action: 'remove' }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('web_rule', { action: 'list' }, 'read-only').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: 'alert(1)', url: 'https://example.com/' }, 'unrestricted').kind, 'deny')
  assert.throws(() => resolveAutomationMode('anything-goes'), /automationMode/)
})

test('disabled browser service exposes no tools and rejects browser execution', async () => {
  const service = new BrowserService(resolveConfig({ enabled: false }))
  try {
    const status = await service.status()
    assert.deepEqual(status.exposedTools, [])
    await assert.rejects(service.open('http://127.0.0.1:1/'), /browser service is disabled/i)
  } finally {
    await service.close()
  }
})

test('runNode passes argv containing spaces verbatim without shell quoting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-argv-'))
  const script = path.join(dir, 'argv.mjs')
  fs.writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))', 'utf8')
  try {
    const result = await runNode(script, ['hello world', 'a"b'], { signal: undefined, timeoutMs: 5_000 })
    assert.equal(result.code, 0)
    assert.deepEqual(JSON.parse(result.stdout), ['hello world', 'a"b'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('real Playwright runtime executes built-ins, recipes, and a scoped userscript', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-snapshot-'))
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Fixture</title><main><h1>Hello DSH</h1><p id="copy">Browser automation fixture.</p><a href="/next">Next</a></main>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')
  const url = `http://127.0.0.1:${address.port}/page`
  const bootstrapStatePath = path.join(snapshotDir, 'auth', 'bootstrap.json')
  const service = new BrowserService(resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    opencliEnabled: true,
    authProfiles: { bootstrap: { storageStatePath: bootstrapStatePath, allowedDomains: ['127.0.0.1'], persistState: true } },
    autoInstall: false,
    verbose: false,
  }))
  try {
    const builtIn = await service.runBuiltinScript(url, 'article-clean')
    assert.match(builtIn.resultJson, /Hello DSH/)
    assert.equal(fs.existsSync(bootstrapStatePath), false)
    await service.runBuiltinScript(url, 'article-clean', { authProfile: 'bootstrap' })
    assert.equal(fs.existsSync(bootstrapStatePath), true)

    const recipe = await service.recipe([
      { type: 'wait', condition: 'selector', value: '#copy' },
      { type: 'extract', selector: '#copy', mode: 'text' },
    ], { url })
    assert.equal(recipe.steps[1]?.value, 'Browser automation fixture.')

    const external = await service.runUserscript(url, VALID_SCRIPT, { inputs: { query: 'runtime-only' } })
    assert.equal(JSON.parse(external.resultJson).heading, 'Hello DSH')
    assert.equal(JSON.parse(external.resultJson).input, 'runtime-only')

    const assetStore = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory: path.join(snapshotDir, 'automations'), persistenceMode: 'manual' }))
    const draft = assetStore.saveDraft({ kind: 'userscript', name: 'Reusable heading reader', domains: ['127.0.0.1'], inputNames: ['query'], source: VALID_SCRIPT })
    assert.equal(assetStore.validate(draft.id).testStatus, 'untested')
    assert.throws(() => assetStore.setStatus(draft.id, 'active'), /pass testing/)
    const replay = await executeAutomationAsset(service, assetStore, draft.id, url, { query: 'draft-replay' }, 'draft')
    assert.equal(JSON.parse((replay.value as { resultJson: string }).resultJson).input, 'draft-replay')
    assert.equal(assetStore.get(draft.id)?.testStatus, 'passed')
    assert.equal(assetStore.setStatus(draft.id, 'active').status, 'active')

    const extracted = await service.searchResults(url, {
      item: 'main', title: 'h1', link: 'a', text: '#copy',
    }, { count: 1 })
    assert.deepEqual(extracted, [{
      title: 'Hello DSH',
      url: `http://127.0.0.1:${address.port}/next`,
      snippet: 'Browser automation fixture.',
    }])

    const crawl = await service.crawl([url], { maxPages: 2, maxDepth: 1, sameOrigin: true, maxCharsPerPage: 2_000 })
    assert.equal(crawl.pages.length, 2, JSON.stringify(crawl))
    assert.deepEqual(crawl.pages.map(page => page.depth), [0, 1])
    assert.equal(crawl.stats.pagesVisited, 2)
    assert.match(crawl.warnings.join(' '), /terms|robots/i)

    const catalog = await service.opencliCatalog({ site: 'reddit', query: 'search', limit: 5 })
    assert.ok(catalog.length > 0 && catalog.length <= 5)
    assert.ok(catalog.every(item => item.site === 'reddit'))

    const snapshot = await service.snapshot(url, [], { outDir: snapshotDir, screenshot: false } as never)
    assert.equal(snapshot.screenshotPath, undefined)
    assert.equal(fs.existsSync(snapshot.htmlPath), true)
    assert.deepEqual(fs.readdirSync(snapshotDir).filter(file => file.endsWith('.png')), [])

    const status = await service.status()
    assert.equal(status.browserRuntime, 'playwright')
    assert.equal(status.usagePolicy.maxPagesPerRun, 20)
    assert.equal(status.usageGovernor.totalRuns > 0, true)
    assert.equal(status.automationMode, 'standard')
    assert.equal(status.exposedTools.length, 21)
    assert.equal(status.directInteractionPolicy, 'ask')
    assert.equal(status.opencliInstalled, true)
  } finally {
    await service.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

test('real Patchright runtime is selectable and executes a trusted script', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Patchright fixture</title><main><h1>Stealth runtime</h1><p>Patchright works through the same browser contract.</p></main>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')
  const service = new BrowserService(resolveConfig({
    enabled: true,
    channel: 'chrome',
    headless: true,
    browserRuntime: 'patchright',
    opencliEnabled: false,
    automationMode: 'standard',
    autoInstall: false,
    verbose: false,
  }))
  try {
    const result = await service.runBuiltinScript(`http://127.0.0.1:${address.port}/`, 'article-clean')
    assert.match(result.resultJson, /Stealth runtime/)
    const status = await service.status()
    assert.equal(status.browserRuntime, 'patchright')
    assert.match(status.runtimeWarnings.join(' '), /headed|headless/i)
  } finally {
    await service.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('bounded crawl backs off and retries a real 429 response', async () => {
  let requests = 0
  const observedCookies: string[] = []
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-crawl-auth-'))
  const storageStatePath = path.join(authDir, 'state.json')
  fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [{ name: 'crawl_session', value: 'must-not-leak', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] }), 'utf8')
  const server = http.createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(204)
      response.end()
      return
    }
    requests++
    observedCookies.push(request.headers.cookie ?? '')
    if (requests === 1) {
      response.writeHead(429, { 'content-type': 'text/plain', 'retry-after': '0.02' })
      response.end('slow down')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Recovered</title><main><h1>Recovered after backoff</h1></main>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')
  const service = new BrowserService(resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    browserRuntime: 'playwright',
    opencliEnabled: false,
    automationMode: 'unrestricted',
    authProfiles: { crawlAuth: { storageStatePath, allowedDomains: ['127.0.0.1'] } },
    defaultAuthProfile: 'crawlAuth',
    usagePolicy: { minDelayMs: 0, maxConcurrency: 2, burst: 3, maxPagesPerRun: 2, maxDepth: 0, retryLimit: 1, backoffBaseMs: 10, cooldownMs: 100 },
    autoInstall: false,
    verbose: false,
  }))
  try {
    const result = await service.crawl([`http://127.0.0.1:${address.port}/`], { maxPages: 1, maxDepth: 0 })
    assert.equal(requests, 2)
    assert.equal(result.pages.length, 1)
    assert.equal(result.errors.length, 0)
    assert.equal(result.stats.backoffEvents, 1)
    assert.match(result.pages[0]?.text ?? '', /Recovered after backoff/)
    assert.ok(observedCookies.every(value => !value.includes('crawl_session')))
    await assert.rejects(() => service.crawl([`http://127.0.0.1:${address.port}/`], { maxPages: 3 }), /maxPages/)
  } finally {
    await service.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    fs.rmSync(authDir, { recursive: true, force: true })
  }
})
