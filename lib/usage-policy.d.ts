/** Bounded, approval-independent buffering for browser and crawler traffic. */
export interface UsagePolicyInput {
    minDelayMs?: number;
    maxConcurrency?: number;
    burst?: number;
    maxPagesPerRun?: number;
    maxDepth?: number;
    retryLimit?: number;
    backoffBaseMs?: number;
    cooldownMs?: number;
}
export interface UsagePolicy extends Record<string, number> {
    minDelayMs: number;
    maxConcurrency: number;
    burst: number;
    maxPagesPerRun: number;
    maxDepth: number;
    retryLimit: number;
    backoffBaseMs: number;
    cooldownMs: number;
}
export declare function resolveUsagePolicy(input: UsagePolicyInput | undefined): UsagePolicy;
export declare class UsageGovernor {
    readonly policy: UsagePolicy;
    private active;
    private readonly globalWaiters;
    private readonly hosts;
    private queued;
    private totalRuns;
    private totalWaitMs;
    private backoffEvents;
    constructor(policy: UsagePolicy);
    private host;
    private acquireGlobal;
    private releaseGlobal;
    private acquireHost;
    run<T>(url: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
    /** Record server pressure. Returns the applied host cooldown in milliseconds. */
    noteResponse(url: string, status: number, retryAfterMs?: number): number;
    snapshot(): {
        active: number;
        queued: number;
        trackedHosts: number;
        coolingHosts: number;
        totalRuns: number;
        totalWaitMs: number;
        backoffEvents: number;
    };
}
