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
import { type LineIssue } from './properties-form.ts';
import { type PolicyFieldName } from './policy-fields.ts';
import { type AuthProfileEntry } from './auth-profiles-form.ts';
import { type PromptDefaults, type PromptExtraEntry, type PromptExtraKind, type PromptExtraValue, type PromptTextFieldId } from './prompts-form.ts';
export type SectionField = 'enabled' | 'automationMode' | 'toolSurface' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled' | 'autoInstall' | 'storageStatePath' | 'defaultAuthProfile' | 'executablePath' | 'snapshotDir' | 'verbose' | 'cdpPort' | 'maxSessions' | 'downloadDir' | 'downloadMaxBytes' | 'allowPrivateHosts' | 'viewportMode' | 'viewportWidth' | 'viewportHeight' | 'userAgent' | 'locale' | 'timezoneId' | 'proxyServer' | 'proxyBypass';
/** Retained name for callers that predate the section/JSON split. */
export type SettingField = SectionField;
/** One control's state, as the shared form model reports it. */
export type CardFieldState = SettingsFieldState;
export interface BrowserCardState extends SettingsFormShell {
    /** Single-input controls. */
    fields: Record<SectionField, CardFieldState>;
    /** JSON code-editor controls, kept apart so `fields` stays exhaustively keyed. */
    jsonFields: Record<string, CardFieldState>;
    /** The "prompt text" section: views of the one staged `prompts` draft. */
    prompts: PromptsCardState;
    /** The "default parameters" editor: one properties text over the plugin-wide default fields. */
    properties: PropertiesCardState;
    /** The policy objects as one control per key: the text shown, whether it differs from the default, and why a typed text is refused. */
    policies: Record<PolicyFieldName, Record<string, PolicyKeyState>>;
    /** Problems that involve several fields (a custom viewport needs both sizes), by the field that is missing something. They block the save. */
    problems: Record<string, string>;
    /** The configuration fields a save would write (staged and different from what is stored), in field order. */
    changes: string[];
}
export interface PolicyKeyState {
    text: string;
    overridden: boolean;
    problem?: 'invalidNumber' | 'invalidChoice' | 'invalidRange';
}
export interface PropertiesCardState {
    /** What the editor shows: what was typed (kept verbatim while it has problems), else the text printed from the fields. */
    text: string;
    /** Line-level problems of the text. Errors block the save. */
    issues: LineIssue[];
    /** The keys that carry an override right now, in display order. */
    overridden: {
        key: string;
        value: string;
    }[];
    invalid: boolean;
}
export interface PromptsCardState {
    texts: Record<PromptTextFieldId, {
        text: string;
        invalid: boolean; /** The stored override is exactly the default text, so it changes nothing. */
        sameAsDefault: boolean;
    }>;
    skillEnabled: boolean;
    /** The JSON box for groups, actions and errorHints. */
    extras: {
        text: string;
        invalid: boolean;
    };
    /** The overridden group, action and error-hint entries of the staged draft, for the list. */
    entries: PromptExtraEntry[];
    /** Whether saving would leave a `prompts` entry in the user layer. */
    overridden: boolean;
    /** Whether the whole `prompts` draft is one the plugin would refuse to take. */
    invalid: boolean;
}
/**
 * The single-input section fields the card edits, in display order. Every entry
 * must also be `.volatile()` in the Host Config schema: `volatileForm` drops
 * unmarked fields, and the Host would refuse a write to one.
 */
export declare const FIELD_SPECS: readonly SettingsFieldSpec[];
/** The JSON-shaped section fields: objects (policies, prompts) and the launch-argument array. */
export declare const JSON_FIELD_SPECS: readonly SettingsFieldSpec[];
/**
 * Public config fields the card has no form for, on purpose: nested records (named login states, rule packs with
 * hash-pinned scripts) that are safer to edit in the profile config file. The card names each one and says so, instead
 * of leaving it out without a word. `rulePacks` is not `.volatile()` in the Host schema, so no form could write it.
 */
export declare const CONFIG_FILE_ONLY_FIELDS: readonly ["rulePacks"];
/** Section fields rendered as JSON code editors rather than single inputs. */
export declare const JSON_FIELDS: ReadonlySet<string>;
/** Every field the card renders, in display order. */
export declare const ALL_FIELD_SPECS: readonly SettingsFieldSpec[];
export declare class BrowserSettingsController {
    private readonly scope;
    private readonly promptDefaults;
    private readonly form;
    private readonly store;
    /** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
    private extrasRaw;
    private extrasInvalid;
    /** The properties text as typed; undefined shows the text printed from the staged fields. */
    private propsRaw;
    private propsIssues;
    /** The language of the comments printed in the advanced text; the card sets it from its own language. */
    private docsLang;
    /** What was typed in each prompt control while it differs from what is staged (a text equal to the default stages nothing). */
    private readonly promptRaw;
    /** What was typed in a policy key's control while it is not a value the key accepts. */
    private readonly policyRaw;
    /** `promptDefaults` reads the plugin's own prompt texts once they are loaded; until then nothing is "equal to default". */
    constructor(scope: SettingsFormScope<Record<string, unknown>>, promptDefaults?: () => PromptDefaults | undefined);
    inject(): {
        edit: (field: string, text: string) => void;
        resetField: (field: string) => void;
        save: () => Promise<void>;
        discard: () => void;
        editProperties: (text: string) => void;
        setPropertyLanguage: (lang: string) => void;
        resetProperty: (key: string) => void;
        editPromptText: (id: PromptTextFieldId, text: string) => void;
        setPromptSkillEnabled: (enabled: boolean) => void;
        editPromptExtras: (text: string) => void;
        editPolicyKey: (field: PolicyFieldName, key: string, text: string) => void;
        saveAuthProfile: (id: string, entry: AuthProfileEntry) => void;
        removeAuthProfile: (id: string) => void;
        resetPromptExtras: () => void;
        setPromptExtra: (kind: PromptExtraKind, key: string, value: PromptExtraValue | undefined) => void;
        hooks: {
            browserSettings: SnapshotStore<BrowserCardState>;
        };
    };
    /** Forget the advanced text as typed, so it is printed again from the fields (their edits are already staged). */
    private dropTypedProperties;
    /** Rules that span fields, read from the texts the fields hold now (the deployed sizes count when a control does not set them). */
    private crossProblems;
    /** The fields a save would write: the text differs from the stored one, or a reset leaves the stored override. */
    private changedFields;
    private save;
    private spec;
    /** The text of a field as the plugin has it now (stored, deployed, or default), ignoring anything staged. */
    private storedText;
    private isStored;
    /** Print the text from the fields as they are (staged edits included). */
    private printProperties;
    /**
     * Stage the fields to match a properties text: a key with a value is edited to it, a key without one (commented,
     * deleted, blank) goes back to the default. The staged result is the same per-field `set` / `unset` the one-control
     * form produced, so the saved configuration has the same flat keys and nothing else.
     */
    editProperties(text: string): void;
    /** Print the comments of the advanced text in this language (`zh`, anything else is English). Text the person typed is not touched. */
    setPropertyLanguage(lang: string): void;
    /** Comment out one key's line: that parameter goes back to the default. */
    resetProperty(key: string): void;
    private projectProperties;
    /** The staged `prompts` value as an object (empty when none, or when its text is not JSON). */
    private promptsDraft;
    private stagePrompts;
    private refresh;
    private clearPromptRaw;
    /**
     * A prompt text: blank, or exactly the plugin's default text, is NO override. Saving the default as an override
     * would freeze today's wording and hide every later improvement, so the box keeps what was typed (an author may
     * have copied the default to edit it) while nothing is staged for it.
     */
    editPromptText(id: PromptTextFieldId, text: string): void;
    setPromptSkillEnabled(enabled: boolean): void;
    editPromptExtras(text: string): void;
    /**
     * One entry of the groups / actions / errorHints lists, from the entry dialog. An entry equal to the plugin's own
     * text is no override (see editPromptText), so it leaves the list instead of freezing today's wording.
     */
    setPromptExtra(kind: PromptExtraKind, key: string, value: PromptExtraValue | undefined): void;
    /** Back to the plugin's own text for groups, actions and error hints. */
    resetPromptExtras(): void;
    private clearPolicyRaw;
    private policyHasRaw;
    /** The staged policy object (empty when its text is not a JSON object yet). */
    private policyDraft;
    /** `value` without the keys that equal their default (and without anything the policy does not know), keys in the card's order. */
    private minimalPolicy;
    /**
     * One key of a policy object, from its own control. A text the key does not accept is kept as typed (and blocks the
     * save); an empty text, or the default itself, removes the key so the object holds only what differs.
     */
    editPolicyKey(field: PolicyFieldName, key: string, text: string): void;
    private projectPolicies;
    /** Stage a whole `authProfiles` map; the stored map itself is staged back when they are equal, so the form is clean again. */
    private stageProfiles;
    /** Add or replace one profile. A profile's state-file path is kept as given: the card never rewrites a path it did not create. */
    saveAuthProfile(id: string, entry: AuthProfileEntry): void;
    /** Remove one profile from the baseline configuration. */
    removeAuthProfile(id: string): void;
    snapshot(): BrowserCardState;
    dispose(): void;
    private project;
    private projectPrompts;
}
