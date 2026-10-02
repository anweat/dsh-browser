import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ACTIONS, CALL_TOOL, INDEX_TOOL, findAction, findSubAction } from '../src/actions/registry.ts'
import { ACTION_GROUPS, ERROR_CODES } from '../src/actions/types.ts'
import { validateArgs } from '../src/actions/schema.ts'
import { COMPACT_GUIDE, renderIndex } from '../src/actions/index-view.ts'
import { SKILL_DIR, SKILL_NAME, createSkillProvider, parseSkillFile, readSkill } from '../src/skill.ts'
import plugin, { inject } from '../src/index.ts'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { normalizePostconditions, validateRecipeV2 } from '../src/automation-v2.ts'

const SKILL_FILES = ['SKILL.md', ...fs.readdirSync(path.join(SKILL_DIR, 'references')).filter(file => file.endsWith('.md')).map(file => 'references/' + file)]
const read = (file: string): string => fs.readFileSync(path.join(SKILL_DIR, file), 'utf8')

/** The old tool names; none may appear in guidance, since the model cannot call them. */
const LEGACY = /\bbrowser_(open|read|click|type|press|select|check|hover|scroll|set_files|wait|screenshot|close|status|install|console|requests|evaluate|script_\w+|userscript_run|recipe_run|automation_\w+|opencli_\w+|crawl)\b/

test('the skill is packaged where the plugin looks for it', () => {
  assert.ok(fs.existsSync(path.join(SKILL_DIR, 'SKILL.md')), SKILL_DIR)
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] }
  assert.ok(pkg.files.includes('assets'), 'package.json files must ship assets/')
  assert.ok(SKILL_DIR.endsWith(path.join('assets', 'skills', 'dsh-browser') + path.sep))
  // lib/ sits next to src/ one level below the package root, so the same relative URL resolves from the build.
  const built = path.join(path.dirname(new URL('../package.json', import.meta.url).pathname), 'lib')
  if (fs.existsSync(path.join(built, 'skill.js'))) {
    assert.ok(fs.readFileSync(path.join(built, 'skill.js'), 'utf8').includes("../assets/skills/dsh-browser/"))
  }
})

test('SKILL.md has the front matter the Host needs and stays within its size budget', () => {
  const skill = readSkill()
  assert.equal(skill.name, SKILL_NAME)
  assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.match(skill.description, /open, read, or operate web pages/i)
  assert.match(skill.description, /打开、读取、操作网页/)
  assert.ok(skill.body.length <= 7_000, `skill body is ${skill.body.length} chars (~2k tokens max)`)
  assert.ok(!skill.body.startsWith('---'))
  assert.throws(() => parseSkillFile('no front matter'), /front matter/)
})

test('every reference file is linked from SKILL.md', () => {
  const body = read('SKILL.md')
  for (const file of SKILL_FILES.filter(file => file !== 'SKILL.md')) assert.ok(body.includes(file), `${file} is not referenced`)
  for (const [, link] of body.matchAll(/`(references\/[\w.-]+)`/g)) assert.ok(SKILL_FILES.includes(link!), `dangling reference ${link}`)
})

test('skill text and examples cannot drift from the action registry', () => {
  let namesChecked = 0
  let callsChecked = 0
  let indexChecked = 0
  const groupPattern = new RegExp(`(?<![\\w/.])(${ACTION_GROUPS.join('|')})\\.([a-z_]+)\\b(?!\\.md)`, 'g')
  for (const file of SKILL_FILES) {
    const text = read(file)
    assert.doesNotMatch(text, LEGACY, `${file} names a tool that no longer exists`)
    for (const match of text.matchAll(groupPattern)) {
      assert.ok(findAction(match[0]), `${file} mentions unknown action ${match[0]}`)
      namesChecked += 1
    }
    for (const block of text.matchAll(/```json (call|index)\n([\s\S]*?)```/g)) {
      const value = JSON.parse(block[2]!) as Record<string, unknown>
      if (block[1] === 'call') {
        assert.deepEqual(Object.keys(value).sort().filter(key => key !== 'args'), ['action'], `${file}: a call block is {action, args}`)
        const action = findAction(value.action)
        assert.ok(action, `${file} example calls unknown action ${String(value.action)}`)
        const checked = validateArgs(action.params, value.args ?? {})
        assert.deepEqual(checked.errors, [], `${file}: example for ${action.name} fails its schema`)
        // A sub-action example must name a real operation and carry what that operation requires.
        if (action.subActions) {
          const operation = (value.args as Record<string, unknown>)[action.subActions.key] as string
          const sub = action.subActions.items[operation]
          assert.ok(sub, `${file}: ${action.name} example uses unknown operation ${operation}`)
          for (const required of sub.required ?? []) assert.ok(required in (value.args as object), `${file}: ${action.name} ${operation} example lacks ${required}`)
          for (const key of Object.keys(value.args as object)) assert.ok(key === action.subActions.key || sub.params.includes(key), `${file}: ${action.name} ${operation} example passes ${key}, which that operation does not take`)
        }
        callsChecked += 1
      } else {
        assert.ok(Object.keys(value).every(key => ['group', 'action', 'query'].includes(key)), `${file}: bad index args`)
        if (typeof value.action === 'string') assert.ok(findAction(value.action) || findSubAction(value.action), `${file}: index names unknown action ${value.action}`)
        if (typeof value.group === 'string') assert.ok((ACTION_GROUPS as readonly string[]).includes(value.group))
        indexChecked += 1
      }
    }
  }
  // The checks above must have actually looked at something.
  assert.ok(namesChecked >= 25, `only ${namesChecked} action names were checked`)
  assert.ok(callsChecked >= 14, `only ${callsChecked} call examples were checked`)
  assert.ok(indexChecked >= 2, 'the sub-action index form is demonstrated')
})

test('the six everyday actions the skill promises examples for are all demonstrated', () => {
  const body = read('SKILL.md')
  for (const action of ['target.open', 'observe.read', 'act.click', 'act.fill', 'act.wait', 'automation.run', 'automation.search']) {
    assert.match(body, new RegExp(`"action":"${action.replace('.', '\\.')}"`), `${action} has no example`)
  }
  assert.ok(ACTIONS.length > 0)
})

test('the skill provider matches the Host provider contract and serves the packaged body', async () => {
  const provider = createSkillProvider()
  assert.equal(provider.name, 'dsh-browser')
  const [candidate] = await provider.list()
  assert.ok(candidate)
  assert.equal(candidate.name, 'dsh-browser')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, 600)
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
  assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: SKILL_DIR })
  const loaded = await provider.get()
  assert.equal(loaded.name, 'dsh-browser')
  assert.match(loaded.content, /^# dsh-browser/)
  assert.doesNotMatch(loaded.content, /^---/)
  // Relative reference files resolve against the advertised base directory.
  for (const [, link] of loaded.content.matchAll(/`(references\/[\w.-]+)`/g)) assert.ok(fs.existsSync(path.join(candidate.resourceBase.path, link!)), link)
})

function hostWith(tools: any[]): Context {
  const root = new Context()
  root.provide('tools', { register(tool: any) { tools.push(tool); return () => {} } })
  root.provide('settings', {})
  return root
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40))

test('the plugin does not depend on a skill service: it declares none and works without one', async () => {
  assert.deepEqual(inject, ['tools', 'settings'])
  assert.deepEqual((plugin as { inject: readonly string[] }).inject, ['tools', 'settings'])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-noskill-'))
  const tools: any[] = []
  const host = hostWith(tools)
  try {
    host.plugin(plugin as never, { snapshotDir: dir } as never)
    await settle()
    // Cordis 4.0.4 would leave the plugin pending if `skills` were a required inject; the tools prove it ran.
    assert.deepEqual(tools.map(tool => tool.name), [INDEX_TOOL, CALL_TOOL])
    const index = tools.find(tool => tool.name === INDEX_TOOL)
    const root = (await index.execute({}, {})).text as string
    assert.ok(root.includes(COMPACT_GUIDE), 'the root carries the compact guide when no skill exists')
    assert.doesNotMatch(root, /skill "dsh-browser"/)
    const call = tools.find(tool => tool.name === CALL_TOOL)
    const reply = await call.execute({ action: 'runtime.status' }, { signal: new AbortController().signal })
    assert.equal(reply.ok, true, 'actions keep working without the skill')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('when a skill service appears, the provider is registered and the guide gives way to a pointer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-skill-'))
  const tools: any[] = []
  const host = hostWith(tools)
  const providers: any[] = []
  try {
    host.plugin(plugin as never, { snapshotDir: dir } as never)
    await settle()
    const index = tools.find(tool => tool.name === INDEX_TOOL)
    assert.ok(((await index.execute({}, {})).text as string).includes('Guide:'))

    const skillHost = host.plugin({
      name: 'fake-skill-registry',
      apply(ctx: any) {
        ctx.provide('skills', { registerProvider(create: (control: unknown) => unknown) { providers.push(create({ signal: new AbortController().signal, invalidate() {} })); return () => {} } })
      },
    } as never)
    await settle()
    assert.equal(providers.length, 1)
    assert.equal(providers[0].name, 'dsh-browser')
    assert.equal((await providers[0].list({}))[0].name, 'dsh-browser')
    const withSkill = (await index.execute({}, {})).text as string
    assert.match(withSkill, /skill "dsh-browser"/)
    assert.ok(!withSkill.includes('Guide:'))

    // If the registry goes away the guide returns, since the skill can no longer be loaded.
    skillHost.dispose()
    await settle()
    assert.ok(((await index.execute({}, {})).text as string).includes('Guide:'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('every v2 recipe the skill shows is accepted by the real v2 validators, not just by the parameter schema', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-skill-v2-'))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  let checked = 0
  for (const file of SKILL_FILES) {
    for (const block of read(file).matchAll(/```json call\n([\s\S]*?)```/g)) {
      const call = JSON.parse(block[1]!) as { action: string; args: Record<string, any> }
      if (call.args?.schemaVersion !== 2) continue
      if (call.action === 'automation.run_recipe') {
        validateRecipeV2(call.args.steps)
        if (call.args.postconditions) normalizePostconditions(call.args.postconditions, call.args.steps)
        checked += 1
      } else if (call.action === 'automation.develop' && call.args.action === 'save') {
        const { action: _action, ...draft } = call.args
        const saved = store.saveDraft(draft as never)
        assert.equal(saved.schemaVersion, 2, `${file}: the saved draft is v2`)
        checked += 1
      }
    }
  }
  assert.ok(checked >= 3, `only ${checked} v2 examples were checked`)
  // The converter example needs a real v1 asset id; its shape is covered by the schema check above.
})

test('skill guidance for automation.develop matches its sub-actions, error codes and the revision rules', () => {
  const skill = read('SKILL.md')
  const recipes = read('references/recipes.md')
  const develop = findAction('automation.develop')!
  // Every sub-action the registry has is something the guidance may name; every one it names exists.
  for (const [, operation] of (skill + recipes).matchAll(/"action":"(get|save|validate|test|convert|fork)"/g)) assert.ok(operation! in develop.subActions!.items, operation)
  for (const operation of ['fork', 'convert', 'test', 'save']) assert.match(skill + recipes, new RegExp(`"action":"${operation}"`), `${operation} is demonstrated`)
  assert.match(skill, /automation\.develop\.save/, 'the split detail form is shown')
  assert.match(skill, /VALIDATION_MISSING/)
  assert.match(recipes, /VALIDATION_MISSING/)
  assert.ok(develop.errors!.includes('VALIDATION_MISSING'))
  assert.match(skill + recipes, /revision/)
  assert.match(skill + recipes, /sourceAssetId/)
  // Error codes in the table all exist.
  for (const [, code] of skill.matchAll(/^\| `([A-Z_]+)`/gm)) assert.ok((ERROR_CODES as readonly string[]).includes(code!), `${code} is not an error code`)
  // The detail of every sub-action fits the budget the guidance relies on.
  for (const operation of Object.keys(develop.subActions!.items)) {
    assert.ok(renderIndex({ action: `automation.develop.${operation}` }, { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: true }).text.length <= 3_500, operation)
  }
})
