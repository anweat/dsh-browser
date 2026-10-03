import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const { Config, resolveConfig } = await import('../src/config.ts')
const { PROMPT_LIMITS, defaultPrompts, describePrompts, resolvePrompts } = await import('../src/prompts.ts')
const { ACTIONS } = await import('../src/actions/registry.ts')
const { renderIndex } = await import('../src/actions/index-view.ts')
const { DEFAULT_ERROR_HINTS, hintFor, installErrorHints, mapError } = await import('../src/actions/errors.ts')
const { ACTION_GROUPS } = await import('../src/actions/types.ts')
const { createSkillProvider } = await import('../src/skill.ts')
const { registerTools } = await import('../src/tools.ts')

const dumped = defaultPrompts()

/** Everything the model can read that the prompts configuration can touch, for one configuration. */
async function outputs(prompts: unknown, mode: 'unrestricted' | 'read-only' | 'standard') {
  const config = resolveConfig(Config({ automationMode: mode, prompts } as never) as never)
  const env = (skillAvailable: boolean) => ({ mode: config.automationMode, options: config.automationAssets, enabled: true, skillAvailable, prompts: config.prompts.current() })
  const pages: Record<string, string> = {}
  for (const skillAvailable of [false, true]) {
    pages[`root:${skillAvailable}`] = renderIndex({}, env(skillAvailable)).text
    for (const group of ACTION_GROUPS) pages[`group:${group}:${skillAvailable}`] = renderIndex({ group }, env(skillAvailable)).text
  }
  for (const action of ACTIONS) {
    const names = [action.name, ...Object.keys(action.subActions?.items ?? {}).map((sub: string) => `${action.name}.${sub}`), ...Object.keys(action.topics ?? {}).map((topic: string) => `${action.name}.${topic}`)]
    for (const name of names) pages[`action:${name}`] = renderIndex({ action: name }, env(true)).text
  }
  for (const query of ['click', 'upload file', 'draft journal', 'observe', 'zzzz']) pages[`search:${query}`] = renderIndex({ query }, env(true)).text
  const hints: Record<string, unknown> = {}
  const release = installErrorHints(() => config.prompts.current().errorHints)
  try {
    for (const code of Object.keys(DEFAULT_ERROR_HINTS)) hints[code] = hintFor(code as never)
    for (const message of ['Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole("button")', 'Target page, context or browser has been closed', 'strict mode violation: locator resolved to 2 elements', 'is not allowed for', 'asset not found', 'something unexpected']) hints[message] = mapError(new Error(message), 'act.click')
  } finally { release() }
  const tools: any[] = []
  registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, config, {} as never)
  const flat: any[] = []
  registerTools({ tools: { register: (tool: any) => flat.push(tool) } } as never, resolveConfig(Config({ automationMode: mode, toolSurface: 'flat', prompts } as never) as never), {} as never)
  const provider = createSkillProvider(undefined, config.prompts)
  return {
    pages, hints,
    tools: tools.map(tool => [tool.name, tool.description, tool.parameters]),
    flatTools: flat.map(tool => [tool.name, tool.description]),
    skill: [await provider.list(), await provider.get()],
    status: describePrompts({ prompts: config.prompts, mode: config.automationMode, options: config.automationAssets, enabled: true }),
  }
}

test('the dump lists every overridable text in the structure of the config, and every default is within its limit', () => {
  assert.deepEqual(Object.keys(dumped), ['tools', 'rootGuide', 'rootNote', 'groups', 'actions', 'errorHints', 'skill'])
  assert.deepEqual(Object.keys(dumped.groups as object), [...ACTION_GROUPS])
  const actions = dumped.actions as Record<string, { summary: string; notes: string }>
  for (const action of ACTIONS) {
    assert.ok(actions[action.name], `${action.name} is listed`)
    for (const sub of Object.keys(action.subActions?.items ?? {})) assert.ok(actions[`${action.name}.${sub}`], `${action.name}.${sub} is listed`)
    for (const topic of Object.keys(action.topics ?? {})) assert.ok(actions[`${action.name}.${topic}`], `${action.name}.${topic} is listed`)
  }
  assert.deepEqual(Object.keys(dumped.errorHints as object), Object.keys(DEFAULT_ERROR_HINTS))
  for (const [key, value] of Object.entries(actions)) {
    assert.ok(value.summary.length > 0 && value.summary.length <= PROMPT_LIMITS.summary, `${key} summary ${value.summary.length}`)
    assert.ok(value.notes.length <= (key.startsWith('observe.read.') && key !== 'observe.read' ? PROMPT_LIMITS.topicText : PROMPT_LIMITS.notes), `${key} notes ${value.notes.length}`)
  }
  // The JSON is plain data: it survives a text round trip unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(dumped)), dumped)
})

test('round trip: the dump, passed back as the configuration, changes no output at all', async () => {
  // Through the config schema too, as a deployer's pasted YAML/JSON would pass.
  assert.doesNotThrow(() => Config({ prompts: JSON.parse(JSON.stringify(dumped)) } as never))
  const resolved = resolvePrompts(JSON.parse(JSON.stringify(dumped)))
  assert.deepEqual(resolved.diagnostics, [], 'the defaults raise no diagnostic')
  for (const mode of ['unrestricted', 'read-only', 'standard'] as const) {
    const base = await outputs(undefined, mode)
    const round = await outputs(JSON.parse(JSON.stringify(dumped)), mode)
    assert.deepEqual(round.pages, base.pages, `${mode}: catalog pages`)
    assert.deepEqual(round.hints, base.hints, `${mode}: error hints`)
    assert.deepEqual(round.tools, base.tools, `${mode}: L0 tools`)
    assert.deepEqual(round.flatTools, base.flatTools, `${mode}: flat tools`)
    assert.deepEqual(round.skill, base.skill, `${mode}: skill`)
    assert.deepEqual(round.status.diagnostics, [], `${mode}: no diagnostics`)
    assert.deepEqual(round.status.budget, base.status.budget, `${mode}: budget`)
  }
  // The comparison would notice a difference: one edited text moves its output.
  const edited = JSON.parse(JSON.stringify(dumped))
  edited.actions['act.click'].summary = 'edited'
  assert.notDeepEqual((await outputs(edited, 'unrestricted')).pages, (await outputs(undefined, 'unrestricted')).pages)
})

test('prompts:dump prints the same JSON the library produces', () => {
  const script = fileURLToPath(new URL('../scripts/dump-prompts.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), dumped)
  assert.equal(JSON.parse(spawnSync(process.execPath, [script, '--compact'], { encoding: 'utf8' }).stdout).rootNote, '')
})

test('the settings card gets the same JSON prompts:dump prints, through the RPC, and it is the configuration shape', async () => {
  const { rpcFixture } = await import('./rpc-fixture.ts')
  const { PromptsStatusController } = await import('../src/client/prompts-status-client.ts')
  const script = fileURLToPath(new URL('../scripts/dump-prompts.mjs', import.meta.url))
  const printed = spawnSync(process.execPath, [script], { encoding: 'utf8' }).stdout
  const { call, rpc, requests } = rpcFixture()
  const reply = await call('promptsDefaults')
  assert.equal(reply.ok, true)
  assert.equal(reply.value.json + '\n', printed, 'byte for byte what the script prints')
  assert.deepEqual(JSON.parse(reply.value.json), dumped)

  const controller = new PromptsStatusController(rpc as never)
  await controller.refresh()
  assert.equal(controller.snapshot().defaults, undefined, 'nothing is loaded until it is asked for')
  await controller.exportDefaults()
  assert.equal(requests.at(-1)!.endpoint, 'promptsDefaults')
  assert.equal(controller.snapshot().defaults, reply.value.json)
  assert.ok(controller.snapshot().status === undefined || controller.snapshot().loading === false)
  controller.inject().hidePromptDefaults()
  assert.equal(controller.snapshot().defaults, undefined)
  // A refresh of the status keeps an exported text on screen; a failing export says so and leaves the rest alone.
  await controller.exportDefaults()
  await controller.refresh()
  assert.equal(controller.snapshot().defaults, reply.value.json)
  const flaky = new PromptsStatusController({ call: async () => { throw new Error('plugin restarting') } } as never)
  await flaky.exportDefaults()
  assert.equal(flaky.snapshot().defaultsFailed, true)
  assert.equal(flaky.snapshot().defaults, undefined)
  controller.dispose(); flaky.dispose()
})
