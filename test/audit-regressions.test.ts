import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { registerTools } from '../src/tools.ts'
import { browserPolicyDecision } from '../src/approval-policy.ts'
import { validateRecipe } from '../src/automation.ts'
import { registerAutomationAssetRpc } from '../src/automation-assets-rpc.ts'

test('waits cannot disable timeouts and primitive writes retain approvals', () => {
  assert.throws(() => validateRecipe([{ type: 'wait', condition: 'selector', value: '#missing', timeoutMs: 0 }]), /timeoutMs/)
  assert.throws(() => validateRecipe([{ type: 'wait', condition: 'unknown' } as never]), /condition/)
  for (const name of ['browser_press', 'browser_select', 'browser_check']) {
    assert.equal(browserPolicyDecision(name, {}, 'read-only').kind, 'deny')
    assert.equal(browserPolicyDecision(name, {}, 'standard').kind, 'ask')
    assert.equal(browserPolicyDecision(name, {}, 'autonomous').kind, 'allow')
  }
})

test('real browser handles primitives and hidden uploads; redirects cannot expand script matches', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-audit-'))
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/outside' }); res.end(); return }
    if (req.url === '/outside') { res.end('<title>outside</title>'); return }
    res.setHeader('content-type', 'text/html')
    res.end('<title>fixture</title><input id="q" onkeydown="if(event.key===\'Enter\')document.body.dataset.enter=\'yes\'"><select id="s"><option value="a">A</option><option value="b">B</option></select><input id="c" type="checkbox"><input id="f" type="file" hidden><p>ready</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const config = resolveConfig({ snapshotDir: dir, channel: 'chrome', headless: true, autoInstall: false, automationMode: 'unrestricted' })
  const service = new BrowserService(config)
  const definitions = new Map<string, any>()
  registerTools({ tools: { register: (tool: any) => definitions.set(tool.name, tool) } } as never, config, service)
  try {
    await assert.rejects(service.open('file:///fixture.txt'), /HTTP/)
    await service.open(base)
    const call = (name: string, args: unknown) => definitions.get(name).execute(args, { signal: new AbortController().signal })
    await call('browser_wait', { selector: 'p', timeoutMs: 1000 })
    await call('browser_press', { selector: '#q', key: 'Enter' })
    await call('browser_select', { selector: '#s', values: ['b'] })
    await call('browser_check', { selector: '#c', checked: true })
    const file = path.join(dir, 'fixture.txt'); fs.writeFileSync(file, 'fixture')
    await service.setFiles('#f', [file], { timeoutMs: 1000 })
    const state = await service.evaluate('({enter:document.body.dataset.enter,selected:document.querySelector("#s").value,checked:document.querySelector("#c").checked,files:document.querySelector("#f").files.length})')
    assert.deepEqual(JSON.parse(state.resultJson), { enter: 'yes', selected: 'b', checked: true, files: 1 })
    const source = '// ==UserScript==\n// @name redirect test\n// @match http://127.0.0.1/redirect\n// @grant none\n// ==/UserScript==\nreturn document.title'
    await assert.rejects(service.runUserscript(base + '/redirect', source), /redirected outside/)
  } finally {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('asset API validates envelopes and unregisters every exact route', async () => {
  const routes = new Map<string, any>(); const disposers: (() => void)[] = []
  const ctx: any = {
    inject(_names: unknown, setup: (ctx: unknown) => void) { setup(ctx) },
    effect(setup: () => () => void) { disposers.push(setup()) },
    connection: { fetch: { register(route: any) {
      assert.equal(routes.has(route.path), false); routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    } } },
  }
  registerAutomationAssetRpc(ctx, { snapshot: () => ({ assets: [] }) } as never, {} as never)
  assert.equal(routes.size, 8)
  const route = routes.get('/api/dsh-browser-assets/snapshot')
  const request = (body: unknown) => route.fetch(new Request('http://localhost/api/dsh-browser-assets/snapshot', { method: 'POST', body: JSON.stringify(body) }))
  const invalid = await request({ method: 'wrong' })
  assert.equal(invalid.status, 200)
  assert.equal((await invalid.json()).result.error.code, 'gateway/bad-request')
  const response = await request({ type: 'client-request', rpcId: 'test', method: 'dsh-browser-assets/snapshot', payload: {} })
  assert.deepEqual(await response.json(), { type: 'server-response', rpcId: 'test', result: { ok: true, value: { assets: [] } } })
  for (const dispose of disposers) dispose()
  assert.equal(routes.size, 0)
})

test('auth profiles filter foreign storage; domains are admission rules, not a network firewall', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-auth-audit-'))
  let foreignHits = 0
  const server = http.createServer((req, res) => {
    if (req.headers.host?.startsWith('localhost')) { foreignHits++; res.end('foreign'); return }
    if (req.url === '/chain') { res.writeHead(302, { location: '/redirect' }); res.end(); return }
    if (req.url === '/redirect') { res.writeHead(302, { location: `http://localhost:${(server.address() as { port: number }).port}/foreign` }); res.end(); return }
    res.end('<title>auth</title>')
  })
  await new Promise<void>(resolve => server.listen(0, resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const storageStatePath = path.join(dir, 'state.json')
  fs.writeFileSync(storageStatePath, JSON.stringify({ cookies: [
    { name: 'allowed', value: 'fixture', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    { name: 'foreign', value: 'fixture', domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
  ], origins: [] }))
  const service = new BrowserService(resolveConfig({ channel: 'chrome', snapshotDir: dir, autoInstall: false,
    authProfiles: { fixture: { storageStatePath, allowedDomains: ['127.0.0.1'] } },
  }))
  try {
    await service.open(base, { authProfile: 'fixture' })
    const state = await (service as any).activeContext.storageState()
    assert.deepEqual(state.cookies.map((cookie: any) => cookie.name), ['allowed'])
    await assert.rejects(service.open(base.replace('127.0.0.1', 'localhost'), { authProfile: 'fixture' }), /not allowed/)
    assert.equal(foreignHits, 0)
  } finally {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
