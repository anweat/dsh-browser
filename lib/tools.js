/**
 * Model-facing browser tools for dsh-browser: an interactive, multi-step
 * browser over a persistent page (open/click/type/scroll/read/screenshot/close)
 * plus status and chromium-install helpers.
 * @module dsh-browser/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
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
export function registerTools(ctx, config, service) {
    ctx.tools.register(defineTool({
        name: 'browser_open',
        description: 'Open a URL in the persistent browser page and return the rendered title, readable text, and a full-page screenshot path. Use this to start a multi-step browsing session.',
        parameters: {
            url: { type: 'string', required: true, description: 'The HTTP(S) URL to open.' },
            waitMs: { type: 'number', description: 'Extra settle time in ms after load.' },
            authProfile: { type: 'string', description: 'Named, domain-scoped auth profile from dsh-browser config.' },
            rulePack: { type: 'string', description: 'Named, domain-scoped enhancement rule pack.' },
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
            return service.open(args.url, { ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {}, ...args.authProfile ? { authProfile: args.authProfile } : {}, ...args.rulePack ? { rulePack: args.rulePack } : {} });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'browser_click',
        description: 'Click a CSS selector on the current browser page, then return the updated page state. Use after browser_open to follow links or press buttons.',
        parameters: {
            selector: { type: 'string', required: true, description: 'CSS selector of the element to click.' },
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
            return service.click(args.selector);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'browser_type',
        description: 'Type text into an input/textarea (CSS selector) on the current browser page, then return the page state. Use to fill search boxes and forms.',
        parameters: {
            selector: { type: 'string', required: true, description: 'CSS selector of the input/textarea to fill.' },
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
            return service.type(args.selector, args.text);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'browser_scroll',
        description: 'Scroll the current browser page vertically by deltaY pixels (positive = down) to trigger lazy loading, then return the page state.',
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
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
        name: 'browser_screenshot',
        description: 'Capture a full-page screenshot of the current browser page and return the file path.',
        parameters: {},
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
        async execute() {
            return service.screenshot();
        },
    }));
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
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
                    headless: { type: 'boolean', required: true },
                    opencliEnabled: { type: 'boolean', required: true },
                    chromiumInstalled: { type: 'boolean', required: true },
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
                            'channel: ' + v.channel + (v.headless ? ' (headless)' : ' (headed)'),
                            'chromium installed: ' + v.chromiumInstalled,
                            'opencli (bundled): ' + (v.opencliEnabled ? 'enabled' : 'disabled'),
                            'auth profiles: ' + (v.authProfiles.map(p => p.id + '[' + p.allowedDomains.join(',') + ']' + (p.persistState ? '(writeback)' : '')).join('; ') || '-'),
                            'rule packs: ' + (v.rulePacks.join(', ') || '-'),
                            'built-in scripts: ' + v.builtinScripts.join(', '),
                            'external userscripts: ' + (v.externalUserscriptsRequireApproval ? 'one-shot approval required' : 'unrestricted'),
                            'mutating recipes: ' + (v.mutatingRecipesRequireApproval ? 'one-shot approval required' : 'unrestricted'),
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
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
        name: 'browser_script_run_builtin',
        description: 'Run one trusted built-in read-only script in a fresh Playwright context and return bounded JSON. Supports named AuthProfile and RulePack selection.',
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
    ctx.tools.register(defineTool({
        name: 'browser_userscript_run',
        description: 'Run an externally supplied Tampermonkey/UserScript-style script in a fresh Playwright context. This always requires native one-shot user approval, enforces target @match, caps source/result size, and provides no GM_* APIs.',
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
    ctx.tools.register(defineTool({
        name: 'browser_recipe_run',
        description: 'Run a bounded Playwright recipe (max 25 named steps). Read-only wait/extract/assert/screenshot recipes run directly; recipes containing click/fill/type/press/select/check/hover/scroll require native one-shot user approval.',
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
            return service.recipe(args.steps, {
                signal: exec.signal,
                ...args.url ? { url: args.url } : {},
                ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
                ...args.authProfile ? { authProfile: args.authProfile } : {},
                ...args.rulePack ? { rulePack: args.rulePack } : {},
            });
        },
    }));
    ctx.tools.register(defineTool({
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
    ctx.tools.register(defineTool({
        name: 'browser_opencli_run',
        description: 'Run any bundled OpenCLI adapter or browser-session command with verbatim argv. Always requires native one-shot user approval because commands may reuse logged-in Chrome state or perform writes. Prefer existing read-only search tools when available.',
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