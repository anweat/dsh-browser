import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { AuthProfileStore } from '../src/auth-profiles.ts'
import { resolveRulePack } from '../src/rule-packs.ts'

test('named auth profiles are domain-scoped and default to read-only state', () => {
  const profiles = new AuthProfileStore({
    work: { storageStatePath: 'D:/secrets/work.json', allowedDomains: ['example.com'] },
  })
  assert.equal(profiles.resolve('work', 'https://sub.example.com/path').persistState, false)
  assert.throws(() => profiles.resolve('work', 'https://other.test/'), /not allowed/i)
  assert.throws(() => profiles.resolve('missing', 'https://example.com/'), /unknown auth profile/i)
  assert.deepEqual(profiles.list().map(v => v.id), ['work'])
})

test('rule packs require host match and a verified local init script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-rule-'))
  const script = path.join(dir, 'init.js')
  fs.writeFileSync(script, 'window.__enhanced = true', 'utf8')
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(script)).digest('hex')
  try {
    const packs = {
      enhanced: {
        matches: ['example.com'],
        initScriptPath: script,
        initScriptSha256: sha256,
        steps: [
          { type: 'waitFor' as const, selector: '#results', timeoutMs: 5000 },
          { type: 'scroll' as const, deltaY: 1200, repeat: 2, waitMs: 100 },
        ],
      },
    }
    const resolved = resolveRulePack(packs, 'enhanced', 'https://sub.example.com/search')
    assert.equal(resolved?.initScriptPath, script)
    assert.equal(resolved?.steps.length, 2)
    assert.throws(() => resolveRulePack(packs, 'enhanced', 'https://other.test/'), /not allowed/i)
    assert.throws(() => resolveRulePack({ enhanced: { ...packs.enhanced, initScriptSha256: '0'.repeat(64) } }, 'enhanced', 'https://example.com/'), /hash/i)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rule pack validation rejects unbounded steps', () => {
  assert.throws(() => resolveRulePack({ bad: { matches: ['example.com'], steps: [{ type: 'wait' as const, waitMs: 120_000 }] } }, 'bad', 'https://example.com/'), /waitMs/i)
})
