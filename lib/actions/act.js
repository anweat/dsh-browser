/** `act` group: interact with the page. @module dsh-browser/actions/act */
import { EXPECT_PARAMS, TARGET_PARAMS } from "./schema.js";
import { expectOf, targetOf } from "./shared.js";
const TIMEOUT = { type: 'number', description: 'Target timeout 1-30000 ms.' };
export const ACT_ACTIONS = [
    {
        name: 'act.click',
        group: 'act',
        summary: 'Click an element (CSS selector or role/text/label locator); returns the updated page state.',
        params: { ...TARGET_PARAMS, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { locator: { role: 'button', name: 'Search' } } }, { args: { selector: '#submit' } }],
        async execute(args, ctx) {
            return ctx.service.click(targetOf(args), { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.fill',
        group: 'act',
        summary: 'Fill text into an input/textarea (replaces its value); returns the page state.',
        notes: 'To empty a field use act.clear.',
        params: { ...TARGET_PARAMS, text: { type: 'string', required: true, description: 'Text to enter.' }, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { locator: { label: 'Query' }, text: 'dsh' } }],
        async execute(args, ctx) {
            return ctx.service.type(targetOf(args), args.text, { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.type',
        group: 'act',
        summary: 'Type text key by key into the located element (fires key events); use act.fill to replace a value at once.',
        notes: 'Appends at the caret. Use it for inputs that react to every keystroke (autocomplete, masked fields). To empty a field use act.clear.',
        params: { ...TARGET_PARAMS, text: { type: 'string', required: true, description: 'Text to type, 1-10000 characters.' }, delayMs: { type: 'number', description: 'Delay between keys, 0-1000 ms. Default 0.' }, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 60_000,
        examples: [{ args: { locator: { role: 'combobox', name: 'City' }, text: 'Ams', delayMs: 50 } }],
        async execute(args, ctx) {
            return ctx.service.typeKeys(targetOf(args), args.text, { ...expectOf(args), ...args.delayMs !== undefined ? { delayMs: args.delayMs } : {}, ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.clear',
        group: 'act',
        summary: 'Empty an input/textarea (fires the input event, so controlled fields update); returns the page state.',
        params: { ...TARGET_PARAMS, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { locator: { label: 'Query' } } }],
        async execute(args, ctx) {
            return ctx.service.clear(targetOf(args), { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.press',
        group: 'act',
        summary: 'Press a key globally or on an element (Enter, ArrowDown, Control+Enter).',
        params: { ...TARGET_PARAMS, key: { type: 'string', required: true, description: 'Playwright key such as Enter, ArrowDown, or Control+Enter.' }, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { key: 'Enter' } }],
        async execute(args, ctx) {
            return ctx.service.press(targetOf(args, false), args.key, { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.select',
        group: 'act',
        summary: 'Select one or more option values in a dropdown.',
        params: { ...TARGET_PARAMS, values: { type: 'array', required: true, items: { type: 'string' }, description: '1-20 option values.' }, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { selector: '#country', values: ['NL'] } }],
        async execute(args, ctx) {
            return ctx.service.select(targetOf(args), args.values, { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.check',
        group: 'act',
        summary: 'Check or uncheck a checkbox or radio control.',
        params: { ...TARGET_PARAMS, checked: { type: 'boolean', description: 'True to check, false to uncheck. Defaults to true.' }, timeoutMs: TIMEOUT, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { locator: { role: 'checkbox', name: 'Remember me' }, checked: true } }],
        async execute(args, ctx) {
            return ctx.service.check(targetOf(args), args.checked ?? true, { ...expectOf(args), ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.hover',
        group: 'act',
        summary: 'Hover an element (menus, tooltips) and return the updated page state.',
        params: { ...TARGET_PARAMS, waitMs: { type: 'number', description: 'Settle time after hovering, 0 to the action timeout. Default 300 ms.' }, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: false, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: { selector: '#menu' } }],
        async execute(args, ctx) {
            return ctx.service.hover(targetOf(args), { ...expectOf(args), ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {}, session: ctx.session });
        },
    },
    {
        name: 'act.scroll',
        group: 'act',
        summary: 'Scroll the page vertically by deltaY pixels (positive = down) to trigger lazy loading.',
        params: { deltaY: { type: 'number', description: 'Pixels to scroll; positive scrolls down. Default 2000.' }, ...EXPECT_PARAMS },
        approval: 'interaction', readOnly: false, mutating: false, concurrencySafe: false, timeoutMs: 20_000,
        examples: [{ args: { deltaY: 1500 } }],
        async execute(args, ctx) {
            return ctx.service.scroll(args.deltaY ?? 2000, { ...expectOf(args), session: ctx.session });
        },
    },
    {
        name: 'act.upload',
        group: 'act',
        summary: 'Set existing local files on an input[type=file]. Paths must be absolute regular files (max 20, 512 MiB total).',
        notes: 'The action reads the files for upload but never modifies them. Approval shows the requested paths unless automationMode=unrestricted.',
        params: { ...TARGET_PARAMS, files: { type: 'array', required: true, items: { type: 'string' }, description: '1-20 absolute local file paths, at most 512 MiB total.' }, ...EXPECT_PARAMS },
        approval: 'upload', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 30_000,
        errors: ['POLICY_DENIED (empty or non-absolute paths)'],
        examples: [{ args: { selector: 'input[type=file]', files: ['/abs/path/report.pdf'] } }],
        async execute(args, ctx) {
            return ctx.service.setFiles(targetOf(args), args.files, { ...expectOf(args), session: ctx.session });
        },
    },
    {
        name: 'act.wait',
        group: 'act',
        summary: 'Wait for exactly one of: an element state, a URL pattern, network idle, or a fixed delay.',
        params: {
            ...TARGET_PARAMS,
            state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'], description: 'Element state. Defaults to visible.' },
            urlPattern: { type: 'string', description: 'Playwright URL glob to wait for.' },
            networkIdle: { type: 'boolean', description: 'Set true to wait for networkidle.' },
            timeMs: { type: 'number', description: 'Fixed delay 0-10000 ms.' },
            timeoutMs: { type: 'number', description: 'Condition timeout 0-30000 ms. Default 15000.' },
        },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 35_000,
        examples: [{ args: { locator: { text: 'Results' } } }, { args: { networkIdle: true } }],
        async execute(args, ctx) {
            const target = targetOf(args, false);
            return ctx.service.wait(target, {
                ...args.state ? { state: args.state } : {},
                ...args.urlPattern ? { urlPattern: args.urlPattern } : {},
                ...args.networkIdle !== undefined ? { networkIdle: args.networkIdle } : {},
                ...args.timeMs !== undefined ? { timeMs: args.timeMs } : {},
                ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
                session: ctx.session,
            });
        },
    },
];
//# sourceMappingURL=act.js.map