export interface AuthProfileConfig {
    storageStatePath: string;
    allowedDomains: string[];
    /** Persist cookies/localStorage back after a transient context closes. Defaults to false. */
    persistState?: boolean;
}
export interface ResolvedAuthProfile extends AuthProfileConfig {
    id: string;
    persistState: boolean;
}
export declare function hostAllowed(hostname: string, domains: readonly string[]): boolean;
export declare class AuthProfileStore {
    private profiles;
    constructor(profiles?: Record<string, AuthProfileConfig>);
    /** Swap in the effective profiles (baseline plus policy overlay); sessions resolve against them from the next call on. */
    replace(profiles: Record<string, AuthProfileConfig>): void;
    get(id: string): AuthProfileConfig | undefined;
    resolve(id: string, targetUrl: string): ResolvedAuthProfile;
    list(): {
        id: string;
        allowedDomains: string[];
        persistState: boolean;
    }[];
}
