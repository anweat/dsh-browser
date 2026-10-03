#!/usr/bin/env node
// Prints every overridable model-facing text with its built-in default, as JSON in the exact
// structure of the `prompts` configuration:
//
//   { tools, rootGuide, rootNote, groups, actions, errorHints, skill }
//
// Copy the output, delete what you want to keep as is, reword the rest, and put it under
// `prompts:` in your profile config (see README "Custom prompt text"). Pasted back unchanged it
// changes nothing: blank `notes`, `rootNote`, `skill.bodyFile` and `skill.append` mean "none".
//
// Usage: node scripts/dump-prompts.mjs [--compact]
//   --compact  single-line JSON (default is 2-space indented)
//
// It reads the TypeScript sources, so it never reports a stale build, and it needs no browser.
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

// The sources use parameter properties, which need type *transformation*.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}

const { defaultPrompts } = await import(pathToFileURL(path.join(root, 'src/prompts.ts')).href)
console.log(JSON.stringify(defaultPrompts(), null, process.argv.includes('--compact') ? 0 : 2))
