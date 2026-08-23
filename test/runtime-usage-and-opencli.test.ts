import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../src/config.ts'
import { browserRuntimePackage, loadBrowserRuntime } from '../src/deps.ts'
import { filterOpencliCatalog, parseOpencliCatalog } from '../src/opencli-catalog.ts'
import { UsageGovernor, resolveUsagePolicy } from '../src/usage-policy.ts'
import { BrowserService } from '../src/browser-service.ts'

test('runtime selection is explicit and Patchright is loadable', () => {
  assert.equal(browserRuntimePackage('playwright'), 'playwright')
  assert.equal(browserRuntimePackage('patchright'), 'patchright')
  assert.throws(() => browserRuntimePackage('camoufox' as never), /browserRuntime/)
  assert.ok(loadBrowserRuntime('patchright').chromium)

  const config = resolveConfig({
    enabled: true,
    channel: 'chrome',
    headless: false,
    browserRuntime: 'patchright',
    opencliEnabled: true,
    automationMode: 'unrestricted',
    autoInstall: false,
    verbose: false,
  })
  assert.equal(config.browserRuntime, 'patchright')
})

test('usage policy resolves safe defaults and rejects unbounded values', () => {
  const policy = resolveUsagePolicy(undefined)
  assert.equal(policy.maxConcurrency, 2)
  assert.equal(policy.burst, 3)
  assert.equal(policy.maxPagesPerRun, 20)
  assert.equal(policy.maxDepth, 2)
  assert.throws(() => resolveUsagePolicy({ maxConcurrency: 0 }), /maxConcurrency/)
  assert.throws(() => resolveUsagePolicy({ maxPagesPerRun: 500 }), /maxPagesPerRun/)
})

test('usage governor buffers concurrency and per-host bursts', async () => {
  const governor = new UsageGovernor(resolveUsagePolicy({
    minDelayMs: 30,
    maxConcurrency: 1,
    burst: 1,
    maxPagesPerRun: 5,
    maxDepth: 1,
    retryLimit: 1,
    backoffBaseMs: 20,
    cooldownMs: 100,
  }))
  let active = 0
  let peak = 0
  const started: number[] = []
  const operation = () => governor.run('https://example.com/search', async () => {
    started.push(Date.now())
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
  })
  await Promise.all([operation(), operation()])
  assert.equal(peak, 1)
  assert.ok((started[1] ?? 0) - (started[0] ?? 0) >= 25)
})

test('429/503 feedback creates a bounded cooldown even without approvals', async () => {
  const governor = new UsageGovernor(resolveUsagePolicy({
    minDelayMs: 0,
    maxConcurrency: 2,
    burst: 3,
    maxPagesPerRun: 5,
    maxDepth: 1,
    retryLimit: 2,
    backoffBaseMs: 20,
    cooldownMs: 100,
  }))
  const delay = governor.noteResponse('https://example.com/search', 429, 35)
  assert.equal(delay, 35)
  const started = Date.now()
  await governor.run('https://example.com/next', async () => undefined)
  assert.ok(Date.now() - started >= 30)
  assert.equal(governor.snapshot().backoffEvents, 1)
})

test('usage governor aborts queued or cooling requests promptly', async () => {
  const governor = new UsageGovernor(resolveUsagePolicy({
    minDelayMs: 0,
    maxConcurrency: 1,
    burst: 1,
    maxPagesPerRun: 5,
    maxDepth: 1,
    retryLimit: 1,
    backoffBaseMs: 100,
    cooldownMs: 5_000,
  }))
  governor.noteResponse('https://example.com/', 429, 5_000)
  const controller = new AbortController()
  const started = Date.now()
  const pending = governor.run('https://example.com/next', async () => undefined, controller.signal)
  setTimeout(() => controller.abort(), 20)
  await assert.rejects(pending, /aborted/i)
  assert.ok(Date.now() - started < 500)
  assert.equal(governor.snapshot().active, 0)
})

test('OpenCLI catalog is parsed, filtered, and capped before model exposure', () => {
  const raw = JSON.stringify([
    { command: 'reddit/search', site: 'reddit', name: 'search', description: 'Search Reddit', access: 'read', strategy: 'public', args: ['query'] },
    { command: 'reddit/post', site: 'reddit', name: 'post', description: 'Create post', access: 'write', strategy: 'cookie', args: ['title'] },
    { command: 'github/search-code', site: 'github', name: 'search-code', description: 'Search code', access: 'read', strategy: 'cookie', args: ['query'] },
  ])
  const catalog = parseOpencliCatalog(raw)
  assert.equal(catalog.length, 3)
  assert.deepEqual(filterOpencliCatalog(catalog, { query: 'search', access: 'read', limit: 1 }).map(item => item.command), ['github/search-code'])
  assert.deepEqual(filterOpencliCatalog(catalog, { site: 'reddit', strategy: 'public', limit: 10 }).map(item => item.command), ['reddit/search'])
})

test('OpenCLI dispatch shares the approval-independent usage governor', async () => {
  const service = new BrowserService(resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    browserRuntime: 'playwright',
    opencliEnabled: true,
    automationMode: 'unrestricted',
    usagePolicy: { minDelayMs: 0, maxConcurrency: 1, burst: 1 },
    autoInstall: false,
    verbose: false,
  }))
  const before = (await service.status()).usageGovernor.totalRuns
  const result = await service.opencli(['--version'])
  assert.equal(result.code, 0)
  assert.equal((await service.status()).usageGovernor.totalRuns, before + 1)
  await service.close()
})
