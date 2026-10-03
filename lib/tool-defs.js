/**
 * The model-facing definitions of the two `indexed` tools (L0): name, description and parameter schema.
 *
 * Kept apart from `tools.ts` so the plugin registers them, the budget check measures them, and
 * `prompts:dump` lists their defaults from one definition. Only the description is configurable
 * (`prompts.tools.<name>.description`); the parameter schema is structural and fixed.
 * @module dsh-browser/tool-defs
 */
import { CALL_TOOL, INDEX_TOOL } from "./actions/registry.js";
import { COMPLIANCE_NOTICE } from "./actions/shared.js";
/** Default `browser_index` description. */
export const DEFAULT_INDEX_DESCRIPTION = 'Browser capability index. No args: groups and environment state. {group}: that group\'s actions. {action}: one action\'s full schema. {query}: keyword search.';
/**
 * Default `browser_call` description, WITHOUT the compliance notice. The notice is appended to whatever
 * description is in force (configured or default): it states who is responsible for how the capability is used,
 * so a deployment can reword the guidance around it but cannot drop it.
 */
export const DEFAULT_CALL_DESCRIPTION = 'Run one browser action; browser_index shows the names. Args are validated server-side: INVALID_ARGS replies include the schema. Reply: {ok, action, executionStatus, result | error{code,message,hint}}.';
export const INDEX_PARAMETERS = {
    group: { type: 'string', description: 'Group name, e.g. act.' },
    action: { type: 'string', description: 'Action name, e.g. act.click.' },
    query: { type: 'string', description: 'Keywords.' },
};
export const CALL_PARAMETERS = {
    action: { type: 'string', required: true, description: 'Action name, e.g. target.open.' },
    args: { type: 'object', additionalProperties: true, description: 'Arguments for the action.' },
};
/** The two overridable tool names. */
export const PROMPT_TOOL_NAMES = [INDEX_TOOL, CALL_TOOL];
export function indexDescription(override) {
    return override ?? DEFAULT_INDEX_DESCRIPTION;
}
export function callDescription(override) {
    return `${(override ?? DEFAULT_CALL_DESCRIPTION).trimEnd()} ${COMPLIANCE_NOTICE}`;
}
/** What the host sends to the model for the two indexed tools (name + description + parameters). */
export function indexedToolDefinitions(overrides = {}) {
    return [
        { name: INDEX_TOOL, description: indexDescription(overrides.browser_index), parameters: INDEX_PARAMETERS },
        { name: CALL_TOOL, description: callDescription(overrides.browser_call), parameters: CALL_PARAMETERS },
    ];
}
//# sourceMappingURL=tool-defs.js.map