/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */
import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
import { resolveAutomationMode } from "./freedom.js";
import { resolveUsagePolicy } from "./usage-policy.js";
import { resolveAutomationAssetPolicy } from "./automation-assets.js";
export const BROWSER_RUNTIMES = ['playwright', 'patchright'];
export function resolveBrowserRuntime(value) {
    const runtime = value ?? 'playwright';
    if (typeof runtime !== 'string' || !BROWSER_RUNTIMES.includes(runtime)) {
        throw new Error('browserRuntime must be one of: ' + BROWSER_RUNTIMES.join(', '));
    }
    return runtime;
}
export const Config = z.object({
    enabled: z.boolean().default(true),
    channel: z.string().default('chromium'),
    browserRuntime: z.string().default('playwright'),
    headless: z.boolean().default(true),
    storageStatePath: z.string(),
    authProfiles: z.dict(z.object({
        storageStatePath: z.string(),
        allowedDomains: z.array(z.string()).default([]),
        persistState: z.boolean().default(false),
    })),
    defaultAuthProfile: z.string(),
    rulePacks: z.dict(z.object({
        matches: z.array(z.string()).default([]),
        initScriptPath: z.string(),
        initScriptSha256: z.string(),
        steps: z.array(z.object({
            type: z.string(),
            selector: z.string(),
            timeoutMs: z.number(),
            optional: z.boolean(),
            deltaY: z.number(),
            repeat: z.number(),
            waitMs: z.number(),
        })).default([]),
    })),
    executablePath: z.string(),
    opencliEnabled: z.boolean().default(true),
    automationMode: z.string().default('standard'),
    usagePolicy: z.object({
        minDelayMs: z.number().default(750),
        maxConcurrency: z.number().default(2),
        burst: z.number().default(3),
        maxPagesPerRun: z.number().default(20),
        maxDepth: z.number().default(2),
        retryLimit: z.number().default(2),
        backoffBaseMs: z.number().default(1000),
        cooldownMs: z.number().default(30000),
    }),
    automationAssets: z.object({
        enabled: z.boolean().default(true),
        directory: z.string(),
        persistenceMode: z.string().default('suggest'),
        activationMode: z.string().default('manual'),
        minSuccessfulRuns: z.number().default(3),
        minDistinctSessions: z.number().default(2),
        successWindowDays: z.number().default(14),
        minSuccessRate: z.number().default(0.8),
        maxCandidates: z.number().default(20),
        candidateTtlDays: z.number().default(14),
        maxSuggestionsPerDay: z.number().default(2),
        maxDrafts: z.number().default(10),
        maxActiveAssets: z.number().default(50),
        retrievalTopK: z.number().default(5),
        catalogTokenBudget: z.number().default(800),
        modelDevelopmentEnabled: z.boolean().default(true),
        maxModelDraftWritesPerSession: z.number().default(3),
    }),
    autoInstall: z.boolean().default(false),
    snapshotDir: z.string(),
    verbose: z.boolean().default(false),
    cdpPort: z.number().description('Optional remote debugging port to expose CDP for external tools (e.g. 9222)'),
    args: z.array(z.string()).default([]).description('Additional Chromium CLI launch arguments'),
});
export function defaultSnapshotDir() {
    const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
    return path.join(home, 'data', 'browser', 'snapshots');
}
export function resolveConfig(config) {
    const snapshotDir = config.snapshotDir ?? defaultSnapshotDir();
    return {
        enabled: config.enabled ?? true,
        channel: config.channel ?? 'chromium',
        browserRuntime: resolveBrowserRuntime(config.browserRuntime),
        headless: config.headless ?? true,
        opencliEnabled: config.opencliEnabled ?? true,
        automationMode: resolveAutomationMode(config.automationMode),
        usagePolicy: resolveUsagePolicy(config.usagePolicy),
        automationAssets: resolveAutomationAssetPolicy(config.automationAssets),
        autoInstall: config.autoInstall ?? false,
        snapshotDir,
        verbose: config.verbose ?? false,
        authProfiles: config.authProfiles ?? {},
        rulePacks: config.rulePacks ?? {},
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        ...config.cdpPort !== undefined ? { cdpPort: config.cdpPort } : {},
        ...config.defaultAuthProfile ? { defaultAuthProfile: config.defaultAuthProfile } : {},
        ...config.storageStatePath !== undefined && config.storageStatePath !== '' ? { storageStatePath: config.storageStatePath } : {},
        ...config.executablePath !== undefined && config.executablePath !== '' ? { executablePath: config.executablePath } : {},
    };
}
//# sourceMappingURL=config.js.map