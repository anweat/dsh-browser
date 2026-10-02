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
/** A provider object shaped like the Host's `SkillProvider` (declared locally to avoid a build-time dependency). */
export declare function createSkillProvider(dir?: string): {
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
/**
 * Register the skill when the Host provides a skill registry, and track whether
 * it is registered so the index can fall back to its compact guide otherwise.
 * @returns a reader for "is the skill currently available".
 */
export declare function registerSkillWhenAvailable(ctx: Context, dir?: string): {
    isAvailable: () => boolean;
};
