/**
 * Model-facing tool surfaces for dsh-browser.
 *
 * Every capability is an action in the registry (`src/actions/`). This module
 * only projects that registry into tools:
 *
 * - `indexed` (default): two small tools, `browser_index` for progressive
 *   disclosure and `browser_call` to run an action. Constant, tiny context cost.
 * - `flat`: one tool per usable action, named `browser_<group>_<action>`.
 *   Every action is described up front; useful for comparison and debugging.
 *
 * Both surfaces dispatch through the same {@link runAction}, so validation,
 * the result envelope, and the error codes are identical.
 * @module dsh-browser/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.ts';
import type { BrowserService } from './browser-service.ts';
import type { AutomationAssetStore } from './automation-assets.ts';
export interface ToolRuntime {
    /** Whether the `dsh-browser` skill is currently registered; read at call time. */
    skillAvailable?: () => boolean;
}
export declare function registerTools(ctx: Context, config: ResolvedConfig, service: BrowserService, assets?: AutomationAssetStore, runtime?: ToolRuntime): void;
