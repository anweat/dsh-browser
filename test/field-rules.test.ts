import test from 'node:test'
import assert from 'node:assert/strict'
import { CHECKED_TEXT_FIELDS, crossFieldProblems, fieldProblem } from '../src/client/field-rules.ts'
import { resolveContextDefaults } from '../src/context-options.ts'
import { resolveConfig } from '../src/config.ts'

test('blank means "use the default" and is never a problem', () => {
  for (const field of CHECKED_TEXT_FIELDS) assert.equal(fieldProblem(field, ''), undefined, field)
  assert.equal(fieldProblem('proxyServer', '   '), undefined)
})

test('each checked field names why a value is refused', () => {
  const refused: [string, string, RegExp][] = [
    ['proxyServer', 'ftp://127.0.0.1:21', /scheme must be one of/],
    ['proxyServer', 'http://user:pw@127.0.0.1:1', /credentials/],
    ['proxyServer', 'http://127.0.0.1:7890/x', /without a path/],
    ['userAgent', 'a\nb', /control characters/],
    ['locale', 'not a locale', /BCP 47/],
    ['timezoneId', 'Mars/Base', /IANA time zone/],
    ['proxyBypass', 'x'.repeat(1001), /1000 characters/],
    ['downloadDir', 'relative/dir', /absolute directory path/],
    ['downloadDir', './x', /absolute/],
    ['viewportWidth', '5', /whole number from 200 to 7680/],
    ['viewportHeight', '9000', /whole number from 200 to 4320/],
    ['viewportWidth', '12.5', /whole number/],
    ['downloadMaxBytes', '0', /whole number from 1 to 10737418240/],
    ['downloadMaxBytes', 'lots', /whole number/],
  ]
  for (const [field, text, why] of refused) assert.match(fieldProblem(field, text) ?? '', why, `${field}=${JSON.stringify(text)}`)
  const fine: [string, string][] = [
    ['proxyServer', 'http://127.0.0.1:7890'], ['proxyServer', 'socks5://10.0.0.1:1080'], ['proxyServer', '127.0.0.1:7890'], ['userAgent', 'Mozilla/5.0 X'],
    ['locale', 'zh-CN'], ['timezoneId', 'Asia/Shanghai'], ['proxyBypass', 'a.com,.b.test'], ['downloadDir', '/var/dl'], ['downloadDir', 'C:\\Users\\x\\dl'],
    ['viewportWidth', '800'], ['downloadMaxBytes', '104857600'],
  ]
  for (const [field, text] of fine) assert.equal(fieldProblem(field, text), undefined, `${field}=${text}`)
})

test('custom viewport without a size is a cross-field problem on the missing fields; other modes are not', () => {
  assert.deepEqual(Object.keys(crossFieldProblems({ viewportMode: 'custom', viewportWidth: '', viewportHeight: '' })).sort(), ['viewportHeight', 'viewportWidth'])
  assert.deepEqual(Object.keys(crossFieldProblems({ viewportMode: 'custom', viewportWidth: '800', viewportHeight: '' })), ['viewportHeight'])
  assert.deepEqual(crossFieldProblems({ viewportMode: 'custom', viewportWidth: '800', viewportHeight: '600' }), {})
  assert.deepEqual(crossFieldProblems({ viewportMode: 'window', viewportWidth: '', viewportHeight: '' }), {})
  assert.deepEqual(crossFieldProblems({}), {})
})

test('the card and the server never disagree: what the card accepts the server uses, what the card refuses the server drops', () => {
  const samples: Record<string, string[]> = {
    userAgent: ['Mozilla/5.0', 'a\nb', 'x'.repeat(600)],
    locale: ['en-US', 'zh-cn', 'nope nope', 'e'],
    timezoneId: ['UTC', 'Asia/Shanghai', 'Mars/Base', 'Asia/Shanghai '],
    proxyServer: ['http://h:1', 'h:1', 'socks5://h:1', 'ftp://h:1', 'http://u:p@h:1', 'http://h:1/p', 'http://', '::'],
  }
  for (const [field, values] of Object.entries(samples)) {
    for (const value of values) {
      const server = resolveContextDefaults({ [field]: value } as never).warnings.length === 0
      const card = fieldProblem(field, value) === undefined
      assert.equal(card, server, `${field}=${JSON.stringify(value)}: card ${card ? 'accepts' : 'refuses'}, server ${server ? 'uses' : 'drops'} it`)
    }
  }
  for (const value of ['/var/dl', 'relative', 'C:\\dl', '']) {
    if (value === '') continue
    const server = process.platform === 'win32' || value.startsWith('/')
      ? resolveConfig({ downloadDir: value } as never).configWarnings.length === 0
      : undefined
    if (server !== undefined && !value.startsWith('C:')) assert.equal(fieldProblem('downloadDir', value) === undefined, server, value)
  }
})
