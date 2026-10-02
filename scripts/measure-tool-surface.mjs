#!/usr/bin/env node
// Measures the model-facing tool surface: every tool the plugin registers,
// serialized as { name, description, parameters } (what the host sends to the
// model; output schemas and renderers stay host-side and are reported
// separately for information only). Prints the tool count, total characters,
// an estimated token count (chars / 3.5) and a per-tool ranking.
//
// Usage: node scripts/measure-tool-surface.mjs [--mode <read-only|standard|autonomous|unrestricted>] [--json]
//   --mode  automation mode to register under. Default `unrestricted`, which
//           exposes every tool (the full surface); omit nothing else.
//   --json  machine-readable output (for budgets in later milestones).
//
// It measures the TypeScript sources, not lib/, so it never reports a stale
// build. It needs no browser and does not launch one.
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const CHARS_PER_TOKEN = 3.5
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

function collect(automationMode) {
  const registered = []
  const config = resolveConfig({ enabled: true, automationMode })
  registerTools({ tools: { register: tool => registered.push(tool) } }, config, {})
  return registered.map(tool => {
    const modelFacing = { name: tool.name, description: tool.description, parameters: tool.parameters }
    const serialized = JSON.stringify(modelFacing)
    return {
      name: tool.name,
      chars: serialized.length,
      descriptionChars: String(tool.description ?? '').length,
      parametersChars: JSON.stringify(tool.parameters ?? {}).length,
      outputSchemaChars: JSON.stringify(tool.output?.schema ?? {}).length,
    }
  })
}

function summarize(automationMode) {
  const tools = collect(automationMode)
  const totalChars = tools.reduce((sum, tool) => sum + tool.chars, 0)
  return {
    mode: automationMode,
    toolCount: tools.length,
    totalChars,
    estimatedTokens: Math.round(totalChars / CHARS_PER_TOKEN),
    descriptionChars: tools.reduce((sum, tool) => sum + tool.descriptionChars, 0),
    parametersChars: tools.reduce((sum, tool) => sum + tool.parametersChars, 0),
    outputSchemaChars: tools.reduce((sum, tool) => sum + tool.outputSchemaChars, 0),
    charsPerToken: CHARS_PER_TOKEN,
    tools: tools.map(tool => ({ ...tool, estimatedTokens: Math.round(tool.chars / CHARS_PER_TOKEN) })).sort((a, b) => b.chars - a.chars || a.name.localeCompare(b.name)),
  }
}

const primary = summarize(mode)

if (json) {
  console.log(JSON.stringify(primary, null, 2))
  process.exit(0)
}

const pad = (value, width) => String(value).padStart(width)
console.log(`Tool surface (mode=${primary.mode}; name + description + parameters schema, as sent to the model)`)
console.log(`  tools:           ${primary.toolCount}`)
console.log(`  total chars:     ${primary.totalChars}`)
console.log(`  estimated tokens: ${primary.estimatedTokens}  (chars / ${CHARS_PER_TOKEN})`)
console.log(`  of which description chars: ${primary.descriptionChars}, parameters chars: ${primary.parametersChars}`)
console.log(`  output schemas (host-side, not sent to the model): ${primary.outputSchemaChars} chars`)
console.log('')
console.log(`${'#'.padStart(3)}  ${'tool'.padEnd(30)} ${pad('chars', 7)} ${pad('~tokens', 8)} ${pad('desc', 6)} ${pad('params', 7)}`)
primary.tools.forEach((tool, index) => {
  console.log(`${pad(index + 1, 3)}  ${tool.name.padEnd(30)} ${pad(tool.chars, 7)} ${pad(tool.estimatedTokens, 8)} ${pad(tool.descriptionChars, 6)} ${pad(tool.parametersChars, 7)}`)
})

if (modeIndex < 0) {
  console.log('')
  console.log('Other automation modes (same measurement):')
  for (const other of ['read-only', 'standard', 'autonomous']) {
    const summary = summarize(other)
    console.log(`  ${other.padEnd(12)} tools=${pad(summary.toolCount, 2)} chars=${pad(summary.totalChars, 6)} ~tokens=${pad(summary.estimatedTokens, 5)}`)
  }
}
