/** Exercise compiled asset routes on an exact installed DSH host's real auth/HTTP stack. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerAutomationAssetRpc } from '../lib/automation-assets-rpc.js'

const require = createRequire(resolve(process.argv[2], 'package.json'))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const connection = await load('@deepseek-ai/dsh-client-connection')
const { default: WebServer } = await load('@deepseek-ai/dsh-host-webserver')
const root = new Context()
let credentialRecord
try {
  root.provide('credentials', {
    readRecord: async () => credentialRecord,
    modifyRecord: async (_key, fn) => (credentialRecord = await fn(credentialRecord)),
    deleteRecord: async () => { credentialRecord = undefined },
  })
  await root.plugin(connection, { trustedHosts: [] })
  const fiber = await root.plugin({
    name: 'asset-rpc-probe',
    apply(ctx) { registerAutomationAssetRpc(ctx, { snapshot: () => ({ assets: [] }) }, {}) },
  })
  await root.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const transport = root.get('connection'), port = root.get('webServer').port
  const base = `http://127.0.0.1:${port}`
  const headers = { 'content-type': 'application/json', connection: 'close' }
  transport.authorizeIndex({ method: 'GET', url: transport.authenticatedUrl(base + '/'), headers: { host: `127.0.0.1:${port}` } }, {
    writeHead(_status, values) { if (values['set-cookie']) headers.cookie = values['set-cookie'].split(';')[0] }, end() {},
  })
  assert.ok(headers.cookie)
  const request = (signed, method = 'dsh-browser-assets/snapshot') => fetch(base + '/api/' + method, {
    method: 'POST', headers: signed ? headers : { 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'probe', method, payload: {} }),
  })
  assert.equal((await request(false)).status, 401)
  const response = await request(true)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).result, { ok: true, value: { assets: [] } })
  assert.equal((await request(true, 'dsh-browser-assets/unknown')).status, 404)
  await fiber.dispose()
  assert.equal((await request(true)).status, 404)
  console.log('PASS: compiled asset routes; Connection before WebServer; authenticated access, unsigned rejection, exact routing, disposal')
} finally { await root.fiber.dispose() }
