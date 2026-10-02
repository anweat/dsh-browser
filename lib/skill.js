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
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const SKILL_NAME = 'dsh-browser';
const PROVIDER_NAME = 'dsh-browser';
/** Same rank the Host gives packaged skills (`BUNDLED_SKILL_RANK`). */
const BUNDLED_SKILL_RANK = 600;
/** `assets/skills/dsh-browser/`, resolved next to `src/` or the built `lib/`. */
export const SKILL_DIR = fileURLToPath(new URL('../assets/skills/dsh-browser/', import.meta.url));
/** Parse `name` and `description` out of a SKILL.md and return the body without the front matter. */
export function parseSkillFile(raw) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    if (!match)
        throw new Error('SKILL.md is missing its front matter');
    const field = (key) => {
        const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(match[1]);
        return line ? line[1].trim().replace(/^["']|["']$/g, '') : '';
    };
    return { name: field('name'), description: field('description'), body: match[2].replace(/^\s+/, '') };
}
export function readSkill(dir = SKILL_DIR) {
    return parseSkillFile(fs.readFileSync(dir + 'SKILL.md', 'utf8'));
}
/** A provider object shaped like the Host's `SkillProvider` (declared locally to avoid a build-time dependency). */
export function createSkillProvider(dir = SKILL_DIR) {
    const resourceBase = { kind: 'directory', path: dir };
    const invocation = { modelInvocable: true, userInvocable: true };
    const skill = readSkill(dir);
    const candidate = {
        name: skill.name,
        description: skill.description,
        invocation,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase,
        rank: BUNDLED_SKILL_RANK,
        locator: dir + 'SKILL.md',
    };
    return {
        name: PROVIDER_NAME,
        list: async () => [candidate],
        // Re-read on each load so edits to the packaged file are never stale.
        get: async () => {
            const current = readSkill(dir);
            return { name: current.name, description: current.description, invocation, provider: PROVIDER_NAME, source: 'bundled', resourceBase, content: current.body };
        },
    };
}
/**
 * Register the skill when the Host provides a skill registry, and track whether
 * it is registered so the index can fall back to its compact guide otherwise.
 * @returns a reader for "is the skill currently available".
 */
export function registerSkillWhenAvailable(ctx, dir = SKILL_DIR) {
    let available = false;
    ctx.inject(['skills'], (skillCtx) => {
        let provider;
        try {
            provider = createSkillProvider(dir);
        }
        catch (error) {
            skillCtx.logger?.(PROVIDER_NAME)?.warn?.('dsh-browser skill not registered: ' + String(error));
            return;
        }
        skillCtx.skills.registerProvider(() => provider);
        available = true;
        skillCtx.effect?.(() => () => { available = false; });
    });
    return { isAvailable: () => available };
}
//# sourceMappingURL=skill.js.map