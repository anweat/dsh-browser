/** `crawl` group: bounded multi-page traversal. @module dsh-browser/actions/crawl */

import type { ActionDef } from './types.ts'

export const CRAWL_ACTIONS: ActionDef[] = [
  {
    name: 'crawl.crawl',
    group: 'crawl',
    summary: 'Crawl a bounded set of HTTP(S) pages under the configured concurrency, burst, page/depth, retry, and cooldown budgets.',
    notes: 'Read-only and always buffered, even in unrestricted mode. Anonymous (no AuthProfile).',
    params: {
      startUrls: { type: 'array', required: true, items: { type: 'string' }, description: '1-5 starting URLs.' },
      maxPages: { type: 'number', description: 'Page budget, capped by usagePolicy.maxPagesPerRun.' },
      maxDepth: { type: 'number', description: 'Link depth, capped by usagePolicy.maxDepth.' },
      sameOrigin: { type: 'boolean', description: 'Only follow links on starting origins. Default true.' },
      maxCharsPerPage: { type: 'number', description: 'Readable text cap per page, 1000-50000.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 300_000,
    examples: [{ args: { startUrls: ['https://example.com/'], maxPages: 5, maxDepth: 1 } }],
    async execute(args, ctx) {
      return ctx.service.crawl(args.startUrls, {
        signal: ctx.signal,
        ...args.maxPages !== undefined ? { maxPages: args.maxPages } : {},
        ...args.maxDepth !== undefined ? { maxDepth: args.maxDepth } : {},
        ...args.sameOrigin !== undefined ? { sameOrigin: args.sameOrigin } : {},
        ...args.maxCharsPerPage !== undefined ? { maxCharsPerPage: args.maxCharsPerPage } : {},
      })
    },
  },
]
