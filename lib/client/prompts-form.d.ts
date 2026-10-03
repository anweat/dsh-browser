/**
 * Pure helpers for the "prompt text" section of the settings card.
 *
 * The whole `prompts` configuration is one staged JSON field (the host writes top-level fields); the card's separate
 * controls (tool descriptions, root guide and note, the skill) and the JSON box for groups, actions and error hints
 * are two views of that one draft. Nothing here touches the host or the DOM.
 * @module dsh-browser/client/prompts-form
 */
type Json = Record<string, unknown>;
/** The single-line and multi-line text controls of the section, by id, with the path each edits and its length cap. */
export declare const PROMPT_TEXT_FIELDS: readonly [{
    readonly id: "indexDescription";
    readonly path: readonly ["tools", "browser_index", "description"];
    readonly limit: 1500;
    readonly multiline: true;
}, {
    readonly id: "callDescription";
    readonly path: readonly ["tools", "browser_call", "description"];
    readonly limit: 1500;
    readonly multiline: true;
}, {
    readonly id: "rootGuide";
    readonly path: readonly ["rootGuide"];
    readonly limit: 1500;
    readonly multiline: true;
}, {
    readonly id: "rootNote";
    readonly path: readonly ["rootNote"];
    readonly limit: 800;
    readonly multiline: true;
}, {
    readonly id: "skillDescription";
    readonly path: readonly ["skill", "description"];
    readonly limit: 1000;
    readonly multiline: false;
}, {
    readonly id: "skillBodyFile";
    readonly path: readonly ["skill", "bodyFile"];
    readonly limit: 1024;
    readonly multiline: false;
}, {
    readonly id: "skillAppend";
    readonly path: readonly ["skill", "append"];
    readonly limit: 4000;
    readonly multiline: true;
}];
export type PromptTextFieldId = typeof PROMPT_TEXT_FIELDS[number]['id'];
/** The members the JSON box edits; the other controls own the rest. */
export declare const PROMPT_EXTRA_KEYS: readonly ["groups", "actions", "errorHints"];
export declare function getAt(root: Json, path: readonly string[]): unknown;
/** A copy of `root` with `path` set to `value`; an empty or absent value removes it, and parents left empty go with it. */
export declare function setAt(root: Json, path: readonly string[], value: unknown): Json;
/** The groups/actions/errorHints box: groups and actions are objects of `{summary, notes}`, errorHints a code-to-text map. */
export declare function validExtras(value: Json): boolean;
/**
 * Whether a whole `prompts` value is acceptable to save: known top-level keys, strings within their caps, a boolean
 * `skill.enabled`. Group names, action names and error codes are the plugin's to judge (it reports unknown ones as
 * diagnostics), so they are not checked here.
 */
export declare function validPrompts(value: Json): boolean;
/** The JSON box's content for a `prompts` value: its groups, actions and errorHints, or empty when it has none. */
export declare function extrasText(value: Json): string;
/** A copy of a `prompts` value with groups, actions and errorHints replaced by `extras` (absent members removed). */
export declare function withExtras(value: Json, extras: Json): Json;
/** Drop empty containers and the `skill.enabled=true` default, so equal settings compare equal whatever defaults the host filled in. */
export declare function canonicalPrompts(value: Json): Json;
export {};
