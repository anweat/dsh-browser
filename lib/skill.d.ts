/**
 * The bundled `dsh-browser` skill: usage guidance for the browser tools.
 *
 * The skill is registered with the Host's skill registry when that service
 * exists. It must never be a hard dependency of the plugin: Cordis 4.0.4 treats
 * every declared `inject` as required, so a missing `skills` service would hang
 * the whole plugin. The plugin therefore asks for it through a scoped
 * `ctx.inject(['skills'], …)` and works the same without it.
 * @module dsh-browser/skill
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PromptsSource } from './prompts.ts';
import { SKILL_BODY_FILE_LIMIT } from './prompt-limits.ts';
export declare const SKILL_NAME = "dsh-browser";
/** `assets/skills/dsh-browser/`, resolved next to `src/` or the built `lib/`. */
export declare const SKILL_DIR: string;
/** Parse `name` and `description` out of a SKILL.md and return the body without the front matter. */
export declare function parseSkillFile(raw: string): {
    name: string;
    description: string;
    body: string;
};
export declare function readSkill(dir?: string): {
    name: string;
    description: string;
    body: string;
};
export { SKILL_BODY_FILE_LIMIT };
/**
 * Read a replacement skill body. A leading front matter block is dropped (the name and description come from the
 * packaged file or `prompts.skill.description`). Never throws: a missing, unreadable, empty or oversized file is
 * reported as a reason, and the caller falls back to the packaged body.
 */
export declare function loadSkillBodyFile(file: string): {
    ok: true;
    body: string;
} | {
    ok: false;
    reason: string;
};
/** What the skill says right now: the packaged file with the `prompts.skill` overrides applied. */
export declare function currentSkill(dir?: string, prompts?: PromptsSource): {
    name: string;
    description: string;
    body: string;
};
/**
 * A provider object shaped like the Host's `SkillProvider` (declared locally to avoid a build-time dependency).
 * It reads the packaged file and the `prompts.skill` overrides on every call, so it is never stale.
 */
export declare function createSkillProvider(dir?: string, prompts?: PromptsSource): {
    name: string;
    list: () => Promise<{
        name: string;
        description: string;
        invocation: {
            modelInvocable: boolean;
            userInvocable: boolean;
        };
        provider: string;
        source: string;
        resourceBase: {
            kind: "directory";
            path: string;
        };
        rank: number;
        locator: string;
    }[]>;
    get: () => Promise<{
        name: string;
        description: string;
        invocation: {
            modelInvocable: boolean;
            userInvocable: boolean;
        };
        provider: string;
        source: string;
        resourceBase: {
            kind: "directory";
            path: string;
        };
        content: string;
    }>;
};
export interface SkillRegistration {
    /** Whether the skill is registered with the Host right now (false without a skill service, or when disabled). */
    isAvailable: () => boolean;
    /**
     * Bring the registration in line with the current `prompts.skill`: register or withdraw the provider when `enabled`
     * changed, and tell the Host (`invalidate()`) when the description, body file or appended text changed. Cheap; the
     * tools call it on every use, which is how a config edit reaches the skill without a restart.
     */
    refresh: () => void;
}
/**
 * Register the skill when the Host provides a skill registry, and track whether
 * it is registered so the index can fall back to its compact guide otherwise.
 * With `prompts.skill.enabled=false` nothing is registered.
 */
export declare function registerSkillWhenAvailable(ctx: Context, dir?: string, prompts?: PromptsSource): SkillRegistration;
