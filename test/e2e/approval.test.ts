/**
 * Real-browser test of the approval order in `standard` mode, through the real plugin and its real Host hook:
 * a call with invalid arguments is not asked about and returns INVALID_ARGS without touching the page (proved from
 * the page state and the server side), and the corrected call is the one that is asked and runs.
 * Skipped with a printed reason when no browser exists; nothing is downloaded.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import plugin from '../../src/index.ts'
import { detectBrowser, startFixtureServer } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:approval] SKIPPED: ${detection.reason}`)

describe('dsh-browser approval order in a real browser (standard mode)', { skip: detection.ok ? false : detection.reason }, () => {
  let root: Context
  let fiber: { dispose: () => void }
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  let dir: string
  const tools = new Map<string, any>()
  /** What the Host would have shown the user: one entry per `ask` decision. */
  const asked: string[] = []
  const S = 'e2e-approval'

  /** One model tool call as the Host runs it: the `tools/pre-execute` hook first, an approval for `ask` (granted here), then the tool. */
  async function hostCall(name: string, args: Record<string, unknown>): Promise<{ decision: string; envelope?: any }> {
    const exec = { name, arguments: args, agent: { id: S, session: { id: S } }, signal: new AbortController().signal }
    const gate = await (root as any).serial('tools/pre-execute', exec, async () => ({ kind: 'allow' })) as { kind: string; reason?: string }
    if (gate.kind === 'deny') return { decision: 'deny' }
    if (gate.kind === 'ask') asked.push(gate.reason!)
    return { decision: gate.kind, envelope: await tools.get(name).execute(args, exec) }
  }
  const action = (name: string, args: Record<string, unknown> = {}) => hostCall('browser_call', { action: name, args })
  const chosen = async (): Promise<string> => /Chosen: \w+/.exec((await action('observe.read')).envelope.result.text)![0]
  const hits = async (): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 150))
    return server.hits()['slot-change'] ?? 0
  }

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-e2e-approval-'))
    root = new Context()
    root.provide('tools', { register(tool: any) { tools.set(tool.name, tool); return () => {} } })
    fiber = root.plugin(plugin as never, {
      enabled: true, headless: true, verbose: false, autoInstall: false, automationMode: 'standard', snapshotDir: dir,
      ...detection.channel ? { channel: detection.channel } : {},
      ...detection.executablePath ? { executablePath: detection.executablePath } : {},
      automationAssets: { directory: path.join(dir, 'automations'), persistenceMode: 'manual' },
    } as never) as never
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(tools.has('browser_call'), 'the plugin registered its tools')
  })

  after(async () => {
    try { await (root as any).browser?.close() } catch { /* best effort */ }
    fiber?.dispose()
    await server?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('wrong arguments get INVALID_ARGS with no approval and no page change; the corrected call is asked once and runs', async () => {
    const opened = await action('target.open', { url: `${server.base}/approval-select.html` })
    assert.equal(opened.envelope.ok, true)
    assert.equal(asked.length, 0, 'opening a page needs no approval')
    assert.equal(await chosen(), 'Chosen: none')

    // The incident: `value` where the schema says `values`.
    const wrong = await action('act.select', { locator: { selector: 'select[name="slot"]' }, value: 'pm' })
    assert.equal(wrong.decision, 'allow', 'the hook did not ask about a call that cannot run')
    assert.equal(asked.length, 0, 'no approval was shown')
    assert.equal(wrong.envelope.ok, false)
    assert.equal(wrong.envelope.executionStatus, 'failed')
    assert.equal(wrong.envelope.error.code, 'INVALID_ARGS')
    assert.match(wrong.envelope.error.message, /value: unknown argument/)
    assert.match(wrong.envelope.error.message, /values: required/)
    assert.match(wrong.envelope.error.schema, /^act\.select\(.*values: string\[\]/)
    assert.equal(await chosen(), 'Chosen: none', 'the page was not touched')
    assert.equal(await hits(), 0, 'the page never fired its change handler (server side)')

    // The corrected call is the one the user is asked about, and it runs.
    const right = await action('act.select', { locator: { selector: 'select[name="slot"]' }, values: ['pm'] })
    assert.equal(right.decision, 'ask')
    assert.equal(asked.length, 1)
    assert.match(asked[0]!, /act\.select selector="select\[name=\\"slot\\"\]" \(values pm\)/)
    assert.equal(right.envelope.ok, true, JSON.stringify(right.envelope))
    assert.equal(await chosen(), 'Chosen: pm')
    assert.equal(await hits(), 1, 'exactly one real change reached the page')
  })

  it('other kinds of wrong arguments behave the same: misspelled name, wrong type, no arguments', async () => {
    const before = asked.length
    const bad: [string, Record<string, unknown>][] = [
      ['act.click', { selectr: '#slot' }],
      ['act.fill', { selector: '#slot', text: 5 }],
      ['act.press', {}],
      ['script.evaluate', { expresion: 'document.title' }],
    ]
    for (const [name, args] of bad) {
      const result = await action(name, args)
      assert.equal(result.decision, 'allow', name)
      assert.equal(result.envelope.error.code, 'INVALID_ARGS', name)
    }
    assert.equal(asked.length, before, 'none of them was asked about')
    assert.equal(await chosen(), 'Chosen: pm', 'the page still shows the last real change only')
    assert.equal(await hits(), 1)
  })
})
