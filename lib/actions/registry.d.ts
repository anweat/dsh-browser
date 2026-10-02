/**
 * The action registry: the single definition of every model-visible browser
 * capability. Tool surfaces, approval policy, and exposure rules are all
 * derived from this list.
 * @module dsh-browser/actions/registry
 */
import { type ActionDef, type ActionGroup, type ActionTraits } from './types.ts';
export declare const ACTIONS: readonly ActionDef[];
export declare const GROUP_SUMMARIES: Record<ActionGroup, string>;
/**
 * The flags that apply to THIS call. An action with sub-actions takes the flags of the operation the
 * arguments select; an unknown or missing operation gets the action-level (strictest) flags.
 */
export declare function traitsFor(action: ActionDef, args?: unknown): ActionTraits;
/** Whether any operation of the action is usable in `read-only` mode (decides whether it is listed there at all). */
export declare function readOnlyCapable(action: ActionDef): boolean;
/** `automation.develop.save` resolves to the action and its operation; undefined for anything else. */
export declare function findSubAction(name: unknown): {
    action: ActionDef;
    sub: string;
} | undefined;
export declare function isActionGroup(value: unknown): value is ActionGroup;
export declare function findAction(name: unknown): ActionDef | undefined;
export declare function actionsInGroup(group: ActionGroup): ActionDef[];
/** Tool name for an action on the flat surface: `browser_<group>_<action>` (`browser_crawl` for crawl.crawl). */
export declare function flatToolName(action: ActionDef): string;
export declare function findActionByFlatTool(toolName: string): ActionDef | undefined;
/** The two tools of the indexed surface. */
export declare const INDEX_TOOL = "browser_index";
export declare const CALL_TOOL = "browser_call";
