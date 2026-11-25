/**
 * OpenCLI 1.8 and 2.x side by side. The fixtures in test/fixtures/opencli are trimmed real outputs of both CLIs
 * (`list`, `<site> <name> --help -f json`, failures that happen before any browser work); the fake packages below
 * answer like each generation and log every call, so no real OpenCLI, daemon or browser is involved.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { findAction } from '../src/actions/registry.ts'
import { opencliSupport } from '../src/deps.ts'
import { describeOpencliError, parseOpencliCatalog, parseOpencliCatalogPage, parseOpencliFailure, parseOpencliHelp } from '../src/opencli-catalog.ts'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'opencli')
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')

test('2.x list pages: first and last real page parse into the catalog item shape (site and name from the command words)', () => {
  const first = parseOpencliCatalogPage(fixture('v2-list-first.json'))
  assert.equal(first.items.length, 4)
  assert.deepEqual({ ...first.items[0]!, description: '' }, { command: '12306 login', site: '12306', name: 'login', description: '', access: 'write', strategy: '', args: [] })
  assert.equal(first.total, 1291)
  assert.equal(first.nextOffset, 100)
  const last = parseOpencliCatalogPage(fixture('v2-list-last.json'))
  assert.equal(last.nextOffset, undefined, 'the last page has no nextOffset')
  assert.equal(last.items.at(-1)!.site, 'zsxq')
  assert.equal(last.items.at(-1)!.name, 'whoami')
})

test('2.x list pages: a failure envelope, a bare array and garbage are errors, not an empty page', () => {
  assert.throws(() => parseOpencliCatalogPage(fixture('v2-fail-unknown.json')), /unknown_command: Unknown command: nosuchsite \(Use opencli list/)
  assert.throws(() => parseOpencliCatalogPage('[]'), /not an \{ok:true,data:\{commands/)
  assert.throws(() => parseOpencliCatalogPage('{"ok":true,"data":{}}'), /not an \{ok:true/)
  assert.throws(() => parseOpencliCatalogPage('nope'), /valid JSON/)
  assert.throws(() => parseOpencliCatalog('{"ok":true}'), /array \(1\.8\.x\) or an \{ok,data/)
})

test('1.8 list: the array keeps its arguments, strategy and domain', () => {
  const items = parseOpencliCatalog(fixture('v1-list.json'))
  assert.equal(items.length, 2)
  assert.equal(items[0]!.command, '12306/login')
  assert.equal(items[0]!.strategy, 'cookie')
  assert.equal(items[0]!.domain, '12306.cn')
  assert.equal((items[0]!.args[0] as { name: string }).name, 'timeout')
})

test('help json has the same fields in both versions: positionals, options, domain', () => {
  const v1 = parseOpencliHelp(fixture('v1-help-zhihu-search.json'))!
  const v2 = parseOpencliHelp(fixture('v2-help-zhihu-search.json'))!
  assert.deepEqual(v1.args, v2.args)
  assert.equal(v2.domain, 'www.zhihu.com')
  assert.deepEqual(v2.args.map(arg => (arg as { name: string }).name), ['query', 'limit', 'type'])
  assert.equal((v2.args[0] as { positional: boolean; required: boolean }).positional, true)
  assert.equal((v2.args[0] as { required: boolean }).required, true)
  assert.deepEqual((v2.args[2] as { choices: string[] }).choices, ['all', 'answer', 'article', 'question'])
  assert.match(v2.example!, /opencli zhihu search/)
  assert.equal(parseOpencliHelp('error: unknown command'), undefined)
  assert.equal(parseOpencliHelp('{"ok":false}'), undefined)
})

test('2.x failure lines (stdout JSON) are read into code, message and hint; anything else is not a failure', () => {
  assert.deepEqual(parseOpencliFailure(fixture('v2-fail-unknown.json')), { code: 'unknown_command', message: 'Unknown command: nosuchsite', hint: 'Use opencli list <query> to find a capability.' })
  assert.deepEqual(parseOpencliFailure(fixture('v2-fail-missing-arg.json')), { code: 'commander.missingArgument', message: "error: missing required argument 'query'" })
  assert.equal(parseOpencliFailure('{"ok":true,"data":[]}'), undefined)
  assert.equal(parseOpencliFailure("error: missing required argument 'query'"), undefined)
  assert.equal(parseOpencliFailure('[]'), undefined)
  assert.equal(describeOpencliError({ code: 'X', message: 'm', hint: 'h' }), 'X: m (h)')
})

// ── fake packages ──────────────────────────────────────────────────────────────

/**
 * A package whose entry answers like OpenCLI of that generation and appends every call to `calls.log`.
 * FAKE_MODE: `page2-fails` (2.x: the page at offset 100 is a failure line), `page2-garbage`, `stuck` (nextOffset never advances),
 * `short` (the last page claims more total than it served), `help-fails` (help exits 1).
 */
function fakeOpencli(major: 1 | 2, commands = 230) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-opencli-${major}-`))
  const log = path.join(dir, 'calls.log')
  const helpJson = fixture('v2-help-zhihu-search.json')
  fs.writeFileSync(path.join(dir, 'help.json'), helpJson)
  const rows = Array.from({ length: commands }, (_, i) => ({ site: i < 3 ? 'zhihu' : 'site' + Math.floor(i / 20), name: i < 3 ? ['search', 'hot', 'question'][i] : 'cmd' + i, description: 'adapter ' + i, access: i % 2 ? 'write' : 'read' }))
  fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify(rows))
  fs.writeFileSync(path.join(dir, 'main.js'), `
const fs = require('node:fs'), path = require('node:path')
const argv = process.argv.slice(2)
fs.appendFileSync(path.join(__dirname, 'calls.log'), JSON.stringify(argv) + '\\n')
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'rows.json'), 'utf8'))
const mode = process.env.FAKE_MODE || ''
const major = ${major}
const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
const fail = (code, message, hint) => { if (major === 2) { console.log(JSON.stringify({ ok: false, error: { code, message, exitCode: 2, ...hint ? { hint } : {} } })) } else { console.error('error: ' + message) } process.exit(major === 2 ? 2 : 1) }
if (argv[0] === '--version') { console.log('${major}.0.0'); process.exit(0) }
if (argv[0] === 'list') {
  if (major === 1) { console.log(JSON.stringify(rows.map(r => ({ command: r.site + '/' + r.name, site: r.site, name: r.name, description: r.description, access: r.access, strategy: 'cookie', args: [{ name: 'q', type: 'str', positional: true }], domain: r.site + '.test' })))); process.exit(0) }
  const limit = Number(opt('--limit', '25')), offset = Number(opt('--offset', '0'))
  if (mode === 'page2-fails' && offset === 100) fail('internal', 'page two exploded', 'try later')
  if (mode === 'page2-garbage' && offset === 100) { console.log('<html>oops</html>'); process.exit(0) }
  const page = rows.slice(offset, offset + limit).map(r => ({ command: r.site + ' ' + r.name, description: r.description, access: r.access }))
  const next = mode === 'stuck' ? offset : (offset + limit < rows.length ? offset + limit : undefined)
  const total = mode === 'short' ? rows.length + 50 : rows.length
  console.log(JSON.stringify({ ok: true, data: { commands: page, total, ...next !== undefined ? { nextOffset: next } : {} } })); process.exit(0)
}
if (argv.includes('--help') && argv[0] !== 'browser') {
  if (mode === 'help-fails' && argv[1] === 'search') { console.error('boom'); process.exit(1) }
  console.log(fs.readFileSync(path.join(__dirname, 'help.json'), 'utf8')); process.exit(0)
}
if (argv[0] === 'nosuchsite') fail('unknown_command', 'Unknown command: nosuchsite', 'Use opencli list <query> to find a capability.')
console.log(major === 2 ? JSON.stringify({ ok: true, data: [{ title: 'result' }] }) : JSON.stringify([{ title: 'result' }]))
`)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@jackwener/opencli', version: major === 2 ? '2.0.3' : '1.8.8', bin: { opencli: 'main.js' } }))
  const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string[]) : []
  return { dir, calls }
}

async function withFake<T>(major: 1 | 2, mode: string, body: (fake: ReturnType<typeof fakeOpencli>, service: BrowserService) => Promise<T>, commands?: number): Promise<T> {
  const fake = fakeOpencli(major, commands)
  const previous = { path: process.env.DSH_BROWSER_OPENCLI, mode: process.env.FAKE_MODE }
  process.env.DSH_BROWSER_OPENCLI = fake.dir
  process.env.FAKE_MODE = mode
  try {
    const service = new BrowserService(resolveConfig({ enabled: true, opencliEnabled: true, autoInstall: false, usagePolicy: { minDelayMs: 0, burst: 20 } } as never))
    return await body(fake, service)
  } finally {
    if (previous.path === undefined) delete process.env.DSH_BROWSER_OPENCLI; else process.env.DSH_BROWSER_OPENCLI = previous.path
    if (previous.mode === undefined) delete process.env.FAKE_MODE; else process.env.FAKE_MODE = previous.mode
  }
}

test('2.x is supported: available, no warning, version reported', async () => {
  await withFake(2, '', async (_fake, service) => {
    assert.equal(opencliSupport().state, 'ok')
    assert.equal(service.opencliAvailable(), true)
    const status = await service.status()
    assert.equal(status.opencliVersion, '2.0.3')
    assert.equal(status.opencliUnsupported, undefined)
    assert.equal(status.runtimeWarnings.some(text => /OpenCLI/.test(text)), false)
  })
  assert.equal(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).peerDependencies['@jackwener/opencli'], '>=1.8.0 <3')
})

test('2.x catalog: every page is read once (100 per page), cached, and a short answer is filled in from --help', async () => {
  await withFake(2, '', async (fake, service) => {
    const zhihu = await service.opencliCatalog({ site: 'zhihu' })
    assert.deepEqual(zhihu.map(item => item.command), ['zhihu hot', 'zhihu question', 'zhihu search'])
    const lists = fake.calls().filter(call => call[0] === 'list')
    assert.deepEqual(lists.map(call => call.slice(call.indexOf('--limit'))), [['--limit', '100', '--offset', '0'], ['--limit', '100', '--offset', '100'], ['--limit', '100', '--offset', '200']])
    const search = zhihu.find(item => item.name === 'search')!
    assert.deepEqual(search.args.map(arg => (arg as { name: string }).name), ['query', 'limit', 'type'])
    assert.equal(search.domain, 'www.zhihu.com')
    assert.equal(search.strategy, '', '2.x has no strategy')
    const helps = () => fake.calls().filter(call => call.includes('--help'))
    assert.equal(helps().length, 3)
    assert.deepEqual(helps()[0]!.slice(-3), ['--help', '-f', 'json'])
    await service.opencliCatalog({ site: 'zhihu' })
    assert.equal(fake.calls().filter(call => call[0] === 'list').length, 3, 'the catalog is cached')
    assert.equal(helps().length, 3, 'help is cached per command')
    const wide = await service.opencliCatalog({ query: 'adapter', limit: 11 })
    assert.equal(wide.length, 11)
    assert.equal(wide.every(item => item.args.length === 0), true, 'more than 10 matches: no help calls')
    assert.equal(helps().length, 3)
  })
})

test('2.x catalog: help for one command failing leaves that item without arguments and does not fail the call', async () => {
  await withFake(2, 'help-fails', async (_fake, service) => {
    const items = await service.opencliCatalog({ site: 'zhihu' })
    assert.equal(items.length, 3)
    assert.equal(items.find(item => item.name === 'search')!.args.length, 0)
    assert.ok(items.find(item => item.name === 'hot')!.args.length > 0)
  })
})

test('2.x catalog: a failing, malformed, stuck or short page is an error, never a short catalog (and the next call tries again)', async () => {
  await withFake(2, 'page2-fails', async (_fake, service) => {
    await assert.rejects(() => service.opencliCatalog({}), /OpenCLI catalog failed: internal: page two exploded \(try later\)/)
  })
  await withFake(2, 'page2-garbage', async (_fake, service) => {
    await assert.rejects(() => service.opencliCatalog({}), /valid JSON/)
  })
  await withFake(2, 'stuck', async (_fake, service) => {
    await assert.rejects(() => service.opencliCatalog({}), /did not advance/)
  })
  await withFake(2, 'short', async (_fake, service) => {
    await assert.rejects(() => service.opencliCatalog({}), /ended early: 230 of 280/)
  })
  await withFake(2, 'page2-fails', async (fake, service) => {
    await assert.rejects(() => service.opencliCatalog({}))
    process.env.FAKE_MODE = ''
    assert.equal((await service.opencliCatalog({ site: 'zhihu', limit: 100 })).length, 3)
    assert.equal(fake.calls().filter(call => call[0] === 'list').length, 5)
  })
})

test('catalog: the first caller giving up does not fail the others, and local metadata does not wait behind the site pacing', async () => {
  await withFake(2, '', async (fake, service) => {
    const ac = new AbortController()
    const first = service.opencliCatalog({ site: 'zhihu' }, ac.signal)
    const second = service.opencliCatalog({ site: 'zhihu' })
    setTimeout(() => ac.abort(), 20)
    await assert.rejects(first, /aborted while waiting for the OpenCLI catalog/)
    assert.equal((await second).length, 3)
    assert.equal(fake.calls().filter(call => call[0] === 'list').length, 3, 'one shared load')
    await assert.rejects(service.opencliCatalog({}, AbortSignal.abort()).then(() => { throw new Error('cached: no wait') }), /cached: no wait/)
  })
  const fake = fakeOpencli(2)
  const previous = process.env.DSH_BROWSER_OPENCLI
  process.env.DSH_BROWSER_OPENCLI = fake.dir
  try {
    // one start per 60 s: three pages through the pacing would take minutes
    const paced = new BrowserService(resolveConfig({ enabled: true, opencliEnabled: true, autoInstall: false, usagePolicy: { minDelayMs: 60_000, burst: 1 } } as never))
    assert.equal((await paced.opencliCatalog({ site: 'zhihu' })).length, 3)
    assert.equal(fake.calls().filter(call => call[0] === 'list').length, 3)
  } finally { if (previous === undefined) delete process.env.DSH_BROWSER_OPENCLI; else process.env.DSH_BROWSER_OPENCLI = previous }
})

test('1.8 catalog: one array call, arguments already there, no help calls', async () => {
  await withFake(1, '', async (fake, service) => {
    const items = await service.opencliCatalog({ site: 'zhihu' })
    assert.deepEqual(items.map(item => item.command), ['zhihu/hot', 'zhihu/question', 'zhihu/search'])
    assert.equal(items[0]!.strategy, 'cookie')
    assert.equal((items[0]!.args[0] as { name: string }).name, 'q')
    assert.deepEqual(fake.calls().map(call => call.join(' ')), ['list -f json'])
  })
})

test('opencli.run: a 2.x failure line becomes code, message and hint; a success envelope passes through unchanged; 1.8 text stays text', async () => {
  const run = findAction('opencli.run')!
  await withFake(2, '', async (_fake, service) => {
    const ctx = { service, signal: new AbortController().signal } as never
    const failed = await run.execute({ args: ['nosuchsite', 'foo'] } as never, ctx) as any
    assert.equal(failed.code, 2)
    assert.deepEqual(failed.error, { code: 'unknown_command', message: 'Unknown command: nosuchsite', hint: 'Use opencli list <query> to find a capability.' })
    assert.match(failed.output, /unknown_command/)
    const ok = await run.execute({ args: ['site1', 'cmd30', '-f', 'json'] } as never, ctx) as any
    assert.equal(ok.code, 0)
    assert.equal(ok.error, undefined)
    assert.deepEqual(JSON.parse(ok.output), { ok: true, data: [{ title: 'result' }] })
  })
  await withFake(1, '', async (_fake, service) => {
    const failed = await run.execute({ args: ['nosuchsite', 'foo'] } as never, { service, signal: new AbortController().signal } as never) as any
    assert.equal(failed.code, 1)
    assert.equal(failed.error, undefined)
    assert.match(failed.output, /unknown command|error: Unknown command/)
  })
})

test('the action text names the session form by version, in one short sentence', () => {
  const run = findAction('opencli.run')!
  assert.match(run.notes!, /positional on 1\.8.*--session research.*2\.x.*opencliVersion/)
})
