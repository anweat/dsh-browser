/**
 * The policy actions through the registry: approval by direction, risk on loosening, audit by session, effects on
 * profile resolution and context creation, and what other sessions can see. A fake browser stands in for Chromium.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { browserCallDecision, browserPolicyDecision } from '../src/approval-policy.ts'
import { policyChangeFor } from '../src/actions/policy.ts'
import { findAction } from '../src/actions/registry.ts'
import { mapError } from '../src/actions/errors.ts'
import { validateArgs } from '../src/actions/schema.ts'
import type { AutomationMode } from '../src/freedom.ts'

function setup(overrides: Record<string, unknown> = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-policy-act-')))
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(path.join(dataDir, 'auth'), { recursive: true })
  const stateFile = path.join(dataDir, 'auth', 'forum.json')
  fs.writeFileSync(stateFile, JSON.stringify({
    cookies: [
      { name: 'a', value: '1', domain: 'a.example.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
      { name: 'b', value: '1', domain: 'b.example.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    ], origins: [],
  }))
  const config = resolveConfig({
    enabled: true, browserDataDir: dataDir, snapshotDir: path.join(root, 'snap'), downloadDir: path.join(root, 'dl'), automationMode: 'standard',
    authProfiles: { forum: { storageStatePath: stateFile, allowedDomains: ['a.example.com'], persistState: false } },
    ...overrides,
  } as never)
  const service = new BrowserService(config)
  const created: { options: Record<string, any>; closed: boolean }[] = []
  ;(service as any).browser = {
    isConnected: () => true, on() {},
    async newContext(options: Record<string, any>) {
      const entry = { options, closed: false }
      created.push(entry)
      return { on() {}, async addInitScript() {}, async newPage() { return { on() {}, isClosed: () => entry.closed, async close() {}, mainFrame: () => ({}), url: () => 'about:blank' } }, async close() { entry.closed = true }, async storageState() { return {} } }
    },
  }
  const run = (name: string, args: Record<string, unknown>, session = 'A') =>
    findAction(name)!.execute(args, { service, config, session: `session:${session}`, sessionId: session, agent: undefined, signal: new AbortController().signal } as never)
  const decide = (name: string, args: Record<string, unknown>, mode: AutomationMode) => {
    const change = policyChangeFor(name, args)
    return browserCallDecision(name, args, mode, undefined, undefined, undefined, change ? service.previewPolicyChange(change) : undefined)
  }
  return { root, dataDir, stateFile, config, service, created, run, decide }
}

test('approval by direction: tightening is free everywhere, loosening is denied/asked/allowed by mode with the diff in the reason', () => {
  const { decide } = setup()
  const narrow = { id: 'forum', allowedDomains: ['a.example.com'], persistState: false, reason: 'no change' }
  for (const mode of ['read-only', 'standard', 'autonomous', 'unrestricted'] as const) {
    assert.deepEqual(decide('runtime.set_usage_policy', { minDelayMs: 5000, reason: 'slow down please' }, mode), { kind: 'allow' }, `tighten ${mode}`)
    assert.deepEqual(decide('runtime.remove_auth_profile', { id: 'forum', reason: 'remove it' }, mode), { kind: 'allow' }, `remove ${mode}`)
    assert.deepEqual(decide('runtime.set_auth_profile', narrow, mode), { kind: 'allow' }, `no-op ${mode}`)
  }
  const widen = { id: 'forum', allowedDomains: ['a.example.com', 'b.example.com'], reason: 'need b' }
  assert.equal(decide('runtime.set_auth_profile', widen, 'read-only').kind, 'deny')
  assert.equal(decide('runtime.set_auth_profile', widen, 'unrestricted').kind, 'allow')
  for (const mode of ['standard', 'autonomous'] as const) {
    const decision = decide('runtime.set_auth_profile', widen, mode) as { kind: string; reason: string }
    assert.equal(decision.kind, 'ask', mode)
    assert.match(decision.reason, /profile forum: allow b\.example\.com/)
  }
  const looser = decide('runtime.set_usage_policy', { maxConcurrency: 4, reason: 'faster please' }, 'standard') as { kind: string; reason: string }
  assert.equal(looser.kind, 'ask')
  assert.match(looser.reason, /usagePolicy\.maxConcurrency: 2 -> 4 \(looser\)/)
  assert.equal(decide('runtime.set_auth_profile', { id: 'fresh', allowedDomains: ['n.example.com'], persistState: true, reason: 'new profile' }, 'standard').kind, 'ask', 'a new profile and persistState widen')
  assert.equal(decide('runtime.set_usage_policy', { minDelayMs: 100, reason: 'loosen' }, 'read-only').kind, 'deny')
  // A change that cannot be planned changes nothing, so it is not asked about; the executor says why.
  assert.deepEqual(decide('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['com'], reason: 'bad domain' }, 'standard'), { kind: 'allow' })
  // The tier without a preview (a caller that cannot look) is the cautious one.
  assert.equal(browserPolicyDecision('runtime.set_usage_policy', { minDelayMs: 1, reason: 'abc' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('runtime.set_usage_policy', { minDelayMs: 1, reason: 'abc' }, 'read-only').kind, 'deny')
})

test('the actions have schemas: reason is required, no unknown keys', () => {
  const set = findAction('runtime.set_auth_profile')!
  assert.deepEqual(validateArgs(set.params, { id: 'a', allowedDomains: ['a.com'], reason: 'why not' }).errors, [])
  assert.deepEqual(validateArgs(set.params, { id: 'a', allowedDomains: ['a.com'] }).errors, ['reason: required'])
  assert.ok(validateArgs(set.params, { id: 'a', reason: 'x', domains: ['a.com'] }).errors.length > 0)
  assert.ok(validateArgs(findAction('runtime.reset_policy')!.params, { scope: 'everything', reason: 'abc' }).errors.length > 0)
})

test('a loosening result carries risk (also unrestricted: nobody asked); a tightening does not; both return before/after and write an audit entry', async () => {
  const { run, service } = setup({ automationMode: 'unrestricted' })
  const tight = await run('runtime.set_usage_policy', { minDelayMs: 3000, reason: 'be gentle' }) as any
  assert.equal(tight.direction, 'tighten')
  assert.equal(tight.risk, undefined)
  assert.deepEqual(tight.before.usagePolicy, { minDelayMs: 750 })
  assert.deepEqual(tight.after.usagePolicy, { minDelayMs: 3000 })
  assert.equal(tight.revision, 1)
  const loose = await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['a.example.com', 'b.example.com'], reason: 'task needs b' }) as any
  assert.equal(loose.direction, 'loosen')
  assert.equal(loose.risk.level, 'elevated')
  assert.match(loose.risk.approval, /unrestricted/)
  assert.match(loose.risk.note, /unrestricted/)
  assert.deepEqual(loose.before.authProfiles.forum.allowedDomains, ['a.example.com'])
  assert.deepEqual(loose.after.authProfiles.forum.allowedDomains, ['a.example.com', 'b.example.com'])
  const report = service.policyReport() as any
  assert.equal(report.revision, 2)
  assert.deepEqual(report.audit.map((entry: any) => [entry.session, entry.action, entry.direction, entry.reason]), [
    ['A', 'runtime.set_usage_policy', 'tighten', 'be gentle'],
    ['A', 'runtime.set_auth_profile', 'loosen', 'task needs b'],
  ])
  assert.equal(report.usagePolicy.minDelayMs.overridden, true)
  assert.equal(report.authProfiles[0].origin, 'overlay-changed')
})

test('in standard mode a loosening that was approved says so in its risk field', async () => {
  const { run } = setup()
  const loose = await run('runtime.set_usage_policy', { maxConcurrency: 4, reason: 'user approved' }) as any
  assert.match(loose.risk.approval, /approved by the user/)
})

test('the effective policy is live: a context gets cookies only of the domains the profile allows now, and a revoked one is refused at once', async () => {
  const { run, service, created } = setup({ automationMode: 'unrestricted' })
  const open = (url: string, session: string) => (service as any).transientContext(url, { authProfile: 'forum', session }) as Promise<{ context: any }>
  const cookiesOf = (index: number) => (created[index]!.options.storageState?.cookies ?? []).map((cookie: any) => cookie.domain).sort()
  await open('https://a.example.com/', 'A')
  assert.deepEqual(cookiesOf(0), ['a.example.com'])
  await assert.rejects(open('https://b.example.com/', 'A'), /not allowed for b\.example\.com/)
  await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['a.example.com', 'b.example.com'], reason: 'needs b' })
  await open('https://b.example.com/', 'A')
  assert.deepEqual(cookiesOf(1), ['a.example.com', 'b.example.com'], 'cookies of the newly allowed domain are injected')
  await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['a.example.com'], reason: 'revoke b' })
  await assert.rejects(open('https://b.example.com/', 'A'), /not allowed for b\.example\.com/, 'the revocation holds at the next call')
  await run('runtime.remove_auth_profile', { id: 'forum', reason: 'gone' })
  await assert.rejects(open('https://a.example.com/', 'A'), /unknown auth profile: forum/)
  assert.deepEqual((service as any).authProfiles.list(), [])
})

test('open sessions that lose access are closed immediately; sessions that keep it are untouched', async () => {
  const { run, service, created } = setup({ automationMode: 'unrestricted' })
  const ensure = (session: string) => (service as any).ensurePage('https://a.example.com/', { session: `session:${session}`, authProfile: 'forum' })
  await ensure('A')
  await ensure('B')
  const widened = await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['a.example.com', 'b.example.com'], reason: 'widen' }) as any
  assert.equal(widened.sessionsClosed, undefined, 'widening takes nothing away')
  assert.deepEqual(created.map(entry => entry.closed), [false, false])
  const narrowed = await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['b.example.com'], reason: 'drop a' }) as any
  assert.equal(narrowed.sessionsClosed, 2)
  assert.deepEqual(created.map(entry => entry.closed), [true, true])
  assert.match(narrowed.note, /closed/)
})

test('usage limits are applied to the governor and to crawl budgets at once', async () => {
  const { run, service } = setup({ automationMode: 'unrestricted' })
  await run('runtime.set_usage_policy', { maxPagesPerRun: 3, maxDepth: 0, minDelayMs: 4000, reason: 'small crawl' })
  assert.equal((service as any).usageGovernor.policy.minDelayMs, 4000)
  await assert.rejects(service.crawl(['https://e.test/'], { maxPages: 10 }), /maxPages must be from 1 to configured usagePolicy\.maxPagesPerRun \(3\)/)
  const status = await service.status()
  assert.equal(status.usagePolicy.minDelayMs, 4000)
})

test('optimistic locking through the action, and errors map to INVALID_ARGS / ACTION_FAILED', async () => {
  const { run } = setup({ automationMode: 'unrestricted' })
  await run('runtime.set_usage_policy', { minDelayMs: 2000, reason: 'first' })
  const stale = await run('runtime.set_usage_policy', { minDelayMs: 3000, expectedRevision: 0, reason: 'second' }).catch(error => error)
  assert.match(stale.message, /revision 1, not 0/)
  assert.equal(mapError(stale, 'runtime.set_usage_policy').code, 'ACTION_FAILED')
  const invalid = await run('runtime.set_auth_profile', { id: 'forum', allowedDomains: ['github.io'], reason: 'too wide' }).catch(error => error)
  assert.equal(mapError(invalid, 'runtime.set_auth_profile').code, 'INVALID_ARGS')
  assert.match(invalid.message, /public suffix/)
  const noReason = await run('runtime.set_usage_policy', { minDelayMs: 2000 }).catch(error => error)
  assert.equal(mapError(noReason, 'runtime.set_usage_policy').code, 'INVALID_ARGS')
})

test('one session does not learn another session\'s id from the audit; the settings card (no viewer) sees all', async () => {
  const { run, service } = setup({ automationMode: 'unrestricted' })
  await run('runtime.set_usage_policy', { minDelayMs: 2000, reason: 'from session A' }, 'A')
  await run('runtime.set_usage_policy', { minDelayMs: 2500, reason: 'from session B' }, 'B')
  const seenByB = await run('inspect.policy', {}, 'B') as any
  assert.deepEqual(seenByB.audit.map((entry: any) => entry.session), ['another session', 'B'])
  assert.equal(JSON.stringify(seenByB).includes('"A"'), false)
  const panel = service.policyReport() as any
  assert.deepEqual(panel.audit.map((entry: any) => entry.session), ['A', 'B'])
})

test('a broken overlay file is a visible runtime warning and the baseline applies', async () => {
  const { service, config } = setup()
  fs.mkdirSync(path.dirname(config.policyOverlayFile), { recursive: true })
  fs.writeFileSync(config.policyOverlayFile, '{"version":1,"broken":')
  const status = await service.status()
  assert.ok(status.runtimeWarnings.some(warning => /policy overlay .* was ignored/.test(warning)), status.runtimeWarnings.join('\n'))
  assert.equal(status.usagePolicy.minDelayMs, 750)
  const report = service.policyReport() as any
  assert.match(report.warning, /ignored/)
})

test('the real Host hook previews the change: a loosening asks with its diff, a tightening is not asked', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: plugin } = await import('../src/index.ts')
  const root0 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-policy-hook-')))
  const decide = async (action: string, args: Record<string, unknown>) => {
    const ctx = new Context()
    ctx.provide('tools', { register() { return () => {} } })
    const fiber = ctx.plugin(plugin as never, { snapshotDir: path.join(root0, 'snap'), downloadDir: path.join(root0, 'dl'), browserDataDir: path.join(root0, 'data'), automationMode: 'standard' } as never)
    await new Promise(resolve => setTimeout(resolve, 40))
    try {
      return await (ctx as any).serial('tools/pre-execute', { name: 'browser_call', arguments: { action, args } }, async () => ({ kind: 'allow' })) as { kind: string; reason?: string }
    } finally { fiber.dispose() }
  }
  const loose = await decide('runtime.set_usage_policy', { maxConcurrency: 6, reason: 'more parallel work' })
  assert.equal(loose.kind, 'ask')
  assert.match(loose.reason!, /usagePolicy\.maxConcurrency: 2 -> 6 \(looser\)/)
  assert.equal((await decide('runtime.set_usage_policy', { minDelayMs: 9000, reason: 'be careful' })).kind, 'allow')
})
