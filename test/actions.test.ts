import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, CALL_TOOL, INDEX_TOOL, actionsInGroup, findAction, findActionByFlatTool, flatToolName } from '../src/actions/registry.ts'
import { ACTION_GROUPS } from '../src/actions/types.ts'
import { compactSchema, expandParams, validateArgs } from '../src/actions/schema.ts'
import { mapError } from '../src/actions/errors.ts'
import { runAction, truncateResult, type RunEnvironment } from '../src/actions/run.ts'
import { resolveBrowserCall } from '../src/actions/surface.ts'
import { COMPACT_GUIDE, renderIndex, type IndexEnvironment } from '../src/actions/index-view.ts'
import { browserPolicyDecision } from '../src/approval-policy.ts'
import { resolveConfig } from '../src/config.ts'
import { configuredBrowserTools } from '../src/freedom.ts'
import { registerTools } from '../src/tools.ts'

/** The 30 tools this plugin used to register, and the action each one became. */
const LEGACY_TOOL_TO_ACTION: Record<string, string> = {
  browser_status: 'runtime.status', browser_install: 'runtime.install',
  browser_open: 'target.open', browser_close: 'target.close',
  browser_read: 'observe.read', browser_screenshot: 'observe.screenshot',
  browser_click: 'act.click', browser_type: 'act.fill', browser_press: 'act.press', browser_select: 'act.select',
  browser_check: 'act.check', browser_hover: 'act.hover', browser_scroll: 'act.scroll', browser_set_files: 'act.upload', browser_wait: 'act.wait',
  browser_console: 'inspect.console', browser_requests: 'inspect.requests',
  browser_evaluate: 'script.evaluate', browser_script_catalog: 'script.catalog', browser_script_validate: 'script.validate',
  browser_script_run_builtin: 'script.run_builtin', browser_userscript_run: 'script.run_userscript',
  browser_automation_search: 'automation.search', browser_automation_develop: 'automation.develop', browser_automation_run: 'automation.run', browser_recipe_run: 'automation.run_recipe',
  browser_crawl: 'crawl.crawl',
  browser_opencli_status: 'opencli.status', browser_opencli_catalog: 'opencli.catalog', browser_opencli_run: 'opencli.run',
}

const ENV: RunEnvironment = { mode: 'unrestricted', options: { modelDevelopmentEnabled: true }, enabled: true }
const READ_ONLY: RunEnvironment = { mode: 'read-only', options: { modelDevelopmentEnabled: true }, enabled: true }

function ctxWith(service: Record<string, unknown>, signal = new AbortController().signal) {
  return { service: service as never, config: resolveConfig({}), session: 'session:test', sessionId: 'test', agent: undefined, signal }
}

test('every former tool maps onto a registered action, and no legacy tool name is registered', () => {
  assert.equal(Object.keys(LEGACY_TOOL_TO_ACTION).length, 30)
  for (const [tool, action] of Object.entries(LEGACY_TOOL_TO_ACTION)) {
    assert.ok(findAction(action), `${tool} -> ${action} is missing from the registry`)
  }
  assert.equal(new Set(Object.values(LEGACY_TOOL_TO_ACTION)).size, 30)
  const names = (toolSurface: 'indexed' | 'flat') => {
    const registered: string[] = []
    registerTools({ tools: { register: (tool: any) => registered.push(tool.name) } } as never, resolveConfig({ automationMode: 'unrestricted', toolSurface }), {} as never)
    return registered
  }
  // Indexed: only the two entry tools, so not one old name survives.
  assert.deepEqual(names('indexed'), ['browser_index', 'browser_call'])
  // Flat: `browser_<group>_<action>` happens to coincide with a few old names, but each of those is now the
  // registry's action (envelope result, server-side validation), never a wrapper around the old tool.
  const coincide = names('flat').filter(name => name in LEGACY_TOOL_TO_ACTION)
  for (const name of coincide) assert.equal(flatToolName(findAction(LEGACY_TOOL_TO_ACTION[name]!)!), name)
  assert.ok(!names('flat').includes('browser_open') && !names('flat').includes('browser_click') && !names('flat').includes('browser_status'))
})

test('the registry is well formed: unique names, known groups, valid examples', () => {
  const names = ACTIONS.map(action => action.name)
  assert.equal(new Set(names).size, names.length)
  for (const action of ACTIONS) {
    const [group, verb] = action.name.split('.')
    assert.match(action.name, /^[a-z]+\.[a-z_]+$/)
    assert.equal(action.group, group, action.name)
    assert.ok(verb && action.summary.length > 10 && !action.summary.includes('\n'), `${action.name} needs a one-line summary`)
    assert.ok(action.timeoutMs >= 1000, action.name)
    for (const example of action.examples ?? []) {
      const checked = validateArgs(action.params, example.args)
      assert.deepEqual(checked.errors, [], `${action.name} example must validate`)
    }
  }
  for (const group of ACTION_GROUPS) assert.ok(actionsInGroup(group).length > 0, group)
  const flat = ACTIONS.map(flatToolName)
  assert.equal(new Set(flat).size, flat.length)
  assert.equal(findActionByFlatTool('browser_act_click')?.name, 'act.click')
  assert.equal(findActionByFlatTool('browser_crawl')?.name, 'crawl.crawl')
})

test('LOCATOR_SCHEMA is defined once and expanded only for the flat projection', () => {
  const click = findAction('act.click')!
  assert.deepEqual(click.params.locator, { ref: 'locator' })
  const expanded = expandParams(click.params)
  assert.equal(expanded.locator?.type, 'object')
  assert.equal(expanded.locator?.properties?.frame?.type, 'object', 'nested frame ref expands too')
  assert.ok(!JSON.stringify(expanded).includes('"ref"'))
  // The same shared node serves every element-targeting action.
  const refs = ACTIONS.filter(action => action.params.locator).map(action => JSON.stringify(action.params.locator))
  assert.ok(refs.length >= 8 && new Set(refs).size === 1)
})

test('argument validation rejects unknown keys, wrong types, bad enums, and missing required values', () => {
  const click = findAction('act.click')!
  assert.deepEqual(validateArgs(click.params, { selector: '#a' }).errors, [])
  assert.deepEqual(validateArgs(click.params, { locator: { role: 'button', name: 'Go', frame: { selector: 'iframe' } } }).errors, [])
  assert.match(validateArgs(click.params, { seletor: '#a' }).errors.join(), /seletor: unknown argument/)
  assert.match(validateArgs(click.params, { selector: 3 }).errors.join(), /selector: expected string/)
  assert.match(validateArgs(click.params, { locator: { role: 'button', bogus: 1 } }).errors.join(), /locator\.bogus: unknown argument/)
  assert.match(validateArgs(click.params, 'oops').errors.join(), /expected object/)
  const wait = findAction('act.wait')!
  assert.match(validateArgs(wait.params, { selector: '#a', state: 'gone' }).errors.join(), /state: must be one of/)
  const fill = findAction('act.fill')!
  assert.match(validateArgs(fill.params, { selector: '#a' }).errors.join(), /text: required/)
  // null for an omitted optional value is tolerated.
  assert.deepEqual(validateArgs(click.params, { selector: '#a', locator: null }).errors, [])
  const develop = findAction('automation.develop')!
  assert.deepEqual(validateArgs(develop.params, { action: 'save', kind: 'recipe', name: 'n', recipe: [{ type: 'click', selector: 'a' }] }).errors, [])
  assert.match(validateArgs(develop.params, { action: 'save', recipe: [{ type: 'dance' }] }).errors.join(), /recipe\[0\]\.type: must be one of/)
})

test('browser_call replies with an envelope and runs the action through the registry', async () => {
  const calls: unknown[] = []
  const service = { read: async (opts: unknown) => { calls.push(opts); return { url: 'http://x/', title: 'T', text: 'hello', screenshotPath: undefined } } }
  const reply = await runAction('observe.read', {}, ctxWith(service), ENV)
  assert.deepEqual(reply, { ok: true, action: 'observe.read', executionStatus: 'completed', result: { url: 'http://x/', title: 'T', text: 'hello' } })
  assert.deepEqual(calls, [{ session: 'session:test' }])
  const listing = await runAction('script.catalog', {}, ctxWith({ scriptCatalog: () => [{ id: 'links' }] }), ENV)
  assert.deepEqual(listing.result, { items: [{ id: 'links' }] }, 'array results are wrapped, not dropped')
})

test('INVALID_ARGS carries a compact schema so the model can correct itself', async () => {
  const reply = await runAction('act.fill', { locator: { label: 'Q' } }, ctxWith({}), ENV)
  assert.equal(reply.ok, false)
  assert.equal(reply.executionStatus, 'failed')
  assert.equal(reply.error?.code, 'INVALID_ARGS')
  assert.match(reply.error!.message, /text: required/)
  assert.match(reply.error!.schema!, /^act\.fill\(selector\?: string, locator\?: \$locator, text: string, timeoutMs\?: number\)/)
  assert.match(reply.error!.schema!, /\$locator = \{selector\?: string, role\?: string/)
  assert.ok(compactSchema('act.fill', findAction('act.fill')!.params).length < 600)
  // A cross-field rule the schema cannot state is still INVALID_ARGS.
  const both = await runAction('act.click', { selector: '#a', locator: { text: 'x' } }, ctxWith({}), ENV)
  assert.equal(both.error?.code, 'INVALID_ARGS')
  assert.match(both.error!.message, /exactly one of selector or locator/)
})

test('unknown and unavailable actions are refused with structured errors', async () => {
  const unknown = await runAction('browser_click', {}, ctxWith({}), ENV)
  assert.equal(unknown.error?.code, 'UNKNOWN_ACTION')
  assert.match(unknown.error!.hint!, /browser_index/)
  const guess = await runAction('act.clik', {}, ctxWith({}), ENV)
  assert.equal(guess.error?.code, 'UNKNOWN_ACTION')
  // browser_call refuses again, independently of the Host approval hook.
  const denied = await runAction('act.click', { selector: '#a' }, ctxWith({ click: async () => { throw new Error('must not run') } }), READ_ONLY)
  assert.equal(denied.error?.code, 'POLICY_DENIED')
  assert.match(denied.error!.message, /automationMode=read-only/)
  const noDev = await runAction('automation.develop', { action: 'get', id: 'x' }, ctxWith({}), { ...ENV, options: { modelDevelopmentEnabled: false } })
  assert.equal(noDev.error?.code, 'POLICY_DENIED')
  const disabled = await runAction('observe.read', {}, ctxWith({}), { ...ENV, enabled: false })
  assert.equal(disabled.error?.code, 'POLICY_DENIED')
})

test('Playwright and service errors map to contract codes and keep the original message', () => {
  const cases: [string, string, string, string?][] = [
    ['locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator(\'#nope\')', 'act.click', 'LOCATOR_NOT_FOUND'],
    ['locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole(\'button\')\n  - locator resolved to <button>\n  - element is not enabled', 'act.click', 'NOT_ACTIONABLE'],
    ['locator.click: Timeout 30000ms exceeded.\nCall log:\n  - locator resolved to <div>\n  - <div class="overlay"> intercepts pointer events', 'act.click', 'NOT_ACTIONABLE'],
    ['locator.waitFor: Timeout 15000ms exceeded.\n  - waiting for locator(\'#late\')', 'act.wait', 'DEADLINE'],
    ['locator.click: Error: strict mode violation: getByRole(\'button\') resolved to 2 elements', 'act.click', 'LOCATOR_AMBIGUOUS'],
    ['page.evaluate: Target page, context or browser has been closed', 'script.evaluate', 'TARGET_CLOSED'],
    ['script.evaluate timed out after 1000ms; page JavaScript was terminated', 'script.evaluate', 'DEADLINE'],
    ['browser recipe requires url or an active target.open page', 'automation.run_recipe', 'TARGET_CLOSED'],
    ['dsh-browser: chromium is not installed for playwright. Run the runtime.install action', 'target.open', 'CAPABILITY_UNAVAILABLE'],
    ['dsh-browser: browser service is disabled', 'target.open', 'CAPABILITY_UNAVAILABLE'],
    ['act.upload requires absolute file paths: a.txt', 'act.upload', 'INVALID_ARGS'],
    ['act.wait requires exactly one target, urlPattern, networkIdle=true, or timeMs', 'act.wait', 'INVALID_ARGS'],
    ['automation asset a1 is not allowed on evil.com', 'automation.run', 'POLICY_DENIED'],
    ['active automation asset not found', 'automation.run', 'NOT_FOUND'],
    ['net::ERR_NAME_NOT_RESOLVED at http://x.invalid/', 'target.open', 'ACTION_FAILED'],
  ]
  for (const [message, action, code] of cases) {
    const body = mapError(new Error(message), action)
    assert.equal(body.code, code, message)
    assert.equal(body.message, message, 'the original message is preserved')
  }
  const aborted = new AbortController(); aborted.abort()
  assert.equal(mapError(new Error('whatever'), 'act.click', { signal: aborted.signal }).code, 'CANCELLED')
  const timeout = Object.assign(new Error('x'), { name: 'TimeoutError' })
  assert.equal(mapError(timeout, 'act.click').code, 'DEADLINE')
})

test('a cancelled call reports cancelled, and a missed deadline on a mutating action is outcome_unknown', async () => {
  const controller = new AbortController()
  controller.abort()
  const cancelled = await runAction('observe.read', {}, ctxWith({ read: async () => ({}) }, controller.signal), ENV)
  assert.equal(cancelled.executionStatus, 'cancelled')
  assert.equal(cancelled.error?.code, 'CANCELLED')

  const click = findAction('act.click')!
  const read = findAction('observe.read')!
  const originalClick = click.timeoutMs
  const originalRead = read.timeoutMs
  click.timeoutMs = 30
  read.timeoutMs = 30
  try {
    const stuck = new Promise(() => {})
    const mutating = await runAction('act.click', { selector: '#go' }, ctxWith({ click: () => stuck }), ENV)
    assert.equal(mutating.executionStatus, 'outcome_unknown')
    assert.equal(mutating.error?.code, 'DEADLINE')
    assert.match(mutating.error!.hint!, /verify|Outcome unknown/i)
    const reading = await runAction('observe.read', {}, ctxWith({ read: () => stuck }), ENV)
    assert.equal(reading.executionStatus, 'failed')
    assert.equal(reading.error?.code, 'DEADLINE')
  } finally {
    click.timeoutMs = originalClick
    read.timeoutMs = originalRead
  }
})

test('oversized results are shortened but stay valid JSON, with the truncation reported', async () => {
  const big = 'x'.repeat(250_000)
  const reply = await runAction('observe.read', {}, ctxWith({ read: async () => ({ url: 'http://x/', title: 'T', text: big }) }), ENV)
  assert.equal(reply.ok, true)
  assert.ok(JSON.stringify(reply).length < 110_000)
  assert.ok(reply.truncation && reply.truncation.omitted > 100_000)
  assert.equal((reply.result as { url: string }).url, 'http://x/')
  JSON.parse(JSON.stringify(reply))
  const small = truncateResult({ text: 'ok' })
  assert.equal(small.truncation, undefined)
})

test('approval reasons name the action and its key arguments', () => {
  const reason = (name: string, args: unknown, mode: any = 'standard') => {
    const decision = browserPolicyDecision(name, args, mode)
    assert.equal(decision.kind, 'ask', name)
    return (decision as { reason: string }).reason
  }
  assert.match(reason('act.click', { locator: { role: 'button', name: 'Submit' } }), /act\.click role="button" name="Submit"/)
  assert.match(reason('act.click', { selector: '#submit' }), /act\.click #submit/)
  assert.match(reason('act.fill', { selector: '#q', text: 'secret' }), /act\.fill #q \(6 chars\)/)
  assert.doesNotMatch(reason('act.fill', { selector: '#q', text: 'secret' }), /secret/, 'typed text never appears in the prompt')
  assert.match(reason('act.press', { key: 'Enter' }), /act\.press \(page\) \(key Enter\)/)
  assert.match(reason('act.upload', { selector: 'input', files: ['/a/b.txt'] }), /act\.upload input.*\/a\/b\.txt/)
  assert.match(reason('script.evaluate', { expression: 'document.title' }), /script\.evaluate `document\.title`/)
  assert.match(reason('opencli.run', { args: ['reddit', 'search', 'dsh'] }), /opencli\.run.*reddit search dsh/)
  assert.match(reason('runtime.install', {}), /runtime\.install/)
  assert.match(reason('automation.develop', { action: 'save' }), /automation\.develop save/)
  assert.match(reason('automation.run', { id: 'asset-1' }), /automation\.run asset-1/)
  assert.match(reason('automation.run_recipe', { steps: [{ type: 'click', selector: 'a' }] }), /automation\.run_recipe.*click/)
})

test('legacy and unknown browser names are denied by the policy; web tools keep their rules', () => {
  for (const legacy of Object.keys(LEGACY_TOOL_TO_ACTION)) assert.equal(browserPolicyDecision(legacy, {}, 'unrestricted').kind, 'deny', legacy)
  assert.equal(browserPolicyDecision('act.dance', {}, 'unrestricted').kind, 'deny')
  assert.equal(browserPolicyDecision('web_search', {}, 'read-only').kind, 'allow')
})

test('the Host hook sees the action behind browser_call and flat tools', () => {
  assert.deepEqual(resolveBrowserCall(INDEX_TOOL, { group: 'act' }), { kind: 'index' })
  assert.deepEqual(resolveBrowserCall(CALL_TOOL, { action: 'act.click', args: { selector: '#a' } }), { kind: 'action', action: 'act.click', args: { selector: '#a' } })
  assert.deepEqual(resolveBrowserCall(CALL_TOOL, { action: 'act.click' }), { kind: 'action', action: 'act.click', args: {} })
  assert.deepEqual(resolveBrowserCall(CALL_TOOL, { action: 'nope.nope' }), { kind: 'unresolved' })
  assert.deepEqual(resolveBrowserCall(CALL_TOOL, undefined), { kind: 'unresolved' })
  assert.deepEqual(resolveBrowserCall('browser_act_click', { selector: '#a' }), { kind: 'action', action: 'act.click', args: { selector: '#a' } })
  assert.equal(resolveBrowserCall('web_search', {}), undefined)
  // A browser_call for a guarded action reaches the same rules as the action itself.
  const resolved = resolveBrowserCall(CALL_TOOL, { action: 'act.upload', args: { selector: 'input', files: [] } })
  assert.equal(resolved?.kind, 'action')
  if (resolved?.kind === 'action') assert.equal(browserPolicyDecision(resolved.action, resolved.args, 'standard').kind, 'deny')
})

const INDEX_ENV: IndexEnvironment = { mode: 'standard', options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: false }

test('browser_index root, group, action, and query views stay small and mode-aware', () => {
  const root = renderIndex({}, INDEX_ENV)
  assert.equal(root.level, 'root')
  for (const group of ACTION_GROUPS) assert.match(root.text, new RegExp(`\\n  ${group} \\(\\d+\\)`))
  assert.match(root.text, /automation\.search/)
  assert.match(root.text, /automation\.run/)
  assert.ok(root.text.length < 2_400, `root is ${root.text.length} chars`)

  const group = renderIndex({ group: 'act' }, INDEX_ENV)
  assert.equal(group.level, 'group')
  assert.ok(group.text.length < 4_000, `group is ${group.text.length} chars`)
  for (const action of actionsInGroup('act')) assert.ok(group.text.includes(action.name + ' - '), action.name)
  assert.match(group.text, /act\.click - .*\| asks/)

  const detail = renderIndex({ action: 'act.click' }, INDEX_ENV)
  assert.equal(detail.level, 'action')
  assert.match(detail.text, /\$locator - Element locator/)
  assert.equal(detail.text.split('\n$locator').length - 1, 1, 'the shared locator schema appears once')
  assert.match(detail.text, /example: browser_call\(\{"action":"act\.click"/)

  const search = renderIndex({ query: 'upload file' }, INDEX_ENV)
  assert.equal(search.level, 'search')
  assert.match(search.text, /act\.upload/)
  assert.ok(search.text.split('\n').length <= 9)
  assert.match(renderIndex({ query: 'zzzzqqq' }, INDEX_ENV).text, /No usable action/)
  assert.match(renderIndex({ group: 'nope' }, INDEX_ENV).text, /Unknown group "nope"/)
  assert.match(renderIndex({ action: 'act.clik' }, INDEX_ENV).text, /Unknown action "act\.clik"/)
})

test('browser_index lists only what the current mode allows and collapses the rest', () => {
  const readOnly: IndexEnvironment = { ...INDEX_ENV, mode: 'read-only' }
  const group = renderIndex({ group: 'act' }, readOnly).text
  assert.match(group, /act\.wait - /)
  assert.doesNotMatch(group, /\nact\.click - /)
  assert.match(group, /Unavailable \(disabled by automationMode=read-only\): act\.click/)
  const root = renderIndex({}, readOnly).text
  assert.match(root, /Unavailable/)
  assert.match(root, /read-only: /)
  const noDev = renderIndex({ group: 'automation' }, { ...INDEX_ENV, options: { modelDevelopmentEnabled: false } }).text
  assert.doesNotMatch(noDev, /\nautomation\.develop - /)
  assert.match(noDev, /modelDevelopmentEnabled=false/)
  assert.match(renderIndex({}, { ...INDEX_ENV, runtime: { chromiumInstalled: false } }).text, /Chromium is NOT installed.*runtime\.install/)
})

test('without a skill the root carries a compact guide; with one it points at the skill', () => {
  const without = renderIndex({}, INDEX_ENV).text
  assert.ok(without.includes(COMPACT_GUIDE))
  assert.ok(COMPACT_GUIDE.length <= 1_050, `guide is ${COMPACT_GUIDE.length} chars (~300 tokens max)`)
  const withSkill = renderIndex({}, { ...INDEX_ENV, skillAvailable: true }).text
  assert.ok(!withSkill.includes(COMPACT_GUIDE))
  assert.match(withSkill, /skill "dsh-browser"/)
})

test('indexed registers two tools; flat registers one per usable action; both share one dispatch', async () => {
  const collect = (config: Record<string, unknown>) => {
    const tools = new Map<string, any>()
    registerTools({ tools: { register: (tool: any) => tools.set(tool.name, tool) } } as never, resolveConfig(config as never), {} as never)
    return tools
  }
  assert.deepEqual([...collect({ automationMode: 'unrestricted' }).keys()], ['browser_index', 'browser_call'])
  assert.deepEqual([...collect({ enabled: false }).keys()], [])
  const flatAll = collect({ automationMode: 'unrestricted', toolSurface: 'flat' })
  assert.equal(flatAll.size, 31)
  assert.equal(collect({ automationMode: 'read-only', toolSurface: 'flat' }).size, 18)
  assert.equal(collect({ automationMode: 'standard', toolSurface: 'flat', automationAssets: { modelDevelopmentEnabled: false } }).size, 30)
  assert.deepEqual([...flatAll.keys()].sort(), configuredBrowserTools('unrestricted', { modelDevelopmentEnabled: true }, true, 'flat').sort())
  const flatClick = flatAll.get('browser_act_click')
  assert.equal(flatClick.parameters.properties.locator.properties.role.type, 'string', 'flat tools carry the expanded locator schema')

  const stub = { read: async () => ({ url: 'u', title: 't', text: 'x' }) }
  const tools = new Map<string, any>()
  registerTools({ tools: { register: (tool: any) => tools.set(tool.name, tool) } } as never, resolveConfig({ automationMode: 'unrestricted' }), stub as never)
  const viaCall = await tools.get('browser_call').execute({ action: 'observe.read' }, { signal: new AbortController().signal })
  const flatTools = new Map<string, any>()
  registerTools({ tools: { register: (tool: any) => flatTools.set(tool.name, tool) } } as never, resolveConfig({ automationMode: 'unrestricted', toolSurface: 'flat' }), stub as never)
  const viaFlat = await flatTools.get('browser_observe_read').execute({}, { signal: new AbortController().signal })
  assert.deepEqual(viaFlat, viaCall)
  const index = await tools.get('browser_index').execute({ group: 'observe' }, {})
  assert.match(index.text, /observe\.read/)
})

test('toolSurface defaults to indexed and rejects unknown values', () => {
  assert.equal(resolveConfig({}).toolSurface, 'indexed')
  assert.equal(resolveConfig({ toolSurface: 'flat' } as never).toolSurface, 'flat')
  assert.throws(() => resolveConfig({ toolSurface: 'deferred' } as never), /toolSurface must be one of/)
})

test('the indexed always-on surface stays inside the 1.5k-token budget and every disclosure layer inside 1k', async () => {
  const modelFacing = (toolSurface: 'indexed' | 'flat', automationMode = 'unrestricted') => {
    const tools: any[] = []
    registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, resolveConfig({ automationMode, toolSurface } as never), {} as never)
    return tools
  }
  const size = (tools: any[]) => tools.reduce((sum, tool) => sum + JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length, 0)
  const indexed = modelFacing('indexed')
  assert.ok(size(indexed) <= 5_250, `indexed L0 is ${size(indexed)} chars (budget 5250 = 1.5k tokens)`)
  assert.ok(size(modelFacing('flat')) > size(indexed) * 10, 'the flat surface carries every action up front')
  const index = indexed.find(tool => tool.name === 'browser_index')
  for (const input of [{}, ...ACTION_GROUPS.map(group => ({ group })), ...ACTIONS.map(action => ({ action: action.name }))]) {
    const text = (await index.execute(input, {})).text as string
    assert.ok(text.length <= 3_500, `${JSON.stringify(input)} is ${text.length} chars (budget 1k tokens)`)
  }
})
