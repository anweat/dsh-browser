/** `target` group: open, close, and list this session's page. @module dsh-browser/actions/target */
export const TARGET_ACTIONS = [
    {
        name: 'target.open',
        group: 'target',
        summary: 'Open a URL in this session\'s own page; returns title, readable text, and a full-page screenshot path.',
        notes: 'Each session gets its own page and context; sessions never see each other\'s page, cookies, or captured traffic. capture records console messages and failed/4xx/5xx requests in memory (no bodies or headers), capped, and resets on the next open. viewport/userAgent/locale/timezoneId/proxyServer are context creation options: they stay with the session\'s context until target.close, an option you leave out keeps its current value, and a different value closes the old context and its pages (the result says contextRebuilt) before opening in a new one. proxyServer and userAgent change the network egress and fingerprint, so they ask for approval; proxy accounts are not supported.',
        params: {
            url: { type: 'string', required: true, description: 'The HTTP(S) URL to open.' },
            waitMs: { type: 'number', description: 'Extra settle time in ms after load.' },
            authProfile: { type: 'string', description: 'Named, domain-scoped auth profile from dsh-browser config.' },
            rulePack: { type: 'string', description: 'Named, domain-scoped enhancement rule pack.' },
            capture: { type: 'array', items: { type: 'string', enum: ['console', 'network'] }, description: 'In-memory capture channels for this navigation.' },
            viewport: { type: 'object', additionalProperties: false, description: 'Viewport size in CSS pixels (width 200-7680, height 200-4320).', properties: { width: { type: 'number', required: true }, height: { type: 'number', required: true } } },
            userAgent: { type: 'string', description: 'User agent for this session\'s context. Asks for approval.' },
            locale: { type: 'string', description: 'BCP 47 locale, e.g. en-US or zh-CN.' },
            timezoneId: { type: 'string', description: 'IANA time zone, e.g. Asia/Shanghai.' },
            proxyServer: { type: 'string', description: 'Proxy such as http://host:port or socks5://host:port; no account or password. Asks for approval.' },
        },
        approval: 'context-options', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 60_000,
        examples: [{ args: { url: 'https://example.com/' } }, { args: { url: 'https://example.com/', capture: ['console', 'network'] }, note: 'enables inspect.console / inspect.requests' }, { args: { url: 'https://example.com/', viewport: { width: 390, height: 844 }, locale: 'en-US' }, note: 'context options; a different value rebuilds the context' }],
        async execute(args, ctx) {
            return ctx.service.open(args.url, {
                ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
                ...args.authProfile ? { authProfile: args.authProfile } : {},
                ...args.rulePack ? { rulePack: args.rulePack } : {},
                ...args.capture ? { capture: args.capture } : {},
                ...args.viewport ? { viewport: args.viewport } : {},
                ...args.userAgent !== undefined ? { userAgent: args.userAgent } : {},
                ...args.locale !== undefined ? { locale: args.locale } : {},
                ...args.timezoneId !== undefined ? { timezoneId: args.timezoneId } : {},
                ...args.proxyServer !== undefined ? { proxyServer: args.proxyServer } : {},
                session: ctx.session,
            });
        },
    },
    {
        name: 'target.download',
        group: 'target',
        summary: 'Save a URL\'s file into the download directory with this session\'s login state; returns the absolute path, size and sha256.',
        notes: 'Fetches with the session\'s cookies (a request first, then a navigation that captures the attachment download). Fails instead of returning an empty file. The file name comes from the server unless filename is given (a plain name only); a taken name gets a -1, -2 suffix, nothing is overwritten. Capped by downloadMaxBytes (default 100 MiB). The session\'s page is not navigated. Downloads started by clicks or navigation are saved the same way and listed by inspect.downloads. PDFs are not parsed: download, then use the path.',
        params: {
            url: { type: 'string', required: true, description: 'The HTTP(S) URL of the file.' },
            filename: { type: 'string', description: 'Plain file name to save as (no path); default is the server\'s suggestion.' },
            timeoutMs: { type: 'number', description: 'Overall budget 1000-150000 ms. Default 60000.' },
        },
        approval: 'download', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 170_000,
        errors: ['POLICY_DENIED (url outside the auth profile domains)'],
        examples: [{ args: { url: 'https://example.com/report.pdf' } }, { args: { url: 'https://example.com/export?id=7', filename: 'export-7.csv' } }],
        async execute(args, ctx) {
            return ctx.service.download(args.url, {
                ...args.filename !== undefined ? { filename: args.filename } : {},
                ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
                signal: ctx.signal,
                session: ctx.session,
            });
        },
    },
    {
        name: 'target.close',
        group: 'target',
        summary: 'Close this session\'s pages and context (popups included); the next target.open starts fresh. Other sessions are untouched.',
        params: {},
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 15_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            await ctx.service.closePage(ctx.service.sessionState(ctx.agent));
            return { closed: true };
        },
    },
    {
        name: 'target.list',
        group: 'target',
        summary: 'List this session\'s open pages (the one it opened plus popups) with id, url, title, and which one is active.',
        notes: 'A popup (window.open, a link with target=_blank) joins the list but does not become active by itself; switch with target.select. Other sessions\' pages are never listed.',
        params: {},
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 15_000,
        examples: [{ args: {} }],
        async execute(_args, ctx) {
            const { targets } = await ctx.service.listTargets({ session: ctx.session });
            const status = targets.length ? await ctx.service.status({ session: ctx.session }) : undefined;
            return { targets, ...status?.activeAuthProfile ? { authProfile: status.activeAuthProfile } : {} };
        },
    },
    {
        name: 'target.select',
        group: 'target',
        summary: 'Make one of this session\'s pages (id from target.list) the active page for act/observe/inspect actions.',
        notes: 'Switches only within this session. A page that was closed returns TARGET_CLOSED; call target.list again. Returns the selected page\'s url, title and text.',
        params: { id: { type: 'string', required: true, description: 'Target id from target.list, e.g. t2.' } },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 20_000,
        examples: [{ args: { id: 't2' } }],
        async execute(args, ctx) {
            return ctx.service.selectTarget(args.id, { session: ctx.session });
        },
    },
];
//# sourceMappingURL=target.js.map