/**
 * Action dispatch: validate arguments, check availability, run the executor
 * under a deadline, and wrap everything in the result envelope.
 *
 * Both tool surfaces call {@link runAction}, so the envelope and the error
 * codes are identical whether the model reaches an action through
 * `browser_call` or through a flat per-action tool.
 * @module dsh-browser/actions/run
 */
import { type ActionContext, type ActionEnvelope } from './types.ts';
import { type AutomationMode, type ExposureOptions } from '../freedom.ts';
/** Serialized-result cap; larger results get their longest strings shortened. */
export declare const RESULT_CHAR_LIMIT = 100000;
export interface RunEnvironment {
    mode: AutomationMode;
    options: ExposureOptions;
    enabled: boolean;
}
/**
 * Shorten the longest string fields until the serialized result fits. The
 * result stays valid JSON; the envelope reports how much text was dropped.
 */
export declare function truncateResult(result: Record<string, unknown>, limit?: number): {
    result: Record<string, unknown>;
    truncation?: {
        omitted: number;
        reason: string;
    };
};
/**
 * Run one action and return the envelope. Never throws: every failure is a
 * structured error the model can act on.
 */
export declare function runAction(name: unknown, rawArgs: unknown, ctx: ActionContext, env: RunEnvironment): Promise<ActionEnvelope>;
