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
/** An asset as the approval prompt names it: enough to recognise it without the full UUID. */
export interface AssetRef {
    id: string;
    name: string;
    revision: number;
}
/**
 * `"Host check: docs search" r1 (5fdc912d)`: the name (control characters and line breaks flattened, cut to 60 characters,
 * quoted so it reads as data), the revision, and the first 8 characters of the id. The name is whatever a model saved, so
 * it is never trusted to be one line.
 */
export declare function assetLabel(asset: AssetRef): string;
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
 * @param asset - for the same two, the asset itself, so the approval prompt names it instead of showing a bare id.
 */
export declare function browserPolicyDecision(name: string, args: unknown, mode?: AutomationMode, assetKind?: 'recipe' | 'userscript', draftSteps?: readonly AnyRecipeStep[], asset?: AssetRef): BrowserPolicyDecision;
/**
 * The decision the Host hook returns for a resolved browser action, in this order:
 *
 * 1. An action the automationMode disables stays denied (`browserPolicyDecision` says so).
 * 2. Arguments `runAction` would refuse for their shape are let through unasked: the executor validates them
 *    again with the same check and returns `INVALID_ARGS` with the schema, and runs nothing.
 * 3. Otherwise the approval rules of `browserPolicyDecision` apply. The rules that read the arguments themselves
 *    (upload paths, evaluate expression, userscript source) therefore only see arguments that passed the schema.
 */
export declare function browserCallDecision(...params: Parameters<typeof browserPolicyDecision>): BrowserPolicyDecision;
