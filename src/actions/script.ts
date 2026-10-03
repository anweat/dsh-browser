/** `script` group: page JavaScript, built-in scripts, userscripts. @module dsh-browser/actions/script */

import type { ActionDef } from './types.ts'

export const SCRIPT_ACTIONS: ActionDef[] = [
  {
    name: 'script.evaluate',
    group: 'script',
    summary: 'Evaluate one bounded JavaScript expression in the current page; returns capped JSON.',
    notes: 'Runs with the page origin and login state, so it can read or mutate the DOM, access non-HttpOnly cookies/storage, and issue requests the browser allows. No Node.js or host-filesystem access.',
    params: {
      expression: { type: 'string', required: true, description: 'JavaScript expression up to 20,000 characters; the resolved value must be JSON-serializable.' },
      timeoutMs: { type: 'number', description: 'Execution timeout 1000-30000 ms. Default 15000.' },
    },
    approval: 'evaluate', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 35_000,
    errors: ['POLICY_DENIED (empty or oversized expression)'],
    examples: [{ args: { expression: 'document.title' } }],
    async execute(args, ctx) {
      return ctx.service.evaluate(args.expression, { ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session })
    },
  },
  {
    name: 'script.catalog',
    group: 'script',
    summary: 'List trusted built-in read-only scripts (article-clean, links, jsonld, forms).',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      return { items: ctx.service.scriptCatalog() }
    },
  },
  {
    name: 'script.validate',
    group: 'script',
    summary: 'Validate Tampermonkey-style userscript source without running it: @match/@grant, SHA-256, capabilities.',
    notes: 'Only @grant none is supported.',
    params: {
      source: { type: 'string', required: true, description: 'Complete userscript source including the metadata block. Never embed credentials.' },
      url: { type: 'string', description: 'Optional target URL to verify against @match and @exclude-match.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: { source: '// ==UserScript==\n// @name T\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn document.title', url: 'https://example.com/' } }],
    async execute(args, ctx) {
      const result = ctx.service.validateUserscript(args.source, args.url)
      return {
        valid: result.valid, sha256: result.sha256, bytes: result.bytes, name: result.metadata.name,
        matches: result.metadata.matches, grants: result.metadata.grants, capabilities: result.capabilities,
        errors: result.errors, warnings: result.warnings,
      }
    },
  },
  {
    name: 'script.run_builtin',
    group: 'script',
    summary: 'Run one trusted built-in read-only script in a fresh context and return bounded JSON.',
    params: {
      url: { type: 'string', required: true },
      scriptId: { type: 'string', required: true, enum: ['article-clean', 'links', 'jsonld', 'forms'] },
      authProfile: { type: 'string' },
      rulePack: { type: 'string' },
      timeoutMs: { type: 'number' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 60_000,
    examples: [{ args: { url: 'https://example.com/', scriptId: 'links' } }],
    async execute(args, ctx) {
      return ctx.service.runBuiltinScript(args.url, args.scriptId, {
        signal: ctx.signal,
        ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
        ...args.authProfile ? { authProfile: args.authProfile } : {},
        ...args.rulePack ? { rulePack: args.rulePack } : {},
      })
    },
  },
  {
    name: 'script.run_userscript',
    group: 'script',
    summary: 'Run an externally supplied userscript in a fresh context. Validate first.',
    notes: 'Target @match, source/result caps, and no-GM_* validation always apply; approval follows automationMode.',
    params: {
      url: { type: 'string', required: true },
      source: { type: 'string', required: true, description: 'Complete userscript source. Never embed credentials or tokens.' },
      authProfile: { type: 'string' },
      rulePack: { type: 'string' },
      timeoutMs: { type: 'number' },
    },
    approval: 'userscript', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 60_000,
    errors: ['POLICY_DENIED (invalid userscript)'],
    examples: [{ args: { url: 'https://example.com/', source: '// ==UserScript==\n// @name T\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn document.title' } }],
    async execute(args, ctx) {
      return ctx.service.runUserscript(args.url, args.source, {
        signal: ctx.signal,
        ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
        ...args.authProfile ? { authProfile: args.authProfile } : {},
        ...args.rulePack ? { rulePack: args.rulePack } : {},
      })
    },
  },
]
