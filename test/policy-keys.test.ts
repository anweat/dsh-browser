import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { Config } = await import('../src/config.ts')
const { resolveAutomationAssetPolicy } = await import('../src/automation-assets.ts')
const { resolveUsagePolicy } = await import('../src/usage-policy.ts')
const { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS, USAGE_POLICY_BOUNDS } = await import('../src/policy-keys.ts')

type Schema = { dict: Record<string, { dict?: Record<string, unknown> }> }
const schemaKeys = (field: string) => Object.keys((Config as unknown as Schema).dict[field]!.dict!)

test('the policy key lists are the resolver keys and the Host schema keys, so a new key cannot be left out of the panel', () => {
  assert.deepEqual([...ASSET_POLICY_KEYS].toSorted(), Object.keys(resolveAutomationAssetPolicy()).toSorted())
  assert.deepEqual([...ASSET_POLICY_KEYS].toSorted(), schemaKeys('automationAssets').toSorted())
  assert.deepEqual([...USAGE_POLICY_KEYS].toSorted(), Object.keys(resolveUsagePolicy(undefined)).toSorted())
  assert.deepEqual([...USAGE_POLICY_KEYS].toSorted(), schemaKeys('usagePolicy').toSorted())
  assert.ok(ASSET_POLICY_KEYS.includes('maxTestCredentials') && ASSET_POLICY_KEYS.includes('minInputSetsForActivation'))
})

test('the usage bounds the card enforces are the ones the resolver enforces', () => {
  for (const [key, [min, max]] of Object.entries(USAGE_POLICY_BOUNDS)) {
    assert.doesNotThrow(() => resolveUsagePolicy({ [key]: min }), `${key} accepts its minimum`)
    assert.doesNotThrow(() => resolveUsagePolicy({ [key]: max }), `${key} accepts its maximum`)
    assert.throws(() => resolveUsagePolicy({ [key]: min - 1 }), new RegExp(key))
    assert.throws(() => resolveUsagePolicy({ [key]: max + 1 }), new RegExp(key))
  }
})
