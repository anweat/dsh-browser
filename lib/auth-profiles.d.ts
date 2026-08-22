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
export declare class AuthProfileStore {
    private readonly profiles;
    constructor(profiles?: Record<string, AuthProfileConfig>);
    resolve(id: string, targetUrl: string): ResolvedAuthProfile;
    list(): {
        id: string;
        allowedDomains: string[];
        persistState: boolean;
    }[];
}
