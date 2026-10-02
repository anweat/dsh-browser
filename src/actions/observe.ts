/** `observe` group: read the page, take screenshots. @module dsh-browser/actions/observe */

import type { ActionDef } from './types.ts'
import { TARGET_PARAMS, } from './schema.ts'
import { targetOf } from './shared.ts'

export const OBSERVE_ACTIONS: ActionDef[] = [
  {
    name: 'observe.read',
    group: 'observe',
    summary: 'Read the current page (URL, title, readable text) without a screenshot.',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 20_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      return ctx.service.read({ session: ctx.session })
    },
  },
  {
    name: 'observe.screenshot',
    group: 'observe',
    summary: 'Capture the page, a clip region, or one element. Files land inside the configured snapshotDir.',
    params: {
      ...TARGET_PARAMS,
      clip: { type: 'object', additionalProperties: false, properties: {
        x: { type: 'number', required: true }, y: { type: 'number', required: true }, width: { type: 'number', required: true }, height: { type: 'number', required: true },
      } },
      fullPage: { type: 'boolean', description: 'Capture the full scrollable page. Defaults to true for page screenshots; incompatible with selector/locator.' },
      format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format. Defaults from filename or png.' },
      quality: { type: 'number', description: 'JPEG quality 0-100.' },
      filename: { type: 'string', description: 'Plain filename ending in .png, .jpg, or .jpeg. Directory traversal and absolute paths are rejected.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 30_000,
    examples: [{ args: {} }, { args: { locator: { role: 'heading', name: 'Pricing' } }, note: 'element screenshot' }],
    async execute(args, ctx) {
      const target = targetOf(args, false)
      return ctx.service.screenshot({
        ...target ? { target } : {},
        ...args.clip ? { clip: args.clip } : {},
        ...args.fullPage !== undefined ? { fullPage: args.fullPage } : {},
        ...args.format ? { format: args.format } : {},
        ...args.quality !== undefined ? { quality: args.quality } : {},
        ...args.filename ? { filename: args.filename } : {},
        session: ctx.session,
      })
    },
  },
]
