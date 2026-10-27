/**
 * Real-browser e2e for the policy overlay: an agent widens an auth profile through the actions and the profile's
 * cookies reach the page only for what is allowed at that moment; a revocation closes the session and holds at once;
 * the paths and domains the validators refuse are refused through the real tool layer.
 *
 * `*.localhost` names resolve to loopback in Chromium, so two "sites" (a.localhost, b.localhost) share one server.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createHarness, detectBrowser, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e] policy-overlay SKIPPED: ${detection.reason}`)

async function startServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const cookies = String(req.headers.cookie ?? '').split(/;\s*/).map(part => part.split('=')[0]).filter(Boolean).sort().join(',')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<title>whoami</title><p id="c">cookies:[${cookies}]</p>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as { port: number }).port, close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()) }) }
}

describe('dsh-browser policy overlay e2e', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let strict: Harness
  let server: Awaited<ReturnType<typeof startServer>>
  const S = 'e2e-policy-1'
  const site = (name: string) => `http://${name}.localhost:${server.port}/whoami`

  before(async () => {
    assert.ok(detection.ok)
    server = await startServer()
    harness = createHarness(detection, { allowPrivateHosts: true })
    strict = createHarness(detection)
    const authDir = path.join(harness.dataDir, 'auth')
    fs.mkdirSync(authDir, { recursive: true })
    fs.writeFileSync(path.join(authDir, 'p.json'), JSON.stringify({
      cookies: ['a', 'b'].map(site_ => ({ name: 'c' + site_, value: '1', domain: `${site_}.localhost`, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' })),
      origins: [],
    }))
  })

  after(async () => {
    await harness?.dispose()
    await strict?.dispose()
    await server?.close()
  })

  it('an agent creates a profile, widens it, and the cookies of a domain reach the page only once it is allowed', async () => {
    const created = await harness.result(S, 'runtime.set_auth_profile', { id: 'p', allowedDomains: ['a.localhost'], reason: 'e2e: log in to a' })
    assert.equal(created.direction, 'loosen')
    assert.equal(created.risk.level, 'elevated', 'unrestricted runs it unasked, and says so')

    const a = await harness.result(S, 'target.open', { url: site('a'), authProfile: 'p' })
    assert.match(a.text, /cookies:\[ca\]/, 'a\'s cookie is injected, b\'s is not')

    const denied = await harness.action(S, 'target.open', { url: site('b'), authProfile: 'p' })
    assert.equal(denied.ok, false)
    assert.equal(denied.error.code, 'POLICY_DENIED')

    const widened = await harness.result(S, 'runtime.set_auth_profile', { id: 'p', allowedDomains: ['a.localhost', 'b.localhost'], reason: 'e2e: now b too' })
    assert.equal(widened.direction, 'loosen')
    const b = await harness.result('e2e-policy-2', 'target.open', { url: site('b'), authProfile: 'p' })
    assert.match(b.text, /cookies:\[cb\]/, 'after the change b\'s cookie is injected into a new context')
  })

  it('revoking closes the sessions that held the login and holds at once', async () => {
    const before_ = await harness.result('e2e-policy-3', 'target.open', { url: site('b'), authProfile: 'p' })
    assert.match(before_.text, /cookies:\[cb\]/)
    const page = (harness.service as any).sessions.get('session:e2e-policy-3').page
    const revoked = await harness.result(S, 'runtime.set_auth_profile', { id: 'p', allowedDomains: ['a.localhost'], reason: 'e2e: revoke b' })
    assert.equal(revoked.direction, 'tighten')
    assert.equal(revoked.risk, undefined)
    assert.ok(revoked.sessionsClosed >= 1)
    assert.equal(page.isClosed(), true, 'the page that held b\'s login is gone')
    const again = await harness.action('e2e-policy-3', 'target.open', { url: site('b'), authProfile: 'p' })
    assert.equal(again.ok, false)
    assert.equal(again.error.code, 'POLICY_DENIED')
    const removed = await harness.result(S, 'runtime.remove_auth_profile', { id: 'p', reason: 'e2e: done' })
    assert.equal(removed.direction, 'tighten')
    const gone = await harness.action(S, 'target.open', { url: site('a'), authProfile: 'p' })
    assert.equal(gone.ok, false)
  })

  it('what the validators refuse is refused through the tool layer, and nothing is written', async () => {
    const overlayFile = path.join(harness.dataDir, 'policy-overlay.json')
    const revisionBefore = (await harness.result(S, 'inspect.policy')).revision
    const outside = path.join(harness.dir, 'outside.json')
    fs.writeFileSync(outside, '{}')
    const link = path.join(harness.dataDir, 'auth', 'escape.json')
    fs.symlinkSync(outside, link)
    const attempts: Record<string, unknown>[] = [
      { id: 'x', allowedDomains: ['a.localhost'], persistState: true, storageStatePath: '/etc/passwd' },
      { id: 'x', allowedDomains: ['a.localhost'], persistState: true, storageStatePath: outside },
      { id: 'x', allowedDomains: ['a.localhost'], persistState: true, storageStatePath: link },
      { id: 'x', allowedDomains: ['a.localhost'], persistState: true, storageStatePath: path.join(harness.dataDir, 'auth') + '/../../outside.json' },
      { id: 'x', allowedDomains: ['com'] },
      { id: 'x', allowedDomains: ['github.io'] },
      { id: 'x', allowedDomains: ['*'] },
      { id: 'x', allowedDomains: ['169.254.169.254'] },
      { id: 'x', allowedDomains: ['a.localhost:8080'] },
      { id: '__proto__', allowedDomains: ['a.localhost'], persistState: true },
    ]
    for (const args of attempts) {
      const envelope = await harness.action(S, 'runtime.set_auth_profile', { ...args, reason: 'e2e: should be refused' })
      assert.equal(envelope.ok, false, JSON.stringify(args))
      assert.equal(envelope.error.code, 'INVALID_ARGS', JSON.stringify(args))
    }
    assert.equal((await harness.result(S, 'inspect.policy')).revision, revisionBefore, 'no refused change reached the file')
    assert.equal(fs.existsSync(overlayFile) ? JSON.parse(fs.readFileSync(overlayFile, 'utf8')).revision : 0, revisionBefore)
  })

  it('without allowPrivateHosts a private name is refused; the missing reason is INVALID_ARGS', async () => {
    const envelope = await strict.action(S, 'runtime.set_auth_profile', { id: 'p', allowedDomains: ['a.localhost'], persistState: true, reason: 'e2e: private host' })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.error.code, 'INVALID_ARGS')
    assert.match(envelope.error.message, /allowPrivateHosts/)
    const noReason = await strict.action(S, 'runtime.set_usage_policy', { minDelayMs: 2000 })
    assert.equal(noReason.ok, false)
    assert.equal(noReason.error.code, 'INVALID_ARGS')
  })

  it('usage limits change at once; the overlay file is 0600; reset returns to the baseline and keeps the audit trail', async () => {
    const tightened = await strict.result(S, 'runtime.set_usage_policy', { minDelayMs: 3000, maxConcurrency: 1, reason: 'e2e: gentle' })
    assert.equal(tightened.direction, 'tighten')
    const status = await strict.result(S, 'runtime.status')
    assert.equal(status.usagePolicy.minDelayMs, 3000)
    assert.equal(status.usagePolicy.maxConcurrency, 1)
    const file = path.join(strict.dataDir, 'policy-overlay.json')
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    const reset = await strict.result(S, 'runtime.reset_policy', { scope: 'all', reason: 'e2e: back' })
    assert.equal(reset.direction, 'loosen')
    assert.ok(reset.risk)
    const report = await strict.result(S, 'inspect.policy')
    assert.equal(report.overlayActive, false)
    assert.equal(report.usagePolicy.minDelayMs.value, 750)
    assert.equal(report.audit.length, 2)
  })
})
