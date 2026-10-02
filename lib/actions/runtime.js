/** `runtime` group: runtime status and the Chromium installer. @module dsh-browser/actions/runtime */
const cap = (text) => text.slice(0, 2000);
export const RUNTIME_ACTIONS = [
    {
        name: 'runtime.status',
        group: 'runtime',
        summary: 'Report runtime status: install state, automationMode, approval policies, usage buffer, this session\'s active page.',
        notes: 'A page opened by another session is not reported.',
        params: {},
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 15_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            return ctx.service.status({ session: ctx.session });
        },
    },
    {
        name: 'runtime.install',
        group: 'runtime',
        summary: 'Install the bundled Playwright Chromium (large download). Run once if runtime.status reports chromium not installed.',
        params: {},
        approval: 'install', readOnly: false, mutating: false, concurrencySafe: false, timeoutMs: 600_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            const result = await ctx.service.installChromium();
            return { code: result.code, timedOut: result.timedOut, stdout: cap(result.stdout ?? ''), stderr: cap(result.stderr ?? '') };
        },
    },
];
//# sourceMappingURL=runtime.js.map