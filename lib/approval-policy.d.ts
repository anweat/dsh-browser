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
import { type AnyRecipeStep } from './automation.ts';
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
 * The one rule for replaying recipe steps: read-only steps run directly; mutating steps are denied in
 * read-only, asked in standard, and free in autonomous and unrestricted. `automation.run_recipe` applies
 * it to the steps in the call, and `automation.develop` test applies it to the steps of the draft.
 */
export declare function recipeStepsDecision(name: string, steps: readonly AnyRecipeStep[], mode: AutomationMode): BrowserPolicyDecision;
/**
 * Decide whether a call may run.
 * @param name - an action name (`act.click`) or one of the WebSearch tool names this policy also guards.
 * @param args - the action's own arguments (never the `browser_call` wrapper).
 * @param mode - the configured automationMode.
 * @param assetKind - for `automation.run` and `automation.develop` test, the kind of the asset about to run.
 * @param draftSteps - for `automation.develop` test of a recipe, the steps the draft would replay.
 */
export declare function browserPolicyDecision(name: string, args: unknown, mode?: AutomationMode, assetKind?: 'recipe' | 'userscript', draftSteps?: readonly AnyRecipeStep[]): BrowserPolicyDecision;
