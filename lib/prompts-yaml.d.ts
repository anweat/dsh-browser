/**
 * The default model-facing texts as a commented YAML document, in the exact structure of the `prompts:` configuration.
 *
 * `prompts:dump` and the settings card's "Export default text" also give the same data as plain JSON; this is the form
 * to start editing from: every section, and every entry of the long lists, says where the model reads it and when, what
 * its length cap is, and when a change takes effect. Comments are the only addition: parsed as YAML, the document is
 * deep-equal to {@link defaultPrompts} (test/prompts-yaml.test.ts), so pasting it back changes nothing.
 * @module dsh-browser/prompts-yaml
 */
export type PromptLang = 'en' | 'zh';
export declare function promptsDumpYaml(lang?: PromptLang): string;
