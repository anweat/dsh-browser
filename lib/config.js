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
        ...config.storageStatePath !== undefined && config.storageStatePath !== '' ? { storageStatePath: config.storageStatePath } : {},
        ...config.executablePath !== undefined && config.executablePath !== '' ? { executablePath: config.executablePath } : {},
    };
}
//# sourceMappingURL=config.js.map