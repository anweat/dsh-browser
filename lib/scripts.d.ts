/**
 * Tampermonkey-compatible metadata validation and bounded userscript execution.
 * Only `@grant none` is supported; GM_* APIs are intentionally not emulated.
 * @module dsh-browser/scripts
 */
export interface UserscriptMetadata {
    name: string;
    description?: string;
    matches: string[];
    excludes: string[];
    grants: string[];
}
export interface UserscriptValidation {
    valid: boolean;
    sha256: string;
    bytes: number;
    metadata: UserscriptMetadata;
    capabilities: string[];
    errors: string[];
    warnings: string[];
}
export interface BuiltinScript {
    id: string;
    name: string;
    description: string;
    source: string;
}
export declare const BUILTIN_SCRIPTS: readonly BuiltinScript[];
export declare function matchUserscriptPattern(pattern: string, targetUrl: string): boolean;
export declare function validateUserscript(source: string, targetUrl?: string): UserscriptValidation;
export declare function builtinScript(id: string): BuiltinScript;
export declare function executeUserscript(page: any, source: string, maxResultChars?: number, inputs?: Record<string, string>): Promise<{
    resultJson: string;
    truncated: boolean;
}>;
