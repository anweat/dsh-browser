#!/usr/bin/env node
// Installs the Playwright browser(s) used by the dsh-browser plugin, using the
// playwright CLI from THIS plugin's node_modules (not the global install).
// Usage: node scripts/install-browser.mjs [chromium|msedge|...]  (default chromium)
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const req = createRequire(path.join(root, 'package.json'))
const cli = path.join(path.dirname(req.resolve('playwright/package.json')), 'cli.js')

const channels = process.argv.slice(2)
const targets = channels.length ? channels : ['chromium']
console.log('[dsh-browser] installing playwright browsers:', targets.join(', '))
const r = spawnSync(process.execPath, [cli, 'install', ...targets], { stdio: 'inherit', cwd: root })
process.exit(r.status ?? 1)
