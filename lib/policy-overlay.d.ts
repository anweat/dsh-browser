/**
 * The policy overlay: restriction-type settings that an agent may edit, without hand-editing the config.
 *
 * Only two kinds of field can be overlaid: `authProfiles` (allowed domains, persistState, storageStatePath, and
 * creating or removing a profile) and the `usagePolicy` throttle values. The panel's configuration stays the
 * baseline; the overlay is a small managed file next to the plugin's other data (`$DSH_HOME/data/browser/`) that is
 * merged on top of it, with a revision for optimistic locking and a bounded audit trail.
 *
 * Everything an agent may put in the overlay is validated here, strictly, by the same functions that re-validate the
 * file when it is loaded: a file that does not parse, fails its checksum or holds a value the validators refuse is
 * ignored as a whole (the baseline applies) and reported, never half-applied.
 * @module dsh-browser/policy-overlay
 */
import type { AuthProfileConfig } from './auth-profiles.ts';
import type { UsagePolicy } from './usage-policy.ts';
export declare const MAX_DOMAINS_PER_PROFILE = 50;
export declare const MAX_PROFILES = 30;
export declare const MAX_AUDIT_ENTRIES = 50;
/** Whether a (non-wildcard) name is a TLD or a registry/platform suffix, which can never be a login scope. */
export declare function isPublicSuffix(name: string): boolean;
export interface DomainEnv {
    allowPrivateHosts: boolean;
}
/**
 * Normalize one allowed-domain entry to its stored form (lower-case punycode, `*.` kept) or throw
 * {@link ActionArgError} saying exactly why it is refused.
 */
export declare function normalizeAllowedDomain(raw: unknown, env: DomainEnv): string;
/** The name an entry matches (`*.a.com` and `a.com` scope the same hosts, see hostAllowed). */
export declare function domainBase(entry: string): string;
export declare function normalizeAllowedDomains(raw: unknown, env: DomainEnv): string[];
export declare function checkProfileId(id: unknown): string;
export declare function checkReason(reason: unknown): string;
export interface PathEnv {
    /** The only directory an agent-set storageStatePath may live in. */
    authDir: string;
    /** Directories no auth file may be inside of. */
    forbidden: readonly string[];
    /** Set when the auth directory overlaps one of {@link forbidden}: every agent-set path is refused. */
    authDirProblem?: string;
}
/** The absolute path of an agent-set auth state file, or an {@link ActionArgError} saying why not. */
export declare function checkStorageStatePath(raw: unknown, env: PathEnv, takenByOthers?: readonly string[]): string;
/** Whether the auth directory overlaps the directories that hold downloads or screenshots (then no agent path is trusted). */
export declare function authDirConflict(authDir: string, forbidden: readonly string[]): string | undefined;
export declare function checkUsagePatch(raw: unknown): Partial<UsagePolicy>;
/** What an overlay entry may hold for a profile: only the fields that differ from the baseline (all of them for a new profile). */
export interface OverlayProfile {
    allowedDomains?: string[];
    persistState?: boolean;
    storageStatePath?: string;
}
export type Direction = 'tighten' | 'loosen' | 'none';
export interface AuditEntry {
    revision: number;
    at: string;
    /** `agent` (an action), `panel` (the settings card's clear button). */
    source: 'agent' | 'panel';
    /** The session that asked, for an agent change. */
    session?: string;
    action: string;
    reason: string;
    direction: Direction;
    /** One line per change. */
    changes: string[];
}
export interface PolicyOverlay {
    version: 1;
    revision: number;
    updatedAt: string;
    /** `null` removes a baseline profile. */
    authProfiles: Record<string, OverlayProfile | null>;
    usagePolicy: Partial<UsagePolicy>;
    audit: AuditEntry[];
}
export interface EffectivePolicy {
    authProfiles: Record<string, AuthProfileConfig>;
    usagePolicy: UsagePolicy;
}
export interface Baseline {
    authProfiles: Record<string, AuthProfileConfig>;
    usagePolicy: UsagePolicy;
}
export declare function emptyOverlay(): PolicyOverlay;
/** The baseline with the overlay merged on top. Never mutates its inputs. */
export declare function mergeOverlay(baseline: Baseline, overlay: PolicyOverlay): EffectivePolicy;
export interface ProfileDiff {
    id: string;
    change: 'added' | 'removed' | 'changed';
    domainsAdded: string[];
    domainsRemoved: string[];
    persistState?: {
        before: boolean;
        after: boolean;
    };
    storageStatePath?: {
        before: string;
        after: string;
    };
}
export interface PolicyDiff {
    profiles: ProfileDiff[];
    usage: {
        key: string;
        before: number;
        after: number;
        direction: Direction;
    }[];
    direction: Direction;
    /** One human-readable line per change. */
    lines: string[];
}
export declare function diffPolicy(before: EffectivePolicy, after: EffectivePolicy): PolicyDiff;
export interface PolicyStoreOptions {
    /** `$DSH_HOME/data/browser/policy-overlay.json`. */
    file: string;
    authDir: string;
    snapshotDir: string;
    downloadDir: string;
    allowPrivateHosts: boolean;
    baseline: Baseline;
}
export type PolicyChange = {
    kind: 'setAuthProfile';
    id: string;
    allowedDomains?: unknown;
    persistState?: unknown;
    storageStatePath?: unknown;
} | {
    kind: 'removeAuthProfile';
    id: string;
} | {
    kind: 'setUsagePolicy';
    values: unknown;
} | {
    kind: 'reset';
    scope: 'all' | 'usagePolicy' | 'authProfile';
    id?: string;
};
export interface ChangeMeta {
    source: 'agent' | 'panel';
    session?: string;
    reason: string;
    action: string;
    /** When given, the change only applies if the overlay is still at this revision. */
    expectedRevision?: number;
}
export interface PlannedChange {
    before: EffectivePolicy;
    after: EffectivePolicy;
    overlay: PolicyOverlay;
    diff: PolicyDiff;
}
export interface AppliedChange extends PlannedChange {
    revision: number;
    audit: AuditEntry;
}
export declare class PolicyConflictError extends Error {
    constructor(message: string);
}
export declare function checksumOf(overlay: PolicyOverlay): string;
export declare class PolicyOverlayStore {
    private readonly options;
    private overlay;
    private signature;
    private problem;
    private readonly pathEnv;
    constructor(options: PolicyStoreOptions);
    get file(): string;
    get authDir(): string;
    get allowPrivateHosts(): boolean;
    get baseline(): Baseline;
    /** Why the overlay file was ignored, if it was. */
    get warning(): string | undefined;
    current(): PolicyOverlay;
    effective(): EffectivePolicy;
    private stat;
    /** Re-read the file when it changed on disk. Returns whether the effective policy may have changed. */
    refresh(): boolean;
    private reload;
    /** Strict parse: unknown keys, wrong types, a failed checksum or any value the validators refuse reject the whole file. */
    private parse;
    /** Compute a change without writing anything. Throws {@link ActionArgError} for an invalid change. */
    plan(change: PolicyChange): PlannedChange;
    /** Plan and write a change: re-reads the file first, checks the revision, writes atomically (0600) and appends the audit entry. */
    apply(change: PolicyChange, meta: ChangeMeta): AppliedChange;
    /** Move an unreadable file aside (kept for inspection) so a fresh overlay can start. */
    private quarantine;
}
