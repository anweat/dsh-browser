import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { AutomationDevelopmentService } from '../src/automation-development.ts'

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
