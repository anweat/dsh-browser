/**
 * Approval classification, per action.
 *
 * The Host hook resolves a model tool call (`browser_call`, or a flat
 * per-action tool) to an action name plus its arguments and asks this module
 * for a decision. Each action carries an approval class in the registry; the
 * rules below interpret that class for the current automationMode. Reasons
 * name the action and its key arguments, so the user sees `act.click #submit`
 * rather than a generic dispatcher tool.
 * @module dsh-browser/approval-policy
 */
import { type AutomationMode } from './freedom.ts';
export type BrowserPolicyDecision = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
} | {
    kind: 'ask';
    reason: string;
};
/**
 * Decide whether a call may run.
 * @param name - an action name (`act.click`) or one of the WebSearch tool names this policy also guards.
 * @param args - the action's own arguments (never the `browser_call` wrapper).
 * @param mode - the configured automationMode.
 * @param assetKind - for `automation.run`, the kind of the asset about to run.
 */
export declare function browserPolicyDecision(name: string, args: unknown, mode?: AutomationMode, assetKind?: 'recipe' | 'userscript'): BrowserPolicyDecision;
