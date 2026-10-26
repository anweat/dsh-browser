/**
 * The comments printed in front of every key of the default-parameters text (the "Advanced: text mode" view), in the
 * language of the card: what the setting is for, its allowed values or range, its default, and the risk when there is
 * one. Comment lines start with `#`, which the parser ignores, so they are never data and a round trip keeps every key.
 * Pure, with no DOM: `properties-form.ts` prints with these, the tests read them.
 * @module dsh-browser/client/property-docs
 */
export type DocLang = 'en' | 'zh';
export interface PropertyDocs {
    /** Lines at the top of the text (each is printed after `# `). */
    header: readonly string[];
    /** The title of each group of keys. */
    group: Readonly<Record<string, string>>;
    /** One line per key: use, values or range, default, risk. */
    key: Readonly<Record<string, string>>;
}
/** The docs of a language; anything but `zh` is English. */
export declare function propertyDocs(lang?: DocLang | string): PropertyDocs;
