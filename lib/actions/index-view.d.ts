/**
 * The progressive-disclosure views behind `browser_index`.
 *
 * L1 is the group list (root) and one group's actions; L2 is one action's full
 * schema. Only actions usable under the current automationMode are listed;
 * the rest collapse into one line with the reason.
 * @module dsh-browser/actions/index-view
 */
import { type ActionDef } from './types.ts';
import { type AutomationMode, type ExposureOptions } from '../freedom.ts';
import type { ResolvedPrompts } from '../prompts.ts';
export interface IndexEnvironment {
    mode: AutomationMode;
    options: ExposureOptions;
    enabled: boolean;
    /** True when the `dsh-browser` skill is registered with the Host. */
    skillAvailable: boolean;
    /** Runtime facts worth surfacing at the root (undefined when unknown). */
    runtime?: {
        chromiumInstalled?: boolean;
        opencliInstalled?: boolean;
        opencliEnabled?: boolean;
    };
    /** Deployment overrides of the text (`prompts` configuration); absent means the built-in text everywhere. */
    prompts?: ResolvedPrompts;
}
/** The fallback guide shown at the root when no skill service is present (kept under ~300 tokens). */
export declare const COMPACT_GUIDE: string;
export declare function renderRoot(env: IndexEnvironment): string;
export declare function renderGroup(group: string, env: IndexEnvironment): string;
export declare function renderAction(name: string, env: IndexEnvironment): string;
export declare function searchActions(query: string, env: IndexEnvironment): ActionDef[];
export declare function renderSearch(query: string, env: IndexEnvironment): string;
/** Resolve a `browser_index` call to text. `action` wins over `group`, which wins over `query`. */
export declare function renderIndex(args: {
    group?: string;
    action?: string;
    query?: string;
}, env: IndexEnvironment): {
    level: 'root' | 'group' | 'action' | 'search';
    text: string;
};
