/**
 * Maps a model-visible tool call to the action it will run, so the Host
 * approval hook can judge `browser_call` and flat tools by action rather than
 * by tool name.
 * @module dsh-browser/actions/surface
 */
export type ResolvedBrowserCall = 
/** `browser_index`: read-only catalog, no side effects. */
{
    kind: 'index';
}
/** A call that names a known action; `args` are the action's own arguments. */
 | {
    kind: 'action';
    action: string;
    args: unknown;
}
/** `browser_call` with a missing or unknown action; execution returns a structured error. */
 | {
    kind: 'unresolved';
};
export declare function resolveBrowserCall(toolName: string, rawArgs: unknown): ResolvedBrowserCall | undefined;
