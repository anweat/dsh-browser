import test from 'node:test'
import assert from 'node:assert/strict'
import { OBSERVE_DEFAULT_BYTES, OBSERVE_DEFAULT_ITEMS, describeScan, fitObservation, normalizeObserve, scopeBase, type RawScan } from '../src/observe.ts'
import { fakePage } from './fake-page.ts'

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value))

test('normalizeObserve fills the defaults and refuses out-of-range limits', () => {
  const request = normalizeObserve({})
  assert.deepEqual([request.sections, request.maxItems, request.maxBytes, request.includeValues], [['content'], OBSERVE_DEFAULT_ITEMS, OBSERVE_DEFAULT_BYTES, false])
  assert.deepEqual(normalizeObserve({ sections: ['controls', 'controls', 'tables'] }).sections, ['controls', 'tables'])
  assert.throws(() => normalizeObserve({ sections: [] }), /at least one/)
  assert.throws(() => normalizeObserve({ sections: ['forms'] }), /unknown section "forms"/)
  assert.throws(() => normalizeObserve({ maxItems: 0 }), /maxItems/)
  assert.throws(() => normalizeObserve({ maxItems: 501 }), /maxItems/)
  assert.throws(() => normalizeObserve({ maxBytes: 100 }), /maxBytes/)
  assert.throws(() => normalizeObserve({ maxBytes: 95_000 }), /maxBytes/)
  assert.throws(() => normalizeObserve({ region: { x: 0, y: 0, width: 0, height: 5 } }), /region/)
  assert.throws(() => normalizeObserve({ timeoutMs: 0 }), /timeoutMs/)
})

function control(index: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { role: 'textbox', name: `Field ${index}`, type: 'text', locator: { role: 'textbox', name: `Field ${index}`, exact: true }, actions: ['fill', 'type', 'clear'], visible: true, disabled: false, source: 'dom', ...extra }
}

test('fitObservation drops whole items from the end, stays valid JSON, and says what is missing', () => {
  const controls = Array.from({ length: 80 }, (_, index) => control(index))
  const head = { url: 'http://x/', title: 'T', counts: { controls: 80 } }
  const fits = fitObservation({ head, controls }, 90_000, { controls: 80 }, 100)
  assert.equal(fits.truncation, undefined, 'nothing is cut when it fits')
  assert.equal((fits.record.controls as unknown[]).length, 80)

  const budget = 6_000
  const cut = fitObservation({ head, controls }, budget, { controls: 80 }, 100)
  const record = { ...cut.record, truncation: cut.truncation }
  assert.ok(bytes(record) <= budget, `${bytes(record)} bytes with the truncation record`)
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record)
  const kept = (cut.record.controls as { name: string }[])
  assert.ok(kept.length > 0 && kept.length < 80)
  assert.deepEqual(kept.map(entry => entry.name), controls.slice(0, kept.length).map(entry => entry.name), 'a prefix is kept; no item is half cut')
  assert.equal(cut.truncation!.omittedBySection.controls, 80 - kept.length)
  assert.match(cut.truncation!.reason, /maxBytes=6000 reached for controls/)
  assert.doesNotMatch(cut.truncation!.reason, /maxItems/)
})

test('fitObservation tells maxItems from maxBytes, and counts items the page had beyond the in-page cap', () => {
  // The page had 120 links; the scan listed 50 (maxItems) and they fit the byte budget.
  const links = Array.from({ length: 50 }, (_, index) => ({ text: `L${index}`, href: `http://x/${index}`, visible: true }))
  const cut = fitObservation({ head: {}, links }, 90_000, { links: 120 }, 50)
  assert.equal(cut.truncation!.omittedBySection.links, 70)
  assert.match(cut.truncation!.reason, /maxItems=50 reached for links/)
  assert.doesNotMatch(cut.truncation!.reason, /maxBytes/)
})

test('fitObservation cuts text at a character boundary and shares the budget with the lists', () => {
  const text = '𝒳'.repeat(20_000) + 'tail'
  const controls = Array.from({ length: 60 }, (_, index) => control(index))
  const cut = fitObservation({ head: { url: 'u' }, text, controls }, 10_000, { controls: 60 }, 100)
  const record = { ...cut.record, truncation: cut.truncation }
  assert.ok(bytes(record) <= 10_000)
  const out = cut.record.text as string
  assert.ok(out.length < text.length)
  assert.doesNotMatch(out, /[\ud800-\udbff]$/, 'a surrogate pair is never split')
  assert.deepEqual(JSON.parse(JSON.stringify(cut.record)).text, out)
  assert.ok((cut.record.controls as unknown[]).length >= 10, 'the lists keep a real share when text is huge')
  assert.equal(cut.truncation!.omittedBySection.content, text.length - out.length)
})

test('fitObservation drops table rows before tables and reports rows and tables separately', () => {
  const table = (name: string, rows: number) => ({ name, headers: ['a', 'b'], rows: Array.from({ length: rows }, (_, index) => [`r${index}`, 'x'.repeat(40)]), totalRows: rows, coverage: 'complete' })
  const tables = [table('one', 60), table('two', 3)]
  const cut = fitObservation({ head: {}, tables }, 2_500, { tables: 2 }, 100)
  const record = { ...cut.record, truncation: cut.truncation }
  assert.ok(bytes(record) <= 2_500)
  const kept = cut.record.tables as { name: string; rows: unknown[]; totalRows: number }[]
  assert.deepEqual(kept.map(entry => entry.name), ['one', 'two'], 'both tables survive; rows went first')
  assert.ok(kept[0]!.rows.length < 60)
  assert.equal(kept[0]!.totalRows, 60, 'totalRows still says how many the page has')
  assert.equal(cut.truncation!.omittedBySection.tableRows, 63 - kept.reduce((sum, entry) => sum + entry.rows.length, 0))
  assert.equal(cut.truncation!.omittedBySection.tables, undefined)
})

function rawControl(id: number, extra: Record<string, unknown> = {}): RawScan['controls'][number] {
  return { id, source: 'dom', path: [], role: 'button', name: 'Remove', type: 'button', visible: true, actions: ['click'], cands: [{ role: 'button', name: 'Remove', exact: true }], ...extra } as never
}

const rawOf = (controls: RawScan['controls']): RawScan => ({ controls, links: [], tables: [], frames: [], counts: { controls: controls.length, links: 0, tables: 0 }, shadowRoots: 0 })
const REQUEST = normalizeObserve({ sections: ['controls'] })

test('a candidate locator is accepted only if it matches that element alone; otherwise the best one is flagged ambiguous with its position', async () => {
  const { page } = fakePage({
    'role=button:Remove': { evaluateAll: () => [4, 9] },
    'role=textbox:Name': { evaluateAll: () => [1] },
    'label=Name': { evaluateAll: () => [1] },
    '#only': { evaluateAll: () => [7] },
    '#other': { evaluateAll: () => [99] },
  })
  const described = await describeScan(page, rawOf([
    rawControl(1, { role: 'textbox', name: 'Name', cands: [{ role: 'textbox', name: 'Name', exact: true }, { label: 'Name', exact: true }] }),
    rawControl(4),
    rawControl(9),
    // A candidate that matches a different element is skipped; the next one that is this element's own is taken.
    rawControl(7, { cands: [{ selector: '#other' }, { selector: '#only' }] }),
    // Nothing to build a locator from at all.
    rawControl(12, { cands: [] }),
  ]), REQUEST, scopeBase(undefined))
  const [named, first, second, other, bare] = described.controls as Record<string, any>[]
  assert.deepEqual(named!.locator, { role: 'textbox', name: 'Name', exact: true })
  assert.equal(named!.ambiguous, undefined)
  assert.deepEqual([first!.ambiguous, first!.matches, first!.nth], [true, 2, 0])
  assert.deepEqual([second!.ambiguous, second!.matches, second!.nth], [true, 2, 1])
  assert.deepEqual(first!.locator, { role: 'button', name: 'Remove', exact: true })
  assert.deepEqual(other!.locator, { selector: '#only' })
  assert.deepEqual([bare!.ambiguous, bare!.locator], [true, undefined])
})

test('inside an iframe the checked locator carries the frame path, and a scoped observation extends the scope\'s own path', async () => {
  const { page, log } = fakePage({
    'frame(iframe#a)>frame(iframe#b)>role=button:Go': { evaluateAll: () => [3] },
    'frame(iframe#outer)>frame(iframe#a)>role=button:Go': { evaluateAll: () => [3] },
  })
  const raw = rawOf([rawControl(3, { name: 'Go', path: ['iframe#a', 'iframe#b'], cands: [{ role: 'button', name: 'Go', exact: true }] })])
  const plain = await describeScan(page, raw, REQUEST, scopeBase(undefined))
  assert.deepEqual((plain.controls![0] as any).locator, { role: 'button', name: 'Go', exact: true, framePath: ['iframe#a', 'iframe#b'] })
  assert.ok(log.includes('evaluateAll:frame(iframe#a)>frame(iframe#b)>role=button:Go'))
  const inner = rawOf([rawControl(3, { name: 'Go', path: ['iframe#a'], cands: [{ role: 'button', name: 'Go', exact: true }] })])
  const scoped = await describeScan(page, inner, REQUEST, scopeBase({ role: 'document', framePath: ['iframe#outer'] }))
  assert.deepEqual((scoped.controls![0] as any).locator.framePath, ['iframe#outer', 'iframe#a'])
})

test('a radio group lists one locator per option and a cross-origin frame becomes a limit, not an error', async () => {
  const { page } = fakePage({ 'role=radio:Free': { evaluateAll: () => [10] }, 'role=radio:Pro': { evaluateAll: () => [11] } })
  const raw = rawOf([{
    source: 'dom', path: [], role: 'radiogroup', type: 'radio', name: 'Plan', visible: true, disabled: false, actions: ['check'],
    options: [
      { id: 10, label: 'Free', value: 'free', checked: false, cands: [{ role: 'radio', name: 'Free', exact: true }] },
      { id: 11, label: 'Pro', value: 'pro', checked: true, cands: [{ role: 'radio', name: 'Pro', exact: true }] },
    ],
  } as never])
  raw.frames = [{ framePath: ['iframe#x'], crossOrigin: true, limitation: 'content not observed (cross-origin or sandboxed frame)' }]
  const described = await describeScan(page, raw, REQUEST, scopeBase(undefined))
  const group = described.controls![0] as any
  assert.equal(group.locator, undefined)
  assert.deepEqual(group.options.map((option: any) => [option.label, option.checked, option.locator.name]), [['Free', false, 'Free'], ['Pro', true, 'Pro']])
  assert.equal(described.frames!.length, 1)
  assert.match(described.limits[0]!, /cross-origin or sandboxed iframe/)
})

test('fitObservation gives up the frame list last, and says so when it had to', () => {
  const frames = Array.from({ length: 20 }, (_, index) => ({ framePath: [`iframe#f${index}`], crossOrigin: true, limitation: 'content not observed (cross-origin or sandboxed frame)' }))
  const cut = fitObservation({ head: { url: 'u', frames }, controls: [control(1), control(2)] }, 2_000, { controls: 2 }, 50)
  const record = { ...cut.record, truncation: cut.truncation }
  assert.ok(bytes(record) <= 2_000, `${bytes(record)} bytes`)
  assert.equal((cut.record.controls as unknown[]).length, 0, 'controls went before the frame list')
  assert.ok((cut.record.frames as unknown[]).length > 0 && (cut.record.frames as unknown[]).length < 20)
  assert.equal(cut.truncation!.omittedBySection.frames, 20 - (cut.record.frames as unknown[]).length)
})
