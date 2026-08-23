import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { Context } from './context-types.ts';
import { type BrowserCardState, type SettingField } from './form.ts';
import { SETTINGS_NAMESPACE } from './settings-namespace.ts';
export declare const name = "dsh-browser-client";
export declare const inject: string[];
export declare const NS = "dsh-browser.card";
export { SETTINGS_NAMESPACE };
export type BrowserSettingsCardProps = PropsLocale<typeof NS> & {
    useBrowserSettings: <R>(selector: (snapshot: BrowserCardState) => R) => R;
    edit: (field: SettingField, text: string) => void;
    resetField: (field: SettingField) => void;
    save: () => void;
    discard: () => void;
};
export declare function apply(ctx: Context): void;
