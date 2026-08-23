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
export declare function parseOpencliCatalog(stdout: string): OpencliCatalogItem[];
export declare function filterOpencliCatalog(catalog: readonly OpencliCatalogItem[], filter?: OpencliCatalogFilter): OpencliCatalogItem[];
