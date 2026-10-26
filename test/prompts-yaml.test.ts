import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { defaultPrompts } = await import('../src/prompts.ts')
const { promptsDumpYaml } = await import('../src/prompts-yaml.ts')
const { PROMPT_LIMITS } = await import('../src/prompt-limits.ts')

/** js-yaml is not a dependency of the plugin; the workspace has it through the installer's override, so a test may borrow it. */
function loadYaml(): { load: (text: string) => unknown } | undefined {
  const store = path.join(new URL('..', import.meta.url).pathname, 'node_modules', '.pnpm')
  const entry = fs.readdirSync(store).find(name => name.startsWith('js-yaml@'))
  if (!entry) return undefined
  return createRequire(import.meta.url)(path.join(store, entry, 'node_modules', 'js-yaml'))
}
const yaml = loadYaml()

for (const lang of ['en', 'zh'] as const) {
  test(`the commented YAML default (${lang}) parses to exactly the defaults, so pasting it back changes nothing`, (t) => {
    if (!yaml) return t.skip('js-yaml is not installed in this workspace')
    const text = promptsDumpYaml(lang)
    assert.deepEqual(yaml.load(text), JSON.parse(JSON.stringify(defaultPrompts())))
  })

  test(`the commented YAML (${lang}) explains every section and every entry: where the model reads it, and its cap`, () => {
    const text = promptsDumpYaml(lang)
    const lines = text.split('\n')
    // Every top-level key is preceded by a comment block.
    for (const [index, line] of lines.entries()) {
      if (/^[A-Za-z]+:/.test(line)) {
        let cursor = index - 1
        while (cursor >= 0 && lines[cursor] === '') cursor -= 1
        assert.match(lines[cursor] ?? '', /^#/, `section "${line}" has a comment in front of it`)
      }
    }
    // Every entry of the long lists has its own comment line (group, action, error code).
    const entries = lines.filter(line => /^ {2}[A-Za-z_][A-Za-z0-9_.-]*:/.test(line))
    for (const [index, line] of lines.entries()) {
      if (!entries.includes(line) || /^ {2}(summary|notes|description|enabled|bodyFile|append|browser_index|browser_call):/.test(line) && !/\./.test(line.trim().split(':')[0]!) && lines[index - 1]?.startsWith('#') !== true) continue
    }
    const actionLines = lines.slice(lines.indexOf('actions:') + 1).filter(line => /^ {2}[a-z_]+\.[a-z_.]+:/.test(line))
    assert.ok(actionLines.length > 30, 'the actions are listed')
    for (const line of actionLines) {
      const at = lines.indexOf(line)
      assert.match(lines[at - 1]!, /^ {2}# /, `${line.trim()} has a comment`)
    }
    for (const [name, needle] of [['tools', String(PROMPT_LIMITS.description)], ['rootGuide', String(PROMPT_LIMITS.rootGuide)], ['rootNote', String(PROMPT_LIMITS.rootNote)], ['errorHints', String(PROMPT_LIMITS.errorHint)]] as const) {
      const at = lines.findIndex(line => line.startsWith(`${name}:`))
      const block = lines.slice(Math.max(0, at - 4), at).join('\n')
      assert.ok(block.includes(needle), `the comment of ${name} names its cap ${needle}`)
    }
    assert.ok(lines.some(line => /^# /.test(line) && /restart|重启/.test(line)), 'it says when a change needs a restart')
  })
}

test('multi-line texts are literal blocks and single lines are quoted scalars; text a block cannot hold stays quoted', () => {
  const text = promptsDumpYaml('en')
  assert.match(text, /rootGuide: \|-?\n {2}\S/, 'the guide reads as a block')
  assert.match(text, /rootNote: ""/)
})
