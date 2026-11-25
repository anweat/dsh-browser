/** Structured, bounded view over OpenCLI's large adapter catalog. */
function stringField(value) {
    return typeof value === 'string' ? value.slice(0, 2_000) : '';
}
function toItem(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const row = value;
    const command = stringField(row.command);
    if (!command)
        return undefined;
    return {
        command,
        site: stringField(row.site),
        name: stringField(row.name),
        description: stringField(row.description),
        access: stringField(row.access),
        strategy: stringField(row.strategy),
        args: Array.isArray(row.args) ? row.args.slice(0, 30) : [],
        ...stringField(row.example) ? { example: stringField(row.example) } : {},
        ...stringField(row.domain) ? { domain: stringField(row.domain) } : {},
    };
}
/** OpenCLI 1.8: `list -f json` is one array whose rows carry site, name, strategy and args. */
export function parseOpencliCatalog(stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        throw new Error('OpenCLI catalog did not return valid JSON');
    }
    if (!Array.isArray(parsed))
        throw new Error('OpenCLI catalog JSON must be an array (1.8.x) or an {ok,data:{commands}} envelope (2.x)');
    return parsed.flatMap(value => toItem(value) ?? []).slice(0, 10_000);
}
/**
 * OpenCLI 2.x: `list -f json --limit n --offset k` prints `{ok:true,data:{commands:[{command:"zhihu search",description,access}],total,nextOffset}}`
 * (a failure is `{ok:false,error:{code,message,hint}}` and is thrown with that message). The rows have no arguments or
 * strategy; site and name are the words of `command`.
 */
export function parseOpencliCatalogPage(stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        throw new Error('OpenCLI catalog page did not return valid JSON');
    }
    if (parsed && parsed.ok === false)
        throw new Error('OpenCLI catalog failed: ' + describeOpencliError(parsed.error));
    const data = parsed?.ok === true ? parsed.data : undefined;
    if (!data || !Array.isArray(data.commands))
        throw new Error('OpenCLI catalog page is not an {ok:true,data:{commands:[...]}} envelope');
    const items = data.commands.flatMap((value) => {
        const row = value;
        const command = stringField(row?.command).trim();
        if (!row || !command)
            return [];
        const [site = '', ...rest] = command.split(/\s+/);
        return toItem({ ...row, command, site, name: rest.join(' ') }) ?? [];
    });
    const total = Number.isInteger(data.total) ? data.total : undefined;
    const nextOffset = Number.isInteger(data.nextOffset) ? data.nextOffset : undefined;
    return { items, ...total !== undefined ? { total } : {}, ...nextOffset !== undefined ? { nextOffset } : {} };
}
/** `code: message (hint)` of an OpenCLI 2.x error object. */
export function describeOpencliError(error) {
    const row = (error && typeof error === 'object' ? error : {});
    const code = stringField(row.code);
    const message = stringField(row.message);
    const hint = stringField(row.hint);
    return [code && message ? `${code}: ${message}` : code || message || 'unknown error', hint ? `(${hint})` : ''].filter(Boolean).join(' ');
}
/** OpenCLI 2.x prints a failure as one JSON line on stdout; this reads it (undefined for anything else, 1.8's text on stderr included). */
export function parseOpencliFailure(stdout) {
    const line = stdout.trim();
    if (!line.startsWith('{') || !line.includes('"ok"'))
        return undefined;
    try {
        const parsed = JSON.parse(line);
        if (parsed?.ok !== false || !parsed.error || typeof parsed.error !== 'object')
            return undefined;
        const { code, message, hint } = parsed.error;
        return { ...typeof code === 'string' ? { code } : {}, ...typeof message === 'string' ? { message: message.slice(0, 1000) } : {}, ...typeof hint === 'string' ? { hint: hint.slice(0, 500) } : {} };
    }
    catch {
        return undefined;
    }
}
/**
 * The argument list of `<site> <name> --help -f json` (same fields in 1.8 and 2.x): positionals first, then options.
 * Returns what the catalog of 1.8 already carries per row, plus `domain` and `example`.
 */
export function parseOpencliHelp(stdout) {
    const start = stdout.indexOf('{');
    if (start < 0)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(stdout.slice(start));
    }
    catch {
        return undefined;
    }
    if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.positionals) && !Array.isArray(parsed.command_options)))
        return undefined;
    const pick = (value, positional) => ({
        name: stringField(value?.name),
        type: stringField(value?.type),
        required: value?.required === true,
        positional,
        ...Array.isArray(value?.choices) ? { choices: value.choices.slice(0, 30) } : {},
        ...value?.default !== undefined ? { default: value.default } : {},
        ...stringField(value?.help) ? { help: stringField(value.help).slice(0, 300) } : {},
    });
    const args = [
        ...(Array.isArray(parsed.positionals) ? parsed.positionals : []).map((value) => pick(value, true)),
        ...(Array.isArray(parsed.command_options) ? parsed.command_options : []).map((value) => pick(value, false)),
    ].filter(arg => arg.name).slice(0, 30);
    return { args, ...stringField(parsed.domain) ? { domain: stringField(parsed.domain) } : {}, ...stringField(parsed.example) ? { example: stringField(parsed.example) } : {} };
}
export function filterOpencliCatalog(catalog, filter = {}) {
    const query = filter.query?.trim().toLowerCase();
    const site = filter.site?.trim().toLowerCase();
    const access = filter.access?.trim().toLowerCase();
    const strategy = filter.strategy?.trim().toLowerCase();
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    return catalog
        .filter(item => !site || item.site.toLowerCase() === site)
        .filter(item => !access || item.access.toLowerCase() === access)
        .filter(item => !strategy || item.strategy.toLowerCase() === strategy)
        .filter(item => !query || [item.command, item.site, item.name, item.description].some(value => value.toLowerCase().includes(query)))
        .sort((a, b) => a.command.localeCompare(b.command))
        .slice(0, limit);
}
//# sourceMappingURL=opencli-catalog.js.map