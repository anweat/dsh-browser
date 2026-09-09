import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { AutomationAssetsController } from '../src/client/automation-assets-client.ts'
import type { AutomationAsset, AutomationAssetSnapshot } from '../src/automation-assets.ts'

const asset: AutomationAsset = {
  id: 'asset-1', kind: 'userscript', status: 'draft', name: 'Read title', description: '', domains: ['example.com'], tags: [], inputNames: [],
  source: '// ==UserScript==\n// @name Read title\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn document.title',
  revision: 1, testStatus: 'untested', successCount: 0, failureCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const snapshot: AutomationAssetSnapshot = {
  policy: {
    enabled: true, persistenceMode: 'suggest', activationMode: 'manual', minSuccessfulRuns: 3, minDistinctSessions: 2,
    successWindowDays: 14, minSuccessRate: 0.8, maxCandidates: 20, candidateTtlDays: 14, maxSuggestionsPerDay: 2,
    maxDrafts: 10, maxActiveAssets: 50, retrievalTopK: 5, catalogTokenBudget: 800,
    modelDevelopmentEnabled: true, maxModelDraftWritesPerSession: 3,
  },
  candidates: [],
  assets: [{
    id: asset.id, kind: asset.kind, status: asset.status, name: asset.name, description: asset.description, domains: asset.domains,
    tags: asset.tags, inputNames: asset.inputNames, revision: asset.revision, testStatus: asset.testStatus,
    successCount: 0, failureCount: 0, updatedAt: asset.updatedAt,
  }],
}

test('client loads summaries first and fetches source only after explicit selection', async () => {
  const endpoints: string[] = []
  const channels: string[] = []
  const payloads: unknown[] = []
  const rpc = {
    async call(channel: string, endpoint: string, payload: unknown) {
      channels.push(channel)
      endpoints.push(endpoint)
      payloads.push(payload)
      return { ok: true, value: ['get', 'test', 'validate'].some(name => endpoint.endsWith(`/${name}`)) ? asset : snapshot }
    },
  } as unknown as ClientConnectionRpc
  const controller = new AutomationAssetsController(rpc)
  await controller.refresh()
  assert.equal(controller.snapshot().selected, undefined)
  assert.equal(endpoints.includes('dsh-browser-assets/get'), false)
  await controller.select(asset.id)
  assert.equal(controller.snapshot().selected?.source?.includes('return document.title'), true)
  assert.equal(endpoints.filter(endpoint => endpoint === 'dsh-browser-assets/get').length, 1)
  await controller.inject().testAutomationAsset(asset.id, 'https://example.com/', { query: 'one' })
  const testIndex = endpoints.indexOf('dsh-browser-assets/test')
  assert.deepEqual(payloads[testIndex], { id: asset.id, url: 'https://example.com/', inputs: { query: 'one' } })
  assert.deepEqual(new Set(channels), new Set(['/api']))
  controller.dispose()
})
