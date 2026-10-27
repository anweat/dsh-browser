/**
 * Policy actions: let the agent read and tighten (or, with approval, loosen) the restriction-type settings.
 *
 * `inspect.policy` reads the effective policy and the audit trail. The `runtime.*` actions write the policy
 * overlay (see ../policy-overlay.ts): every change needs a `reason`, is validated strictly, is applied at once, and
 * is audited. The approval rule is by direction, not by action: tightening is free, loosening follows the
 * automationMode (approval-policy.ts), and a loosening that went through carries `risk` in its result.
 * @module dsh-browser/actions/policy
 */
import type { PolicyChange } from '../policy-overlay.ts';
import type { ActionDef } from './types.ts';
export declare const POLICY_ACTION_NAMES: readonly ["runtime.set_auth_profile", "runtime.remove_auth_profile", "runtime.set_usage_policy", "runtime.reset_policy"];
/** The overlay change an action call asks for (undefined for anything else). Shared by the executor and the approval hook. */
export declare function policyChangeFor(action: string, rawArgs: unknown): PolicyChange | undefined;
export declare const POLICY_ACTIONS: ActionDef[];
