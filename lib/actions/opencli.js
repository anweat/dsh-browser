/** `opencli` group: OpenCLI adapters (OpenCLI is optional and installed separately). @module dsh-browser/actions/opencli */
import { parseOpencliFailure } from "../opencli-catalog.js";
/** What an opencli run returns: the output as before, plus OpenCLI 2.x's own failure (one JSON line on stdout, nonzero exit) as `error`. */
function runOutput(result, max) {
    const failure = result.code !== 0 ? parseOpencliFailure(result.stdout ?? '') : undefined;
    return { code: result.code, timedOut: result.timedOut, output: (result.stdout || result.stderr || '').slice(0, max), ...failure ? { error: failure } : {} };
}
export const OPENCLI_ACTIONS = [
    {
        name: 'opencli.status',
        group: 'opencli',
        summary: 'Run OpenCLI doctor: daemon, extension, profile, and Browser Bridge connectivity.',
        params: {},
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 45_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            const result = await ctx.service.opencliDoctor(ctx.signal);
            return runOutput(result, 20_000);
        },
    },
    {
        name: 'opencli.catalog',
        group: 'opencli',
        summary: 'Discover OpenCLI adapters through a filtered, capped catalog (command, access class, strategy, args).',
        notes: 'Use before opencli.run to find exact command names. Up to 10 matches come with their arguments; narrow with site or query to get them.',
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
        summary: 'Run any OpenCLI adapter or browser-session command with verbatim argv.',
        notes: 'Commands may reuse logged-in Chrome state or perform writes, so approval is skipped only in unrestricted mode. Prefer existing read-only actions when available. `opencli browser` names its session by version: positional on 1.8 (`browser research open URL`), `--session research` on 2.x; read opencliVersion in runtime.status (references/opencli.md).',
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
            return runOutput(result, 100_000);
        },
    },
];
//# sourceMappingURL=opencli.js.map