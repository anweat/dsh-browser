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
/** The plugin's own text for the card's prompt controls, taken from the default export (`promptsDumpText`). */
export interface PromptDefaults {
    /** Default text by control; a control with no default text (a body file, an appended text) is absent. */
    texts: Partial<Record<PromptTextFieldId, string>>;
    /** The default groups, actions and errorHints, the shape the JSON box takes. */
    extras: Json;
}
/** Read the default export's JSON into {@link PromptDefaults}; undefined when it is not the expected shape. */
export declare function defaultsFromJson(json: string): PromptDefaults | undefined;
/**
 * `extras` without the entries that equal the plugin's default: copying the whole default into the box and changing
 * one line must save one override, not freeze every other text at today's wording.
 */
export declare function pruneDefaultExtras(extras: Json, defaults: Json): Json;
/** The three lists of per-entry overrides, and what one entry holds. */
export type PromptExtraKind = typeof PROMPT_EXTRA_KEYS[number];
export type PromptExtraValue = {
    summary?: string;
    notes?: string;
} | string;
/** One overridden entry of the lists, as the card lists it. */
export interface PromptExtraEntry {
    kind: PromptExtraKind;
    key: string;
    summary?: string;
    notes?: string;
    /** An error hint's text. */
    text?: string;
}
/** The overridden entries of a `prompts` draft, in the order groups, actions, errorHints. */
export declare function extraEntries(draft: Json): PromptExtraEntry[];
/** `draft` with one entry set (or removed when `value` is undefined or empty); parents left empty go with it. */
export declare function withExtraEntry(draft: Json, kind: PromptExtraKind, key: string, value: PromptExtraValue | undefined): Json;
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
