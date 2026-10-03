/** `opencli` group: bundled OpenCLI adapters. @module dsh-browser/actions/opencli */
export const OPENCLI_ACTIONS = [
    {
        name: 'opencli.status',
        group: 'opencli',
        summary: 'Run bundled OpenCLI doctor: daemon, extension, profile, and Browser Bridge connectivity.',
        params: {},
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 45_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            const result = await ctx.service.opencliDoctor(ctx.signal);
            return { code: result.code, timedOut: result.timedOut, output: (result.stdout || result.stderr).slice(0, 20_000) };
        },
    },
    {
        name: 'opencli.catalog',
        group: 'opencli',
        summary: 'Discover bundled OpenCLI adapters through a filtered, capped catalog (command, access class, strategy, args).',
        notes: 'Use before opencli.run to find exact command names.',
        params: {
            query: { type: 'string' }, site: { type: 'string' },
            access: { type: 'string', enum: ['read', 'write'] },
            strategy: { type: 'string' }, limit: { type: 'number' },
        },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 75_000,
        examples: [{ args: { site: 'reddit', access: 'read', limit: 10 } }],
        async execute(args, ctx) {
            const items = await ctx.service.opencliCatalog(args, ctx.signal);
            return { items: items.map(({ args: itemArgs, ...item }) => ({ ...item, args: itemArgs })) };
        },
    },
    {
        name: 'opencli.run',
        group: 'opencli',
        summary: 'Run any bundled OpenCLI adapter or browser-session command with verbatim argv.',
        notes: 'Commands may reuse logged-in Chrome state or perform writes, so approval is skipped only in unrestricted mode. Prefer existing read-only actions when available.',
        params: {
            args: { type: 'array', required: true, items: { type: 'string' }, description: 'Arguments after opencli, e.g. ["reddit","search","dsh","-f","json"].' },
            profile: { type: 'string', description: 'Optional OpenCLI profile alias, passed as --profile.' },
            timeoutMs: { type: 'number' },
        },
        approval: 'opencli', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 180_000,
        examples: [{ args: { args: ['reddit', 'search', 'dsh', '-f', 'json'] } }],
        async execute(args, ctx) {
            const argv = [...args.profile ? ['--profile', args.profile] : [], ...args.args];
            const result = await ctx.service.opencli(argv, { timeoutMs: Math.min(Math.max(args.timeoutMs ?? 60_000, 1_000), 120_000), signal: ctx.signal });
            return { code: result.code, timedOut: result.timedOut, output: (result.stdout || result.stderr).slice(0, 100_000) };
        },
    },
];
//# sourceMappingURL=opencli.js.map