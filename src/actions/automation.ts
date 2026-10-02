/** `automation` group: reusable assets and inline recipes. @module dsh-browser/actions/automation */

import type { ActionDef } from './types.ts'
import { ActionUnavailableError, withOutcome } from './types.ts'
import type { AnyRecipeStep, BrowserRecipeStep } from '../automation.ts'
import { RecipeValidationError, hintFor } from './errors.ts'
import { normalizePostconditions, type BrowserRecipeStepV2 } from '../automation-v2.ts'
import { executeAutomationAsset } from '../automation-execution.ts'
import { capJson, recipeOutcome } from './shared.ts'

/** After the deadline aborts a recipe, how long to wait for its in-flight step to return (a step times out within 30 s). */
const RECIPE_SETTLE_MS = 40_000

const DEVELOP_LIMIT = 100_000

/** Wrap an asset-development result: structured when small, truncated JSON text when large. */
function developmentResult(action: string, value: unknown, asset?: { id: string; status: string }): Record<string, unknown> {
  const capped = capJson(value, DEVELOP_LIMIT)
  return { action, ...asset ? { assetId: asset.id, status: asset.status } : {}, result: capped.value, truncated: capped.truncated }
}

export const AUTOMATION_ACTIONS: ActionDef[] = [
  {
    name: 'automation.search',
    group: 'automation',
    summary: 'Search reusable browser automations by task keywords and optional domain; compact metadata only.',
    notes: 'Run this at the start of a task: a verified asset can be run with automation.run instead of re-exploring. Never returns recipe steps or userscript source.',
    params: {
      query: { type: 'string', required: true, description: 'Short task description.' },
      domain: { type: 'string', description: 'Optional target hostname.' },
      status: { type: 'string', enum: ['active', 'draft', 'archived', 'all'], description: 'Asset lifecycle scope. Defaults to active.' },
      kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'Optional asset kind.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: { query: 'search issues', domain: 'github.com' } }],
    async execute(args, ctx) {
      return { items: ctx.assets?.search(args.query, args.domain, args.status, args.kind) ?? [] }
    },
  },
  {
    name: 'automation.develop',
    group: 'automation',
    summary: 'Get, save, validate, test, convert (v1 to v2) or fork (repair copy) one automation draft. Never activates assets.',
    notes: 'One tool, sub-actions selected by `action`; browser_index({action:"automation.develop.<sub>"}) gives one sub-action\'s full schema. Every save is a new revision; a test is bound to its revision and only the user can activate a tested revision.',
    params: {
      action: { type: 'string', required: true, enum: ['get', 'save', 'validate', 'test', 'convert', 'fork'] },
      id: { type: 'string', description: 'asset id; omit on save to create' },
      kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'save' },
      name: { type: 'string', description: 'save' },
      description: { type: 'string' },
      domains: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' }, description: 'retrieval keywords' },
      inputNames: { type: 'array', items: { type: 'string' }, description: 'UserScript input keys' },
      schemaVersion: { type: 'number', description: '1 or 2; use 2 (omitted: new=1, edit keeps)' },
      recipe: { type: 'array', items: { ref: 'recipeStep' }, description: '1-25 steps.' },
      inputSchema: { type: 'array', items: { ref: 'inputSpec' }, description: 'v2 typed inputs.' },
      outputSchema: { type: 'array', items: { ref: 'outputSpec' }, description: 'v2 named outputs.' },
      postconditions: { type: 'array', items: { ref: 'postcondition' }, description: 'v2: verified after the steps' },
      requiredCapabilities: { type: 'array', items: { type: 'string' }, description: 'v2: recorded only' },
      source: { type: 'string', description: 'UserScript' },
      url: { type: 'string', description: 'test: inside the draft domains' },
      inputs: { type: 'object', additionalProperties: true, description: 'test inputs' },
      authProfile: { type: 'string' },
      rulePack: { type: 'string' },
    },
    approval: 'asset-develop', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000, settleMs: RECIPE_SETTLE_MS,
    errors: ['VALIDATION_FAILED', 'VALIDATION_MISSING', 'OUTCOME_UNKNOWN'],
    subActions: {
      key: 'action',
      common: ['action', 'id'],
      items: {
        get: {
          summary: 'Read one asset in full, steps or source included, with its revision, contentHash and test credentials.',
          params: ['id'], required: ['id'], hints: { id: 'asset id' }, errors: ['NOT_FOUND'],
          traits: { readOnly: true, mutating: false, concurrencySafe: true },
        },
        validate: {
          summary: 'Static check of a stored draft (no browser): structure, domains, inputs.',
          params: ['id'], required: ['id'], hints: { id: 'asset id' }, errors: ['NOT_FOUND', 'INVALID_RECIPE'],
          traits: { readOnly: true, mutating: false, concurrencySafe: true },
        },
        save: {
          summary: 'Create a draft (omit id) or replace a whole draft. Every save is a new revision and clears its test result.',
          params: ['id', 'kind', 'name', 'description', 'domains', 'tags', 'inputNames', 'schemaVersion', 'recipe', 'inputSchema', 'outputSchema', 'postconditions', 'requiredCapabilities', 'source'],
          required: ['kind', 'name'], hints: { id: 'existing draft to replace; omit to create', kind: '', name: '' }, errors: ['INVALID_RECIPE', 'POLICY_DENIED'],
          notes: 'Send every field each time. Use schemaVersion 2: strict `locator` steps (several matches => LOCATOR_AMBIGUOUS, step not run). An active asset cannot be saved over: fork it.',
          examples: [{
            args: {
              action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
              recipe: [
                { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
                { type: 'click', locator: { role: 'button', name: 'Search' } },
                { type: 'extract', locator: { css: '#results' }, as: 'results' },
              ],
              postconditions: [{ output: 'results', nonEmpty: true }],
            },
          }],
        },
        test: {
          summary: 'Replay a draft in a real browser. The result is recorded as a credential bound to the draft\'s current revision and content.',
          params: ['id', 'url', 'inputs', 'authProfile', 'rulePack'], required: ['id', 'url'], hints: { id: 'draft id', url: 'inside the draft domains', inputs: '' },
          errors: ['VALIDATION_FAILED', 'VALIDATION_MISSING', 'OUTCOME_UNKNOWN', 'LOCATOR_NOT_FOUND', 'LOCATOR_AMBIGUOUS'],
          notes: 'A v2 test passes only if an assert step or a postcondition checks the result; otherwise it fails with VALIDATION_MISSING. url must be inside the draft\'s domains. A recipe draft is approved like automation.run_recipe in autonomous mode; a UserScript draft asks.',
          examples: [{ args: { action: 'test', id: 'draft-id', url: 'https://example.com/search', inputs: { query: 'dsh' } } }],
        },
        convert: {
          summary: 'Copy a v1 recipe asset (any status) into a NEW v2 draft; the original is not changed.',
          params: ['id'], required: ['id'], hints: { id: 'v1 recipe asset id' }, errors: ['NOT_FOUND', 'INVALID_RECIPE'],
          notes: 'The draft records sourceAssetId and sourceRevision. Steps that still take the first match are listed in pendingDisambiguation.',
        },
        fork: {
          summary: 'Copy any asset, typically an active one that broke, into a NEW editable draft that records sourceAssetId and sourceRevision.',
          params: ['id'], required: ['id'], hints: { id: 'asset to copy' }, errors: ['NOT_FOUND', 'POLICY_DENIED'],
          notes: 'The source keeps running and is not touched by the draft\'s tests. When the user activates the tested draft, the source is archived.',
          examples: [{ args: { action: 'fork', id: 'active-asset-id' } }],
        },
      },
    },
    examples: [
      {
        args: {
          action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
          recipe: [
            { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
            { type: 'click', locator: { role: 'button', name: 'Search' } },
            { type: 'extract', locator: { css: '#results' }, as: 'results' },
          ],
          postconditions: [{ output: 'results', nonEmpty: true }],
        },
      },
    ],
    async execute(args, ctx) {
      const { assets, development } = ctx
      if (!assets || !development) throw new ActionUnavailableError('model automation development is disabled')
      if (args.action === 'get') {
        if (!args.id) throw new Error('automation development get requires id')
        const asset = development.get(args.id)
        return developmentResult('get', asset, asset)
      }
      if (args.action === 'validate') {
        if (!args.id) throw new Error('automation development validate requires id')
        const asset = development.validate(args.id)
        return developmentResult('validate', { id: asset.id, kind: asset.kind, status: asset.status, testStatus: asset.testStatus, testMessage: asset.testMessage }, asset)
      }
      if (args.action === 'test') {
        if (!args.id || !args.url) throw new Error('automation development test requires id and url')
        const result = await executeAutomationAsset(ctx.service, assets, args.id, args.url, args.inputs, 'draft', {
          signal: ctx.signal,
          ...args.authProfile ? { authProfile: args.authProfile } : {},
          ...args.rulePack ? { rulePack: args.rulePack } : {},
          session: ctx.session,
        })
        const capped = capJson(result.value, 50_000)
        // Flat on purpose: executionStatus, validationStatus, completedSteps, failedStep and effects sit next to testStatus.
        const body = {
          action: 'test', assetId: result.asset.id, status: result.asset.status,
          revision: result.asset.revision, contentHash: result.asset.contentHash,
          testStatus: result.asset.testStatus, testMessage: result.asset.testMessage,
          ...result.execution,
          result: capped.value, truncated: capped.truncated,
        }
        // The steps ran cleanly but nothing verifies the result: a failed test, never an ok:true that says "failed".
        if (result.verifierMissing) {
          return withOutcome(body, {
            ok: false, executionStatus: result.execution.executionStatus,
            error: { code: 'VALIDATION_MISSING', message: result.verifierMissing.message, hint: hintFor('VALIDATION_MISSING')! },
          })
        }
        return withOutcome(body, recipeOutcome(result.execution))
      }
      if (args.action === 'fork') {
        if (!args.id) throw new Error('automation development fork requires id')
        const draft = development.fork(args.id, ctx.sessionId)
        return developmentResult('fork', {
          id: draft.id, status: draft.status, name: draft.name, revision: draft.revision, schemaVersion: draft.schemaVersion ?? 1,
          sourceAssetId: draft.sourceAssetId, sourceRevision: draft.sourceRevision, testStatus: draft.testStatus,
        }, draft)
      }
      if (args.action === 'convert') {
        if (!args.id) throw new Error('automation development convert requires id')
        const { draft, conversion } = development.convert(args.id, ctx.sessionId)
        return developmentResult('convert', {
          id: draft.id, status: draft.status, schemaVersion: 2, name: draft.name, revision: draft.revision,
          sourceAssetId: draft.sourceAssetId, sourceRevision: draft.sourceRevision, steps: draft.recipe?.length ?? 0,
          pendingDisambiguation: conversion.pendingDisambiguation, notes: conversion.notes,
        }, draft)
      }
      if (args.action !== 'save' || !args.kind || !args.name) throw new Error('automation development save requires kind and name')
      const asset = development.save({
        ...args.id ? { id: args.id } : {}, kind: args.kind, name: args.name,
        ...args.description !== undefined ? { description: args.description } : {},
        ...args.domains ? { domains: args.domains } : {}, ...args.tags ? { tags: args.tags } : {},
        ...args.inputNames ? { inputNames: args.inputNames } : {}, ...args.recipe ? { recipe: args.recipe as AnyRecipeStep[] } : {},
        ...args.schemaVersion !== undefined ? { schemaVersion: args.schemaVersion } : {},
        ...args.inputSchema ? { inputSchema: args.inputSchema } : {}, ...args.outputSchema ? { outputSchema: args.outputSchema } : {},
        ...args.postconditions ? { postconditions: args.postconditions } : {}, ...args.requiredCapabilities ? { requiredCapabilities: args.requiredCapabilities } : {},
        ...args.source !== undefined ? { source: args.source } : {},
      }, ctx.sessionId)
      const compact = {
        id: asset.id, kind: asset.kind, status: asset.status, name: asset.name, domains: asset.domains, tags: asset.tags, inputNames: asset.inputNames, revision: asset.revision, testStatus: asset.testStatus,
        ...asset.schemaVersion === 2 ? { schemaVersion: 2, pendingDisambiguation: asset.pendingDisambiguation?.length ?? 0 } : {},
      }
      return developmentResult('save', compact, asset)
    },
  },
  {
    name: 'automation.run',
    group: 'automation',
    summary: 'Run one activated reusable automation by id with declared inputs and a target HTTP(S) URL.',
    notes: 'Search first. Source and recipe internals stay Host-side.',
    params: {
      id: { type: 'string', required: true }, url: { type: 'string', required: true },
      inputs: { type: 'object', additionalProperties: true, description: 'Declared string inputs used by named recipe placeholders.' },
      authProfile: { type: 'string' }, rulePack: { type: 'string' },
    },
    approval: 'asset-run', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 120_000, settleMs: RECIPE_SETTLE_MS,
    errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN'],
    examples: [{ args: { id: 'asset-id', url: 'https://example.com/search', inputs: { query: 'dsh' } } }],
    async execute(args, ctx) {
      if (!ctx.assets) throw new ActionUnavailableError('automation assets are unavailable')
      const result = await executeAutomationAsset(ctx.service, ctx.assets, args.id, args.url, args.inputs, 'active', {
        signal: ctx.signal,
        ...args.authProfile ? { authProfile: args.authProfile } : {},
        ...args.rulePack ? { rulePack: args.rulePack } : {},
        session: ctx.session,
      })
      const capped = capJson(result.value, DEVELOP_LIMIT)
      return withOutcome({ assetId: result.asset.id, kind: result.asset.kind, ...result.execution, result: capped.value, truncated: capped.truncated }, recipeOutcome(result.execution))
    },
  },
  {
    name: 'automation.run_recipe',
    group: 'automation',
    summary: 'Run an inline Playwright recipe (max 25 named steps) on the current page or a given url.',
    notes: 'Read-only steps (wait, goto, extract, assert, screenshot) run directly; mutating steps are denied in read-only, approved once in standard, and direct in autonomous/unrestricted. Prefer schemaVersion 2 (strict locators, see automation.develop for the step rules).',
    params: {
      url: { type: 'string', description: 'Open this URL first; omit only when target.open already established a page.' },
      authProfile: { type: 'string' },
      rulePack: { type: 'string' },
      waitMs: { type: 'number' },
      steps: { type: 'array', required: true, items: { ref: 'recipeStep' } },
      schemaVersion: { type: 'number', description: '1 (default): steps use selector and take the first match. 2: steps use locator (strict), goto/clear exist, postconditions apply.' },
      allowedDomains: { type: 'array', items: { type: 'string' }, description: 'v2 goto may go to these domains (and stay on the starting origin). Default: the starting origin only.' },
      postconditions: { type: 'array', items: { ref: 'postcondition' }, description: 'v2: what must hold after the steps.' },
    },
    approval: 'recipe', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 120_000, settleMs: RECIPE_SETTLE_MS,
    errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN', 'INVALID_RECIPE'],
    examples: [
      { args: { url: 'https://example.com/', steps: [{ type: 'extract', selector: 'main', mode: 'text', limit: 5 }] } },
      { args: { url: 'https://example.com/', schemaVersion: 2, steps: [{ type: 'click', locator: { role: 'link', name: 'More' } }, { type: 'extract', locator: { css: 'main' }, as: 'body' }], postconditions: [{ output: 'body', nonEmpty: true }] }, note: 'v2: strict locators' },
    ],
    async execute(args, ctx) {
      const steps = args.steps as AnyRecipeStep[]
      const v2 = args.schemaVersion === 2
      if (args.schemaVersion !== undefined && args.schemaVersion !== 1 && !v2) throw new RecipeValidationError('schemaVersion must be 1 or 2')
      if (!v2 && (args.postconditions || args.allowedDomains)) throw new RecipeValidationError('postconditions and allowedDomains need schemaVersion 2')
      let postconditions
      try { postconditions = v2 && args.postconditions ? normalizePostconditions(args.postconditions, steps as BrowserRecipeStepV2[]) : undefined } catch (error) { throw new RecipeValidationError(error instanceof Error ? error.message : String(error)) }
      try {
        const { steps: _legacy, ...result } = await ctx.service.recipe(steps, {
          signal: ctx.signal,
          ...args.url ? { url: args.url } : {},
          ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
          ...args.authProfile ? { authProfile: args.authProfile } : {},
          ...args.rulePack ? { rulePack: args.rulePack } : {},
          ...v2 ? { schemaVersion: 2 as const, gotoSameOrigin: true, ...args.allowedDomains ? { allowedDomains: args.allowedDomains } : {}, ...postconditions ? { postconditions } : {} } : {},
          session: ctx.session,
        })
        const outcome = recipeOutcome(result)
        const where = result.url || args.url
        // v2 inline recipes are not offered as reuse candidates (the candidate store normalizes v1 selectors only).
        if (where && !v2) ctx.assets?.recordRecipe(where, steps as BrowserRecipeStep[], ctx.sessionId, outcome.ok)
        return withOutcome(result, outcome)
      } catch (error) {
        if (args.url && !v2) ctx.assets?.recordRecipe(args.url, steps as BrowserRecipeStep[], ctx.sessionId, false)
        throw error
      }
    },
  },
]
