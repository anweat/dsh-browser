import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROPERTY_FIELDS, checkProperties, commentOutProperty, parseProperties, quoteValue, serializeProperties, unquote, validateProperty,
} from '../src/client/properties-form.ts'
import { Config } from '../src/config.ts'

const field = (key: string) => PROPERTY_FIELDS.find(entry => entry.key === key)!

test('every default-value field of the schema is a property, and none is listed twice', () => {
  const dict = (Config as unknown as { dict: Record<string, unknown> }).dict
  const properties = PROPERTY_FIELDS.map(entry => entry.key)
  assert.equal(new Set(properties).size, properties.length)
  for (const key of properties) assert.ok(dict[key], `${key} is a Config field`)
  const switches = ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled']
  const policies = ['usagePolicy', 'automationAssets', 'prompts', 'authProfiles', 'rulePacks']
  const misplaced = ['viewport', 'proxy', 'contextOptions', 'download', 'downloads']
  const everything = Object.keys(dict).filter(key => ![...switches, ...policies, ...misplaced].includes(key))
  assert.deepEqual(properties.toSorted(), everything.toSorted(), 'the properties are exactly the fields that are neither switches nor policies')
})

test('parse: comments and blank lines are ignored, the value is everything after the first =, one pair of quotes is removed', () => {
  const parsed = parseProperties([
    '# a comment', '', '   # an indented comment',
    'userAgent = Mozilla/5.0 (X11; a=b; c==d)',
    'locale="en-US"',
    '  timezoneId   =   Asia/Shanghai  ',
    'proxyBypass = "  a.com, b.com  "',
    'args = ["--a=1","--b"]',
    'downloadDir =',
    'viewportMode = custom # not a comment: the # is part of the value',
  ].join('\n'))
  assert.deepEqual(parsed.issues, [])
  const value = (key: string) => parsed.values.get(key)?.value
  assert.equal(value('userAgent'), 'Mozilla/5.0 (X11; a=b; c==d)')
  assert.equal(value('locale'), 'en-US')
  assert.equal(value('timezoneId'), 'Asia/Shanghai')
  assert.equal(value('proxyBypass'), '  a.com, b.com  ')
  assert.equal(value('args'), '["--a=1","--b"]')
  assert.equal(parsed.values.has('downloadDir'), false, 'a blank value is not an override')
  assert.equal(value('viewportMode'), 'custom # not a comment: the # is part of the value')
  assert.equal(parsed.values.get('timezoneId')!.line, 6)
})

test('parse: problems are reported with their line and key; unknown and elsewhere-edited keys are warnings, never silently dropped', () => {
  const parsed = parseProperties(['locale = en-US', 'no equals here', '= value', 'bad key = 1', 'bogus = 1', 'enabled = false', 'usagePolicy = {}', 'locale = de-DE'].join('\n'))
  const byLine = (line: number) => parsed.issues.filter(issue => issue.line === line)
  assert.equal(byLine(2)[0]!.level, 'error')
  assert.match(byLine(2)[0]!.message, /line 2: expected "key = value"/)
  assert.equal(byLine(3)[0]!.level, 'error')
  assert.equal(byLine(4)[0]!.level, 'error')
  assert.match(byLine(4)[0]!.message, /not a setting name/)
  assert.deepEqual([byLine(5)[0]!.level, byLine(5)[0]!.key], ['warning', 'bogus'])
  assert.match(byLine(5)[0]!.message, /unknown setting "bogus" is ignored/)
  assert.match(byLine(6)[0]!.message, /enabled is not a default parameter; it is edited in the "automation freedom" controls/)
  assert.match(byLine(7)[0]!.message, /usage buffer JSON box/)
  assert.match(byLine(8)[0]!.message, /locale is already set on line 1; this later line is the one used/)
  assert.equal(parsed.values.get('locale')!.value, 'de-DE')
  assert.equal(parsed.values.has('bogus'), false)
})

test('round trip: printed text parses back to the same values, whatever the values contain', () => {
  const views = [
    { key: 'userAgent', text: 'Mozilla/5.0 (a=b)', overridden: true },
    { key: 'proxyBypass', text: ' padded ', overridden: true },
    { key: 'locale', text: '"quoted"', overridden: true },
    { key: 'args', text: '["--disable-gpu","--lang=en-US"]', overridden: true },
    { key: 'maxSessions', text: '12', overridden: true },
    { key: 'headless', text: 'false', overridden: true },
    { key: 'timezoneId', text: 'Asia/Shanghai', overridden: false },
    { key: 'verbose', text: 'false', overridden: false },
  ]
  const text = serializeProperties(views)
  const parsed = parseProperties(text)
  assert.deepEqual(parsed.issues, [])
  assert.deepEqual([...parsed.values].map(([key, entry]) => [key, entry.value]).sort(), views.filter(view => view.overridden).map(view => [view.key, view.text]).sort())
  // The rest are comments showing the value in force, or its default.
  assert.match(text, /^# timezoneId = Asia\/Shanghai$/m)
  assert.match(text, /^# channel = chromium$/m, 'no view: the plugin default is shown')
  assert.match(text, /^# viewportMode = window$/m)
  assert.match(text, /^# executablePath =$/m, 'no default and no value: just the key')
  assert.equal(text.endsWith('\n'), true)
  // Every field appears exactly once, as a line or as a comment.
  for (const entry of PROPERTY_FIELDS) assert.equal([...text.matchAll(new RegExp(`^#? ?${entry.key} =`, 'gm'))].length, 1, entry.key)
  // And a second round trip is stable.
  const again = serializeProperties(PROPERTY_FIELDS.map(entry => ({ key: entry.key, text: parsed.values.get(entry.key)?.value ?? '', overridden: parsed.values.has(entry.key) })))
  assert.deepEqual([...parseProperties(again).values], [...parsed.values].map(([key, entry]) => [key, { value: entry.value, line: parseProperties(again).values.get(key)!.line }]))
})

test('quoting only where a bare value would not survive', () => {
  assert.equal(quoteValue('plain'), 'plain')
  assert.equal(quoteValue(' padded'), '" padded"')
  assert.equal(quoteValue('"already"'), '""already""')
  assert.equal(unquote(quoteValue('"already"')), '"already"')
  assert.equal(unquote('"a"'), 'a')
  assert.equal(unquote('"'), '"')
  assert.equal(unquote('a"'), 'a"')
})

test('commentOutProperty turns the lines that set one key into a comment and leaves the rest alone', () => {
  const text = '# header\nlocale = de-DE\nuserAgent = X\n# locale = old\n'
  assert.equal(commentOutProperty(text, 'locale', 'en-US'), '# header\n# locale = en-US\nuserAgent = X\n# locale = old\n')
  assert.equal(commentOutProperty(text, 'locale', ''), '# header\n# locale =\nuserAgent = X\n# locale = old\n')
  assert.equal(commentOutProperty(text, 'verbose', 'false'), text)
})

test('values are validated by kind, with the reason', () => {
  const refused: [string, string, RegExp][] = [
    ['headless', 'yes', /must be true or false/], ['browserRuntime', 'firefox', /must be one of: playwright, patchright/],
    ['viewportMode', 'huge', /must be one of: window, 720p, 1080p, custom/], ['maxSessions', '0', /whole number from 1 to 64/], ['maxSessions', '2.5', /whole number/],
    ['cdpPort', '70000', /whole number from 1 to 65535/], ['args', '--x', /JSON array of non-empty strings/], ['args', '["a",3]', /JSON array/], ['args', '[]', /JSON array/],
    ['proxyServer', 'ftp://h', /scheme must be one of/], ['downloadDir', 'rel', /absolute/], ['locale', 'nope nope', /BCP 47/], ['downloadMaxBytes', '0', /whole number from 1/],
  ]
  for (const [key, value, why] of refused) assert.match(validateProperty(field(key), value) ?? '', why, `${key} = ${value}`)
  const fine: [string, string][] = [
    ['headless', 'false'], ['browserRuntime', 'patchright'], ['viewportMode', '1080p'], ['maxSessions', '64'], ['cdpPort', '9222'], ['args', '["--a"]'],
    ['proxyServer', 'socks5://127.0.0.1:1080'], ['downloadDir', '/var/downloads'], ['downloadDir', 'C:\\dl'], ['channel', 'chrome'], ['executablePath', '/usr/bin/chrome'],
  ]
  for (const [key, value] of fine) assert.equal(validateProperty(field(key), value), undefined, `${key} = ${value}`)
})

test('checkProperties: value errors carry their line; a custom viewport needs both sizes, counting the deployed ones', () => {
  const text = ['viewportMode = custom', 'viewportWidth = 800', 'headless = maybe'].join('\n')
  const parsed = parseProperties(text)
  const issues = checkProperties(parsed, () => '')
  assert.deepEqual(issues.map(issue => [issue.line, issue.level, issue.key]), [[1, 'error', 'viewportHeight'], [3, 'error', 'headless']])
  assert.match(issues[0]!.message, /line 1: viewportMode=custom needs viewportHeight/)
  assert.match(issues[1]!.message, /^line 3: headless must be true or false$/)
  // The height comes from the deployed configuration: no problem.
  assert.deepEqual(checkProperties(parseProperties('viewportMode = custom\nviewportWidth = 800'), key => key === 'viewportHeight' ? '600' : ''), [])
  // custom with nothing at all, from the deployed mode: attributed to the sizes that are missing (no line to point at).
  const bare = checkProperties(parseProperties(''), key => key === 'viewportMode' ? 'custom' : '')
  assert.deepEqual(bare.map(issue => issue.key).sort(), ['viewportHeight', 'viewportWidth'])
})
