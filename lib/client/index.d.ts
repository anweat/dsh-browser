import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { Context } from './context-types.ts';
import { type BrowserCardState } from './form.ts';
import type { PromptExtraKind, PromptExtraValue, PromptTextFieldId } from './prompts-form.ts';
import type { AuthProfileEntry } from './auth-profiles-form.ts';
import type { PolicyFieldName } from './policy-fields.ts';
import { type PromptsStatusState } from './prompts-status-client.ts';
import { type PolicyStatusState } from './policy-status-client.ts';
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
    /** The default-parameters editor (one `key = value` text over the plugin-wide defaults). */
    editProperties: (text: string) => void;
    /** The language of the comments in the advanced text (`zh` or `en`). */
    setPropertyLanguage: (lang: string) => void;
    resetProperty: (key: string) => void;
    editPromptText: (id: PromptTextFieldId, text: string) => void;
    setPromptSkillEnabled: (enabled: boolean) => void;
    editPromptExtras: (text: string) => void;
    resetPromptExtras: () => void;
    /** One key of `usagePolicy` or `automationAssets` from its own control; an empty text puts the default back. */
    editPolicyKey: (field: PolicyFieldName, key: string, text: string) => void;
    /** The login-profile list: add or replace one profile, or remove one, in the staged configuration. */
    saveAuthProfile: (id: string, entry: AuthProfileEntry) => void;
    removeAuthProfile: (id: string) => void;
    usePromptsStatus: <R>(selector: (snapshot: PromptsStatusState) => R) => R;
    refreshPromptsStatus: () => void;
    exportPromptDefaults: () => Promise<void>;
    /** The default texts as commented YAML, in the given language (`en` or `zh`). */
    exportPromptYaml: (lang: string) => Promise<void>;
    /** One entry of the groups / actions / errorHints overrides: a group summary, an action's summary and notes, or an error hint. */
    setPromptExtra: (kind: PromptExtraKind, key: string, value: PromptExtraValue | undefined) => void;
    hidePromptDefaults: () => void;
    usePolicyStatus: <R>(selector: (snapshot: PolicyStatusState) => R) => R;
    refreshPolicyStatus: () => void;
    clearPolicyOverlay: (scope?: 'all' | 'usagePolicy' | 'authProfile', id?: string) => Promise<void>;
    useAutomationAssets: <R>(selector: (snapshot: AutomationAssetsState) => R) => R;
    refreshAutomationAssets: () => void;
    selectAutomationAsset: (id?: string) => void;
    saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>) => Promise<void>;
    summarizeAutomationCandidate: (id: string) => Promise<void>;
    dismissAutomationCandidate: (id: string) => Promise<void>;
    validateAutomationAsset: (id: string) => Promise<void>;
    testAutomationAsset: (id: string, url: string, inputs: Record<string, string>, expectedRevision?: number) => Promise<void>;
    setAutomationAssetStatus: (id: string, status: AutomationAssetStatus, expectedRevision?: number) => Promise<void>;
    editAutomationAsset: (text: string) => void;
    setAssetTestUrl: (value: string) => void;
    setAssetTestInputs: (value: string) => void;
    requestSelectAutomationAsset: (id?: string) => void;
    requestNewAutomationAsset: (kind: AutomationAsset['kind']) => void;
    requestRefreshAutomationAssets: () => void;
    requestForkAutomationAsset: (id: string) => void;
    requestConvertAutomationAsset: (id: string) => void;
    confirmLeaveAutomationAsset: () => void;
    cancelLeaveAutomationAsset: () => void;
    saveEditedAutomationAsset: () => Promise<unknown>;
    saveAndTestAutomationAsset: () => Promise<void>;
    activateAutomationAsset: () => Promise<void>;
};
export declare function apply(ctx: Context): void;
