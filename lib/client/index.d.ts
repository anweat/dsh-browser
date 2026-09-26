import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { Context } from './context-types.ts';
import { type BrowserCardState } from './form.ts';
import { SETTINGS_NAMESPACE } from './settings-namespace.ts';
import { type AutomationAssetsState } from './automation-assets-client.ts';
import type { AutomationAsset, AutomationAssetStatus } from '../automation-assets.ts';
export declare const name = "dsh-browser-client";
export declare const inject: string[];
export declare const NS = "dsh-browser.card";
export { SETTINGS_NAMESPACE };
export type BrowserSettingsCardProps = PropsLocale<typeof NS> & {
    /** Which view the Plugins page is asking for: the one-liner or the form body. */
    view: 'summary' | 'page';
    useBrowserSettings: <R>(selector: (snapshot: BrowserCardState) => R) => R;
    edit: (field: string, text: string) => void;
    resetField: (field: string) => void;
    save: () => void;
    discard: () => void;
    useAutomationAssets: <R>(selector: (snapshot: AutomationAssetsState) => R) => R;
    refreshAutomationAssets: () => void;
    selectAutomationAsset: (id?: string) => void;
    saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>) => Promise<void>;
    summarizeAutomationCandidate: (id: string) => Promise<void>;
    dismissAutomationCandidate: (id: string) => Promise<void>;
    validateAutomationAsset: (id: string) => Promise<void>;
    testAutomationAsset: (id: string, url: string, inputs: Record<string, string>) => Promise<void>;
    setAutomationAssetStatus: (id: string, status: AutomationAssetStatus) => Promise<void>;
};
export declare function apply(ctx: Context): void;
