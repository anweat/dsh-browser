/**
 * The model-facing definitions of the two `indexed` tools (L0): name, description and parameter schema.
 *
 * Kept apart from `tools.ts` so the plugin registers them, the budget check measures them, and
 * `prompts:dump` lists their defaults from one definition. Only the description is configurable
 * (`prompts.tools.<name>.description`); the parameter schema is structural and fixed.
 * @module dsh-browser/tool-defs
 */
/** Default `browser_index` description. */
export declare const DEFAULT_INDEX_DESCRIPTION = "Browser capability index. No args: groups and environment state. {group}: that group's actions. {action}: one action's full schema. {query}: keyword search.";
/**
 * Default `browser_call` description, WITHOUT the compliance notice. The notice is appended to whatever
 * description is in force (configured or default): it states who is responsible for how the capability is used,
 * so a deployment can reword the guidance around it but cannot drop it.
 */
export declare const DEFAULT_CALL_DESCRIPTION = "Run one browser action; browser_index shows the names. Args are validated server-side: INVALID_ARGS replies include the schema. Reply: {ok, action, executionStatus, result | error{code,message,hint}}.";
export declare const INDEX_PARAMETERS: {
    readonly group: {
        readonly type: "string";
        readonly description: "Group name, e.g. act.";
    };
    readonly action: {
        readonly type: "string";
        readonly description: "Action name, e.g. act.click.";
    };
    readonly query: {
        readonly type: "string";
        readonly description: "Keywords.";
    };
};
export declare const CALL_PARAMETERS: {
    readonly action: {
        readonly type: "string";
        readonly required: true;
        readonly description: "Action name, e.g. target.open.";
    };
    readonly args: {
        readonly type: "object";
        readonly additionalProperties: true;
        readonly description: "Arguments for the action.";
    };
};
/** The two overridable tool names. */
export declare const PROMPT_TOOL_NAMES: readonly ["browser_index", "browser_call"];
export type PromptToolName = typeof PROMPT_TOOL_NAMES[number];
export declare function indexDescription(override?: string): string;
export declare function callDescription(override?: string): string;
/** What the host sends to the model for the two indexed tools (name + description + parameters). */
export declare function indexedToolDefinitions(overrides?: {
    browser_index?: string;
    browser_call?: string;
}): {
    name: string;
    description: string;
    parameters: unknown;
}[];
