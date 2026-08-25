import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'
import { executeAutomationAsset } from '../src/automation-execution.ts'
import type { BrowserService } from '../src/browser-service.ts'

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-development-'))
  const policy = resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual', maxModelDraftWritesPerSession: 1 })
  const assets = new AutomationAssetStore(policy)
  return { assets, development: new AutomationDevelopmentService(assets, policy) }
}

test('model development explicitly saves, finds, and reads a bounded recipe draft', () => {
  const { assets, development } = fixture()
  const saved = development.save({
    kind: 'recipe', name: 'Batch issue index', description: 'Index issue titles and links',
    domains: ['example.com'], tags: ['batch-index', 'issues'],
    recipe: [{ type: 'extract', selector: '.issue', mode: 'links', limit: 50 }],
  }, 'session-one')
  assert.equal(saved.status, 'draft')

  const matches = assets.search('batch-index issues', undefined, 'draft', 'recipe')
  assert.equal(matches.length, 1)
  assert.equal(Object.hasOwn(matches[0], 'recipe'), false)

  const loaded = development.get(saved.id)
  assert.equal(loaded.recipe?.[0] && 'selector' in loaded.recipe[0] ? loaded.recipe[0].selector : undefined, '.issue')
  assert.equal(development.validate(saved.id).testStatus, 'untested')

  assert.throws(() => development.save({
    kind: 'recipe', name: 'Another draft', domains: ['example.com'],
    recipe: [{ type: 'extract', selector: 'main', mode: 'text' }],
  }, 'session-one'), /write limit/)
})

test('failed draft replay records only bounded failure state and never enables activation', async () => {
  const { assets } = fixture()
  const draft = assets.saveDraft({
    kind: 'recipe', name: 'Failing search', domains: ['example.com'],
    recipe: [{ type: 'fill', selector: 'input[name=q]', value: '{{input_q}}' }],
  })
  const service = { async recipe() { throw new Error('page leaked a secret value') } } as unknown as BrowserService
  await assert.rejects(() => executeAutomationAsset(service, assets, draft.id, 'https://example.com/', { input_q: 'private' }, 'draft'), /secret value/)
  const failed = assets.get(draft.id)!
  assert.equal(failed.testStatus, 'failed')
  assert.equal(failed.testMessage?.includes('secret'), false)
  assert.throws(() => assets.setStatus(draft.id, 'active'), /pass testing/)
})

test('model development accumulates a scoped UserScript without exposing source in search', () => {
  const { assets, development } = fixture()
  const source = `// ==UserScript==\n// @name Issue cards\n// @match https://example.com/issues/*\n// @grant none\n// ==/UserScript==\nreturn { query: __DSH_INPUTS__.query, count: document.querySelectorAll('.issue').length }`
  const draft = development.save({
    kind: 'userscript', name: 'Issue card index', description: 'Collect issue card counts', domains: ['example.com'],
    tags: ['batch-index', 'issues'], inputNames: ['query'], source,
  }, 'script-session')
  assert.equal(development.validate(draft.id).testStatus, 'untested')
  assert.equal(development.get(draft.id).source, source)
  const summary = assets.search('batch-index issues', 'example.com', 'draft', 'userscript')[0]!
  assert.equal(summary.id, draft.id)
  assert.equal(Object.hasOwn(summary, 'source'), false)
})
