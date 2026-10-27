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
const require_policy_keys = await import('../src/policy-keys.ts')
const { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS, USAGE_POLICY_BOUNDS } = require_policy_keys

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

test('the defaults and ranges the card shows are the resolver\'s: a missing key means the default, and a value past a range is clamped to its edge', () => {
  const { USAGE_POLICY_DEFAULTS, ASSET_POLICY_DEFAULTS, ASSET_POLICY_BOUNDS } = require_policy_keys
  assert.deepEqual({ ...resolveUsagePolicy(undefined) }, { ...USAGE_POLICY_DEFAULTS })
  const resolved = resolveAutomationAssetPolicy() as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(ASSET_POLICY_DEFAULTS)) assert.equal(resolved[key], value, `${key} default`)
  for (const key of ASSET_POLICY_KEYS) if (!(key in ASSET_POLICY_DEFAULTS)) assert.equal(key, 'directory', 'only the directory has no default')
  for (const [key, [min, max]] of Object.entries(ASSET_POLICY_BOUNDS) as [string, [number, number]][]) {
    assert.equal((resolveAutomationAssetPolicy({ [key]: min } as never) as unknown as Record<string, unknown>)[key], min, `${key} min is kept`)
    assert.equal((resolveAutomationAssetPolicy({ [key]: max } as never) as unknown as Record<string, unknown>)[key], max, `${key} max is kept`)
    const below = key === 'minSuccessRate' ? min - 0.1 : min - 1
    const above = key === 'minSuccessRate' ? max + 0.1 : max + 1
    assert.equal((resolveAutomationAssetPolicy({ [key]: below } as never) as unknown as Record<string, unknown>)[key], min, `${key} below the range is clamped to the min`)
    assert.equal((resolveAutomationAssetPolicy({ [key]: above } as never) as unknown as Record<string, unknown>)[key], max, `${key} above the range is clamped to the max`)
  }
  assert.deepEqual(Object.keys(ASSET_POLICY_BOUNDS).toSorted(), ASSET_POLICY_KEYS.filter(key => typeof ASSET_POLICY_DEFAULTS[key as keyof typeof ASSET_POLICY_DEFAULTS] === 'number').toSorted(), 'every numeric key has a range')
})
