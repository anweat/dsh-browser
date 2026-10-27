/** `inspect` group: captured console and network records. @module dsh-browser/actions/inspect */

import type { ActionDef } from './types.ts'

export const INSPECT_ACTIONS: ActionDef[] = [
  {
    name: 'inspect.console',
    group: 'inspect',
    summary: 'Read bounded, redacted console records captured since the last target.open with capture=["console"].',
    notes: 'Records stay in memory and omit console argument objects.',
    params: {
      level: { type: 'string', enum: ['debug', 'log', 'info', 'warning', 'error'], description: 'Minimum severity. Defaults to debug.' },
      limit: { type: 'number', description: 'Newest 1-200 records. Default 100.' },
      clear: { type: 'boolean', description: 'Clear captured records after reading.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: { level: 'error' } }],
    async execute(args, ctx) {
      return ctx.service.consoleMessages({ ...args, session: ctx.session })
    },
  },
  {
    name: 'inspect.requests',
    group: 'inspect',
    summary: 'Read bounded, redacted failed and HTTP 4xx/5xx requests captured since the last target.open with capture=["network"].',
    notes: 'Request/response bodies and headers are never recorded.',
    params: {
      limit: { type: 'number', description: 'Newest 1-200 records. Default 100.' },
      clear: { type: 'boolean', description: 'Clear captured records after reading.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: {} }],
    async execute(args, ctx) {
      return ctx.service.networkRequests({ ...args, session: ctx.session })
    },
  },
  {
    name: 'inspect.downloads',
    group: 'inspect',
    summary: 'List this session\'s downloads (target.download and browser-triggered ones): saved path, bytes, sha256, or the failure.',
    notes: 'Records stay in memory (newest 50) and are never shared between sessions; the files are in downloadDir. clear only drops the records, never the files.',
    params: {
      limit: { type: 'number', description: 'Newest 1-50 records. Default 20.' },
      clear: { type: 'boolean', description: 'Clear the records after reading (files are kept).' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: {} }],
    async execute(args, ctx) {
      return ctx.service.downloadRecords({ ...args, session: ctx.session })
    },
  },
]
