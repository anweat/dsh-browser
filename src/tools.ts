/**
 * Model-facing tool surfaces for dsh-browser.
 *
 * Every capability is an action in the registry (`src/actions/`). This module
 * only projects that registry into tools:
 *
 * - `indexed` (default): two small tools, `browser_index` for progressive
 *   disclosure and `browser_call` to run an action. Constant, tiny context cost.
 * - `flat`: one tool per usable action, named `browser_<group>_<action>`.
 *   Every action is described up front; useful for comparison and debugging.
 *
 * Both surfaces dispatch through the same {@link runAction}, so validation,
 * the result envelope, and the error codes are identical.
 * @module dsh-browser/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from './config.ts'
import type { BrowserService } from './browser-service.ts'
import { sessionKeyFor } from './browser-service.ts'
import { configuredBrowserActions } from './freedom.ts'
import type { AutomationAssetStore } from './automation-assets.ts'
import { AutomationDevelopmentService } from './automation-development.ts'
import { ACTIONS, CALL_TOOL, INDEX_TOOL, flatToolName, traitsFor } from './actions/registry.ts'
import { expandParams } from './actions/schema.ts'
import { renderIndex, type IndexEnvironment } from './actions/index-view.ts'
import { runAction, type RunEnvironment } from './actions/run.ts'
import { COMPLIANCE_NOTICE } from './actions/shared.ts'
import type { ActionContext, ActionDef, ActionEnvelope } from './actions/types.ts'

export interface ToolRuntime {
  /** Whether the `dsh-browser` skill is currently registered; read at call time. */
  skillAvailable?: () => boolean
}

function sessionId(exec: unknown): string {
  const value = (exec as { agent?: { session?: { id?: unknown } } })?.agent?.session?.id
  return typeof value === 'string' && value ? value : 'unknown-session'
}

const ENVELOPE_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' as const, required: true as const },
    action: { type: 'string' as const, required: true as const },
    executionStatus: { type: 'string' as const, required: true as const, enum: ['completed', 'failed', 'cancelled', 'outcome_unknown'] },
    result: { type: 'object' as const, additionalProperties: true },
    error: {
      type: 'object' as const, additionalProperties: false,
      properties: {
        code: { type: 'string' as const, required: true as const },
        message: { type: 'string' as const, required: true as const },
        hint: { type: 'string' as const },
        schema: { type: 'string' as const },
        current: {
          type: 'object' as const, additionalProperties: false,
          properties: { targetId: { type: 'string' as const, required: true as const }, generation: { type: 'number' as const, required: true as const } },
        },
        candidates: {
          type: 'object' as const, additionalProperties: false,
          properties: {
            total: { type: 'number' as const, required: true as const },
            items: {
              type: 'array' as const,
              items: {
                type: 'object' as const, additionalProperties: false,
                properties: {
                  index: { type: 'number' as const, required: true as const },
                  role: { type: 'string' as const, required: true as const },
                  name: { type: 'string' as const, required: true as const },
                  text: { type: 'string' as const, required: true as const },
                  visible: { type: 'boolean' as const, required: true as const },
                },
              },
            },
          },
        },
      },
    },
    truncation: {
      type: 'object' as const, additionalProperties: false,
      properties: { omitted: { type: 'number' as const, required: true as const }, reason: { type: 'string' as const, required: true as const } },
    },
  },
}

const renderEnvelope = (_args: unknown, value: unknown): { type: 'text'; text: string }[] => [{ type: 'text', text: JSON.stringify(value) }]

export function registerTools(ctx: Context, config: ResolvedConfig, service: BrowserService, assets?: AutomationAssetStore, runtime: ToolRuntime = {}): void {
  if (!config.enabled) return
  const development = assets ? new AutomationDevelopmentService(assets, config.automationAssets) : undefined
  const runEnv: RunEnvironment = { mode: config.automationMode, options: config.automationAssets, enabled: config.enabled }
  const register = (tool: any): void => { ctx.tools.register(tool) }

  const actionContext = (exec: any): ActionContext => ({
    service, config, ...assets ? { assets } : {}, ...development ? { development } : {},
    session: sessionKeyFor(exec?.agent),
    sessionId: sessionId(exec),
    agent: exec?.agent,
    signal: exec?.signal ?? new AbortController().signal,
  })

  if (config.toolSurface === 'flat') {
    const exposed = new Set(configuredBrowserActions(config.automationMode, config.automationAssets, config.enabled))
    for (const action of ACTIONS.filter(entry => exposed.has(entry.name))) register(flatTool(action, actionContext, runEnv))
    return
  }

  register(defineTool({
    name: INDEX_TOOL,
    description: 'Browser capability index. No args: groups and environment state. {group}: that group\'s actions. {action}: one action\'s full schema. {query}: keyword search.',
    parameters: {
      group: { type: 'string', description: 'Group name, e.g. act.' },
      action: { type: 'string', description: 'Action name, e.g. act.click.' },
      query: { type: 'string', description: 'Keywords.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { level: { type: 'string', required: true }, text: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    timeoutMs: 15_000,
    isConcurrencySafe: () => true,
    async execute(args: { group?: string; action?: string; query?: string }) {
      const env: IndexEnvironment = {
        mode: config.automationMode, options: config.automationAssets, enabled: config.enabled,
        skillAvailable: runtime.skillAvailable?.() ?? false,
      }
      if (!args.group && !args.action && !args.query) {
        try {
          const status = await service.status()
          env.runtime = { chromiumInstalled: status.chromiumInstalled, opencliInstalled: status.opencliInstalled, opencliEnabled: status.opencliEnabled }
        } catch { /* runtime facts are best-effort */ }
      }
      return renderIndex(args, env)
    },
  }))

  register(defineTool({
    name: CALL_TOOL,
    description: 'Run one browser action; browser_index shows the names. Args are validated server-side: INVALID_ARGS replies include the schema. Reply: {ok, action, executionStatus, result | error{code,message,hint}}. ' + COMPLIANCE_NOTICE,
    parameters: {
      action: { type: 'string', required: true, description: 'Action name, e.g. target.open.' },
      args: { type: 'object', additionalProperties: true, description: 'Arguments for the action.' },
    },
    output: { schema: ENVELOPE_SCHEMA, render: renderEnvelope as never },
    timeoutMs: 600_000,
    // Calls are serialized per agent step: interactions share one page, and the Host classifier cannot read the action.
    isConcurrencySafe: () => false,
    async execute(args: { action: string; args?: Record<string, unknown> }, exec: unknown) {
      return runAction(args.action, args.args, actionContext(exec), runEnv) as Promise<ActionEnvelope> as never
    },
  }))
}

/** One flat tool for one action: the same registry entry, projected as a native tool. */
function flatTool(action: ActionDef, actionContext: (exec: any) => ActionContext, runEnv: RunEnvironment): unknown {
  return defineTool({
    name: flatToolName(action),
    description: action.summary + (action.notes ? ' ' + action.notes : '') + (action.group === 'runtime' || action.group === 'inspect' ? '' : ' ' + COMPLIANCE_NOTICE),
    parameters: expandParams(action.params) as never,
    output: { schema: ENVELOPE_SCHEMA, render: renderEnvelope as never },
    timeoutMs: action.timeoutMs + 5_000,
    isConcurrencySafe: (args: unknown) => traitsFor(action, args).concurrencySafe,
    async execute(args: Record<string, unknown>, exec: unknown) {
      return runAction(action.name, args, actionContext(exec), runEnv) as never
    },
  } as never)
}
