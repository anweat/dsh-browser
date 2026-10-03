#!/usr/bin/env node
// Measures the model-facing tool surface for BOTH tool surfaces: every tool the
// plugin registers, serialized as { name, description, parameters } (what the
// host sends to the model; output schemas and renderers stay host-side and are
// reported separately for information only). Also measures what the indexed
// surface discloses on demand: the browser_index() root, each group listing,
// and one action's full schema.
//
// Prints, per surface: tool count, total characters, an estimated token count
// (chars / 3.5) and a per-tool ranking, then the progressive-disclosure sizes.
// The indexed L0 budget from the tool-system design is 1.5k tokens (~5.2k chars);
// the script reports whether it is met and exits 1 when it is not.
//
// Usage: node scripts/measure-tool-surface.mjs [--mode <read-only|standard|autonomous|unrestricted>] [--json]
//   --mode  automation mode to register under. Default `unrestricted`, which
//           exposes every action (the full surface).
//   --json  machine-readable output (for budgets in later milestones).
//
// It measures the TypeScript sources, not lib/, so it never reports a stale
// build. It needs no browser and does not launch one.
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const INDEXED_L0_BUDGET_TOKENS = 1500
// Every browser_index() layer (root, group, action, sub-action) must stay within this.
const DISCLOSURE_BUDGET_TOKENS = 1000
const root = fileURLToPath(new URL('..', import.meta.url))

// The sources use parameter properties, which need type *transformation*, so
// re-run under the flag the test runner already uses.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

const args = process.argv.slice(2)
const json = args.includes('--json')
const modeIndex = args.indexOf('--mode')
const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'unrestricted'

const { registerTools } = await import(pathToFileURL(path.join(root, 'src/tools.ts')).href)
const { resolveConfig } = await import(pathToFileURL(path.join(root, 'src/config.ts')).href)
const { ACTION_GROUPS } = await import(pathToFileURL(path.join(root, 'src/actions/types.ts')).href)
// The estimate is shared with the settings card and runtime.status (src/tool-defs.ts), so the three cannot drift apart.
const { CHARS_PER_TOKEN, estimateTokens, modelFacingChars } = await import(pathToFileURL(path.join(root, 'src/tool-defs.ts')).href)

const tokens = estimateTokens

function register(automationMode, toolSurface, runtime = {}) {
  const registered = []
  const config = resolveConfig({ enabled: true, automationMode, toolSurface })
  // The service is only touched when a tool executes (browser_index() reads runtime facts best-effort).
  registerTools({ tools: { register: tool => registered.push(tool) } }, config, {}, undefined, runtime)
  return registered
}

function collect(registered) {
  return registered.map(tool => {
    return {
      name: tool.name,
      chars: modelFacingChars([tool]),
      descriptionChars: String(tool.description ?? '').length,
      parametersChars: JSON.stringify(tool.parameters ?? {}).length,
      outputSchemaChars: JSON.stringify(tool.output?.schema ?? {}).length,
    }
  })
}

function summarize(automationMode, toolSurface) {
  const tools = collect(register(automationMode, toolSurface))
  const totalChars = tools.reduce((sum, tool) => sum + tool.chars, 0)
  return {
    mode: automationMode,
    toolSurface,
    toolCount: tools.length,
    totalChars,
    estimatedTokens: tokens(totalChars),
    descriptionChars: tools.reduce((sum, tool) => sum + tool.descriptionChars, 0),
    parametersChars: tools.reduce((sum, tool) => sum + tool.parametersChars, 0),
    outputSchemaChars: tools.reduce((sum, tool) => sum + tool.outputSchemaChars, 0),
    charsPerToken: CHARS_PER_TOKEN,
    tools: tools.map(tool => ({ ...tool, estimatedTokens: tokens(tool.chars) })).sort((a, b) => b.chars - a.chars || a.name.localeCompare(b.name)),
  }
}

/** What browser_index discloses, measured by calling the registered tool itself. */
async function disclosure(automationMode) {
  const tool = register(automationMode, 'indexed').find(entry => entry.name === 'browser_index')
  const render = async input => (await tool.execute(input, {})).text
  const measure = text => ({ chars: text.length, estimatedTokens: tokens(text.length) })
  const groups = {}
  for (const group of ACTION_GROUPS) groups[group] = measure(await render({ group }))
  const withSkill = register(automationMode, 'indexed', { skillAvailable: () => true }).find(entry => entry.name === 'browser_index')
  return {
    root: measure(await render({})),
    rootWithSkill: measure((await withSkill.execute({}, {})).text),
    groups,
    largestGroup: Object.entries(groups).sort((a, b) => b[1].chars - a[1].chars)[0],
    action: { name: 'act.click', ...measure(await render({ action: 'act.click' })) },
    largestActionDetail: await (async () => {
      // Every action detail, and for an action with sub-actions each sub-action's detail too (browser_index({action:"automation.develop.save"})).
      let best
      const { ACTIONS } = await import(pathToFileURL(path.join(root, 'src/actions/registry.ts')).href)
      for (const action of ACTIONS) {
        const names = [action.name, ...Object.keys(action.subActions?.items ?? {}).map(sub => `${action.name}.${sub}`), ...Object.keys(action.topics ?? {}).map(topic => `${action.name}.${topic}`)]
        for (const name of names) {
          const entry = { name, ...measure(await render({ action: name })) }
          if (!best || entry.chars > best.chars) best = entry
        }
      }
      return best
    })(),
    subActionDetails: await (async () => {
      const { ACTIONS } = await import(pathToFileURL(path.join(root, 'src/actions/registry.ts')).href)
      const details = {}
      for (const action of ACTIONS.filter(entry => entry.subActions)) {
        details[action.name] = measure(await render({ action: action.name }))
        for (const sub of Object.keys(action.subActions.items)) details[`${action.name}.${sub}`] = measure(await render({ action: `${action.name}.${sub}` }))
      }
      // Detail pages of an action (observe.read: one per section), and the action's own page next to them.
      for (const action of ACTIONS.filter(entry => entry.topics)) {
        details[action.name] = measure(await render({ action: action.name }))
        for (const topic of Object.keys(action.topics)) details[`${action.name}.${topic}`] = measure(await render({ action: `${action.name}.${topic}` }))
      }
      return details
    })(),
  }
}

const indexed = summarize(mode, 'indexed')
const flat = summarize(mode, 'flat')
const shown = await disclosure(mode)
const budgetChars = Math.round(INDEXED_L0_BUDGET_TOKENS * CHARS_PER_TOKEN)
const withinBudget = indexed.estimatedTokens <= INDEXED_L0_BUDGET_TOKENS
const disclosureSizes = [shown.root, shown.rootWithSkill, ...Object.values(shown.groups), shown.action, ...Object.values(shown.subActionDetails), shown.largestActionDetail]
const disclosureOver = disclosureSizes.filter(size => size.estimatedTokens > DISCLOSURE_BUDGET_TOKENS)
const disclosureWithin = disclosureOver.length === 0

if (json) {
  console.log(JSON.stringify({ indexed, flat, disclosure: shown, indexedL0Budget: { tokens: INDEXED_L0_BUDGET_TOKENS, chars: budgetChars, met: withinBudget }, disclosureBudget: { tokens: DISCLOSURE_BUDGET_TOKENS, met: disclosureWithin } }, null, 2))
  process.exit(withinBudget && disclosureWithin ? 0 : 1)
}

const pad = (value, width) => String(value).padStart(width)

function printSurface(summary) {
  console.log(`Tool surface = ${summary.toolSurface} (mode=${summary.mode}; name + description + parameters schema, as sent to the model)`)
  console.log(`  tools:           ${summary.toolCount}`)
  console.log(`  total chars:     ${summary.totalChars}`)
  console.log(`  estimated tokens: ${summary.estimatedTokens}  (chars / ${CHARS_PER_TOKEN})`)
  console.log(`  of which description chars: ${summary.descriptionChars}, parameters chars: ${summary.parametersChars}`)
  console.log(`  output schemas (host-side, not sent to the model): ${summary.outputSchemaChars} chars`)
  console.log('')
  console.log(`${'#'.padStart(3)}  ${'tool'.padEnd(30)} ${pad('chars', 7)} ${pad('~tokens', 8)} ${pad('desc', 6)} ${pad('params', 7)}`)
  const rows = summary.toolSurface === 'flat' ? summary.tools.slice(0, 8) : summary.tools
  rows.forEach((tool, index) => {
    console.log(`${pad(index + 1, 3)}  ${tool.name.padEnd(30)} ${pad(tool.chars, 7)} ${pad(tool.estimatedTokens, 8)} ${pad(tool.descriptionChars, 6)} ${pad(tool.parametersChars, 7)}`)
  })
  if (rows.length < summary.tools.length) console.log(`     ... ${summary.tools.length - rows.length} more tools (use --json for the full list)`)
  console.log('')
}

printSurface(indexed)
printSurface(flat)

console.log('Progressive disclosure (indexed; text the model reads only when it asks)')
console.log(`  browser_index()                 ${pad(shown.root.chars, 6)} chars  ~${shown.root.estimatedTokens} tokens  (no skill service: includes the compact guide)`)
console.log(`  browser_index() with the skill  ${pad(shown.rootWithSkill.chars, 6)} chars  ~${shown.rootWithSkill.estimatedTokens} tokens`)
for (const [group, size] of Object.entries(shown.groups)) console.log(`  browser_index({group:"${group}"})`.padEnd(34) + `${pad(size.chars, 6)} chars  ~${size.estimatedTokens} tokens`)
console.log(`  browser_index({action:"${shown.action.name}"})`.padEnd(34) + `${pad(shown.action.chars, 6)} chars  ~${shown.action.estimatedTokens} tokens`)
for (const [name, size] of Object.entries(shown.subActionDetails)) console.log(`  browser_index({action:"${name}"})`.padEnd(44) + `${pad(size.chars, 6)} chars  ~${size.estimatedTokens} tokens`)
console.log(`  largest action detail (${shown.largestActionDetail.name}) ${pad(shown.largestActionDetail.chars, 6)} chars  ~${shown.largestActionDetail.estimatedTokens} tokens`)
console.log('')
console.log('Comparison (always-on L0)')
console.log(`  indexed: ${pad(indexed.estimatedTokens, 5)} tokens in ${indexed.toolCount} tools   (budget ${INDEXED_L0_BUDGET_TOKENS} tokens = ${budgetChars} chars: ${withinBudget ? 'MET' : 'EXCEEDED'})`)
console.log(`  flat:    ${pad(flat.estimatedTokens, 5)} tokens in ${flat.toolCount} tools   (indexed is ${(100 - 100 * indexed.estimatedTokens / flat.estimatedTokens).toFixed(0)}% smaller)`)
console.log(`  every disclosure layer: largest ${shown.largestActionDetail.name} ~${shown.largestActionDetail.estimatedTokens} tokens (budget ${DISCLOSURE_BUDGET_TOKENS}: ${disclosureWithin ? 'MET' : 'EXCEEDED'})`)
console.log('  baseline before the registry (30 browser_* tools, B0 measurement): ~8800 tokens')

if (modeIndex < 0) {
  console.log('')
  console.log('Other automation modes (same measurement):')
  for (const other of ['read-only', 'standard', 'autonomous']) {
    const i = summarize(other, 'indexed')
    const f = summarize(other, 'flat')
    console.log(`  ${other.padEnd(12)} indexed tools=${pad(i.toolCount, 2)} ~tokens=${pad(i.estimatedTokens, 5)} | flat tools=${pad(f.toolCount, 2)} ~tokens=${pad(f.estimatedTokens, 5)}`)
  }
}
if (!withinBudget || !disclosureWithin) process.exit(1)
