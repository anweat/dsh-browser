/**
 * Rows for the configuration fields the groups edit, wired to the card's staged form state.
 *
 * One component per control kind (switch, select, text, number). Each is the single entry of its field: it renders
 * `data-dsb-field="<name>"`, which test/settings-card-render.test.ts counts, and it reads the label, the one-line hint
 * and the optional `?` text from the dictionary by the field's name (`<name>`, `<name>Hint`, `<name>Help`).
 * @module dsh-browser/client/field-rows
 */
import type { BrowserSettingsCardProps } from './index.ts';
import type { BrowserCardState, CardFieldState } from './form.ts';
import { type RowLabels, type SelectOption } from './ui-kit.tsx';
export type Card = BrowserSettingsCardProps;
export type Translator = Card['t'];
export type LabelKey = Parameters<Translator>[0];
/** Fill `{name}` placeholders of a dictionary entry. */
export declare const fill: (text: string, values: Record<string, string | number>) => string;
/** The words every row shares. */
export declare function rowLabels(t: Translator): RowLabels;
/** The id of a field's control, tied to its label. */
export declare const controlId: (name: string) => string;
export interface FieldProps {
    card: Card;
    name: string;
    /** Replaces the dictionary's hint; a function receives the field's current text (for a hint that depends on the value). */
    hint?: string | ((text: string) => string);
    /** Text shown when the field has no value of its own (the default in force), as the input's placeholder. */
    placeholder?: string;
    /** Skip the label/hint lookup by name: the row is labelled by these. */
    label?: string;
    /** A short warning badge beside the label. */
    risk?: string;
}
/** How many of these fields carry an override: the number a group's badge shows. */
export declare function useOverriddenCount(card: Card, names: readonly string[]): number;
/** A field's staged state, whether it is a single-input field or one of the JSON-shaped ones (launch arguments, policies). */
export declare function stateOf(snapshot: BrowserCardState, name: string): CardFieldState | undefined;
/** Read one single-input field's staged state. */
export declare function useField(card: Card, name: string): {
    state: import("@deepseek-ai/dsh-client-ui-primitives").SettingsFieldState;
    disabled: boolean;
    problem: string;
    edit: (text: string) => void;
    reset: () => void;
};
/** A boolean field as a switch. */
export declare function SwitchRow(props: FieldProps): import("react").JSX.Element;
/** An enumerated field as a drop-down. */
export declare function SelectRow(props: FieldProps & {
    options: readonly SelectOption[];
}): import("react").JSX.Element;
/** A free-text field. `listId` names a `<datalist>` of suggestions rendered by the caller. */
export declare function TextRow(props: FieldProps & {
    listId?: string;
    code?: boolean;
}): import("react").JSX.Element;
/** A whole-number field with its unit written after the input. */
export declare function NumberRow(props: FieldProps & {
    unit?: string;
}): import("react").JSX.Element;
