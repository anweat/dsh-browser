import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Config, resolveConfig } from '../src/config.ts'
import {
  differingContextOptions, effectiveContextOptions, resolveCallOptions, resolveContextDefaults, sameContextOptions, toPlaywrightOptions,
} from '../src/context-options.ts'
import { ActionArgError } from '../src/actions/types.ts'

test('no configuration keeps today\'s behaviour: nothing is passed to newContext', () => {
  const { options, warnings } = resolveContextDefaults({})
  assert.deepEqual(options, {})
  assert.deepEqual(warnings, [])
  assert.deepEqual(toPlaywrightOptions(options), {})
  const resolved = resolveConfig({} as never)
  assert.deepEqual(resolved.contextDefaults, {})
  assert.deepEqual(resolved.configWarnings, [])
})

test('viewport modes: window passes nothing, presets and custom pass a size', () => {
  assert.deepEqual(resolveContextDefaults({ viewportMode: 'window' }).options, {})
  assert.deepEqual(resolveContextDefaults({ viewportMode: '720p' }).options.viewport, { width: 1280, height: 720 })
  assert.deepEqual(resolveContextDefaults({ viewportMode: '1080p' }).options.viewport, { width: 1920, height: 1080 })
  assert.deepEqual(resolveContextDefaults({ viewportMode: 'custom', viewportWidth: 800, viewportHeight: 600 }).options.viewport, { width: 800, height: 600 })
})

test('invalid viewport configuration never throws: the key falls back and the warning names key, value, reason and fix', () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ viewportMode: 'huge' }, /config viewportMode="huge" was ignored: viewportMode must be one of: window, 720p, 1080p, custom/],
    [{ viewportMode: 'custom' }, /viewportMode="custom" was ignored: viewportMode=custom requires both viewportWidth and viewportHeight/],
    [{ viewportMode: 'custom', viewportWidth: 800 }, /requires both viewportWidth and viewportHeight/],
    [{ viewportMode: 'custom', viewportWidth: 10, viewportHeight: 600 }, /viewport width must be an integer from 200 to 7680/],
    [{ viewportMode: 'custom', viewportWidth: 800, viewportHeight: 9000 }, /viewport height must be an integer from 200 to 4320/],
    [{ viewportMode: 'custom', viewportWidth: 800.5, viewportHeight: 600 }, /integer/],
  ]
  for (const [input, why] of cases) {
    const { options, warnings } = resolveContextDefaults(input)
    assert.equal(options.viewport, undefined, JSON.stringify(input) + ': the default window applies')
    assert.equal(warnings.length, 1, JSON.stringify(input))
    assert.match(warnings[0]!, why)
    assert.match(warnings[0]!, /Fix: /)
  }
})

test('a size under a non-custom mode, and a bypass list without a proxy, are warned about and ignored', () => {
  const sized = resolveContextDefaults({ viewportMode: '720p', viewportWidth: 800, viewportHeight: 600 })
  assert.deepEqual(sized.options.viewport, { width: 1280, height: 720 })
  assert.match(sized.warnings[0]!, /only apply with viewportMode=custom/)
  const bypass = resolveContextDefaults({ proxyBypass: 'example.com' })
  assert.equal(bypass.options.proxy, undefined)
  assert.match(bypass.warnings[0]!, /proxyBypass is ignored/)
})

test('userAgent, locale and timezoneId are validated', () => {
  assert.equal(resolveContextDefaults({ userAgent: ' Mozilla/5.0 test ' }).options.userAgent, 'Mozilla/5.0 test')
  const refused = (input: Record<string, unknown>, key: string, why: RegExp) => {
    const { options, warnings } = resolveContextDefaults(input)
    assert.deepEqual(options, {}, key + ' falls back to the browser default')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, new RegExp(`config ${key}=`))
    assert.match(warnings[0]!, why)
  }
  refused({ userAgent: 'a\nb' }, 'userAgent', /1 to 512 characters without control characters/)
  refused({ userAgent: 'x'.repeat(513) }, 'userAgent', /userAgent/)
  assert.equal(resolveContextDefaults({ locale: 'zh-cn' }).options.locale, 'zh-CN')
  refused({ locale: 'not a locale' }, 'locale', /is not a valid BCP 47/)
  assert.equal(resolveContextDefaults({ timezoneId: 'Asia/Shanghai' }).options.timezoneId, 'Asia/Shanghai')
  refused({ timezoneId: 'Mars/Olympus' }, 'timezoneId', /is not a known IANA time zone/)
})

test('proxyServer: schemes are limited, credentials are refused, a bare host:port means http', () => {
  assert.deepEqual(resolveContextDefaults({ proxyServer: 'http://127.0.0.1:7890' }).options.proxy, { server: 'http://127.0.0.1:7890' })
  assert.deepEqual(resolveContextDefaults({ proxyServer: '127.0.0.1:7890' }).options.proxy, { server: 'http://127.0.0.1:7890' })
  assert.deepEqual(resolveContextDefaults({ proxyServer: 'socks5://10.0.0.1:1080', proxyBypass: ' a.com , .b.test ' }).options.proxy, { server: 'socks5://10.0.0.1:1080', bypass: 'a.com,.b.test' })
  const refused = (input: string, why: RegExp) => {
    const { options, warnings } = resolveContextDefaults({ proxyServer: input, proxyBypass: 'a.com' })
    assert.equal(options.proxy, undefined, input + ': no proxy is used')
    assert.match(warnings[0]!, why)
    assert.match(warnings[0]!, /config proxyServer=/)
    assert.match(warnings.join('\n'), /proxyBypass is ignored/)
    assert.equal(/user(:pass)?@/.test(warnings.join('\n')), false, 'credentials are never echoed into a warning')
  }
  refused('http://user:pass@127.0.0.1:7890', /must not contain credentials/)
  refused('http://user@127.0.0.1:7890', /must not contain credentials/)
  refused('ftp://127.0.0.1:21', /scheme must be one of/)
  refused('http://127.0.0.1:7890/path', /without a path/)
  assert.deepEqual(toPlaywrightOptions({ proxy: { server: 'http://p:1', bypass: 'x.com' } }), { proxy: { server: 'http://p:1', bypass: 'x.com' } })
})

test('the nested spellings and bad values never stop the plugin from loading: the key falls back and runtime.status shows why', () => {
  const parse = (value: Record<string, unknown>) => (Config as unknown as (value: unknown) => never)(value)
  const warningsOf = (value: Record<string, unknown>) => resolveConfig(parse(value)).configWarnings
  assert.match(warningsOf({ viewport: { width: 1280, height: 720 } })[0]!, /"viewport" is not a setting and was ignored; use viewportMode/)
  assert.match(warningsOf({ proxy: { server: 'http://p:1' } })[0]!, /"proxy" is not a setting and was ignored; use proxyServer and proxyBypass/)
  assert.match(warningsOf({ contextOptions: {} })[0]!, /"contextOptions" is not a setting/)
  assert.match(warningsOf({ downloads: { dir: '/x' } })[0]!, /use downloadDir and downloadMaxBytes/)
  const resolved = resolveConfig(parse({ viewport: { width: 1, height: 2 }, proxyServer: 'ftp://h:1', viewportMode: 'custom', downloadDir: 'relative/dir', downloadMaxBytes: 0, locale: 'zh-CN' }))
  assert.deepEqual(resolved.contextDefaults, { locale: 'zh-CN' }, 'only the valid key survives')
  assert.equal(resolved.downloadMaxBytes, 100 * 1024 * 1024)
  assert.match(resolved.downloadDir.replaceAll('\\', '/'), /data\/browser\/downloads$/)
  assert.equal(resolved.configWarnings.length, 5, resolved.configWarnings.join('\n'))
  for (const key of ['viewport', 'proxyServer', 'viewportMode', 'downloadDir', 'downloadMaxBytes']) assert.ok(resolved.configWarnings.some(warning => warning.includes(key)), key)
  const ok = resolveConfig(parse({ viewportMode: 'custom', viewportWidth: 1000, viewportHeight: 700, proxyServer: '127.0.0.1:8080', locale: 'en-US' }))
  assert.deepEqual(ok.contextDefaults, { viewport: { width: 1000, height: 700 }, locale: 'en-US', proxy: { server: 'http://127.0.0.1:8080' } })
  assert.deepEqual(ok.configWarnings, [])
})

test('downloadDir must be absolute and downloadMaxBytes bounded; defaults are 100 MiB under DSH_HOME', () => {
  const resolved = resolveConfig({} as never)
  assert.equal(resolved.downloadMaxBytes, 100 * 1024 * 1024)
  assert.match(resolved.downloadDir.replaceAll('\\', '/'), /data\/browser\/downloads$/)
  const relative = resolveConfig({ downloadDir: 'relative/dir' } as never)
  assert.match(relative.configWarnings[0]!, /config downloadDir="relative\/dir" was ignored: .*absolute/)
  assert.equal(relative.downloadDir, resolved.downloadDir)
  assert.match(resolveConfig({ downloadMaxBytes: 0 } as never).configWarnings[0]!, /downloadMaxBytes=0 was ignored: it must be an integer/)
  assert.match(resolveConfig({ downloadMaxBytes: 1.5 } as never).configWarnings[0]!, /downloadMaxBytes/)
  const set = resolveConfig({ downloadDir: process.platform === 'win32' ? 'C:\\dl' : '/var/dl', downloadMaxBytes: 5000 } as never)
  assert.equal(set.downloadMaxBytes, 5000)
  assert.deepEqual(set.configWarnings, [])
})

test('per-call options are validated as INVALID_ARGS', () => {
  assert.deepEqual(resolveCallOptions(undefined), {})
  assert.deepEqual(resolveCallOptions({ viewport: { width: 390, height: 844 }, locale: 'en-US' }), { viewport: { width: 390, height: 844 }, locale: 'en-US' })
  for (const bad of [
    { viewport: { width: 5, height: 600 } }, { viewport: { width: 800 } }, { userAgent: '' }, { locale: '??' }, { timezoneId: 'Nope/Zone' }, { proxyServer: 'http://u:p@h:1' },
  ]) {
    assert.throws(() => resolveCallOptions(bad as never), ActionArgError, JSON.stringify(bad))
  }
})

test('options compare field by field; a per-call proxy replaces the configured one as a whole', () => {
  const defaults = { viewport: { width: 1280, height: 720 }, proxy: { server: 'http://a:1', bypass: 'x.com' } }
  assert.equal(sameContextOptions(defaults, { ...defaults }), true)
  assert.equal(sameContextOptions({}, {}), true)
  assert.equal(sameContextOptions(defaults, { ...defaults, viewport: { width: 1280, height: 721 } }), false)
  assert.deepEqual(differingContextOptions(defaults, { ...defaults, locale: 'en-US', userAgent: 'u' }), ['userAgent', 'locale'])
  const merged = effectiveContextOptions(defaults, { proxy: { server: 'http://b:2' } })
  assert.deepEqual(merged.proxy, { server: 'http://b:2' })
  assert.deepEqual(merged.viewport, { width: 1280, height: 720 })
  assert.deepEqual(differingContextOptions(defaults, merged), ['proxyServer'])
})

test('the plugin applies and registers its tools with a configuration that used to stop it from loading', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: plugin } = await import('../src/index.ts')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-badcfg-'))
  const registered: string[] = []
  const ctx = new Context()
  ctx.provide('tools', { register(tool: { name: string }) { registered.push(tool.name); return () => {} } })
  // The raw object: cordis parses it with the plugin's own schema, as the Host does.
  const config = ({
    snapshotDir: path.join(dir, 'snap'), downloadDir: 'relative/dir', browserDataDir: path.join(dir, 'data'),
    viewportMode: 'custom', proxyServer: 'ftp://127.0.0.1:1', timezoneId: 'Mars/Base', downloadMaxBytes: 0, viewportWidth: 1, proxy: { server: 'x' },
  }) as never
  const fiber = ctx.plugin(plugin as never, config)
  await new Promise(resolve => setTimeout(resolve, 60))
  try {
    assert.deepEqual(registered.sort(), ['browser_call', 'browser_index'])
  } finally { fiber.dispose() }
})

test('contextSources tags each value of the applied set with where it came from', async () => {
  const { contextSources, describeDefaultsLine } = await import('../src/context-options.ts')
  const defaults = { viewport: { width: 1280, height: 720 }, locale: 'en-US', proxy: { server: 'http://p:1' } }
  const applied = { viewport: { width: 390, height: 844 }, locale: 'en-US', userAgent: 'Mobile/1', proxy: { server: 'http://p:1' }, timezoneId: 'UTC' }
  assert.deepEqual(contextSources(applied, defaults, { viewport: { width: 390, height: 844 } }), { viewport: 'call', locale: 'default', userAgent: 'session', proxyServer: 'default', timezoneId: 'session' })
  assert.deepEqual(contextSources(defaults, defaults, {}), { viewport: 'default', locale: 'default', proxyServer: 'default' })
  assert.deepEqual(contextSources({}, defaults, {}), {})
  const line = describeDefaultsLine(defaults)
  assert.match(line, /viewport 1280x720/)
  assert.match(line, /locale en-US/)
  assert.match(line, /proxyServer http:\/\/p:1/)
  assert.match(line, /userAgent browser's own/)
  assert.match(line, /give only the keys you change/)
  assert.match(describeDefaultsLine({ userAgent: 'x'.repeat(200) }), /userAgent "x{57}\.\.\."/)
})
