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

test('asset API registers its own channel and never intercepts the shared one', async () => {
  let channel: string | undefined
  let handler: any
  const disposers: (() => void)[] = []
  const ctx: any = {
    inject(_names: unknown, setup: (ctx: unknown) => void) { setup(ctx) },
    effect(setup: () => () => void) { disposers.push(setup()) },
    connection: { rpc: {
      handle(ch: string, h: unknown) {
        channel = ch; handler = h
        return async () => { channel = undefined; handler = undefined }
      },
      // Registering on `/api` anyway would replace the shared channel's
      // fallback and 404 every other plugin's endpoint, so fail loudly here.
      intercept() { throw new Error('must not intercept the shared /api channel') },
    } },
  }
  registerAutomationAssetRpc(ctx, { snapshot: () => ({ assets: [] }) } as never, {} as never)
  assert.equal(channel, '/dsh-browser-assets', 'the plugin must own a private channel')
  assert.ok(handler, 'the channel handler was not registered')

  // The Host transport owns envelope decoding, authentication, and the Peer
  // scope, so the handler receives an endpoint relative to the channel.
  const peer = { id: 'test-peer', ctx: {} as never, dispose: async () => {} }
  const ok = await handler('snapshot', {}, new AbortController().signal, peer)
  assert.deepEqual(ok, { ok: true, value: { assets: [] } })
  const unknown = await handler('unknown', {}, new AbortController().signal, peer)
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'not-found')
  for (const dispose of disposers) dispose()
  assert.equal(channel, undefined, 'the channel survived disposal')
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
