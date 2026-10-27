/**
 * The "default parameters" editor of the settings card: every plugin-wide default as one `key = value` text.
 *
 * Process-wide and per-context defaults (browser runtime, window size, user agent, locale, proxy, directories, limits)
 * are one thing, "what each new context starts from"; an agent copies them for a task and changes only what that task
 * needs. So they are edited as one properties text instead of a field-by-field form:
 *
 *     # -- Browser context --
 *     viewportMode = custom
 *     viewportWidth = 1280
 *     # userAgent =
 *
 * A line `key = value` overrides the default; a `#` line is a comment and shows the value in force (the deployed
 * value, or the plugin's default); a key that is commented out or has no value is not overridden. The value is
 * everything after the FIRST `=`, trimmed, with one pair of surrounding double quotes removed; there are no inline
 * comments, so `#` inside a value is literal. Arrays are one JSON line. The saved configuration keeps the same flat
 * keys the old form wrote: this module only parses and prints text, nothing here writes settings.
 *
 * Pure (no DOM, no host); validation is the server's own rule set (`../config-rules.ts` through `field-rules.ts`).
 * @module dsh-browser/client/properties-form
 */
import { type PropertyDocs } from './property-docs.ts';
export type PropertyKind = 'string' | 'boolean' | 'enum' | 'integer' | 'strings';
export interface PropertyField {
    key: string;
    kind: PropertyKind;
    /** The value in force when nothing is configured, as the text the editor shows in a comment line. */
    defaultText?: string;
    options?: readonly string[];
    range?: readonly [number, number];
    group: 'runtime' | 'context' | 'files';
}
export declare const PROPERTY_GROUPS: readonly [{
    readonly id: "runtime";
    readonly title: "Browser runtime";
}, {
    readonly id: "context";
    readonly title: "Browser context (window, language, egress)";
}, {
    readonly id: "files";
    readonly title: "Login state, files and limits";
}];
/** The default-value fields, in display order. Switches and policies (enabled, automationMode, ...) stay controls. */
export declare const PROPERTY_FIELDS: readonly PropertyField[];
export declare const PROPERTY_KEYS: ReadonlySet<string>;
/** Settings that exist but are edited elsewhere in the card; a line naming one is warned about, not applied. */
export declare const ELSEWHERE_KEYS: Readonly<Record<string, string>>;
export interface LineIssue {
    /** 1-based line number in the text. */
    line: number;
    key?: string;
    level: 'error' | 'warning';
    message: string;
}
export interface ParsedProperties {
    /** The value of each key that has an uncommented, non-blank line (the last one wins; a repeat is reported). */
    values: Map<string, {
        value: string;
        line: number;
    }>;
    issues: LineIssue[];
}
/** The value text of a line's right-hand side: trimmed, one pair of surrounding double quotes removed. */
export declare function unquote(raw: string): string;
/** A value as it is written after `=`: quoted only when it would not survive a round trip bare. */
export declare function quoteValue(value: string): string;
/** Split the text into key/value lines. Syntax problems and unknown keys become issues; values are not judged here. */
export declare function parseProperties(text: string): ParsedProperties;
/** Why one property value is refused (the same rules the server and the old form applied), or undefined. */
export declare function validateProperty(field: PropertyField, value: string): string | undefined;
/**
 * Check a parsed text: each value against its rule, then the rules that involve several keys (a custom viewport needs
 * both sizes). `effective` supplies the text in force for a key the text does not set, so a size that comes from the
 * deployed configuration still counts.
 */
export declare function checkProperties(parsed: ParsedProperties, effective: (key: string) => string): LineIssue[];
export interface PropertyView {
    key: string;
    /** The value to print: the override, or the value in force (shown as a comment). */
    text: string;
    overridden: boolean;
}
/**
 * Print the editor text. Every key has a comment line in front of it (what it is for, its values, its default, the
 * risk), then either `key = value` (overridden) or `# key = value-in-force`; groups are under a comment header. Comments
 * are lines starting with `#`, which {@link parseProperties} ignores, so printing and parsing again keeps every key.
 */
export declare function serializeProperties(views: readonly PropertyView[], docs?: PropertyDocs): string;
/** `text` with the lines that set `key` turned into a comment showing `shown` (the deployed value or default). */
export declare function commentOutProperty(text: string, key: string, shown: string): string;
