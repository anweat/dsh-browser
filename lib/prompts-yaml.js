/**
 * The default model-facing texts as a commented YAML document, in the exact structure of the `prompts:` configuration.
 *
 * `prompts:dump` and the settings card's "Export default text" also give the same data as plain JSON; this is the form
 * to start editing from: every section, and every entry of the long lists, says where the model reads it and when, what
 * its length cap is, and when a change takes effect. Comments are the only addition: parsed as YAML, the document is
 * deep-equal to {@link defaultPrompts} (test/prompts-yaml.test.ts), so pasting it back changes nothing.
 * @module dsh-browser/prompts-yaml
 */
import { defaultPrompts, promptTargetKinds } from "./prompts.js";
import { PROMPT_LIMITS } from "./prompt-limits.js";
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** A YAML key: plain when it is a simple word (dots and dashes allowed), quoted otherwise. */
function key(name) {
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) ? name : JSON.stringify(name);
}
/** Characters a literal block cannot carry faithfully: control characters, tabs, line and paragraph separators, a byte-order mark. */
const UNSAFE_IN_BLOCK = new RegExp('[\\u0000-\\u0008\\u000b-\\u001f\\u007f\\u2028\\u2029\\ufeff]|\\t');
/**
 * A string as YAML. A single line is a double-quoted scalar (JSON strings are valid YAML). Several lines are a literal
 * block, which keeps the text readable and editable; anything that would not survive a block (a tab, a control
 * character, a leading space on the first line, a trailing space) falls back to the quoted form.
 */
function scalar(text, indent) {
    const multiline = text.includes('\n');
    if (!multiline)
        return JSON.stringify(text);
    if (UNSAFE_IN_BLOCK.test(text) || /^[ ]/.test(text) || /[ ]\n/.test(text) || text.trim() === '')
        return JSON.stringify(text);
    const trailing = text.match(/\n*$/)[0].length;
    const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+';
    const body = (trailing === 0 ? text : text.slice(0, text.length - trailing)).split('\n');
    const extra = trailing > 1 ? '\n'.repeat(trailing - 1) : '';
    return `|${chomp}\n${body.map(line => line === '' ? '' : `${indent}${line}`).join('\n')}${extra}`;
}
/** `# ` in front of every line of a comment. */
const comment = (text, indent = '') => text.split('\n').map(line => `${indent}# ${line}`.trimEnd());
function emit(name, value, depth, lines) {
    const indent = '  '.repeat(depth);
    if (isRecord(value)) {
        lines.push(`${indent}${key(name)}:`);
        for (const [childName, child] of Object.entries(value))
            emit(childName, child, depth + 1, lines);
        return;
    }
    const rendered = scalar(String(value), `${indent}  `);
    lines.push(typeof value === 'boolean' ? `${indent}${key(name)}: ${value}` : `${indent}${key(name)}: ${rendered}`);
}
export function promptsDumpYaml(lang = 'en') {
    const t = (en, zh) => lang === 'zh' ? zh : en;
    const defaults = defaultPrompts();
    const out = [];
    const section = (text) => { if (out.length)
        out.push(''); out.push(...comment(text)); };
    out.push(...comment(t('Default text of everything the dsh-browser plugin tells the model, in the structure of the `prompts:` setting.\n'
        + 'Use: copy what you want to change under `prompts:` in the plugin\'s section of the profile config (or edit it in the settings card),\n'
        + 'delete everything you keep as it is, reword the rest. Pasted back unchanged this changes nothing (a blank value means "none").\n'
        + 'Layers: L0 = the two tool descriptions, in every request; L1 = browser_index() and browser_index({group}), the catalog the model browses;\n'
        + 'L2 = browser_index({action}), the detail of one action; skill = the dsh-browser skill, loaded on demand. Keep each text short: it costs context every time it is read.', 'dsh-browser 插件告诉模型的全部默认文本，结构与 `prompts:` 设置完全一致。\n'
        + '用法：把想改的部分复制到 profile 配置里本插件段的 `prompts:` 下（或在设置卡片里编辑），保持默认的整段删掉，其余改写。\n'
        + '原样粘回不会改变任何东西（空值表示“没有”）。\n'
        + '层级：L0 = 两个工具描述，每次请求都带；L1 = browser_index() 与 browser_index({group})，模型浏览的目录；\n'
        + 'L2 = browser_index({action})，单个动作的详情；skill = dsh-browser 技能，按需加载。每段都尽量短：每被读一次都占用上下文。')));
    section(t(`tools — L0. The tool descriptions the model reads on every request, so shorter is better. At most ${PROMPT_LIMITS.description} characters each.\n`
        + 'Registered when the profile starts: a change needs a restart. The compliance notice is always appended to browser_call and cannot be removed.', `tools —— L0。模型每次请求都会读到的两个工具描述，越短越好；各不超过 ${PROMPT_LIMITS.description} 字符。\n`
        + '工具在 profile 启动时注册：修改后需要重启。browser_call 末尾的合规声明会自动追加，无法删除。'));
    emit('tools', defaults.tools, 0, out);
    section(t(`rootGuide — L1. The compact guide at the top of browser_index() when the dsh-browser skill is not available or is turned off (skill.enabled: false). At most ${PROMPT_LIMITS.rootGuide} characters.\nTakes effect on the next call.`, `rootGuide —— L1。dsh-browser skill 不可用或被关闭（skill.enabled: false）时，browser_index() 顶部显示的精简指南；不超过 ${PROMPT_LIMITS.rootGuide} 字符。\n下一次调用即生效。`));
    emit('rootGuide', defaults.rootGuide, 0, out);
    section(t(`rootNote — L1. Your own advice, appended at the end of browser_index() (also when the skill is available). Blank means none. At most ${PROMPT_LIMITS.rootNote} characters.`, `rootNote —— L1。你自己的建议，追加在 browser_index() 末尾（有 skill 时也显示）；留空表示没有；不超过 ${PROMPT_LIMITS.rootNote} 字符。`));
    emit('rootNote', defaults.rootNote, 0, out);
    if (isRecord(defaults.groups)) {
        section(t(`groups — L1. One line per action group, shown when the model calls browser_index() with no arguments (the list of groups). At most ${PROMPT_LIMITS.summary} characters each.`, `groups —— L1。每个动作分组的一行说明，模型调用不带参数的 browser_index()（分组列表）时读到；各不超过 ${PROMPT_LIMITS.summary} 字符。`));
        out.push('groups:');
        for (const [name, value] of Object.entries(defaults.groups)) {
            out.push(...comment(t(`group ${name}`, `分组 ${name}`), '  '));
            emit(name, value, 1, out);
        }
    }
    if (isRecord(defaults.actions)) {
        const kinds = promptTargetKinds();
        section(t(`actions — L1/L2. Keyed by group.action (automation.develop.save adds a sub-action, observe.read.controls a detail topic).\n`
            + `summary (at most ${PROMPT_LIMITS.summary} characters) is the one-line catalog entry the model reads in browser_index({group}); notes (at most ${PROMPT_LIMITS.notes}; ${PROMPT_LIMITS.topicText} for a topic)\n`
            + 'is the extra guidance in browser_index({action}). For a topic, notes is the whole text of that detail page. Blank notes means none.', `actions —— L1/L2。键为 group.action（automation.develop.save 是子动作，observe.read.controls 是详情主题）。\n`
            + `summary（不超过 ${PROMPT_LIMITS.summary} 字符）是模型在 browser_index({group}) 里读到的一行目录；notes（不超过 ${PROMPT_LIMITS.notes}，主题 ${PROMPT_LIMITS.topicText}）\n`
            + '是 browser_index({action}) 里的补充指导；对详情主题，notes 就是该页的全部文字；notes 留空表示没有。'));
        out.push('actions:');
        for (const [name, value] of Object.entries(defaults.actions)) {
            const kind = kinds[name] ?? 'action';
            out.push(...comment(kind === 'action'
                ? t(`${name} — summary: browser_index({group: "${name.split('.')[0]}"}); notes: browser_index({action: "${name}"})`, `${name} —— summary 在 browser_index({group: "${name.split('.')[0]}"}) 里读到；notes 在 browser_index({action: "${name}"}) 里读到`)
                : kind === 'sub'
                    ? t(`${name} — a sub-action: its summary and notes appear in browser_index({action: "${name}"})`, `${name} —— 子动作：summary 与 notes 出现在 browser_index({action: "${name}"}) 里`)
                    : t(`${name} — a detail topic: browser_index({action: "${name}"}) returns this page`, `${name} —— 详情主题：browser_index({action: "${name}"}) 返回这一页`), '  '));
            emit(name, value, 1, out);
        }
    }
    if (isRecord(defaults.errorHints)) {
        section(t(`errorHints — L2 (in results). Keyed by error code. The hint is appended to the error result with that code, so the model reads it right after a failed call. At most ${PROMPT_LIMITS.errorHint} characters each.\nOnly codes that have a fixed hint can be replaced; others are ignored.`, `errorHints —— 结果里。键为错误码。提示会附在该错误码的错误结果后面，模型在调用失败后立即读到；各不超过 ${PROMPT_LIMITS.errorHint} 字符。\n只有带固定提示的错误码可被替换，其余会被忽略。`));
        out.push('errorHints:');
        for (const [name, value] of Object.entries(defaults.errorHints)) {
            out.push(...comment(t(`${name}: read after a failed call that returned this code`, `${name}：调用失败并返回该错误码后读到`), '  '));
            emit(name, value, 1, out);
        }
    }
    if (isRecord(defaults.skill)) {
        section(t('skill — the dsh-browser skill (SKILL.md), registered with the Host\'s skill list so the model can load it on demand.', 'skill —— dsh-browser 技能（SKILL.md），注册进宿主的技能列表，模型按需加载。'));
        out.push('skill:');
        const skill = defaults.skill;
        out.push(...comment(t('enabled: false stops registering the skill; the root then shows rootGuide instead.', 'enabled: false 时不注册该技能，根目录改为显示 rootGuide。'), '  '));
        emit('enabled', skill.enabled, 1, out);
        out.push(...comment(t(`description: the line the model reads in the skill list on every turn, so keep it short. At most ${PROMPT_LIMITS.skillDescription} characters.`, `description：模型每一轮在技能列表里读到的那一行，请保持简短；不超过 ${PROMPT_LIMITS.skillDescription} 字符。`), '  '));
        emit('description', skill.description, 1, out);
        out.push(...comment(t(`bodyFile: absolute path of a Markdown file that replaces the SKILL.md body the model reads when it loads the skill (at most ${PROMPT_LIMITS.skillBodyFile} characters). A missing or unreadable file falls back to the packaged body. Blank means the packaged body.`, `bodyFile：用一个 Markdown 文件（绝对路径，不超过 ${PROMPT_LIMITS.skillBodyFile} 字符）替换模型加载技能时读到的 SKILL.md 正文；文件缺失或不可读时回退到内置正文；留空表示使用内置正文。`), '  '));
        emit('bodyFile', skill.bodyFile, 1, out);
        out.push(...comment(t(`append: text added to the end of the skill body, read when the model loads the skill. Blank means none. At most ${PROMPT_LIMITS.skillAppend} characters.`, `append：追加在技能正文末尾的文字，模型加载技能时读到；留空表示没有；不超过 ${PROMPT_LIMITS.skillAppend} 字符。`), '  '));
        emit('append', skill.append, 1, out);
    }
    return out.join('\n') + '\n';
}
//# sourceMappingURL=prompts-yaml.js.map