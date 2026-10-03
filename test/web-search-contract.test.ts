/**
 * Regression contract for the `browser` service surface that web-search-pro
 * depends on (dsh-web-search-pro `src/browser-service.ts`:
 * `Pick<BrowserService, 'render' | 'snapshot' | 'searchResults' | 'opencli' | 'close'>`).
 *
 * web-search-pro reads the service lazily with `ctx.get('browser')` and
 * feature-detects each method with `typeof browser[method] === 'function'`, so
 * a renamed or removed method silently degrades a feature instead of failing a
 * build. These tests pin the names, positional arity, return shapes and the
 * "transient context, independent of per-session pages" behaviour so that the
 * tool-surface and session refactors in later milestones cannot regress them.
 *
 * Call sites in web-search-pro (2026-10-02):
 *   render(url, rules, { signal, maxChars })                         fetch.ts
 *   snapshot(url, rules, { signal, outDir, screenshot })             tools.ts (web_snapshot)
 *   searchResults(url, spec, { signal, count, cookies?, authProfile?, rulePack? })  engines.ts, platform-search.ts
 *   opencli([adapter, 'search', query, '-f', 'yaml'], { timeoutMs, signal })        engines.ts -> { code, stdout, stderr }
 *   close()                                                          declared in the Pick; not called from src
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { BrowserService, sessionKeyFor } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { apply, inject } from '../src/index.ts'

const CONSUMED_METHODS = ['render', 'snapshot', 'searchResults', 'opencli', 'close'] as const

// Function.length counts parameters before the first one with a default value.
// render(url, rules, opts = {}), snapshot(url, rules, opts), searchResults(url, spec, opts = {}),
// opencli(args, opts = {}), close().
const REQUIRED_ARITY: Record<(typeof CONSUMED_METHODS)[number], number> = {
  render: 2,
  snapshot: 3,
  searchResults: 2,
  opencli: 1,
  close: 0,
}

const ARTICLE = 'This paragraph is long enough to satisfy the content extractor minimum length of forty characters.'

function page(): string {
  return `<!doctype html><html><head><title>Contract Page</title></head><body>
    <nav>site navigation</nav>
    <div id="content"><p>${ARTICLE}</p><div class="ad">buy things now</div></div>
  </body></html>`
}

function resultsPage(): string {
  const items = [1, 2, 3, 4].map(n => `<div class="r"><h3 class="t">Result ${n}</h3><a class="l" href="/doc/${n}">link</a><p class="s">Snippet ${n}</p></div>`).join('')
  return `<!doctype html><title>Results</title><body>${items}</body>`
}

async function startServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(req.url?.startsWith('/results') ? resultsPage() : req.url?.startsWith('/other') ? '<title>Other Session Page</title><p>other</p>' : page())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

function makeService(dir: string, overrides: Record<string, unknown> = {}): BrowserService {
  return new BrowserService(resolveConfig({ enabled: true, headless: true, verbose: false, autoInstall: false, snapshotDir: dir, storageStatePath: undefined, ...overrides } as never))
}

test('web-search-pro consumed methods exist with the expected positional arity', () => {
  const proto = BrowserService.prototype as unknown as Record<string, unknown>
  for (const name of CONSUMED_METHODS) {
    assert.equal(typeof proto[name], 'function', `BrowserService.${name} must stay a method`)
    assert.equal((proto[name] as (...args: unknown[]) => unknown).length, REQUIRED_ARITY[name], `BrowserService.${name} positional arity changed`)
  }
})

test('the plugin still provides the service under the name web-search-pro reads', () => {
  assert.ok(inject.includes('tools'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-contract-apply-'))
  const provided: Record<string, unknown> = {}
  try {
    const ctx = {
      settings: { register: () => ({ get: () => ({ snapshotDir: dir }) }) },
      tools: { register() {} },
      on() {},
      provide(name: string, value: unknown) { provided[name] = value },
      effect() {},
      inject() {},
      logger() { return { info() {} } },
    }
    apply(ctx as never, { snapshotDir: dir } as never)
    assert.deepEqual(Object.keys(provided), ['browser'])
    for (const name of CONSUMED_METHODS) assert.equal(typeof (provided.browser as Record<string, unknown>)[name], 'function', `provided service lacks ${name}()`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('opencli() always resolves to a CliResult, even when it cannot run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-contract-cli-'))
  try {
    const disabledCli = await makeService(dir, { opencliEnabled: false }).opencli(['xiaohongshu', 'search', 'q', '-f', 'yaml'], { timeoutMs: 1000 })
    assert.deepEqual(Object.keys(disabledCli).sort(), ['code', 'stderr', 'stdout', 'timedOut'])
    assert.equal(disabledCli.code, -1)
    assert.match(disabledCli.stderr, /OpenCLI is disabled/)

    const disabledService = await makeService(dir, { enabled: false }).opencli(['x'])
    assert.equal(disabledService.code, -1)
    assert.match(disabledService.stderr, /disabled/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('render, snapshot and searchResults keep their result shapes and stay independent of session pages', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-contract-'))
  const server = await startServer()
  const service = makeService(dir)
  t.after(async () => {
    await service.close()
    await server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const rules = [{ hostname: '127.0.0.1', contentSelectors: ['#content'], removeSelectors: ['.ad'] }]
  const signal = new AbortController().signal

  // An unrelated session already has a page open; the three methods below use
  // their own transient context and must neither reuse nor disturb it.
  const sessionKey = sessionKeyFor({ id: 'ws-contract', session: { id: 'ws-contract' } } as never)
  await service.open(`${server.base}/other`, { session: sessionKey })

  // render(url, rules, { signal, maxChars }) -> { title, text, html, usedRule? }
  const rendered = await service.render(`${server.base}/page`, rules, { signal, maxChars: 200_000 })
  assert.deepEqual(Object.keys(rendered).sort(), ['html', 'text', 'title', 'usedRule'])
  assert.equal(rendered.title, 'Contract Page')
  assert.equal(rendered.usedRule, '127.0.0.1')
  assert.ok(rendered.text.includes(ARTICLE))
  assert.ok(!rendered.text.includes('buy things now'), 'removeSelectors must be applied')
  assert.ok(!rendered.text.includes('site navigation'), 'contentSelectors must scope the text')
  assert.match(rendered.html, /<title>Contract Page<\/title>/)

  const truncated = await service.render(`${server.base}/page`, rules, { signal, maxChars: 10 })
  assert.match(truncated.text, /Content truncated at 10 characters/)

  // snapshot(url, rules, { signal, outDir, screenshot }) -> { title, text, htmlPath, screenshotPath?, usedRule? }
  const outDir = path.join(dir, 'snapshots')
  const withShot = await service.snapshot(`${server.base}/page`, rules, { signal, outDir, screenshot: true })
  assert.equal(withShot.title, 'Contract Page')
  assert.ok(withShot.text.includes(ARTICLE))
  assert.ok(withShot.htmlPath.startsWith(outDir) && fs.existsSync(withShot.htmlPath), 'snapshot writes the HTML file')
  assert.ok(withShot.screenshotPath && withShot.screenshotPath.startsWith(outDir) && fs.existsSync(withShot.screenshotPath), 'snapshot writes the screenshot')
  assert.match(fs.readFileSync(withShot.htmlPath, 'utf8'), /Contract Page/)
  const noShot = await service.snapshot(`${server.base}/page`, rules, { signal, outDir, screenshot: false })
  assert.equal(noShot.screenshotPath, undefined)
  assert.ok(fs.existsSync(noShot.htmlPath))

  // searchResults(url, spec, { signal, count }) -> [{ url, title, snippet? }]. The spec is
  // web-search-pro's PlatformSearchSpec, which carries extra fields (id, label, url()) that
  // must be ignored.
  const spec = { id: 'fixture', label: 'Fixture', url: (q: string) => q, item: '.r', title: '.t', link: '.l', text: '.s' }
  const hits = await service.searchResults(`${server.base}/results`, spec as never, { signal, count: 3 })
  assert.equal(hits.length, 3, 'count caps the result list')
  assert.deepEqual(hits[0], { url: `${server.base}/doc/1`, title: 'Result 1', snippet: 'Snippet 1' })
  assert.deepEqual(Object.keys(hits[2]!).sort(), ['snippet', 'title', 'url'])
  const noSnippet = await service.searchResults(`${server.base}/results`, { item: '.r', title: '.t', link: '.l' }, { signal })
  assert.equal(noSnippet.length, 4)
  assert.equal(noSnippet[0]!.snippet, undefined, 'snippet is omitted when the spec has no text selector')

  // Transient calls left the session page exactly as it was, and registered no session of their own.
  assert.equal((await service.read({ session: sessionKey })).title, 'Other Session Page')
  assert.equal((await service.status({ session: sessionKey })).activeUrl, `${server.base}/other`)
  assert.equal((await service.status()).activeUrl, undefined, 'the shared bucket must stay empty')

  // Non-HTTP(S) targets are rejected rather than navigated (web-search-pro surfaces the message).
  await assert.rejects(service.render('file:///etc/hosts', rules), /HTTP/)
})

test('close() is safe to call repeatedly and does not require a launched browser', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-contract-close-'))
  try {
    const service = makeService(dir)
    await service.close()
    await service.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
