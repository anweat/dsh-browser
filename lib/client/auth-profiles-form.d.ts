/**
 * Pure helpers of the login-profile list and its dialog: reading the staged `authProfiles` JSON, the rules for a new
 * profile's name and for a domain, and the path a new profile gets. Nothing here touches the Host or the DOM.
 * @module dsh-browser/client/auth-profiles-form
 */
/** One login profile as the configuration holds it. */
export interface AuthProfileEntry {
    storageStatePath: string;
    allowedDomains: string[];
    persistState: boolean;
}
/** The profiles in a staged `authProfiles` text; entries that are not profiles are left out, and unparsable text is no profiles. */
export declare function parseProfiles(text: string): Record<string, AuthProfileEntry>;
/** Whether a value is a map of well-formed profiles: what a save may write for `authProfiles`. */
export declare function validAuthProfiles(value: Record<string, unknown>): boolean;
/** Why a name is refused for a NEW profile: not a usable name, or taken. */
export declare function idProblem(id: string, existing: readonly string[]): 'authIdInvalid' | 'authIdExists' | undefined;
/** Why a domain entry is refused: a host name only, optionally with a leading `*.`; no scheme, path, port or whitespace. */
export declare function domainProblem(domain: string): 'authDomainInvalid' | undefined;
/** Whether a name is one the policy overlay refuses for agents unless private hosts are allowed (a note for the person; their own config may list it). */
export declare function isPrivateName(domain: string): boolean;
/** The state-file path a new profile gets: `<login-state directory>/<name>.json`, with the directory's own separator. */
export declare function profilePathFor(authDir: string, id: string): string;
