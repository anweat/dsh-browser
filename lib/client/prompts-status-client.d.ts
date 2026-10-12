import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PromptsStatus } from '../prompts.ts';
import { type PromptDefaults } from './prompts-form.ts';
export interface PromptsStatusState {
    loading: boolean;
    failed: boolean;
    /** What the running plugin reports: the overrides in force, the diagnostics, and the L0 estimate. */
    status?: PromptsStatus;
    /** The JSON of every default prompt text, once "Export default text" has loaded it (the same text `prompts:dump` prints). */
    defaults?: string;
    /** Set when loading the defaults failed. */
    defaultsFailed?: boolean;
    /** The plugin's own text per prompt control and its default groups/actions/errorHints, loaded when the card opens. */
    defaultTexts?: PromptDefaults;
    /** The default export as loaded, so "Export default text" can show it without another request. */
    defaultsJson?: string;
}
/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
export declare class PromptsStatusController {
    private readonly rpc;
    private readonly store;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    /** The prompt defaults the form compares with and shows as placeholders; undefined until they are loaded. */
    promptDefaults(): PromptDefaults | undefined;
    inject(): {
        hooks: {
            promptsStatus: SnapshotStore<PromptsStatusState>;
        };
        refreshPromptsStatus: () => void;
        exportPromptDefaults: () => Promise<void>;
        loadPromptDefaults: () => Promise<void>;
        hidePromptDefaults: () => void;
    };
    snapshot(): PromptsStatusState;
    dispose(): void;
    /** Fetch the default texts (once; a later call reuses them). They feed the placeholders and the "equal to default is no override" rule. */
    loadDefaults(): Promise<void>;
    /** Show the default text in the read-only box under the section. */
    exportDefaults(): Promise<void>;
    refresh(): Promise<void>;
    private publish;
}
