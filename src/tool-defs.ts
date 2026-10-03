/**
 * The model-facing definitions of the two `indexed` tools (L0): name, description and parameter schema.
 *
 * Kept apart from `tools.ts` so the plugin registers them, the budget check measures them, and
 * `prompts:dump` lists their defaults from one definition. Only the description is configurable
 * (`prompts.tools.<name>.description`); the parameter schema is structural and fixed.
 * @module dsh-browser/tool-defs
 */

import { CALL_TOOL, INDEX_TOOL } from './actions/registry.ts'
import { COMPLIANCE_NOTICE } from './actions/shared.ts'

/** Default `browser_index` description. */
export const DEFAULT_INDEX_DESCRIPTION = 'Browser capability index. No args: groups and environment state. {group}: that group\'s actions. {action}: one action\'s full schema. {query}: keyword search.'

/**
 * Default `browser_call` description, WITHOUT the compliance notice. The notice is appended to whatever
 * description is in force (configured or default): it states who is responsible for how the capability is used,
 * so a deployment can reword the guidance around it but cannot drop it.
 */
export const DEFAULT_CALL_DESCRIPTION = 'Run one browser action; browser_index shows the names. Args are validated server-side: INVALID_ARGS replies include the schema. Reply: {ok, action, executionStatus, result | error{code,message,hint}}.'

export const INDEX_PARAMETERS = {
  group: { type: 'string', description: 'Group name, e.g. act.' },
  action: { type: 'string', description: 'Action name, e.g. act.click.' },
  query: { type: 'string', description: 'Keywords.' },
} as const

export const CALL_PARAMETERS = {
  action: { type: 'string', required: true, description: 'Action name, e.g. target.open.' },
  args: { type: 'object', additionalProperties: true, description: 'Arguments for the action.' },
} as const

/** The two overridable tool names. */
export const PROMPT_TOOL_NAMES = [INDEX_TOOL, CALL_TOOL] as const
export type PromptToolName = typeof PROMPT_TOOL_NAMES[number]

export function indexDescription(override?: string): string {
  return override ?? DEFAULT_INDEX_DESCRIPTION
}

export function callDescription(override?: string): string {
  return `${(override ?? DEFAULT_CALL_DESCRIPTION).trimEnd()} ${COMPLIANCE_NOTICE}`
}

/** One tool as the host sends it to the model. */
export interface ModelFacingTool { name: string; description: string; parameters: unknown }

/**
 * The JSON Schema `defineTool` produces from a parameter shorthand map: `required: true` moves to a `required` list.
 * Kept here, not imported, so the budget code does not need the tool runtime; test/l0-estimate.test.ts holds it equal
 * to what `defineTool` really registers.
 */
function jsonSchemaOf(shorthand: Record<string, Record<string, unknown>>): unknown {
  const properties = Object.fromEntries(Object.entries(shorthand).map(([name, spec]) => [name, Object.fromEntries(Object.entries(spec).filter(([key]) => key !== 'required'))]))
  const required = Object.entries(shorthand).filter(([, spec]) => spec.required === true).map(([name]) => name)
  return { type: 'object', properties, ...required.length ? { required } : {} }
}

/**
 * What the host sends to the model for the two indexed tools (name + description + parameters).
 * The parameters are the JSON Schema form (`type`/`properties`/`required`), which is what is registered and what the
 * model is billed for, not the shorthand map the tools are declared with.
 */
export function indexedToolDefinitions(overrides: { browser_index?: string; browser_call?: string } = {}): ModelFacingTool[] {
  return [
    { name: INDEX_TOOL, description: indexDescription(overrides.browser_index), parameters: jsonSchemaOf(INDEX_PARAMETERS) },
    { name: CALL_TOOL, description: callDescription(overrides.browser_call), parameters: jsonSchemaOf(CALL_PARAMETERS) },
  ]
}

/** Characters per token of the surface estimate. */
export const CHARS_PER_TOKEN = 3.5

/** Estimated tokens of a character count. The one rounding rule for the settings card, `runtime.status` and the measure script. */
export function estimateTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN)
}

/** Serialized size of tools as the host sends them: the one input of every L0 estimate. */
export function modelFacingChars(tools: readonly { name: string; description?: unknown; parameters?: unknown }[]): number {
  return tools.reduce((sum, tool) => sum + JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length, 0)
}
