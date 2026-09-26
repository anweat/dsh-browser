/**
 * The browser settings card's form model.
 *
 * Staging, the revision fence, and the snapshot store are owned by the shared
 * `SettingsFormModel` from `@deepseek-ai/dsh-client-ui-primitives` — the same
 * model every official settings page uses — so this module only declares which
 * fields the card edits and how each one converts between stored value and
 * draft text. A save is one `mutate(ops, revision)`; `set`/`unset` per field no
 * longer exist on this Host line.
 * @module dsh-browser/client/form
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SettingsFieldSpec, SettingsFormScope, SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
export type SectionField = 'enabled' | 'automationMode' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled' | 'autoInstall' | 'storageStatePath' | 'defaultAuthProfile' | 'executablePath' | 'snapshotDir' | 'verbose' | 'cdpPort';
/** Retained name for callers that predate the section/JSON split. */
export type SettingField = SectionField;
/** One control's state, as the shared form model reports it. */
export type CardFieldState = SettingsFieldState;
export interface BrowserCardState extends SettingsFormShell {
    /** Single-input controls. */
    fields: Record<SectionField, CardFieldState>;
    /** JSON code-editor controls, kept apart so `fields` stays exhaustively keyed. */
    jsonFields: Record<string, CardFieldState>;
}
/**
 * The single-input section fields the card edits, in display order. Every entry
 * must also be `.volatile()` in the Host Config schema: `volatileForm` drops
 * unmarked fields, and the Host would refuse a write to one.
 */
export declare const FIELD_SPECS: readonly SettingsFieldSpec[];
/** The JSON-shaped section fields the card renders as code editors. */
export declare const JSON_FIELD_SPECS: readonly SettingsFieldSpec[];
/** Section fields rendered as JSON code editors rather than single inputs. */
export declare const JSON_FIELDS: ReadonlySet<string>;
/** Every field the card renders, in display order. */
export declare const ALL_FIELD_SPECS: readonly SettingsFieldSpec[];
export declare class BrowserSettingsController {
    private readonly form;
    private readonly store;
    constructor(scope: SettingsFormScope<Record<string, unknown>>);
    inject(): {
        edit: (field: string, text: string) => void;
        resetField: (field: string) => void;
        save: () => void;
        discard: () => void;
        hooks: {
            browserSettings: SnapshotStore<BrowserCardState>;
        };
    };
    snapshot(): BrowserCardState;
    dispose(): void;
    private project;
}
