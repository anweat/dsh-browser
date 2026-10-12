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

test('invalid viewport configuration is an error that names the key, never silently ignored', () => {
  assert.throws(() => resolveContextDefaults({ viewportMode: 'huge' }), /viewportMode must be one of: window, 720p, 1080p, custom/)
  assert.throws(() => resolveContextDefaults({ viewportMode: 'custom' }), /requires both viewportWidth and viewportHeight/)
  assert.throws(() => resolveContextDefaults({ viewportMode: 'custom', viewportWidth: 800 }), /requires both/)
  assert.throws(() => resolveContextDefaults({ viewportMode: 'custom', viewportWidth: 10, viewportHeight: 600 }), /viewport width must be an integer from 200 to 7680/)
  assert.throws(() => resolveContextDefaults({ viewportMode: 'custom', viewportWidth: 800, viewportHeight: 9000 }), /viewport height must be an integer from 200 to 4320/)
  assert.throws(() => resolveContextDefaults({ viewportMode: 'custom', viewportWidth: 800.5, viewportHeight: 600 }), /integer/)
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
  assert.throws(() => resolveContextDefaults({ userAgent: 'a\nb' }), /userAgent must be 1 to 512 characters without control characters/)
  assert.throws(() => resolveContextDefaults({ userAgent: 'x'.repeat(513) }), /userAgent/)
  assert.equal(resolveContextDefaults({ locale: 'zh-cn' }).options.locale, 'zh-CN')
  assert.throws(() => resolveContextDefaults({ locale: 'not a locale' }), /locale "not a locale" is not a valid BCP 47/)
  assert.equal(resolveContextDefaults({ timezoneId: 'Asia/Shanghai' }).options.timezoneId, 'Asia/Shanghai')
  assert.throws(() => resolveContextDefaults({ timezoneId: 'Mars/Olympus' }), /timezoneId "Mars\/Olympus" is not a known IANA time zone/)
})

test('proxyServer: schemes are limited, credentials are refused, a bare host:port means http', () => {
  assert.deepEqual(resolveContextDefaults({ proxyServer: 'http://127.0.0.1:7890' }).options.proxy, { server: 'http://127.0.0.1:7890' })
  assert.deepEqual(resolveContextDefaults({ proxyServer: '127.0.0.1:7890' }).options.proxy, { server: 'http://127.0.0.1:7890' })
  assert.deepEqual(resolveContextDefaults({ proxyServer: 'socks5://10.0.0.1:1080', proxyBypass: ' a.com , .b.test ' }).options.proxy, { server: 'socks5://10.0.0.1:1080', bypass: 'a.com,.b.test' })
  assert.throws(() => resolveContextDefaults({ proxyServer: 'http://user:pass@127.0.0.1:7890' }), /must not contain credentials/)
  assert.throws(() => resolveContextDefaults({ proxyServer: 'http://user@127.0.0.1:7890' }), /must not contain credentials/)
  assert.throws(() => resolveContextDefaults({ proxyServer: 'ftp://127.0.0.1:21' }), /scheme must be one of/)
  assert.throws(() => resolveContextDefaults({ proxyServer: 'http://127.0.0.1:7890/path' }), /without a path/)
  assert.deepEqual(toPlaywrightOptions({ proxy: { server: 'http://p:1', bypass: 'x.com' } }), { proxy: { server: 'http://p:1', bypass: 'x.com' } })
})

test('the nested spellings fail loudly in resolveConfig instead of being dropped, including through schema parsing', () => {
  const parse = (value: Record<string, unknown>) => (Config as unknown as (value: unknown) => never)(value)
  assert.throws(() => resolveConfig(parse({ viewport: { width: 1280, height: 720 } })), /"viewport" is not a setting; use viewportMode/)
  assert.throws(() => resolveConfig(parse({ proxy: { server: 'http://p:1' } })), /"proxy" is not a setting; use proxyServer and proxyBypass/)
  assert.throws(() => resolveConfig(parse({ contextOptions: {} })), /"contextOptions" is not a setting/)
  assert.throws(() => resolveConfig(parse({ downloads: { dir: '/x' } })), /use downloadDir and downloadMaxBytes/)
  const ok = resolveConfig(parse({ viewportMode: 'custom', viewportWidth: 1000, viewportHeight: 700, proxyServer: '127.0.0.1:8080', locale: 'en-US' }))
  assert.deepEqual(ok.contextDefaults, { viewport: { width: 1000, height: 700 }, locale: 'en-US', proxy: { server: 'http://127.0.0.1:8080' } })
})

test('downloadDir must be absolute and downloadMaxBytes bounded; defaults are 100 MiB under DSH_HOME', () => {
  const resolved = resolveConfig({} as never)
  assert.equal(resolved.downloadMaxBytes, 100 * 1024 * 1024)
  assert.match(resolved.downloadDir.replaceAll('\\', '/'), /data\/browser\/downloads$/)
  assert.throws(() => resolveConfig({ downloadDir: 'relative/dir' } as never), /downloadDir must be an absolute directory path/)
  assert.throws(() => resolveConfig({ downloadMaxBytes: 0 } as never), /downloadMaxBytes must be an integer/)
  assert.throws(() => resolveConfig({ downloadMaxBytes: 1.5 } as never), /downloadMaxBytes/)
  const set = resolveConfig({ downloadDir: process.platform === 'win32' ? 'C:\\dl' : '/var/dl', downloadMaxBytes: 5000 } as never)
  assert.equal(set.downloadMaxBytes, 5000)
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
