/** Structured, bounded view over OpenCLI's large adapter catalog. */
export interface OpencliCatalogItem {
    command: string;
    site: string;
    name: string;
    description: string;
    access: string;
    strategy: string;
    args: unknown[];
    example?: string;
    domain?: string;
}
export interface OpencliCatalogFilter {
    query?: string;
    site?: string;
    access?: string;
    strategy?: string;
    limit?: number;
}
/** OpenCLI 1.8: `list -f json` is one array whose rows carry site, name, strategy and args. */
export declare function parseOpencliCatalog(stdout: string): OpencliCatalogItem[];
export interface OpencliCatalogPage {
    items: OpencliCatalogItem[];
    total?: number;
    /** Where the next page starts; absent on the last page. */
    nextOffset?: number;
}
/**
 * OpenCLI 2.x: `list -f json --limit n --offset k` prints `{ok:true,data:{commands:[{command:"zhihu search",description,access}],total,nextOffset}}`
 * (a failure is `{ok:false,error:{code,message,hint}}` and is thrown with that message). The rows have no arguments or
 * strategy; site and name are the words of `command`.
 */
export declare function parseOpencliCatalogPage(stdout: string): OpencliCatalogPage;
/** `code: message (hint)` of an OpenCLI 2.x error object. */
export declare function describeOpencliError(error: unknown): string;
/** OpenCLI 2.x prints a failure as one JSON line on stdout; this reads it (undefined for anything else, 1.8's text on stderr included). */
export declare function parseOpencliFailure(stdout: string): {
    code?: string;
    message?: string;
    hint?: string;
} | undefined;
/**
 * The argument list of `<site> <name> --help -f json` (same fields in 1.8 and 2.x): positionals first, then options.
 * Returns what the catalog of 1.8 already carries per row, plus `domain` and `example`.
 */
export declare function parseOpencliHelp(stdout: string): {
    args: unknown[];
    domain?: string;
    example?: string;
} | undefined;
export declare function filterOpencliCatalog(catalog: readonly OpencliCatalogItem[], filter?: OpencliCatalogFilter): OpencliCatalogItem[];
