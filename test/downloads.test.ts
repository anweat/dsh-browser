import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import {
  DownloadLimitError, claimDownloadPath, contentDispositionFilename, downloadNameFromUrl, resolveDownloadFilename, sanitizeDownloadName,
  streamToFile, temporaryDownloadPath, writeBufferToFile,
} from '../src/downloads.ts'
import { ActionArgError } from '../src/actions/types.ts'

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-dl-'))

test('a chosen filename must already be a plain name', () => {
  assert.equal(sanitizeDownloadName('report.pdf', true), 'report.pdf')
  assert.equal(sanitizeDownloadName('报告 2026.pdf', true), '报告 2026.pdf')
  for (const bad of ['', '   ', '.', '..', '...', 'a/b.pdf', 'a\\b.pdf', '/etc/passwd', 'C:\\x.txt', '../x', 'CON', 'nul.txt', 'COM1.log', 'lpt9', 'a<b', 'a|b', 'q?.txt']) {
    assert.throws(() => sanitizeDownloadName(bad, true), ActionArgError, JSON.stringify(bad))
  }
  assert.equal(sanitizeDownloadName('re\u0000po\nrt.pdf', true), 'report.pdf', 'control characters are removed, not refused')
  assert.equal(sanitizeDownloadName('a.pdf. .', true), 'a.pdf', 'trailing dots and spaces go')
  assert.equal(sanitizeDownloadName('invoice\u202egpj.exe', true), 'invoicegpj.exe', 'a right-to-left override cannot disguise the extension')
})

test('a name suggested by a server is reduced, not refused', () => {
  assert.equal(sanitizeDownloadName('../../etc/passwd', false), 'passwd')
  assert.equal(sanitizeDownloadName('C:\\Users\\x\\evil.exe', false), 'evil.exe')
  assert.equal(sanitizeDownloadName('a:b*c?.txt', false), 'a_b_c_.txt')
  assert.equal(sanitizeDownloadName('CON.txt', false), '_CON.txt')
  assert.equal(sanitizeDownloadName('..', false), '')
  assert.equal(sanitizeDownloadName('dir/', false), '')
  const long = sanitizeDownloadName('x'.repeat(400) + '.pdf', false)
  assert.ok(long.length <= 180 && long.endsWith('.pdf'), 'long names are cut but keep the extension')
})

test('the saved name: the caller\'s, else the server\'s, else the URL\'s, else "download"', () => {
  assert.equal(resolveDownloadFilename({ requested: 'mine.csv', suggested: 'theirs.csv', url: 'https://e.test/x.csv' }), 'mine.csv')
  assert.equal(resolveDownloadFilename({ suggested: 'theirs.csv', url: 'https://e.test/x.csv' }), 'theirs.csv')
  assert.equal(resolveDownloadFilename({ suggested: '', url: 'https://e.test/a/b%20c.csv?x=1' }), 'b c.csv')
  assert.equal(resolveDownloadFilename({ suggested: '..', url: 'https://e.test/' }), 'download')
  assert.throws(() => resolveDownloadFilename({ requested: '../x', suggested: 'ok.txt' }), ActionArgError)
  assert.equal(downloadNameFromUrl('not a url'), '')
})

test('Content-Disposition: extended form wins, quoted and bare forms work', () => {
  assert.equal(contentDispositionFilename(`attachment; filename="a b.pdf"`), 'a b.pdf')
  assert.equal(contentDispositionFilename(`attachment; filename=plain.txt; size=3`), 'plain.txt')
  assert.equal(contentDispositionFilename(`attachment; filename="fallback.txt"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf`), '报告.pdf')
  assert.equal(contentDispositionFilename('inline'), '')
  assert.equal(contentDispositionFilename(undefined), '')
})

test('claiming a path never overwrites: a taken name gets -1, -2 before the extension', () => {
  const dir = tempDir()
  const place = (name: string, body: string): string => {
    const temporary = temporaryDownloadPath(dir)
    fs.writeFileSync(temporary, body)
    return claimDownloadPath(dir, name, temporary)
  }
  const first = place('report.pdf', 'one')
  const second = place('report.pdf', 'two')
  const third = place('report.pdf', 'three')
  assert.deepEqual([first, second, third].map(file => path.basename(file)), ['report.pdf', 'report-1.pdf', 'report-2.pdf'])
  assert.equal(fs.readFileSync(first, 'utf8'), 'one', 'the first file is untouched')
  assert.equal(path.basename(place('noext', 'x')), 'noext')
  assert.equal(path.basename(place('noext', 'y')), 'noext-1')
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('.part-')), [], 'no temporary file is left behind')
  for (const bad of ['../x', 'a/b', '..', '']) {
    const temporary = temporaryDownloadPath(dir)
    fs.writeFileSync(temporary, 'x')
    assert.throws(() => claimDownloadPath(dir, bad, temporary), /outside the download directory/, JSON.stringify(bad))
  }
})

test('streaming counts bytes and hashes; past the cap it stops with DownloadLimitError', async () => {
  const dir = tempDir()
  const body = Buffer.from('hello downloads')
  const file = temporaryDownloadPath(dir)
  const ok = await streamToFile(Readable.from([body.subarray(0, 5), body.subarray(5)]), file, 1024)
  assert.equal(ok.bytes, body.length)
  assert.equal(ok.sha256, crypto.createHash('sha256').update(body).digest('hex'))
  assert.deepEqual(fs.readFileSync(file), body)
  const big = temporaryDownloadPath(dir)
  await assert.rejects(streamToFile(Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), big, 1000), DownloadLimitError)
  assert.throws(() => writeBufferToFile(Buffer.alloc(11), temporaryDownloadPath(dir), 10), DownloadLimitError)
})
