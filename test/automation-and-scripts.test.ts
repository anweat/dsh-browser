import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { validateRecipe, recipeNeedsApproval } from '../src/automation.ts'
import { BUILTIN_SCRIPTS, matchUserscriptPattern, validateUserscript } from '../src/scripts.ts'
import { browserPolicyDecision } from '../src/approval-policy.ts'
import { runNode } from '../src/deps.ts'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { ALL_BROWSER_TOOL_NAMES, browserToolsForMode, resolveAutomationMode } from '../src/freedom.ts'

const VALID_SCRIPT = `// ==UserScript==
// @name Read Heading
// @match http://127.0.0.1/*
// @grant none
// ==/UserScript==
return { heading: document.querySelector('h1')?.textContent || '' }`

test('userscript metadata is scoped, hashed, and capability-reported', () => {
  const validation = validateUserscript(VALID_SCRIPT, 'http://127.0.0.1/page')
  assert.equal(validation.valid, true)
  assert.equal(validation.metadata.name, 'Read Heading')
  assert.match(validation.sha256, /^[a-f\d]{64}$/)
  assert.deepEqual(validation.capabilities, ['dom-read'])
  assert.equal(matchUserscriptPattern('*://*.example.com/*', 'https://sub.example.com/a?q=1'), true)
  assert.equal(matchUserscriptPattern('https://example.com/private/*', 'https://example.com/public/a'), false)
})

test('userscript validation rejects remote requires, grants, and wrong hosts', () => {
  const unsafe = VALID_SCRIPT
    .replace('// @grant none', '// @grant GM_xmlhttpRequest\n// @require https://evil.invalid/a.js')
  assert.match(validateUserscript(unsafe, 'http://127.0.0.1/').errors.join(' '), /@require/)
  assert.match(validateUserscript(unsafe, 'http://127.0.0.1/').errors.join(' '), /@grant/)
  assert.match(validateUserscript(VALID_SCRIPT, 'https://example.com/').errors.join(' '), /outside/)
})

test('built-in scripts are valid, read-only, and have stable ids', () => {
  assert.deepEqual(BUILTIN_SCRIPTS.map(script => script.id), ['article-clean', 'links', 'jsonld', 'forms'])
  for (const script of BUILTIN_SCRIPTS) {
    const validation = validateUserscript(script.source, 'https://example.com/')
    assert.equal(validation.valid, true, script.id + ': ' + validation.errors.join('; '))
    assert.deepEqual(validation.capabilities, ['dom-read'])
  }
})

test('recipes bound steps and distinguish read-only from mutating flows', () => {
  const readonly = [
    { type: 'wait' as const, condition: 'selector' as const, value: 'main' },
    { type: 'wait' as const, condition: 'time' as const, waitMs: 5 },
    { type: 'extract' as const, selector: 'main', mode: 'text' as const },
  ]
  validateRecipe(readonly)
  assert.equal(recipeNeedsApproval(readonly), false)
  assert.equal(recipeNeedsApproval([...readonly, { type: 'click' as const, selector: 'button' }]), true)
  assert.throws(() => validateRecipe([{ type: 'scroll', deltaY: 999_999 }]), /deltaY/)
  assert.throws(() => validateRecipe(Array.from({ length: 26 }, () => ({ type: 'screenshot' as const }))), /25/)
})

test('approval policy asks for arbitrary userscripts, OpenCLI, and mutating recipes', () => {
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['reddit', 'search', 'dsh'] }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'extract', selector: 'main' }] }).kind, 'allow')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }).kind, 'ask')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: 'alert(1)', url: 'https://example.com/' }).kind, 'deny')
})

test('automation modes expose predictable tool sets and retain validation when approval is disabled', () => {
  assert.equal(ALL_BROWSER_TOOL_NAMES.length, 16)
  assert.equal(browserToolsForMode('read-only').length, 10)
  assert.equal(browserToolsForMode('standard').length, 16)
  assert.equal(browserToolsForMode('autonomous').length, 16)
  assert.equal(browserToolsForMode('unrestricted').length, 16)
  assert.equal(browserToolsForMode('read-only').includes('browser_userscript_run'), false)
  assert.equal(browserToolsForMode('read-only').includes('browser_recipe_run'), true)

  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'standard').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_click', { selector: 'button' }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }, 'read-only').kind, 'deny')
  assert.equal(browserPolicyDecision('browser_recipe_run', { steps: [{ type: 'fill', selector: '#q', value: 'dsh' }] }, 'autonomous').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['browser', 'research', 'state'] }, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_install', {}, 'autonomous').kind, 'ask')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: VALID_SCRIPT, url: 'http://127.0.0.1/' }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_opencli_run', { args: ['browser', 'research', 'state'] }, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_install', {}, 'unrestricted').kind, 'allow')
  assert.equal(browserPolicyDecision('browser_userscript_run', { source: 'alert(1)', url: 'https://example.com/' }, 'unrestricted').kind, 'deny')
  assert.throws(() => resolveAutomationMode('anything-goes'), /automationMode/)
})

test('runNode passes argv containing spaces verbatim without shell quoting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-argv-'))
  const script = path.join(dir, 'argv.mjs')
  fs.writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))', 'utf8')
  try {
    const result = await runNode(script, ['hello world', 'a"b'], { signal: undefined, timeoutMs: 5_000 })
    assert.equal(result.code, 0)
    assert.deepEqual(JSON.parse(result.stdout), ['hello world', 'a"b'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('real Playwright runtime executes built-ins, recipes, and a scoped userscript', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Fixture</title><main><h1>Hello DSH</h1><p id="copy">Browser automation fixture.</p><a href="/next">Next</a></main>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a TCP port')
  const url = `http://127.0.0.1:${address.port}/page`
  const service = new BrowserService(resolveConfig({
    enabled: true,
    channel: 'chromium',
    headless: true,
    opencliEnabled: true,
    autoInstall: false,
    verbose: false,
  }))
  try {
    const builtIn = await service.runBuiltinScript(url, 'article-clean')
    assert.match(builtIn.resultJson, /Hello DSH/)

    const recipe = await service.recipe([
      { type: 'wait', condition: 'selector', value: '#copy' },
      { type: 'extract', selector: '#copy', mode: 'text' },
    ], { url })
    assert.equal(recipe.steps[1]?.value, 'Browser automation fixture.')

    const external = await service.runUserscript(url, VALID_SCRIPT)
    assert.equal(JSON.parse(external.resultJson).heading, 'Hello DSH')

    const status = await service.status()
    assert.equal(status.automationMode, 'standard')
    assert.equal(status.exposedTools.length, 16)
    assert.equal(status.directInteractionPolicy, 'ask')
  } finally {
    await service.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
