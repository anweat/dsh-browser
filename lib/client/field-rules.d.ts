/**
 * Inline validation of the settings card's context and download fields.
 *
 * These are the SAME rule functions the server runs when it reads the configuration (`../config-rules.ts` has no
 * imports, so the card bundle carries it unchanged): a value the card accepts is a value the plugin will use, and a
 * value it refuses is one the plugin would have dropped with a runtimeWarning. Blank always means "use the default".
 * @module dsh-browser/client/field-rules
 */
/** Fields whose text is checked here. */
export declare const CHECKED_TEXT_FIELDS: readonly string[];
/** Why one field's text is refused, or undefined when it is fine (or blank). */
export declare function fieldProblem(field: string, text: string): string | undefined;
/**
 * Problems that involve more than one field. `custom` needs both sizes; the sizes themselves are checked by the
 * numeric field's own range.
 */
export declare function crossFieldProblems(texts: Record<string, string | undefined>): Record<string, string>;
