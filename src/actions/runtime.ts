/** `runtime` group: runtime status and the Chromium installer. @module dsh-browser/actions/runtime */

import type { ActionDef } from './types.ts'

const cap = (text: string): string => text.slice(0, 2000)

export const RUNTIME_ACTIONS: ActionDef[] = [
  {
    name: 'runtime.status',
    group: 'runtime',
    summary: 'Report runtime status: install state, automationMode, approval policies, usage buffer, this session\'s active page.',
    notes: 'A page opened by another session is not reported.',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 15_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      // Loaded here, not at the top: prompts.ts measures the catalog and so imports the registry that imports this file.
      const { describePrompts } = await import('../prompts.ts')
      const status = await ctx.service.status({ session: ctx.session })
      // The overrides in force (keys and lengths only) and what was ignored or is over budget, read from the live config.
      return { ...status, prompts: describePrompts({ prompts: ctx.config.prompts, mode: ctx.config.automationMode, options: ctx.config.automationAssets, enabled: ctx.config.enabled }) }
    },
  },
  {
    name: 'runtime.install',
    group: 'runtime',
    summary: 'Install the bundled Playwright Chromium (large download). Run once if runtime.status reports chromium not installed.',
    params: {},
    approval: 'install', readOnly: false, mutating: false, concurrencySafe: false, timeoutMs: 600_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      const result = await ctx.service.installChromium()
      return { code: result.code, timedOut: result.timedOut, stdout: cap(result.stdout ?? ''), stderr: cap(result.stderr ?? '') }
    },
  },
]
