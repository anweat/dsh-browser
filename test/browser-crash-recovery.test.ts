import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'

function createServer(body = '<h1>Test Page</h1><p>Sample content</p>') {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body)
  })
  return server
}

test('browser instance crash: service automatically recovers and can open new browser instances', async () => {
  const server = createServer('<h1>First Run</h1>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`

  const service = new BrowserService(resolveConfig({ headless: true }))
  try {
    const s1 = await service.open(url)
    assert.match(s1.text, /First Run/)
    const b1 = (service as any).browser
    assert.equal(b1?.isConnected(), true)

    // Simulate browser process crash / abrupt termination
    await b1.close()
    assert.equal(b1.isConnected(), false)

    // User or model opens a new browser instance
    const s2 = await service.open(url)
    assert.match(s2.text, /First Run/)
    const b2 = (service as any).browser
    assert.notEqual(b2, b1, 'A new browser instance must be launched')
    assert.equal(b2?.isConnected(), true, 'New browser instance must be connected')
  } finally {
    await service.close()
    server.close()
  }
})

test('closed page: closed active page is detected and open provisions a fresh page', async () => {
  const server = createServer('<h1>Closed Page Test</h1>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`

  const service = new BrowserService(resolveConfig({ headless: true }))
  try {
    const s1 = await service.open(url)
    assert.match(s1.text, /Closed Page Test/)

    const page = (service as any).activePage
    await page.close()
    assert.equal(page.isClosed(), true)

    // Opening a new URL on the service should not be stuck on the dead page
    const s2 = await service.open(url)
    assert.match(s2.text, /Closed Page Test/)
    const newPage = (service as any).activePage
    assert.equal(newPage.isClosed(), false)
  } finally {
    await service.close()
    server.close()
  }
})

test('stale browser reference during transient context operations recovers automatically', async () => {
  const server = createServer('<h1>Transient Context Test</h1><p>Rendered text</p>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-crash-test-'))

  const service = new BrowserService(resolveConfig({ headless: true, snapshotDir: tmpDir }))
  try {
    const r1 = await service.render(url, [])
    assert.match(r1.text, /Transient Context Test/)

    const b1 = (service as any).browser
    await b1.close()
    assert.equal(b1.isConnected(), false)

    // render() should recover and launch a new browser
    const r2 = await service.render(url, [])
    assert.match(r2.text, /Transient Context Test/)
    const b2 = (service as any).browser
    assert.notEqual(b2, b1)
    assert.equal(b2.isConnected(), true)

    // Crash again, then test snapshot()
    await b2.close()
    const snap = await service.snapshot(url, [], { outDir: tmpDir, screenshot: false })
    assert.match(snap.text, /Transient Context Test/)

    // Crash again, then test crawl()
    const b3 = (service as any).browser
    await b3.close()
    const crawlResult = await service.crawl([url], { maxPages: 1 })
    assert.equal(crawlResult.pages.length, 1)

    // Crash again, then test runBuiltinScript()
    const b4 = (service as any).browser
    await b4.close()
    const scriptResult = await service.runBuiltinScript(url, 'article-clean')
    assert.equal(scriptResult.name, 'Article Clean Reader')
  } finally {
    await service.close()
    server.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('closePage with persistState: true does not throw or wedge service when browser crashed', async () => {
  const server = createServer('<h1>Persist State Crash Test</h1>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`
  const tmpStorage = path.join(os.tmpdir(), `dsh-storage-${Date.now()}.json`)

  const service = new BrowserService(resolveConfig({
    headless: true,
    authProfiles: {
      user: {
        allowedDomains: ['127.0.0.1'],
        persistState: true,
        storageStatePath: tmpStorage,
      },
    },
  }))

  try {
    await service.open(url, { authProfile: 'user' })
    const b = (service as any).browser
    await b.close()

    // closePage should not reject even though storageState() throws on closed context
    await assert.doesNotReject(async () => {
      await service.closePage()
    })

    assert.equal((service as any).activePage, undefined)
    assert.equal((service as any).activeContext, undefined)

    // Should be able to open a new page with the auth profile immediately
    const s2 = await service.open(url, { authProfile: 'user' })
    assert.match(s2.text, /Persist State Crash Test/)
  } finally {
    await service.close()
    server.close()
    try { fs.unlinkSync(tmpStorage) } catch {}
  }
})

test('status reports accurately after browser crash without stale activeUrl', async () => {
  const server = createServer('<h1>Status Crash Test</h1>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`

  const service = new BrowserService(resolveConfig({ headless: true }))
  try {
    await service.open(url)
    const st1 = await service.status()
    assert.equal(st1.activeUrl, url)

    const b = (service as any).browser
    await b.close()

    const st2 = await service.status()
    assert.equal(st2.activeUrl, undefined, 'activeUrl must not be reported when browser crashed')
  } finally {
    await service.close()
    server.close()
  }
})

test('repeated sequential crashes and recoveries in the same service instance', async () => {
  const server = createServer('<h1>Multi Crash Test</h1>')
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/`

  const service = new BrowserService(resolveConfig({ headless: true }))
  try {
    for (let i = 0; i < 3; i++) {
      const s = await service.open(url)
      assert.match(s.text, /Multi Crash Test/)
      const b = (service as any).browser
      assert.equal(b.isConnected(), true)
      await b.close()
      assert.equal(b.isConnected(), false)
    }

    // Final open after 3 crashes
    const finalState = await service.open(url)
    assert.match(finalState.text, /Multi Crash Test/)
    assert.equal((service as any).browser.isConnected(), true)
  } finally {
    await service.close()
    server.close()
  }
})
