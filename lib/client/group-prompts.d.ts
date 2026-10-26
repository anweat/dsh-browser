/**
 * "Prompts": the text the model reads, as a list. A row per text (name, default or overridden, length) and an Edit
 * dialog that puts the default text beside your override; the per-entry overrides (groups, actions, error hints) are a
 * list of only the entries you changed, with their own dialog. The budget summary stays on top and the default text can be
 * exported, as commented YAML or plain JSON.
 *
 * Every edit stages into the one `prompts` draft the page's Save writes (see form.ts); a dialog's own Save only stages.
 * @module dsh-browser/client/group-prompts
 */
import { type Card } from './field-rows.tsx';
export declare function PromptsGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
