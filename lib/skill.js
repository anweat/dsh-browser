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
import { SKILL_BODY_FILE_LIMIT } from "./prompt-limits.js";
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
export { SKILL_BODY_FILE_LIMIT };
/**
 * Read a replacement skill body. A leading front matter block is dropped (the name and description come from the
 * packaged file or `prompts.skill.description`). Never throws: a missing, unreadable, empty or oversized file is
 * reported as a reason, and the caller falls back to the packaged body.
 */
export function loadSkillBodyFile(file) {
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    }
    catch (error) {
        const code = error?.code;
        return { ok: false, reason: code === 'ENOENT' ? `skill.bodyFile does not exist: ${file}` : `skill.bodyFile cannot be read (${code ?? 'error'}): ${file}` };
    }
    const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
    const body = (front ? front[1] : raw).replace(/^\s+/, '');
    if (body.trim() === '')
        return { ok: false, reason: `skill.bodyFile is empty: ${file}` };
    if (body.length > SKILL_BODY_FILE_LIMIT)
        return { ok: false, reason: `skill.bodyFile is ${body.length} characters, over the limit of ${SKILL_BODY_FILE_LIMIT}: ${file}` };
    return { ok: true, body };
}
/** What the skill says right now: the packaged file with the `prompts.skill` overrides applied. */
export function currentSkill(dir = SKILL_DIR, prompts) {
    const packaged = readSkill(dir);
    const overrides = prompts?.current().skill;
    if (!overrides)
        return packaged;
    let body = packaged.body;
    if (overrides.bodyFile) {
        const loaded = loadSkillBodyFile(overrides.bodyFile);
        if (loaded.ok)
            body = loaded.body;
    }
    if (overrides.append)
        body = body.replace(/\s+$/, '') + '\n\n' + overrides.append;
    return { name: packaged.name, description: overrides.description ?? packaged.description, body };
}
/** Identifies the skill text in force, so a change (config edit or an edited body file) can be noticed. */
function skillSignature(prompts) {
    const skill = prompts?.current().skill;
    if (!skill)
        return '';
    let file = '';
    if (skill.bodyFile) {
        try {
            const stat = fs.statSync(skill.bodyFile);
            file = `${stat.mtimeMs}:${stat.size}`;
        }
        catch {
            file = 'missing';
        }
    }
    return JSON.stringify([skill.enabled, skill.description, skill.bodyFile, skill.append, file]);
}
/**
 * A provider object shaped like the Host's `SkillProvider` (declared locally to avoid a build-time dependency).
 * It reads the packaged file and the `prompts.skill` overrides on every call, so it is never stale.
 */
export function createSkillProvider(dir = SKILL_DIR, prompts) {
    const resourceBase = { kind: 'directory', path: dir };
    const invocation = { modelInvocable: true, userInvocable: true };
    // Fail at creation, as before, when the packaged file is missing or malformed.
    readSkill(dir);
    return {
        name: PROVIDER_NAME,
        list: async () => {
            const skill = currentSkill(dir, prompts);
            return [{
                    name: skill.name,
                    description: skill.description,
                    invocation,
                    provider: PROVIDER_NAME,
                    source: 'bundled',
                    resourceBase,
                    rank: BUNDLED_SKILL_RANK,
                    locator: dir + 'SKILL.md',
                }];
        },
        // Re-read on each load so edits to the packaged file are never stale.
        get: async () => {
            const current = currentSkill(dir, prompts);
            return { name: current.name, description: current.description, invocation, provider: PROVIDER_NAME, source: 'bundled', resourceBase, content: current.body };
        },
    };
}
/**
 * Register the skill when the Host provides a skill registry, and track whether
 * it is registered so the index can fall back to its compact guide otherwise.
 * With `prompts.skill.enabled=false` nothing is registered.
 */
export function registerSkillWhenAvailable(ctx, dir = SKILL_DIR, prompts) {
    let available = false;
    let sync = () => { };
    ctx.inject(['skills'], (skillCtx) => {
        let provider;
        try {
            provider = createSkillProvider(dir, prompts);
        }
        catch (error) {
            skillCtx.logger?.(PROVIDER_NAME)?.warn?.('dsh-browser skill not registered: ' + String(error));
            return;
        }
        let unregister;
        let invalidate;
        let signature = '';
        let alive = true;
        const register = () => {
            const handle = skillCtx.skills.registerProvider((control) => {
                invalidate = control?.invalidate?.bind(control);
                return provider;
            });
            unregister = typeof handle === 'function' ? handle : () => { };
            available = true;
        };
        const withdraw = () => {
            try {
                unregister?.();
            }
            catch { /* the Host may already have dropped it */ }
            unregister = undefined;
            invalidate = undefined;
            available = false;
        };
        sync = () => {
            if (!alive)
                return;
            const enabled = prompts?.current().skill.enabled !== false;
            const next = skillSignature(prompts);
            if (enabled && !available)
                register();
            else if (!enabled && available)
                withdraw();
            else if (available && next !== signature) {
                try {
                    invalidate?.();
                }
                catch { /* a stale handle is harmless */ }
            }
            signature = next;
        };
        sync();
        skillCtx.effect?.(() => () => { alive = false; withdraw(); });
    });
    return { isAvailable: () => available, refresh: () => sync() };
}
//# sourceMappingURL=skill.js.map