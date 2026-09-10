/**
 * Model-facing browser tools for dsh-browser: an interactive, multi-step
 * browser over a persistent page (open/click/type/scroll/read/screenshot/close)
 * plus status and chromium-install helpers.
 * @module dsh-browser/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { configuredBrowserTools } from "./freedom.js";
import { AutomationDevelopmentService } from "./automation-development.js";
import { executeAutomationAsset } from "./automation-execution.js";
function sessionId(exec) {
    const value = exec?.agent?.session?.id;
    return typeof value === 'string' && value ? value : 'unknown-session';
}
function developmentResult(action, value, asset) {
    const raw = JSON.stringify(value);
    return { action, ...asset ? { assetId: asset.id, status: asset.status } : {}, resultJson: raw.slice(0, 100_000), truncated: raw.length > 100_000 };
}
function renderState(v) {
    const parts = [];
    if (v.title)
        parts.push('Title: ' + v.title);
    parts.push(v.url);
    parts.push(v.text);
    if (v.screenshotPath)
        parts.push('Screenshot: ' + v.screenshotPath);
    return [{ type: 'text', text: parts.join('\n\n') }];
}
function renderScriptResult(value) {
    const v = value;
    return [{ type: 'text', text: [
                `Script: ${v.name} (${v.sha256.slice(0, 12)})`,
                `URL: ${v.url}`,
                `Capabilities: ${v.capabilities.join(', ')}`,
                v.resultJson + (v.truncated ? '\n(result truncated)' : ''),
            ].join('\n') }];
}
const SCRIPT_RESULT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        url: { type: 'string', required: true },
        name: { type: 'string', required: true },
        sha256: { type: 'string', required: true },
        capabilities: { type: 'array', required: true, items: { type: 'string' } },
        resultJson: { type: 'string', required: true },
        truncated: { type: 'boolean', required: true },
    },
};
const RECIPE_STEP_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        type: { type: 'string', required: true, enum: ['wait', 'click', 'fill', 'type', 'press', 'select', 'check', 'hover', 'scroll', 'extract', 'assert', 'screenshot'] },
        condition: { type: 'string', enum: ['selector', 'text', 'load', 'time'] },
        selector: { type: 'string' },
        value: { type: 'string' },
        text: { type: 'string' },
        key: { type: 'string' },
        timeoutMs: { type: 'number' },
        waitMs: { type: 'number' },
        deltaY: { type: 'number' },
        checked: { type: 'boolean' },
        mode: { type: 'string', enum: ['text', 'html', 'links', 'attribute'] },
        attribute: { type: 'string' },
        limit: { type: 'number' },
    },
};
const COMPLIANCE_NOTICE = 'The caller/operator must use this capability according to the target site rules and applicable requirements; dsh-browser only executes the requested browser operation and does not determine whether a particular use is permitted.';
const FRAME_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        selector: { type: 'string', description: 'CSS selector for an iframe. Use exactly one frame field.' },
        name: { type: 'string', description: 'Frame name. Use exactly one frame field.' },
        url: { type: 'string', description: 'Playwright frame URL/glob. Use exactly one frame field.' },
    },
};
const LOCATOR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        selector: { type: 'string', description: 'CSS selector. Use exactly one of selector, role, text, or label.' },
        role: { type: 'string', description: 'Accessible role used by Playwright getByRole.' },
        name: { type: 'string', description: 'Optional accessible name; valid only with role.' },
        text: { type: 'string', description: 'Visible text used by Playwright getByText.' },
        label: { type: 'string', description: 'Form label used by Playwright getByLabel.' },
        exact: { type: 'boolean', description: 'Require an exact semantic match. Defaults to false.' },
        frame: FRAME_SCHEMA,
    },
};
const INTERACTIVE_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        url: { type: 'string', required: true },
        title: { type: 'string' },
        text: { type: 'string', required: true },
        screenshotPath: { type: 'string' },
    },
};
function toolTarget(args, required = true) {
    if (typeof args.selector === 'string' && args.locator === undefined)
        return args.selector;
    if (args.selector === undefined && args.locator && typeof args.locator === 'object')
        return args.locator;
    if (!required && args.selector === undefined && args.locator === undefined)
        return undefined;
    throw new Error('provide exactly one of selector or locator');
}
export function registerTools(ctx, config, service, assets) {
    const exposedTools = new Set(configuredBrowserTools(config.automationMode, config.automationAssets, config.enabled));
    const development = assets ? new AutomationDevelopmentService(assets, config.automationAssets) : undefined;
    const register = (tool) => {
        if (exposedTools.has(String(tool.name)))
            ctx.tools.register(tool);
    };
    register(defineTool({
        name: 'browser_automation_search',
        description: '[Experimental] Search reusable browser automations by explicit task keywords and optional domain. Returns only compact metadata, never recipe steps or userscript source.',
        parameters: {
            query: { type: 'string', required: true, description: 'Short task description.' },
            domain: { type: 'string', description: 'Optional target hostname.' },
            status: { type: 'string', enum: ['active', 'draft', 'archived', 'all'], description: 'Asset lifecycle scope. Defaults to active.' },
            kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'Optional asset kind.' },
        },
        output: {
            schema: {
                type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                        id: { type: 'string', required: true }, kind: { type: 'string', required: true }, status: { type: 'string', required: true },
                        name: { type: 'string', required: true }, description: { type: 'string', required: true },
                        domains: { type: 'array', required: true, items: { type: 'string' } }, tags: { type: 'array', required: true, items: { type: 'string' } },
                        inputNames: { type: 'array', required: true, items: { type: 'string' } }, revision: { type: 'number', required: true },
                        testStatus: { type: 'string', required: true }, successCount: { type: 'number', required: true }, failureCount: { type: 'number', required: true },
                        updatedAt: { type: 'string', required: true }, lastRunAt: { type: 'string' },
                    } },
            },
            render: (_args, value) => [{ type: 'text', text: value.length ? value.map(item => `${item.id} — ${item.name} [${item.kind}] domains=${item.domains.join(',') || '*'} inputs=${item.inputNames.join(',') || '-'}`).join('\n') : 'No active reusable automation matched.' }],
        },
        isConcurrencySafe: () => true,
        async execute(args) { return assets?.search(args.query, args.domain, args.status, args.kind) ?? []; },
    }));
    register(defineTool({
        name: 'browser_automation_develop',
        description: '[Experimental] Explicitly inspect, save, validate, or replay one reusable automation draft. Use search first. Full recipe/source is returned only for action=get with an exact id. This tool never activates assets. ' + COMPLIANCE_NOTICE,
        parameters: {
            action: { type: 'string', required: true, enum: ['get', 'save', 'validate', 'test'] },
            id: { type: 'string', description: 'Exact asset id for get, update, or validate.' },
            kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'Required for save.' },
            name: { type: 'string', description: 'Required for save.' },
            description: { type: 'string' },
            domains: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' }, description: 'Explicit retrieval keywords, capped at 20.' },
            inputNames: { type: 'array', items: { type: 'string' }, description: 'Declared UserScript __DSH_INPUTS__ keys. Recipe placeholders are inferred.' },
            recipe: { type: 'array', items: RECIPE_STEP_SCHEMA, description: 'One to 25 declarative Playwright steps.' },
            source: { type: 'string', description: 'Complete UserScript with @match and @grant none; capped by validator.' },
            url: { type: 'string', description: 'Required for test; must match the draft domain and UserScript @match.' },
            inputs: { type: 'object', additionalProperties: true, description: 'Declared runtime inputs for test.' },
            authProfile: { type: 'string' }, rulePack: { type: 'string' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: {
                    action: { type: 'string', required: true }, assetId: { type: 'string' }, status: { type: 'string' },
                    resultJson: { type: 'string', required: true }, truncated: { type: 'boolean', required: true },
                } },
            render: (_args, value) => [{ type: 'text', text: `Automation development ${value.action}${value.assetId ? ` ${value.assetId} [${value.status}]` : ''}\n${value.resultJson}${value.truncated ? '\n(result truncated)' : ''}` }],
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            if (!assets || !development)
                throw new Error('model automation development is disabled');
            if (args.action === 'get') {
                if (!args.id)
                    throw new Error('automation development get requires id');
                const asset = development.get(args.id);
                return developmentResult('get', asset, asset);
            }
            if (args.action === 'validate') {
                if (!args.id)
                    throw new Error('automation development validate requires id');
                const asset = development.validate(args.id);
                return developmentResult('validate', { id: asset.id, kind: asset.kind, status: asset.status, testStatus: asset.testStatus, testMessage: asset.testMessage }, asset);
            }
            if (args.action === 'test') {
                if (!args.id || !args.url)
                    throw new Error('automation development test requires id and url');
                const result = await executeAutomationAsset(service, assets, args.id, args.url, args.inputs, 'draft', { signal: exec.signal, ...args.authProfile ? { authProfile: args.authProfile } : {}, ...args.rulePack ? { rulePack: args.rulePack } : {} });
                const raw = JSON.stringify(result.value);
                return developmentResult('test', { id: result.asset.id, testStatus: result.asset.testStatus, testMessage: result.asset.testMessage, resultJson: raw.slice(0, 50_000), truncated: raw.length > 50_000 }, result.asset);
            }
            if (args.action !== 'save' || !args.kind || !args.name)
                throw new Error('automation development save requires kind and name');
            const asset = development.save({
                ...args.id ? { id: args.id } : {}, kind: args.kind, name: args.name,
                ...args.description !== undefined ? { description: args.description } : {},
                ...args.domains ? { domains: args.domains } : {}, ...args.tags ? { tags: args.tags } : {},
                ...args.inputNames ? { inputNames: args.inputNames } : {}, ...args.recipe ? { recipe: args.recipe } : {},
                ...args.source !== undefined ? { source: args.source } : {},
            }, sessionId(exec));
            const compact = { id: asset.id, kind: asset.kind, status: asset.status, name: asset.name, domains: asset.domains, tags: asset.tags, inputNames: asset.inputNames, revision: asset.revision, testStatus: asset.testStatus };
            return developmentResult('save', compact, asset);
        },
    }));
    register(defineTool({
        name: 'browser_automation_run',
        description: '[Experimental] Run one manually activated reusable automation by id. Search first. Source and recipe internals remain Host-side; provide declared inputs and a target HTTP(S) URL. ' + COMPLIANCE_NOTICE,
        parameters: {
            id: { type: 'string', required: true }, url: { type: 'string', required: true },
            inputs: { type: 'object', additionalProperties: true, description: 'Declared string inputs used by named recipe placeholders.' },
            authProfile: { type: 'string' }, rulePack: { type: 'string' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: {
                    assetId: { type: 'string', required: true }, kind: { type: 'string', required: true }, resultJson: { type: 'string', required: true }, truncated: { type: 'boolean', required: true },
                } },
            render: (_args, value) => [{ type: 'text', text: `Automation ${value.assetId} [${value.kind}]\n${value.resultJson}${value.truncated ? '\n(result truncated)' : ''}` }],
        },
        timeoutMs: 120_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            if (!assets)
                throw new Error('automation assets are unavailable');
            const result = await executeAutomationAsset(service, assets, args.id, args.url, args.inputs, 'active', { signal: exec.signal, ...args.authProfile ? { authProfile: args.authProfile } : {}, ...args.rulePack ? { rulePack: args.rulePack } : {} });
            const raw = JSON.stringify(result.value);
            return { assetId: result.asset.id, kind: result.asset.kind, resultJson: raw.slice(0, 100_000), truncated: raw.length > 100_000 };
        },
    }));
    register(defineTool({
        name: 'browser_open',
        description: 'Open a URL in the persistent browser page and return the rendered title, readable text, and a full-page screenshot path. Optional bounded capture stores console messages and failed/4xx/5xx requests in memory without bodies or headers. ' + COMPLIANCE_NOTICE,
        parameters: {
            url: { type: 'string', required: true, description: 'The HTTP(S) URL to open.' },
            waitMs: { type: 'number', description: 'Extra settle time in ms after load.' },
            authProfile: { type: 'string', description: 'Named, domain-scoped auth profile from dsh-browser config.' },
            rulePack: { type: 'string', description: 'Named, domain-scoped enhancement rule pack.' },
            capture: { type: 'array', items: { type: 'string', enum: ['console', 'network'] }, description: 'Optional in-memory capture channels for this navigation. Records are capped and reset on the next open.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string' },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 60_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            return service.open(args.url, { ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {}, ...args.authProfile ? { authProfile: args.authProfile } : {}, ...args.rulePack ? { rulePack: args.rulePack } : {}, ...args.capture ? { capture: args.capture } : {} });
        },
    }));
    register(defineTool({
        name: 'browser_click',
        description: 'Click a CSS selector or structured Playwright locator on the current browser page, then return the updated page state. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector of the element to click. Omit when locator is provided.' },
            locator: LOCATOR_SCHEMA,
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string' },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            return service.click(toolTarget(args));
        },
    }));
    register(defineTool({
        name: 'browser_type',
        description: 'Type text into an input/textarea selected by CSS or a structured Playwright locator, then return the page state. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector of the input/textarea. Omit when locator is provided.' },
            locator: LOCATOR_SCHEMA,
            text: { type: 'string', required: true, description: 'Text to type.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string' },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            return service.type(toolTarget(args), args.text);
        },
    }));
    register(defineTool({
        name: 'browser_wait',
        description: 'Wait for one locator state, URL pattern, network idle, or a bounded amount of time on the active page. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector to wait for. Omit when locator or another wait mode is provided.' },
            locator: LOCATOR_SCHEMA,
            state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'], description: 'Locator state. Defaults to visible.' },
            urlPattern: { type: 'string', description: 'Playwright URL glob to wait for.' },
            networkIdle: { type: 'boolean', description: 'Set true to wait for networkidle.' },
            timeMs: { type: 'number', description: 'Fixed delay from 0 to 10,000 ms.' },
            timeoutMs: { type: 'number', description: 'Condition timeout from 0 to 30,000 ms. Default 15,000.' },
        },
        output: { schema: INTERACTIVE_OUTPUT_SCHEMA, render: (_args, value) => renderState(value) },
        timeoutMs: 35_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            const target = toolTarget(args, false);
            return service.wait(target, {
                ...args.state ? { state: args.state } : {}, ...args.urlPattern ? { urlPattern: args.urlPattern } : {},
                ...args.networkIdle !== undefined ? { networkIdle: args.networkIdle } : {}, ...args.timeMs !== undefined ? { timeMs: args.timeMs } : {},
                ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
            });
        },
    }));
    register(defineTool({
        name: 'browser_press',
        description: 'Press a key globally or on a CSS/semantic locator in the active page. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'Optional CSS target. Omit for a global keyboard press or when locator is provided.' },
            locator: LOCATOR_SCHEMA,
            key: { type: 'string', required: true, description: 'Playwright key such as Enter, ArrowDown, or Control+Enter.' },
            timeoutMs: { type: 'number', description: 'Target timeout from 1 to 30,000 ms.' },
        },
        output: { schema: INTERACTIVE_OUTPUT_SCHEMA, render: (_args, value) => renderState(value) },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.press(toolTarget(args, false), args.key, { ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {} }); },
    }));
    register(defineTool({
        name: 'browser_select',
        description: 'Select one or more values in a dropdown selected by CSS or a semantic locator. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector. Omit when locator is provided.' }, locator: LOCATOR_SCHEMA,
            values: { type: 'array', required: true, items: { type: 'string' }, description: 'One to 20 option values.' },
            timeoutMs: { type: 'number', description: 'Target timeout from 1 to 30,000 ms.' },
        },
        output: { schema: INTERACTIVE_OUTPUT_SCHEMA, render: (_args, value) => renderState(value) },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.select(toolTarget(args), args.values, { ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {} }); },
    }));
    register(defineTool({
        name: 'browser_check',
        description: 'Check or uncheck a checkbox or radio control selected by CSS or a semantic locator. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector. Omit when locator is provided.' }, locator: LOCATOR_SCHEMA,
            checked: { type: 'boolean', description: 'True to check, false to uncheck. Defaults to true.' },
            timeoutMs: { type: 'number', description: 'Target timeout from 1 to 30,000 ms.' },
        },
        output: { schema: INTERACTIVE_OUTPUT_SCHEMA, render: (_args, value) => renderState(value) },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.check(toolTarget(args), args.checked ?? true, { ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {} }); },
    }));
    register(defineTool({
        name: 'browser_hover',
        description: 'Hover a CSS selector or semantic locator on the current browser page and return the updated state. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector of the element to hover. Omit when locator is provided.' },
            locator: LOCATOR_SCHEMA,
            waitMs: { type: 'number', description: 'Settle time after hovering, from 0 to the tool timeout. Default 300 ms.' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    url: { type: 'string', required: true }, title: { type: 'string' }, text: { type: 'string', required: true }, screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.hover(toolTarget(args), { ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {} }); },
    }));
    register(defineTool({
        name: 'browser_set_files',
        description: 'Set one or more existing local files on a file-input CSS selector in the current page. Paths must be absolute regular files; the tool reads them for upload but does not modify them. Approval discloses the requested paths unless automationMode=unrestricted. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'CSS selector of an input[type=file] element. Omit when locator is provided.' },
            locator: LOCATOR_SCHEMA,
            files: { type: 'array', required: true, items: { type: 'string' }, description: 'One to 20 absolute local file paths, with at most 512 MiB total size.' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    url: { type: 'string', required: true }, title: { type: 'string' }, text: { type: 'string', required: true }, screenshotPath: { type: 'string' },
                    files: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => {
                const result = value;
                return [{ type: 'text', text: renderState(result)[0].text + '\n\nSelected files: ' + result.files.join(', ') }];
            },
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.setFiles(toolTarget(args), args.files); },
    }));
    register(defineTool({
        name: 'browser_evaluate',
        description: 'Evaluate one bounded JavaScript expression in the current page and return capped JSON. It runs with the page origin and login state, so it can read or mutate the DOM, access non-HttpOnly cookies/storage, and issue requests allowed by the browser. It has no Node.js or direct host-filesystem access, and downloads are not persisted by this tool. ' + COMPLIANCE_NOTICE,
        parameters: {
            expression: { type: 'string', required: true, description: 'A JavaScript expression up to 20,000 characters. The resolved value must be JSON-serializable.' },
            timeoutMs: { type: 'number', description: 'Execution timeout from 1,000 to 30,000 ms. Default 15,000; Chromium page execution is terminated while the page remains open.' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    url: { type: 'string', required: true }, resultJson: { type: 'string', required: true }, truncated: { type: 'boolean', required: true },
                    capabilities: { type: 'array', required: true, items: { type: 'string' } }, warnings: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => {
                const result = value;
                return [{ type: 'text', text: [`URL: ${result.url}`, `Capabilities: ${result.capabilities.join(', ')}`, result.resultJson + (result.truncated ? '\n(result truncated)' : ''), ...result.warnings.map(warning => 'Warning: ' + warning)].join('\n') }];
            },
        },
        timeoutMs: 35_000,
        isConcurrencySafe: () => false,
        async execute(args) { return service.evaluate(args.expression, { ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {} }); },
    }));
    register(defineTool({
        name: 'browser_console',
        description: 'Return bounded, redacted console records captured since the latest browser_open with capture=[console]. Records stay in memory and omit console argument objects. ' + COMPLIANCE_NOTICE,
        parameters: {
            level: { type: 'string', enum: ['debug', 'log', 'info', 'warning', 'error'], description: 'Minimum severity. Defaults to debug.' },
            limit: { type: 'number', description: 'Return the newest 1 to 200 records. Default 100.' },
            clear: { type: 'boolean', description: 'Clear captured records after reading.' },
        },
        output: { schema: { type: 'object', additionalProperties: false, properties: {
                    enabled: { type: 'boolean', required: true }, records: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                type: { type: 'string', required: true }, text: { type: 'string', required: true }, url: { type: 'string' }, timestamp: { type: 'string', required: true },
                            } } },
                } }, render: (_args, value) => [{ type: 'text', text: value.enabled ? (value.records.map(record => `[${record.type}] ${record.text}${record.url ? ` (${record.url})` : ''}`).join('\n') || 'No captured console messages.') : 'Console capture is disabled; reopen with capture=[console].' }] },
        timeoutMs: 10_000,
        isConcurrencySafe: () => true,
        async execute(args) { return service.consoleMessages(args); },
    }));
    register(defineTool({
        name: 'browser_requests',
        description: 'Return bounded, redacted failed and HTTP 4xx/5xx requests captured since the latest browser_open with capture=[network]. Request/response bodies and headers are never recorded. ' + COMPLIANCE_NOTICE,
        parameters: {
            limit: { type: 'number', description: 'Return the newest 1 to 200 records. Default 100.' },
            clear: { type: 'boolean', description: 'Clear captured records after reading.' },
        },
        output: { schema: { type: 'object', additionalProperties: false, properties: {
                    enabled: { type: 'boolean', required: true }, records: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                method: { type: 'string', required: true }, url: { type: 'string', required: true }, status: { type: 'number' }, failure: { type: 'string' }, timestamp: { type: 'string', required: true },
                            } } },
                } }, render: (_args, value) => [{ type: 'text', text: value.enabled ? (value.records.map(record => `${record.method} ${record.status ?? 'FAILED'} ${record.url}${record.failure ? ` — ${record.failure}` : ''}`).join('\n') || 'No failed or HTTP 4xx/5xx requests captured.') : 'Network capture is disabled; reopen with capture=[network].' }] },
        timeoutMs: 10_000,
        isConcurrencySafe: () => true,
        async execute(args) { return service.networkRequests(args); },
    }));
    register(defineTool({
        name: 'browser_scroll',
        description: 'Scroll the current browser page vertically by deltaY pixels (positive = down) to trigger lazy loading, then return the page state. ' + COMPLIANCE_NOTICE,
        parameters: {
            deltaY: { type: 'number', description: 'Pixels to scroll; positive scrolls down. Default 2000.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string' },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 20_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            return service.scroll(args.deltaY ?? 2000);
        },
    }));
    register(defineTool({
        name: 'browser_read',
        description: 'Read the current browser page state (URL, title, readable text) without taking a screenshot.',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string' },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                },
            },
            render: (_args, value) => renderState(value),
        },
        timeoutMs: 20_000,
        isConcurrencySafe: () => false,
        async execute() {
            return service.read();
        },
    }));
    register(defineTool({
        name: 'browser_screenshot',
        description: 'Capture the page, a bounded region, or a CSS/semantic locator. Files always land inside the configured snapshotDir under a plain caller-supplied filename or an autogenerated name. ' + COMPLIANCE_NOTICE,
        parameters: {
            selector: { type: 'string', description: 'Optional CSS selector. Omit when locator is provided.' },
            locator: LOCATOR_SCHEMA,
            clip: { type: 'object', additionalProperties: false, properties: {
                    x: { type: 'number', required: true }, y: { type: 'number', required: true }, width: { type: 'number', required: true }, height: { type: 'number', required: true },
                } },
            fullPage: { type: 'boolean', description: 'Capture the full scrollable page. Defaults to true for page screenshots; incompatible with selector/locator.' },
            format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format. Defaults from filename or png.' },
            quality: { type: 'number', description: 'JPEG quality from 0 to 100.' },
            filename: { type: 'string', description: 'Plain filename only, ending in .png, .jpg, or .jpeg. Directory traversal and absolute paths are rejected.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: 'Screenshot: ' + value.path }],
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => false,
        async execute(args) {
            const target = toolTarget(args, false);
            return service.screenshot({
                ...target ? { target } : {},
                ...args.clip ? { clip: args.clip } : {}, ...args.fullPage !== undefined ? { fullPage: args.fullPage } : {},
                ...args.format ? { format: args.format } : {}, ...args.quality !== undefined ? { quality: args.quality } : {},
                ...args.filename ? { filename: args.filename } : {},
            });
        },
    }));
    register(defineTool({
        name: 'browser_close',
        description: 'Close the current browser page (and its context). The next browser_open starts a fresh page.',
        parameters: {},
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { closed: { type: 'boolean', required: true } } },
            render: () => [{ type: 'text', text: 'Browser page closed.' }],
        },
        timeoutMs: 15_000,
        async execute() {
            await service.closePage();
            return { closed: true };
        },
    }));
    register(defineTool({
        name: 'browser_status',
        description: 'Report the browser runtime status: enabled, channel, headless, whether chromium is installed, whether the bundled OpenCLI is enabled, and the active page URL.',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    enabled: { type: 'boolean', required: true },
                    channel: { type: 'string', required: true },
                    browserRuntime: { type: 'string', required: true, enum: ['playwright', 'patchright'] },
                    runtimeWarnings: { type: 'array', required: true, items: { type: 'string' } },
                    headless: { type: 'boolean', required: true },
                    opencliEnabled: { type: 'boolean', required: true },
                    opencliInstalled: { type: 'boolean', required: true },
                    opencliEntryPath: { type: 'string' },
                    automationMode: { type: 'string', required: true, enum: ['read-only', 'standard', 'autonomous', 'unrestricted'] },
                    exposedTools: { type: 'array', required: true, items: { type: 'string' } },
                    directInteractionPolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    mutatingRecipePolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    externalUserscriptPolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    pageEvaluatePolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    fileUploadPolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    opencliRunPolicy: { type: 'string', required: true, enum: ['deny', 'ask', 'allow'] },
                    chromiumInstalled: { type: 'boolean', required: true },
                    chromiumExecutablePath: { type: 'string' },
                    usagePolicy: { type: 'object', required: true, additionalProperties: true, properties: {} },
                    usageGovernor: { type: 'object', required: true, additionalProperties: true, properties: {} },
                    activeUrl: { type: 'string' },
                    activeAuthProfile: { type: 'string' },
                    authProfiles: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, allowedDomains: { type: 'array', required: true, items: { type: 'string' } }, persistState: { type: 'boolean', required: true } } } },
                    rulePacks: { type: 'array', required: true, items: { type: 'string' } },
                    builtinScripts: { type: 'array', required: true, items: { type: 'string' } },
                    externalUserscriptsRequireApproval: { type: 'boolean', required: true },
                    mutatingRecipesRequireApproval: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => {
                const v = value;
                return [{ type: 'text', text: [
                            'browser: ' + (v.enabled ? 'enabled' : 'disabled'),
                            'runtime: ' + v.browserRuntime + ' / ' + v.channel + (v.headless ? ' (headless)' : ' (headed)'),
                            'automation mode: ' + v.automationMode + ' (' + v.exposedTools.length + ' tools exposed)',
                            'direct interactions: ' + v.directInteractionPolicy,
                            'mutating recipes: ' + v.mutatingRecipePolicy,
                            'external userscripts: ' + v.externalUserscriptPolicy,
                            'page evaluate: ' + v.pageEvaluatePolicy,
                            'local file upload: ' + v.fileUploadPolicy,
                            'general opencli: ' + v.opencliRunPolicy,
                            'runtime chromium installed: ' + v.chromiumInstalled,
                            ...(v.chromiumExecutablePath ? ['chromium executable: ' + v.chromiumExecutablePath] : []),
                            `usage buffer: concurrency=${v.usagePolicy.maxConcurrency}, burst=${v.usagePolicy.burst}/${v.usagePolicy.minDelayMs}ms, crawl=${v.usagePolicy.maxPagesPerRun} pages depth ${v.usagePolicy.maxDepth}`,
                            `usage activity: runs=${v.usageGovernor.totalRuns}, queued=${v.usageGovernor.queued}, waited=${v.usageGovernor.totalWaitMs}ms, backoffs=${v.usageGovernor.backoffEvents}`,
                            'opencli: ' + (v.opencliEnabled ? 'enabled' : 'disabled') + ' / ' + (v.opencliInstalled ? 'installed' : 'missing'),
                            ...(v.opencliEntryPath ? ['opencli entry: ' + v.opencliEntryPath] : []),
                            'auth profiles: ' + (v.authProfiles.map(p => p.id + '[' + p.allowedDomains.join(',') + ']' + (p.persistState ? '(writeback)' : '')).join('; ') || '-'),
                            'rule packs: ' + (v.rulePacks.join(', ') || '-'),
                            'built-in scripts: ' + v.builtinScripts.join(', '),
                            ...v.runtimeWarnings.map(warning => 'warning: ' + warning),
                            ...(v.activeAuthProfile ? ['active auth profile: ' + v.activeAuthProfile] : []),
                            ...(v.activeUrl ? ['active page: ' + v.activeUrl] : []),
                        ].join('\n') }];
            },
        },
        timeoutMs: 15_000,
        isConcurrencySafe: () => true,
        async execute() {
            return service.status();
        },
    }));
    register(defineTool({
        name: 'browser_install',
        description: 'Install the bundled Playwright chromium browser (downloads to the Playwright cache). Run this once if browser_status reports chromium not installed.',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    code: { type: 'number', required: true },
                    stdout: { type: 'string' },
                    stderr: { type: 'string' },
                    timedOut: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => {
                const v = value;
                return [{ type: 'text', text: 'install exit=' + v.code + (v.timedOut ? ' (timeout)' : '') + '\n' + ((v.stderr || v.stdout) ?? '').slice(0, 2000) }];
            },
        },
        timeoutMs: 600_000,
        isConcurrencySafe: () => false,
        async execute() {
            const r = await service.installChromium();
            return { code: r.code, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut };
        },
    }));
    register(defineTool({
        name: 'browser_script_catalog',
        description: 'List trusted built-in read-only browser scripts. Prefer these over external JavaScript for article extraction, links, JSON-LD, and form structure.',
        parameters: {},
        output: {
            schema: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', required: true },
                        name: { type: 'string', required: true },
                        description: { type: 'string', required: true },
                        sha256: { type: 'string', required: true },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.map(item => `${item.id} — ${item.description} (${item.sha256.slice(0, 12)})`).join('\n') }],
        },
        isConcurrencySafe: () => true,
        async execute() {
            return service.scriptCatalog();
        },
    }));
    register(defineTool({
        name: 'browser_script_validate',
        description: 'Validate externally supplied Tampermonkey/UserScript-style JavaScript without executing it. Parses @match/@grant, reports SHA-256 and capabilities. Only @grant none is supported.',
        parameters: {
            source: { type: 'string', required: true, description: 'Complete userscript source including the metadata block. Never embed credentials.' },
            url: { type: 'string', description: 'Optional target URL to verify against @match and @exclude-match.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    sha256: { type: 'string', required: true },
                    bytes: { type: 'number', required: true },
                    name: { type: 'string', required: true },
                    matches: { type: 'array', required: true, items: { type: 'string' } },
                    grants: { type: 'array', required: true, items: { type: 'string' } },
                    capabilities: { type: 'array', required: true, items: { type: 'string' } },
                    errors: { type: 'array', required: true, items: { type: 'string' } },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => [{ type: 'text', text: [
                        `${value.valid ? 'VALID' : 'INVALID'} ${value.name} (${value.sha256})`,
                        `matches: ${value.matches.join(', ') || '-'}`,
                        `grants: ${value.grants.join(', ') || 'none (implicit)'}`,
                        `capabilities: ${value.capabilities.join(', ')}`,
                        ...value.errors.map(error => 'error: ' + error),
                        ...value.warnings.map(warning => 'warning: ' + warning),
                    ].join('\n') }],
        },
        isConcurrencySafe: () => true,
        async execute(args) {
            const result = service.validateUserscript(args.source, args.url);
            return {
                valid: result.valid,
                sha256: result.sha256,
                bytes: result.bytes,
                name: result.metadata.name,
                matches: result.metadata.matches,
                grants: result.metadata.grants,
                capabilities: result.capabilities,
                errors: result.errors,
                warnings: result.warnings,
            };
        },
    }));
    register(defineTool({
        name: 'browser_script_run_builtin',
        description: 'Run one trusted built-in read-only script in a fresh Playwright context and return bounded JSON. Supports named AuthProfile and RulePack selection. ' + COMPLIANCE_NOTICE,
        parameters: {
            url: { type: 'string', required: true },
            scriptId: { type: 'string', required: true, enum: ['article-clean', 'links', 'jsonld', 'forms'] },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
            timeoutMs: { type: 'number' },
        },
        output: { schema: SCRIPT_RESULT_SCHEMA, render: (_args, value) => renderScriptResult(value) },
        timeoutMs: 60_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            return service.runBuiltinScript(args.url, args.scriptId, {
                signal: exec.signal,
                ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
                ...args.authProfile ? { authProfile: args.authProfile } : {},
                ...args.rulePack ? { rulePack: args.rulePack } : {},
            });
        },
    }));
    register(defineTool({
        name: 'browser_userscript_run',
        description: 'Run an externally supplied Tampermonkey/UserScript-style script in a fresh Playwright context. Approval follows automationMode (skipped only in unrestricted); target @match, source/result caps, and no-GM_* validation always apply. ' + COMPLIANCE_NOTICE,
        parameters: {
            url: { type: 'string', required: true },
            source: { type: 'string', required: true, description: 'Complete userscript source. Validate first. Never embed credentials or tokens.' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
            timeoutMs: { type: 'number' },
        },
        output: { schema: SCRIPT_RESULT_SCHEMA, render: (_args, value) => renderScriptResult(value) },
        timeoutMs: 60_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            return service.runUserscript(args.url, args.source, {
                signal: exec.signal,
                ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
                ...args.authProfile ? { authProfile: args.authProfile } : {},
                ...args.rulePack ? { rulePack: args.rulePack } : {},
            });
        },
    }));
    register(defineTool({
        name: 'browser_recipe_run',
        description: 'Run a bounded Playwright recipe (max 25 named steps). Read-only steps run directly; mutating steps are denied in read-only, approved once in standard, and direct in autonomous/unrestricted. ' + COMPLIANCE_NOTICE,
        parameters: {
            url: { type: 'string', description: 'Open this URL first; omit only when browser_open already established an active page.' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
            waitMs: { type: 'number' },
            steps: { type: 'array', required: true, items: RECIPE_STEP_SCHEMA },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    text: { type: 'string', required: true },
                    screenshotPath: { type: 'string' },
                    steps: {
                        type: 'array', required: true, items: {
                            type: 'object', additionalProperties: false, properties: {
                                step: { type: 'number', required: true },
                                action: { type: 'string', required: true },
                                ok: { type: 'boolean', required: true },
                                value: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: [
                        `${value.title}\n${value.url}`,
                        ...value.steps.map(step => `${step.step}. ${step.action}: ${step.ok ? 'ok' : 'failed'}${step.value ? '\n' + step.value : ''}`),
                        value.text,
                    ].join('\n\n') }],
        },
        timeoutMs: 120_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const steps = args.steps;
            try {
                const result = await service.recipe(steps, {
                    signal: exec.signal,
                    ...args.url ? { url: args.url } : {},
                    ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
                    ...args.authProfile ? { authProfile: args.authProfile } : {},
                    ...args.rulePack ? { rulePack: args.rulePack } : {},
                });
                assets?.recordRecipe(result.url, steps, sessionId(exec), true);
                return result;
            }
            catch (error) {
                if (args.url)
                    assets?.recordRecipe(args.url, steps, sessionId(exec), false);
                throw error;
            }
        },
    }));
    register(defineTool({
        name: 'browser_crawl',
        description: 'Crawl a bounded set of HTTP(S) pages with the configured concurrency, burst, page/depth, retry, and cooldown budgets. This is read-only and remains buffered even in unrestricted/no-approval mode. ' + COMPLIANCE_NOTICE,
        parameters: {
            startUrls: { type: 'array', required: true, items: { type: 'string' }, description: 'One to five starting URLs.' },
            maxPages: { type: 'number', description: 'Page budget, capped by usagePolicy.maxPagesPerRun.' },
            maxDepth: { type: 'number', description: 'Link depth, capped by usagePolicy.maxDepth.' },
            sameOrigin: { type: 'boolean', description: 'Only follow links on starting origins. Default true.' },
            maxCharsPerPage: { type: 'number', description: 'Readable text cap per page, 1000-50000.' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    pages: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                url: { type: 'string', required: true }, title: { type: 'string', required: true }, text: { type: 'string', required: true }, depth: { type: 'number', required: true }, status: { type: 'number', required: true },
                            } } },
                    errors: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                url: { type: 'string', required: true }, depth: { type: 'number', required: true }, error: { type: 'string', required: true }, status: { type: 'number' },
                            } } },
                    stats: { type: 'object', required: true, additionalProperties: false, properties: {
                            pagesVisited: { type: 'number', required: true }, queued: { type: 'number', required: true }, elapsedMs: { type: 'number', required: true }, waitMs: { type: 'number', required: true }, backoffEvents: { type: 'number', required: true },
                        } },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => [{ type: 'text', text: [
                        `crawl: ${value.stats.pagesVisited} visited, ${value.pages.length} pages, ${value.errors.length} errors, ${value.stats.waitMs}ms buffered`,
                        ...value.warnings.map(warning => 'warning: ' + warning),
                        ...value.pages.map(page => `\n[depth ${page.depth}, HTTP ${page.status}] ${page.title}\n${page.url}\n${page.text}`),
                        ...value.errors.map(error => `\nERROR depth ${error.depth} ${error.url}: ${error.error}`),
                    ].join('\n') }],
        },
        timeoutMs: 300_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            return service.crawl(args.startUrls, {
                signal: exec.signal,
                ...args.maxPages !== undefined ? { maxPages: args.maxPages } : {},
                ...args.maxDepth !== undefined ? { maxDepth: args.maxDepth } : {},
                ...args.sameOrigin !== undefined ? { sameOrigin: args.sameOrigin } : {},
                ...args.maxCharsPerPage !== undefined ? { maxCharsPerPage: args.maxCharsPerPage } : {},
            });
        },
    }));
    register(defineTool({
        name: 'browser_opencli_status',
        description: 'Run bundled OpenCLI doctor and return the real daemon, extension, profile, and Browser Bridge connectivity status.',
        parameters: {},
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    code: { type: 'number', required: true }, stdout: { type: 'string', required: true }, stderr: { type: 'string', required: true }, timedOut: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: (value.stdout || value.stderr).slice(0, 20_000) }],
        },
        timeoutMs: 45_000,
        isConcurrencySafe: () => true,
        async execute(_args, exec) {
            return service.opencliDoctor(exec.signal);
        },
    }));
    register(defineTool({
        name: 'browser_opencli_catalog',
        description: 'Discover bundled OpenCLI adapters through a filtered, capped catalog. Use before browser_opencli_run to find exact command names, access class, strategy, and arguments without exposing the full catalog.',
        parameters: {
            query: { type: 'string' },
            site: { type: 'string' },
            access: { type: 'string', enum: ['read', 'write'] },
            strategy: { type: 'string' },
            limit: { type: 'number' },
        },
        output: {
            schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                        command: { type: 'string', required: true }, site: { type: 'string', required: true }, name: { type: 'string', required: true }, description: { type: 'string', required: true }, access: { type: 'string', required: true }, strategy: { type: 'string', required: true }, argsJson: { type: 'string', required: true }, example: { type: 'string' }, domain: { type: 'string' },
                    } } },
            render: (_args, value) => [{ type: 'text', text: value.map(item => `${item.command} [${item.access}/${item.strategy}]\n${item.description}\nargs=${item.argsJson}${item.example ? '\nexample: ' + item.example : ''}`).join('\n\n') }],
        },
        timeoutMs: 75_000,
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const items = await service.opencliCatalog(args, exec.signal);
            return items.map(({ args: itemArgs, ...item }) => ({ ...item, argsJson: JSON.stringify(itemArgs) }));
        },
    }));
    register(defineTool({
        name: 'browser_opencli_run',
        description: 'Run any bundled OpenCLI adapter or browser-session command with verbatim argv. Approval is skipped only in unrestricted because commands may reuse logged-in Chrome state or perform writes. Prefer existing read-only search tools when available. ' + COMPLIANCE_NOTICE,
        parameters: {
            args: { type: 'array', required: true, items: { type: 'string' }, description: 'Arguments after opencli, e.g. ["browser","work","state"] or ["reddit","search","dsh","-f","json"].' },
            profile: { type: 'string', description: 'Optional OpenCLI profile alias, passed as --profile.' },
            timeoutMs: { type: 'number' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false, properties: {
                    code: { type: 'number', required: true }, stdout: { type: 'string', required: true }, stderr: { type: 'string', required: true }, timedOut: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: `opencli exit=${value.code}${value.timedOut ? ' (timeout)' : ''}\n${(value.stdout || value.stderr).slice(0, 100_000)}` }],
        },
        timeoutMs: 180_000,
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const argv = [...args.profile ? ['--profile', args.profile] : [], ...args.args];
            return service.opencli(argv, { timeoutMs: Math.min(Math.max(args.timeoutMs ?? 60_000, 1_000), 120_000), signal: exec.signal });
        },
    }));
}
//# sourceMappingURL=tools.js.map