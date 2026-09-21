import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
export type SettingField = 'enabled' | 'automationMode' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled' | 'usagePolicy' | 'automationAssets' | 'autoInstall' | 'storageStatePath' | 'authProfiles' | 'defaultAuthProfile' | 'rulePacks' | 'executablePath' | 'snapshotDir' | 'verbose' | 'cdpPort' | 'args';
export interface CardFieldState {
    text: string;
    overridden: boolean;
    invalid: boolean;
}
export interface BrowserCardState {
    available: boolean;
    writable: boolean;
    dirty: boolean;
    invalid: boolean;
    saving: boolean;
    failed: boolean;
    fields: Record<SettingField, CardFieldState>;
}
type FieldWrite = {
    kind: 'set';
    value: unknown;
} | {
    kind: 'clear';
};
export interface FieldSpec {
    field: SettingField;
    format(value: unknown): string;
    parse(text: string): FieldWrite | undefined;
}
export declare const FIELD_SPECS: readonly FieldSpec[];
export declare class BrowserSettingsController {
    private readonly scope;
    private readonly staged;
    private readonly store;
    private readonly unsubscribe;
    private saving;
    private failed;
    constructor(scope: SettingsScope<Record<string, unknown>>);
    inject(): {
        hooks: {
            browserSettings: SnapshotStore<BrowserCardState>;
        };
        edit: (field: SettingField, text: string) => void;
        resetField: (field: SettingField) => void;
        save: () => void;
        discard: () => void;
    };
    snapshot(): BrowserCardState;
    edit(field: SettingField, text: string): void;
    resetField(field: SettingField): void;
    discard(): void;
    save(): Promise<void>;
    dispose(): void;
    private project;
    private field;
    private plan;
    private spec;
    private sectionValue;
    private baseValue;
    private userLayer;
    private stored;
    private publish;
}
export {};
