/** Structured, bounded view over OpenCLI's large adapter catalog. */
function stringField(value) {
    return typeof value === 'string' ? value.slice(0, 2_000) : '';
}
export function parseOpencliCatalog(stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        throw new Error('OpenCLI catalog did not return valid JSON');
    }
    if (!Array.isArray(parsed))
        throw new Error('OpenCLI catalog JSON must be an array');
    return parsed.flatMap((value) => {
        if (!value || typeof value !== 'object')
            return [];
        const row = value;
        const command = stringField(row.command);
        if (!command)
            return [];
        return [{
                command,
                site: stringField(row.site),
                name: stringField(row.name),
                description: stringField(row.description),
                access: stringField(row.access),
                strategy: stringField(row.strategy),
                args: Array.isArray(row.args) ? row.args.slice(0, 30) : [],
                ...stringField(row.example) ? { example: stringField(row.example) } : {},
                ...stringField(row.domain) ? { domain: stringField(row.domain) } : {},
            }];
    }).slice(0, 10_000);
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