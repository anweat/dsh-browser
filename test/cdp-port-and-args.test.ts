import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { Config, resolveConfig } from '../src/config.ts'
import { BrowserService } from '../src/browser-service.ts'
import { loadBrowserRuntime } from '../src/deps.ts'

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

function fetchJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Unexpected status code: ${res.statusCode}`))
      }
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

test('config schema and resolveConfig support cdpPort and args', () => {
  const defaults = resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    autoInstall: false,
    verbose: false,
  } as Config)
  assert.equal(defaults.cdpPort, undefined)
  assert.deepEqual(defaults.args, [])

  // Configurable fields are `.volatile()`, so the schema result carries live
  // references; `resolveConfig` is the boundary that normalizes them.
  const parsed = resolveConfig(Config({
    cdpPort: 9222,
    args: ['--no-sandbox', '--disable-gpu'],
  }) as unknown as Config)
  assert.equal(parsed.cdpPort, 9222)
  assert.deepEqual(parsed.args, ['--no-sandbox', '--disable-gpu'])

  for (const invalidPort of [0, -1, 65_536, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => Config({ cdpPort: invalidPort }), TypeError)
  }

  const resolved = resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    autoInstall: false,
    verbose: false,
    cdpPort: 9222,
    args: ['--no-sandbox', '--disable-gpu'],
  } as Config)
  assert.equal(resolved.cdpPort, 9222)
  assert.deepEqual(resolved.args, ['--no-sandbox', '--disable-gpu'])
})

test('cdpPort exposes /json/version and allows external CDP connection', async () => {
  const cdpPort = await getFreePort()

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<h1>CDP Test Page</h1><p>Running with remote debugging</p>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const serverPort = (server.address() as net.AddressInfo).port
  const testUrl = `http://127.0.0.1:${serverPort}/`

  const config = resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    autoInstall: false,
    verbose: false,
    cdpPort,
    args: ['--no-sandbox'],
  } as Config)

  const service = new BrowserService(config)
  try {
    const initial = await service.open(testUrl)
    assert.match(initial.text, /CDP Test Page/)

    // Query CDP version metadata
    const versionInfo = await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`)
    assert.ok(typeof versionInfo.Browser === 'string', 'Expected Browser string in version info')
    assert.ok(typeof versionInfo.webSocketDebuggerUrl === 'string', 'Expected webSocketDebuggerUrl in version info')
    assert.match(versionInfo.webSocketDebuggerUrl as string, new RegExp(`^ws://127\\.0\\.0\\.1:${cdpPort}/devtools/browser/`))

    // External tool connects over CDP
    const pw = loadBrowserRuntime('playwright')
    const externalCdp = await pw.chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    try {
      const contexts = externalCdp.contexts()
      assert.ok(contexts.length >= 1, 'Expected at least one browser context')
      const pages = contexts[0].pages()
      assert.ok(pages.length >= 1, 'Expected at least one page')
      const content = await pages[0].content()
      assert.match(content, /CDP Test Page/)
    } finally {
      await externalCdp.close()
    }

    // Normal BrowserService operations continue to work
    const nextState = await service.open(testUrl)
    assert.match(nextState.text, /CDP Test Page/)
  } finally {
    await service.close()
    server.close()
  }

  // Ensure port is closed after service.close()
  await assert.rejects(
    () => fetchJson(`http://127.0.0.1:${cdpPort}/json/version`),
    /ECONNREFUSED/
  )
})
