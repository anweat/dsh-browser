import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// No dsh-tools stub here: the point is to compare with what the real `defineTool` registers.
const { registerTools } = await import('../src/tools.ts')
const { resolveConfig } = await import('../src/config.ts')
const { describePrompts } = await import('../src/prompts.ts')
const { CALL_TOOL, INDEX_TOOL } = await import('../src/actions/registry.ts')
const { estimateTokens, indexedToolDefinitions, modelFacingChars } = await import('../src/tool-defs.ts')

function registered(input: Record<string, unknown>) {
  const config = resolveConfig({ enabled: true, automationMode: 'unrestricted', ...input } as never)
  const tools: { name: string; description: string; parameters: unknown }[] = []
  registerTools({ tools: { register: (tool: never) => tools.push(tool) } } as never, config, {} as never)
  return { config, tools: tools.filter(tool => tool.name === INDEX_TOOL || tool.name === CALL_TOOL) }
}

for (const [label, input] of [
  ['defaults', {}],
  ['overridden descriptions', { prompts: { tools: { browser_index: { description: 'IDX' }, browser_call: { description: 'CALL' } } } }],
] as const) {
  test(`L0: the settings card estimate, runtime.status and the measured surface use one input (${label})`, () => {
    const { config, tools } = registered(input)
    const overrides = config.prompts.current().tools
    // The definitions the budget measures are exactly what the host is sent: normalized schema, final descriptions.
    const definitions = indexedToolDefinitions(overrides)
    assert.deepEqual(definitions.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      tools.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })))
    const status = describePrompts({ prompts: config.prompts, mode: config.automationMode, options: config.automationAssets, enabled: true })
    assert.equal(status.budget.l0Tokens, estimateTokens(modelFacingChars(tools)))
  })
}

test('L0: the card figure equals the number scripts/measure-tool-surface.mjs prints', () => {
  const { config } = registered({})
  const status = describePrompts({ prompts: config.prompts, mode: 'unrestricted', options: config.automationAssets, enabled: true })
  const script = fileURLToPath(new URL('../scripts/measure-tool-surface.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [script, '--json', '--mode', 'unrestricted'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).indexed.estimatedTokens, status.budget.l0Tokens)
})
