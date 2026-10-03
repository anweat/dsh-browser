/**
 * Model-facing tool surfaces for dsh-browser.
 *
 * Every capability is an action in the registry (`src/actions/`). This module
 * only projects that registry into tools:
 *
 * - `indexed` (default): two small tools, `browser_index` for progressive
 *   disclosure and `browser_call` to run an action. Constant, tiny context cost.
 * - `flat`: one tool per usable action, named `browser_<group>_<action>`.
 *   Every action is described up front; useful for comparison and debugging.
 *
 * Both surfaces dispatch through the same {@link runAction}, so validation,
 * the result envelope, and the error codes are identical.
 * @module dsh-browser/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { sessionKeyFor } from "./browser-service.js";
import { configuredBrowserActions } from "./freedom.js";
import { AutomationDevelopmentService } from "./automation-development.js";
import { ACTIONS, CALL_TOOL, INDEX_TOOL, flatToolName, traitsFor } from "./actions/registry.js";
import { expandParams } from "./actions/schema.js";
import { renderIndex } from "./actions/index-view.js";
import { runAction } from "./actions/run.js";
import { COMPLIANCE_NOTICE } from "./actions/shared.js";
function sessionId(exec) {
    const value = exec?.agent?.session?.id;
    return typeof value === 'string' && value ? value : 'unknown-session';
}
const ENVELOPE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        ok: { type: 'boolean', required: true },
        action: { type: 'string', required: true },
        seq: { type: 'number' },
        executionStatus: { type: 'string', required: true, enum: ['completed', 'failed', 'cancelled', 'outcome_unknown'] },
        result: { type: 'object', additionalProperties: true },
        error: {
            type: 'object', additionalProperties: false,
            properties: {
                code: { type: 'string', required: true },
                message: { type: 'string', required: true },
                hint: { type: 'string' },
                schema: { type: 'string' },
                current: {
                    type: 'object', additionalProperties: false,
                    properties: { targetId: { type: 'string', required: true }, generation: { type: 'number', required: true } },
                },
                candidates: {
                    type: 'object', additionalProperties: false,
                    properties: {
                        total: { type: 'number', required: true },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object', additionalProperties: false,
                                properties: {
                                    index: { type: 'number', required: true },
                                    role: { type: 'string', required: true },
                                    name: { type: 'string', required: true },
                                    text: { type: 'string', required: true },
                                    visible: { type: 'boolean', required: true },
                                },
                            },
                        },
                    },
                },
            },
        },
        truncation: {
            type: 'object', additionalProperties: false,
            properties: { omitted: { type: 'number', required: true }, reason: { type: 'string', required: true } },
        },
    },
};
const renderEnvelope = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }];
export function registerTools(ctx, config, service, assets, runtime = {}) {
    if (!config.enabled)
        return;
    const development = assets ? new AutomationDevelopmentService(assets, config.automationAssets) : undefined;
    const runEnv = { mode: config.automationMode, options: config.automationAssets, enabled: config.enabled };
    const register = (tool) => { ctx.tools.register(tool); };
    const actionContext = (exec) => ({
        service, config, ...assets ? { assets } : {}, ...development ? { development } : {},
        session: sessionKeyFor(exec?.agent),
        sessionId: sessionId(exec),
        agent: exec?.agent,
        signal: exec?.signal ?? new AbortController().signal,
    });
    if (config.toolSurface === 'flat') {
        const exposed = new Set(configuredBrowserActions(config.automationMode, config.automationAssets, config.enabled));
        for (const action of ACTIONS.filter(entry => exposed.has(entry.name)))
            register(flatTool(action, actionContext, runEnv));
        return;
    }
    register(defineTool({
        name: INDEX_TOOL,
        description: 'Browser capability index. No args: groups and environment state. {group}: that group\'s actions. {action}: one action\'s full schema. {query}: keyword search.',
        parameters: {
            group: { type: 'string', description: 'Group name, e.g. act.' },
            action: { type: 'string', description: 'Action name, e.g. act.click.' },
            query: { type: 'string', description: 'Keywords.' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { level: { type: 'string', required: true }, text: { type: 'string', required: true } } },
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        timeoutMs: 15_000,
        isConcurrencySafe: () => true,
        async execute(args) {
            const env = {
                mode: config.automationMode, options: config.automationAssets, enabled: config.enabled,
                skillAvailable: runtime.skillAvailable?.() ?? false,
            };
            if (!args.group && !args.action && !args.query) {
                try {
                    const status = await service.status();
                    env.runtime = { chromiumInstalled: status.chromiumInstalled, opencliInstalled: status.opencliInstalled, opencliEnabled: status.opencliEnabled };
                }
                catch { /* runtime facts are best-effort */ }
            }
            return renderIndex(args, env);
        },
    }));
    register(defineTool({
        name: CALL_TOOL,
        description: 'Run one browser action; browser_index shows the names. Args are validated server-side: INVALID_ARGS replies include the schema. Reply: {ok, action, executionStatus, result | error{code,message,hint}}. ' + COMPLIANCE_NOTICE,
        parameters: {
            action: { type: 'string', required: true, description: 'Action name, e.g. target.open.' },
            args: { type: 'object', additionalProperties: true, description: 'Arguments for the action.' },
        },
        output: { schema: ENVELOPE_SCHEMA, render: renderEnvelope },
        timeoutMs: 600_000,
        // Calls are serialized per agent step: interactions share one page, and the Host classifier cannot read the action.
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            return runAction(args.action, args.args, actionContext(exec), runEnv);
        },
    }));
}
/** One flat tool for one action: the same registry entry, projected as a native tool. */
function flatTool(action, actionContext, runEnv) {
    return defineTool({
        name: flatToolName(action),
        description: action.summary + (action.notes ? ' ' + action.notes : '') + (action.group === 'runtime' || action.group === 'inspect' ? '' : ' ' + COMPLIANCE_NOTICE),
        parameters: expandParams(action.params),
        output: { schema: ENVELOPE_SCHEMA, render: renderEnvelope },
        timeoutMs: action.timeoutMs + 5_000,
        isConcurrencySafe: (args) => traitsFor(action, args).concurrencySafe,
        async execute(args, exec) {
            return runAction(action.name, args, actionContext(exec), runEnv);
        },
    });
}
//# sourceMappingURL=tools.js.map