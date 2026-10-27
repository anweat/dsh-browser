import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PolicyConflictError, PolicyOverlayStore, checkProfileId, checkReason, checkStorageStatePath, checkUsagePatch, checksumOf, diffPolicy,
  isPublicSuffix, normalizeAllowedDomain, normalizeAllowedDomains, type Baseline, type PolicyOverlay,
} from '../src/policy-overlay.ts'
import { ActionArgError } from '../src/actions/types.ts'
import { mapError } from '../src/actions/errors.ts'
import { resolveUsagePolicy } from '../src/usage-policy.ts'

const PUBLIC = { allowPrivateHosts: false }
const PRIVATE = { allowPrivateHosts: true }

test('domains: normalized to lower-case punycode, wildcard only as *.registrable', () => {
  assert.equal(normalizeAllowedDomain('Example.COM', PUBLIC), 'example.com')
  assert.equal(normalizeAllowedDomain('*.Example.com', PUBLIC), '*.example.com')
  assert.equal(normalizeAllowedDomain('bücher.example', PUBLIC), 'xn--bcher-kva.example')
  assert.equal(normalizeAllowedDomain('xn--bcher-kva.example', PUBLIC), 'xn--bcher-kva.example')
  assert.equal(normalizeAllowedDomain('a.b.example.co.uk', PUBLIC), 'a.b.example.co.uk')
  assert.equal(normalizeAllowedDomain('user.github.io', PUBLIC), 'user.github.io', 'a tenant under a platform suffix is registrable')
})

test('domains: everything that would widen the scope or is not a host name is refused', () => {
  const refused: [string, RegExp][] = [
    ['*', /wildcard|registrable|top-level/i], ['com', /top-level/], ['co.uk', /public suffix/], ['github.io', /public suffix/], ['com.cn', /public suffix/],
    ['*.com', /top-level|public suffix/], ['*.co.uk', /public suffix/], ['*.github.io', /public suffix/], ['**.example.com', /wildcard/], ['a.*.example.com', /wildcard/], ['ex*.example.com', /wildcard/],
    ['127.0.0.1', /allowPrivateHosts/], ['8.8.8.8', /public IP/], ['*.8.8.8.8', /wildcard IP/], ['*.127.0.0.1', /wildcard IP/], ['2130706433', /allowPrivateHosts/], ['0x7f.0.0.1', /allowPrivateHosts/], ['127.1', /allowPrivateHosts/], ['1.2.3', /public IP|IP literal|non-standard/], ['08.8.8.8', /IP literal|public IP|non-standard|valid/],
    ['169.254.169.254', /never allowed/], ['0.0.0.0', /never allowed/],
    ['localhost', /allowPrivateHosts/], ['foo.localhost', /allowPrivateHosts/], ['printer.local', /allowPrivateHosts/], ['db.internal', /allowPrivateHosts/], ['metadata.google.internal', /never allowed|allowPrivateHosts/],
    ['example.com:8080', /port|host name only/], ['https://example.com', /scheme|host name only/], ['example.com/path', /path|host name only/], ['user@example.com', /host name only/], ['example.com?x=1', /host name only/],
    ['[::1]', /host name only/], ['::1', /host name only/], ['exa mple.com', /whitespace/], [' example.com', /whitespace/], ['example.com\n', /whitespace/], ['exa\u0000mple.com', /whitespace|control/],
    ['example.com.', /dot/], ['.example.com', /invalid label|valid host/], ['a..example.com', /invalid label|valid host/], ['-a.example.com', /invalid label/], ['', /1 to 253|empty/],
    ['a'.repeat(64) + '.example.com', /invalid label|too long|valid host/], ['a.'.repeat(130) + 'example.com', /too long|1 to 253/],
  ]
  for (const [input, why] of refused) {
    assert.throws(() => normalizeAllowedDomain(input, PUBLIC), (error: Error) => error instanceof ActionArgError && why.test(error.message), `${JSON.stringify(input)} should be refused (${why})`)
  }
  assert.throws(() => normalizeAllowedDomain(42 as never, PUBLIC), ActionArgError)
  assert.throws(() => normalizeAllowedDomain(null as never, PUBLIC), ActionArgError)
})

test('allowPrivateHosts lifts only the private-name and private-IP rules, never the metadata or public-IP ones', () => {
  assert.equal(normalizeAllowedDomain('localhost', PRIVATE), 'localhost')
  assert.equal(normalizeAllowedDomain('*.localhost', PRIVATE), '*.localhost')
  assert.equal(normalizeAllowedDomain('app.internal', PRIVATE), 'app.internal')
  assert.equal(normalizeAllowedDomain('127.0.0.1', PRIVATE), '127.0.0.1')
  assert.equal(normalizeAllowedDomain('192.168.1.20', PRIVATE), '192.168.1.20')
  assert.equal(normalizeAllowedDomain('172.16.0.5', PRIVATE), '172.16.0.5')
  assert.equal(normalizeAllowedDomain('127.1', PRIVATE), '127.0.0.1', 'spelling tricks are canonicalized, not trusted')
  assert.equal(normalizeAllowedDomain('2130706433', PRIVATE), '127.0.0.1')
  for (const input of ['169.254.169.254', '169.254.1.1', '0.0.0.0', '8.8.8.8', '172.32.0.1', '*.127.0.0.1', 'metadata.google.internal', 'com', '*', '*.internal']) {
    assert.throws(() => normalizeAllowedDomain(input, PRIVATE), ActionArgError, input)
  }
})

test('public suffix rule: TLDs, ccTLD second levels and platform suffixes, not their tenants', () => {
  for (const suffix of ['com', 'uk', 'co.uk', 'com.cn', 'co.jp', 'github.io', 'vercel.app', 'pages.dev']) assert.equal(isPublicSuffix(suffix), true, suffix)
  for (const name of ['example.com', 'example.co.uk', 'a.example.com.cn', 'user.github.io', 'example.io']) assert.equal(isPublicSuffix(name), false, name)
})

test('a domain list: at least one, at most 50, no duplicates (a wildcard and its base scope the same hosts)', () => {
  assert.deepEqual(normalizeAllowedDomains(['A.com', '*.b.com'], PUBLIC), ['a.com', '*.b.com'])
  assert.throws(() => normalizeAllowedDomains([], PUBLIC), /at least one/)
  assert.throws(() => normalizeAllowedDomains('a.com' as never, PUBLIC), /array/)
  assert.throws(() => normalizeAllowedDomains(['a.com', 'A.COM'], PUBLIC), /twice/)
  assert.throws(() => normalizeAllowedDomains(['a.com', '*.a.com'], PUBLIC), /twice/)
  assert.equal(normalizeAllowedDomains(Array.from({ length: 50 }, (_, i) => `d${i}.example.com`), PUBLIC).length, 50)
  assert.throws(() => normalizeAllowedDomains(Array.from({ length: 51 }, (_, i) => `d${i}.example.com`), PUBLIC), /at most 50/)
})

test('profile ids: bounded character set, no prototype keys', () => {
  for (const ok of ['forum', 'a', 'Work-2_x', 'x'.repeat(40)]) assert.equal(checkProfileId(ok), ok)
  for (const bad of ['', 'x'.repeat(41), '_a', '-a', 'a b', 'a.b', 'a/b', '../a', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', 'a\n', 'café', 5, null, undefined, {}]) {
    assert.throws(() => checkProfileId(bad), ActionArgError, JSON.stringify(bad))
  }
})

test('reason is required and bounded', () => {
  assert.equal(checkReason('  needs the forum login '), 'needs the forum login')
  for (const bad of [undefined, '', 'ab', '   ', 'x'.repeat(301), 5]) assert.throws(() => checkReason(bad), ActionArgError)
  assert.equal(checkReason('line\nbreak ok'), 'line break ok')
})

test('usage values: the configuration ranges, integers only, known keys only', () => {
  assert.deepEqual(checkUsagePatch({ minDelayMs: 0, maxConcurrency: 8, burst: 20, cooldownMs: 300_000, maxPagesPerRun: 100 }), { minDelayMs: 0, maxConcurrency: 8, burst: 20, cooldownMs: 300_000, maxPagesPerRun: 100 })
  for (const bad of [{ maxConcurrency: 9 }, { maxConcurrency: 0 }, { minDelayMs: -1 }, { minDelayMs: 60_001 }, { burst: 21 }, { maxPagesPerRun: 101 }, { maxDepth: 6 }, { retryLimit: 6 }, { cooldownMs: 99 }, { cooldownMs: 300_001 }, { backoffBaseMs: 0 },
    { minDelayMs: 1.5 }, { minDelayMs: '10' }, { minDelayMs: Infinity }, { minDelayMs: NaN }, { bogus: 1 }, { __proto__x: 1 }, { constructor: 1 }]) {
    assert.throws(() => checkUsagePatch(bad), ActionArgError, JSON.stringify(bad))
  }
  assert.throws(() => checkUsagePatch([1]), ActionArgError)
  // The same ranges the configuration resolver enforces.
  assert.throws(() => resolveUsagePolicy({ maxConcurrency: 9 }), /maxConcurrency/)
})

function env() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-policy-')))
  const dataDir = path.join(root, 'data', 'browser')
  const authDir = path.join(dataDir, 'auth')
  fs.mkdirSync(authDir, { recursive: true })
  return { root, dataDir, authDir, snapshotDir: path.join(dataDir, 'snapshots'), downloadDir: path.join(dataDir, 'downloads'), file: path.join(dataDir, 'policy-overlay.json') }
}

test('storageStatePath: an absolute .json file inside the auth directory, nothing else', () => {
  const e = env()
  const pathEnv = { authDir: e.authDir, forbidden: [e.snapshotDir, e.downloadDir] }
  const good = path.join(e.authDir, 'forum.json')
  assert.equal(checkStorageStatePath(good, pathEnv), good)
  assert.equal(checkStorageStatePath(path.join(e.authDir, 'sub', 'x.json'), pathEnv), path.join(e.authDir, 'sub', 'x.json'))
  const outside = path.join(e.root, 'other.json')
  fs.writeFileSync(outside, '{}')
  const link = path.join(e.authDir, 'link.json')
  fs.symlinkSync(outside, link)
  const dirLink = path.join(e.authDir, 'dirlink')
  fs.symlinkSync(e.root, dirLink)
  fs.mkdirSync(e.downloadDir, { recursive: true })
  fs.mkdirSync(path.join(e.authDir, 'adir.json'))
  const refused: [unknown, RegExp][] = [
    ['forum.json', /absolute/], ['', /1 to 500/], [5, /1 to 500/], [e.authDir + '/../x.json', /\.\./], [e.authDir + '/a/../../x.json', /\.\./], [path.join(e.authDir, '..', 'x.json'), /outside the auth directory/],
    [outside, /outside the auth directory/], ['/etc/passwd', /outside the auth directory|\.json/], [path.join(e.authDir, 'x.txt'), /\.json/], [path.join(e.authDir, 'x'), /\.json/],
    [link, /outside the auth directory|symbolic link/], [path.join(dirLink, 'x.json'), /outside the auth directory/], [path.join(e.authDir, 'adir.json'), /not a regular file/],
    [e.authDir + '.json', /outside the auth directory/], [path.join(e.downloadDir, 'x.json'), /outside the auth directory|holds other/], [path.join(e.authDir, 'a\u0000b.json'), /control/],
  ]
  for (const [input, why] of refused) assert.throws(() => checkStorageStatePath(input, pathEnv), (error: Error) => error instanceof ActionArgError && why.test(error.message), JSON.stringify(input))
  // Another profile's file is not shareable.
  assert.throws(() => checkStorageStatePath(good, pathEnv, [good]), /another profile/)
  // An auth directory that overlaps a data directory trusts no agent path at all.
  assert.throws(() => checkStorageStatePath(good, { ...pathEnv, authDirProblem: 'the auth directory overlaps /x' }), /overlaps/)
})

function makeStore(overrides: Partial<{ baseline: Baseline; allowPrivateHosts: boolean }> = {}) {
  const e = env()
  const stateFile = path.join(e.authDir, 'forum.json')
  fs.writeFileSync(stateFile, '{"cookies":[],"origins":[]}')
  const baseline: Baseline = overrides.baseline ?? {
    authProfiles: { forum: { storageStatePath: stateFile, allowedDomains: ['example.com', 'shop.example.org'], persistState: false } },
    usagePolicy: resolveUsagePolicy({}),
  }
  const make = () => new PolicyOverlayStore({ file: e.file, authDir: e.authDir, snapshotDir: e.snapshotDir, downloadDir: e.downloadDir, allowPrivateHosts: overrides.allowPrivateHosts ?? false, baseline })
  return { ...e, stateFile, baseline, make, store: make() }
}
const META = { source: 'agent' as const, session: 'session:a', action: 'test', reason: 'because the test says so' }

test('an overlay is empty by default and the effective policy equals the baseline', () => {
  const { store, baseline } = makeStore()
  assert.equal(store.warning, undefined)
  assert.deepEqual(store.effective().authProfiles.forum, baseline.authProfiles.forum)
  assert.deepEqual({ ...store.effective().usagePolicy }, { ...baseline.usagePolicy })
  assert.equal(store.current().revision, 0)
})

test('narrowing is classified as tightening, widening as loosening, and both are applied, written 0600 and audited', () => {
  const { store, file, make } = makeStore()
  const narrow = store.apply({ kind: 'setAuthProfile', id: 'forum', allowedDomains: ['example.com'] }, META)
  assert.equal(narrow.diff.direction, 'tighten')
  assert.deepEqual(narrow.after.authProfiles.forum!.allowedDomains, ['example.com'])
  assert.equal(narrow.revision, 1)
  assert.equal(narrow.audit.session, 'session:a')
  assert.equal(narrow.audit.reason, 'because the test says so')
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  const widen = store.apply({ kind: 'setAuthProfile', id: 'forum', allowedDomains: ['example.com', 'api.example.com'] }, META)
  assert.equal(widen.diff.direction, 'loosen')
  assert.match(widen.diff.lines.join('\n'), /allow api\.example\.com/)
  // A new store over the same file sees the same thing.
  const again = make()
  assert.deepEqual(again.effective().authProfiles.forum!.allowedDomains, ['example.com', 'api.example.com'])
  assert.equal(again.current().audit.length, 2)
  assert.deepEqual(again.current().audit.map(entry => entry.direction), ['tighten', 'loosen'])
})

test('creating a profile and persistState are loosening; removing a profile is tightening; the baseline is never rewritten', () => {
  const { store, authDir, baseline } = makeStore()
  const created = store.apply({ kind: 'setAuthProfile', id: 'fresh', allowedDomains: ['new.example.com'], persistState: true }, META)
  assert.equal(created.diff.direction, 'loosen')
  assert.equal(created.after.authProfiles.fresh!.storageStatePath, path.join(authDir, 'fresh.json'))
  const persist = store.apply({ kind: 'setAuthProfile', id: 'forum', persistState: true }, META)
  assert.equal(persist.diff.direction, 'loosen')
  const unpersist = store.apply({ kind: 'setAuthProfile', id: 'forum', persistState: false }, META)
  assert.equal(unpersist.diff.direction, 'tighten')
  const removed = store.apply({ kind: 'removeAuthProfile', id: 'forum' }, META)
  assert.equal(removed.diff.direction, 'tighten')
  assert.equal(store.effective().authProfiles.forum, undefined)
  assert.equal(store.current().authProfiles.forum, null, 'a baseline profile is hidden by a tombstone')
  assert.ok(baseline.authProfiles.forum, 'the baseline object is untouched')
  const gone = store.apply({ kind: 'removeAuthProfile', id: 'fresh' }, META)
  assert.equal('fresh' in store.current().authProfiles, false, 'an overlay-only profile is simply dropped')
  assert.equal(gone.diff.direction, 'tighten')
  assert.throws(() => store.apply({ kind: 'removeAuthProfile', id: 'nope' }, META), /unknown auth profile/)
})

test('a new profile needs domains and a usable state file; the agent cannot point it elsewhere', () => {
  const { store, authDir, root } = makeStore()
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p' }), /requires allowedDomains/)
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'] }), /does not exist and persistState is false/)
  assert.doesNotThrow(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'], persistState: true }))
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'], persistState: true, storageStatePath: path.join(root, 'x.json') }), /outside the auth directory/)
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'], persistState: true, storageStatePath: '/etc/passwd' }), ActionArgError)
  // Not the file of another profile.
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'], persistState: true, storageStatePath: path.join(authDir, 'forum.json') }), /another profile/)
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: '__proto__', allowedDomains: ['a.example.com'], persistState: true }), /reserved|must start/)
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'forum' }), /at least one of/)
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'forum', persistState: 'yes' }), /true or false/)
})

test('usage policy: stricter is tightening, any looser value makes it a loosening; baseline values drop their override', () => {
  const { store } = makeStore()
  const strict = store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 2000, maxConcurrency: 1, cooldownMs: 60_000 } }, META)
  assert.equal(strict.diff.direction, 'tighten')
  assert.equal(store.effective().usagePolicy.minDelayMs, 2000)
  const mixed = store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 3000, burst: 10 } }, META)
  assert.equal(mixed.diff.direction, 'loosen', 'one looser value loosens the whole change')
  const lowerDelay = store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 100 } }, META)
  assert.equal(lowerDelay.diff.direction, 'loosen')
  const back = store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 750 } }, META)
  assert.equal('minDelayMs' in store.current().usagePolicy, false, 'a value equal to the baseline is not an override')
  assert.equal(back.diff.direction, 'tighten', '100 -> 750 is stricter than the 100 it replaces')
  assert.throws(() => store.plan({ kind: 'setUsagePolicy', values: {} }), /at least one of/)
  assert.throws(() => store.plan({ kind: 'setUsagePolicy', values: { maxConcurrency: 99 } }), /maxConcurrency/)
})

test('reset goes back to the baseline and is judged like any other change; it keeps the audit trail', () => {
  const { store } = makeStore()
  store.apply({ kind: 'setAuthProfile', id: 'forum', allowedDomains: ['example.com'] }, META)
  store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 5000 } }, META)
  const resetUsage = store.apply({ kind: 'reset', scope: 'usagePolicy' }, META)
  assert.equal(resetUsage.diff.direction, 'loosen')
  const resetOne = store.apply({ kind: 'reset', scope: 'authProfile', id: 'forum' }, META)
  assert.equal(resetOne.diff.direction, 'loosen', 'the narrowed domain comes back')
  assert.deepEqual(store.effective().authProfiles.forum!.allowedDomains, ['example.com', 'shop.example.org'])
  assert.throws(() => store.plan({ kind: 'reset', scope: 'authProfile', id: 'forum' }), /no overlay to reset/)
  const all = store.apply({ kind: 'reset', scope: 'all' }, META)
  assert.equal(all.diff.direction, 'none')
  assert.equal(store.current().audit.length, 5)
})

test('optimistic lock: a stale expectedRevision is a conflict and changes nothing', () => {
  const { store, make } = makeStore()
  store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 2000 } }, META)
  assert.throws(() => store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 3000 } }, { ...META, expectedRevision: 0 }), PolicyConflictError)
  assert.equal(store.effective().usagePolicy.minDelayMs, 2000)
  store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 3000 } }, { ...META, expectedRevision: 1 })
  // Another process writes between this one's read and write: the file wins, the stale holder is refused.
  const other = make()
  other.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 4000 } }, META)
  assert.throws(() => store.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 5000 } }, { ...META, expectedRevision: 2 }), /revision 3, not 2/)
  assert.equal(store.effective().usagePolicy.minDelayMs, 4000, 'the newer file was picked up')
})

test('a file that does not parse, was edited, or holds a forbidden value is ignored as a whole, with a warning, never half-applied', () => {
  const { store, file, make, authDir, root } = makeStore()
  store.apply({ kind: 'setAuthProfile', id: 'forum', allowedDomains: ['example.com'] }, META)
  const good = fs.readFileSync(file, 'utf8')
  const baselineDomains = ['example.com', 'shop.example.org']
  const effectiveDomains = (s: PolicyOverlayStore) => s.effective().authProfiles.forum!.allowedDomains

  fs.writeFileSync(file, '{ not json')
  let broken = make()
  assert.match(broken.warning!, /not valid JSON/)
  assert.deepEqual(effectiveDomains(broken), baselineDomains)

  // Hand-edited: the checksum no longer matches.
  fs.writeFileSync(file, good.replace('"example.com"', '"example.com", "evil.example.net"'))
  broken = make()
  assert.match(broken.warning!, /checksum/)
  assert.deepEqual(effectiveDomains(broken), baselineDomains)

  // Forged with a valid checksum but a forbidden value: re-validated on load.
  const forge = (mutate: (overlay: any) => void) => {
    const overlay = JSON.parse(good)
    delete overlay.checksum
    mutate(overlay)
    fs.writeFileSync(file, JSON.stringify({ ...overlay, checksum: checksumOf(overlay as PolicyOverlay) }))
    return make()
  }
  assert.match(forge(o => { o.authProfiles.forum.allowedDomains = ['com'] }).warning!, /top-level/)
  assert.match(forge(o => { o.authProfiles.forum.allowedDomains = ['EXAMPLE.com'] }).warning!, /normalized form/)
  assert.match(forge(o => { o.authProfiles.forum.storageStatePath = path.join(root, 'elsewhere.json') }).warning!, /outside the auth directory/)
  assert.match(forge(o => { o.authProfiles.forum.storageStatePath = '/etc/passwd' }).warning!, /absolute|outside|json/)
  assert.match(forge(o => { o.usagePolicy.maxConcurrency = 500 }).warning!, /maxConcurrency/)
  assert.match(forge(o => { o.usagePolicy.rogue = 1 }).warning!, /unknown usage policy key/)
  assert.match(forge(o => { o.extra = 1 }).warning!, /unknown key/)
  assert.match(forge(o => { o.version = 2 }).warning!, /version/)
  assert.match(forge(o => { o.authProfiles['__proto__x'] = null; o.authProfiles['bad id'] = null }).warning!, /profile id/)
  assert.match(forge(o => { o.authProfiles.ghost = { allowedDomains: ['a.example.com'] } }).warning!, /incomplete/)
  const bad = forge(o => { o.authProfiles.forum.allowedDomains = ['com'] })
  assert.deepEqual(effectiveDomains(bad), baselineDomains, 'not fail-open: the baseline applies')
  // Changing the policy on a broken file is refused until it is cleared.
  assert.throws(() => bad.apply({ kind: 'setUsagePolicy', values: { minDelayMs: 2000 } }, META), (error: Error) => {
    assert.ok(!(error instanceof ActionArgError), 'not an argument problem')
    assert.equal(mapError(error, 'runtime.set_usage_policy').code, 'CAPABILITY_UNAVAILABLE')
    assert.match(mapError(error, 'runtime.set_usage_policy').hint!, /runtime\.reset_policy/)
    return /unreadable/.test(error.message)
  })
  const cleared = bad.apply({ kind: 'reset', scope: 'all' }, META)
  assert.equal(bad.warning, undefined)
  assert.ok(fs.readdirSync(path.dirname(file)).some(name => name.startsWith('policy-overlay.json.corrupt-')), 'the bad file is kept for inspection')
  assert.equal(cleared.revision, 1)
  void authDir
})

test('the private-host switch is part of validating a stored overlay: turning it off ignores an overlay that relied on it', () => {
  const { store, make, file } = makeStore({ allowPrivateHosts: true })
  store.apply({ kind: 'setAuthProfile', id: 'forum', allowedDomains: ['example.com', 'app.localhost'] }, META)
  assert.equal(make().warning, undefined)
  const fileText = fs.readFileSync(file, 'utf8')
  const strict = new PolicyOverlayStore({ file, authDir: store.authDir, snapshotDir: path.join(path.dirname(file), 'snapshots'), downloadDir: path.join(path.dirname(file), 'downloads'), allowPrivateHosts: false, baseline: store.baseline })
  assert.match(strict.warning!, /allowPrivateHosts/)
  assert.equal(fs.readFileSync(file, 'utf8'), fileText, 'the file is left as it was')
})

test('an auth directory that overlaps the download directory trusts no agent-set path', () => {
  const e = env()
  const baseline: Baseline = { authProfiles: {}, usagePolicy: resolveUsagePolicy({}) }
  const store = new PolicyOverlayStore({ file: e.file, authDir: e.authDir, snapshotDir: e.snapshotDir, downloadDir: path.join(e.authDir, 'downloads'), allowPrivateHosts: false, baseline })
  assert.throws(() => store.plan({ kind: 'setAuthProfile', id: 'p', allowedDomains: ['a.example.com'], persistState: true }), /overlaps/)
})

test('diffPolicy: wildcard and bare forms of one domain are the same scope', () => {
  const policy = resolveUsagePolicy({})
  const before = { authProfiles: { a: { storageStatePath: '/x.json', allowedDomains: ['example.com'], persistState: false } }, usagePolicy: policy }
  const same = { authProfiles: { a: { storageStatePath: '/x.json', allowedDomains: ['*.example.com'], persistState: false } }, usagePolicy: policy }
  assert.equal(diffPolicy(before, same).direction, 'none')
})
