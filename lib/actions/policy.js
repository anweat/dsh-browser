/**
 * Policy actions: let the agent read and tighten (or, with approval, loosen) the restriction-type settings.
 *
 * `inspect.policy` reads the effective policy and the audit trail. The `runtime.*` actions write the policy
 * overlay (see ../policy-overlay.ts): every change needs a `reason`, is validated strictly, is applied at once, and
 * is audited. The approval rule is by direction, not by action: tightening is free, loosening follows the
 * automationMode (approval-policy.ts), and a loosening that went through carries `risk` in its result.
 * @module dsh-browser/actions/policy
 */
import { USAGE_POLICY_BOUNDS } from "../policy-keys.js";
const REASON = { type: 'string', required: true, description: 'Why the policy changes (3-300 characters). Recorded in the audit trail.' };
const EXPECTED = { type: 'number', description: 'Revision from inspect.policy; the change is refused if the policy changed since.' };
const USAGE_PARAMS = Object.fromEntries(Object.entries(USAGE_POLICY_BOUNDS).map(([key, [min, max]]) => [key, { type: 'number', description: `Integer ${min}-${max}.` }]));
export const POLICY_ACTION_NAMES = ['runtime.set_auth_profile', 'runtime.remove_auth_profile', 'runtime.set_usage_policy', 'runtime.reset_policy'];
/** The overlay change an action call asks for (undefined for anything else). Shared by the executor and the approval hook. */
export function policyChangeFor(action, rawArgs) {
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {});
    switch (action) {
        case 'runtime.set_auth_profile':
            return { kind: 'setAuthProfile', id: args.id, allowedDomains: args.allowedDomains, persistState: args.persistState, storageStatePath: args.storageStatePath };
        case 'runtime.remove_auth_profile':
            return { kind: 'removeAuthProfile', id: args.id };
        case 'runtime.set_usage_policy': {
            const values = {};
            for (const key of Object.keys(USAGE_POLICY_BOUNDS))
                if (args[key] !== undefined)
                    values[key] = args[key];
            return { kind: 'setUsagePolicy', values };
        }
        case 'runtime.reset_policy':
            return { kind: 'reset', scope: args.scope, ...typeof args.id === 'string' ? { id: args.id } : {} };
        default:
            return undefined;
    }
}
// What the note says depends on who let the change through: in unrestricted nobody was asked, otherwise the user approved it.
const RISK_NOTE_UNASKED = 'This change widened what the browser may do. With automationMode=unrestricted nothing asks the user before an agent loosens a restriction; the user can review it in the settings card (policy overlay) and roll it back there.';
const RISK_NOTE_APPROVED = 'This change widened what the browser may do and was approved for this call. The user can review it in the settings card (policy overlay) and roll it back there.';
function execute(action) {
    return async (args, ctx) => {
        const change = policyChangeFor(action, args);
        const result = await ctx.service.changePolicy(change, {
            source: 'agent',
            session: ctx.sessionId,
            action,
            reason: args.reason,
            ...typeof args.expectedRevision === 'number' ? { expectedRevision: args.expectedRevision } : {},
        });
        const loosened = result.direction === 'loosen';
        return {
            revision: result.revision,
            direction: result.direction,
            changes: result.diff.lines,
            before: result.before,
            after: result.after,
            ...result.sessionsClosed > 0 ? { sessionsClosed: result.sessionsClosed, note: 'Sessions whose login state this change took away were closed; their next target.open starts fresh.' } : {},
            // Present on every loosening, whoever approved it.
            ...loosened ? { risk: {
                    level: 'elevated',
                    loosened: result.diff.lines,
                    approval: ctx.config.automationMode === 'unrestricted' ? 'none (automationMode=unrestricted does not ask)' : 'approved by the user for this call',
                    note: ctx.config.automationMode === 'unrestricted' ? RISK_NOTE_UNASKED : RISK_NOTE_APPROVED,
                } } : {},
        };
    };
}
export const POLICY_ACTIONS = [
    {
        name: 'inspect.policy',
        group: 'inspect',
        summary: 'Read the effective auth profiles and usage limits, which values the policy overlay changed, and the newest audit entries.',
        notes: 'The overlay is a managed layer over the configured baseline: it can only hold auth profiles and usage limits, and the user can clear it from the settings card. revision is what expectedRevision of the runtime.* policy actions refers to. Domain scopes show as stored (lower-case punycode).',
        params: { auditLimit: { type: 'number', description: 'Newest 1-50 audit entries. Default 10.' } },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
        examples: [{ args: {} }],
        async execute(args, ctx) {
            return ctx.service.policyReport({ ...typeof args.auditLimit === 'number' ? { auditLimit: args.auditLimit } : {}, viewerSession: ctx.sessionId });
        },
    },
    {
        name: 'runtime.set_auth_profile',
        group: 'runtime',
        summary: 'Create an auth profile or change its allowedDomains, persistState or storageStatePath. Narrowing is free; widening needs approval.',
        notes: 'allowedDomains replaces the whole list: registrable domains or *.domain only (no TLDs, public suffixes, IPs, ports or paths; private hosts only with allowPrivateHosts). A new profile needs allowedDomains and a state file inside the auth directory (default <authDir>/<id>.json, which must exist unless persistState is true). Widening (more domains, a new profile, persistState on, another state file) is denied in read-only, asks in standard and autonomous, and runs unasked in unrestricted with `risk` in the result. Open sessions that lose access are closed.',
        params: {
            id: { type: 'string', required: true, description: 'Profile id: letters, digits, _ and -, at most 40.' },
            allowedDomains: { type: 'array', items: { type: 'string' }, description: 'Complete list, at most 50 entries, e.g. ["example.com","*.example.org"].' },
            persistState: { type: 'boolean', description: 'Write the refreshed login state back to the state file when a context closes. Widening.' },
            storageStatePath: { type: 'string', description: 'Absolute .json path inside the auth directory (inspect.policy shows authDir).' },
            reason: REASON, expectedRevision: EXPECTED,
        },
        approval: 'policy', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 15_000,
        errors: ['POLICY_DENIED'],
        examples: [{ args: { id: 'forum', allowedDomains: ['example.com'], reason: 'Task needs the forum login' } }],
        execute: execute('runtime.set_auth_profile'),
    },
    {
        name: 'runtime.remove_auth_profile',
        group: 'runtime',
        summary: 'Remove an auth profile (always allowed; open sessions using it are closed).',
        params: { id: { type: 'string', required: true, description: 'Profile id from inspect.policy.' }, reason: REASON, expectedRevision: EXPECTED },
        approval: 'policy', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 15_000,
        examples: [{ args: { id: 'forum', reason: 'No longer needed' } }],
        execute: execute('runtime.remove_auth_profile'),
    },
    {
        name: 'runtime.set_usage_policy',
        group: 'runtime',
        summary: 'Change usage limits (minDelayMs, maxConcurrency, burst, ...). Stricter values are free; looser ones need approval.',
        notes: 'Same ranges as the usagePolicy configuration; none can be set beyond them. Stricter means a longer delay or backoff, lower concurrency, burst, pages, depth or retries. Any looser value makes the change a loosening: denied in read-only, asks in standard and autonomous, unasked in unrestricted with `risk` in the result.',
        params: { ...USAGE_PARAMS, reason: REASON, expectedRevision: EXPECTED },
        approval: 'policy', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 15_000,
        examples: [{ args: { minDelayMs: 2000, maxConcurrency: 1, reason: 'The site rate-limits us' } }],
        execute: execute('runtime.set_usage_policy'),
    },
    {
        name: 'runtime.reset_policy',
        group: 'runtime',
        summary: 'Drop overlay changes and return to the configured baseline: all of them, only the usage limits, or one profile.',
        notes: 'Going back to the baseline can itself be a loosening (the overlay may have narrowed it); it is judged the same way.',
        params: {
            scope: { type: 'string', required: true, enum: ['all', 'usagePolicy', 'authProfile'], description: 'What to reset.' },
            id: { type: 'string', description: 'The profile, with scope=authProfile.' },
            reason: REASON, expectedRevision: EXPECTED,
        },
        approval: 'policy', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 15_000,
        examples: [{ args: { scope: 'all', reason: 'Back to the configured policy' } }],
        execute: execute('runtime.reset_policy'),
    },
];
//# sourceMappingURL=policy.js.map