/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */
import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    enabled: z.boolean().default(true),
    channel: z.string().default('chromium'),
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
    autoInstall: z.boolean().default(false),
    snapshotDir: z.string(),
    verbose: z.boolean().default(false),
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
        headless: config.headless ?? true,
        opencliEnabled: config.opencliEnabled ?? true,
        autoInstall: config.autoInstall ?? false,
        snapshotDir,
        verbose: config.verbose ?? false,
        authProfiles: config.authProfiles ?? {},
        rulePacks: config.rulePacks ?? {},
        ...config.defaultAuthProfile ? { defaultAuthProfile: config.defaultAuthProfile } : {},
        ...config.storageStatePath !== undefined && config.storageStatePath !== '' ? { storageStatePath: config.storageStatePath } : {},
        ...config.executablePath !== undefined && config.executablePath !== '' ? { executablePath: config.executablePath } : {},
    };
}
//# sourceMappingURL=config.js.map