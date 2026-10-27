// Preloaded into every test process (`node --import ./test/isolate-home.mjs --test ...`, see package.json).
// The plugin keeps screenshots, downloads, the policy overlay and auth state under $DSH_HOME/data/browser when a test
// does not give its own directory, so the suite must never run against the real home of the person running it: point it
// at a throw-away one and remove it on exit. BROWSER_TEST_KEEP_HOME=1 keeps the caller's DSH_HOME (for manual runs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

if (!process.env.BROWSER_TEST_KEEP_HOME) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-test-home-'))
  process.env.DSH_HOME = home
  process.on('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* best effort */ } })
}
