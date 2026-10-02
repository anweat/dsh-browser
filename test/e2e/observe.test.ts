/**
 * Real-browser tests for structured observation (F02 controls and parameters, F03 page structure).
 *
 * The fixtures build their controls with script after load, and the ground truth each test compares
 * against is read straight from the live DOM through script.evaluate, a different path from the
 * observer's own scan. Skipped with a printed reason when no browser exists; nothing is downloaded.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:observe] SKIPPED: ${detection.reason}`)

type Json = Record<string, any>

describe('dsh-browser structured observation in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const S = 'e2e-observe'
  const url = (page: string) => `${server.base}/${page}`

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection)
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  const observe = (args: Json = {}): Promise<Json> => harness.result(S, 'observe.read', args)
  const evaluate = async (expression: string): Promise<any> => JSON.parse((await harness.result(S, 'script.evaluate', { expression })).resultJson)
  const byName = (controls: Json[], name: string): Json => {
    const found = controls.filter(control => control.name === name)
    assert.equal(found.length, 1, `exactly one control named ${name}, found ${found.length}`)
    return found[0]!
  }
  const hit = async (who: string, count = 1): Promise<void> => {
    for (let attempt = 0; attempt < 30 && (server.hits()[who] ?? 0) < count; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(server.hits()[who], count, `${who} reached the server ${count} time(s)`)
  }

  describe('F02: dynamic form, select, radio, constraints, states', () => {
    let controls: Json[]

    before(async () => {
      await harness.result(S, 'target.open', { url: url('observe-form.html') })
      await harness.result(S, 'act.wait', { locator: { text: 'Ready' } })
      const result = await observe({ sections: ['controls'] })
      controls = result.controls
    })

    it('lists controls that script inserted after load, each with role, name, type, actions, and source', async () => {
      assert.equal(controls.length, 28)
      const result = await observe({ sections: ['controls'] })
      assert.equal(result.counts.controls, 28)
      assert.equal(result.truncation, undefined)
      assert.equal(result.text, undefined, 'content was not asked for')
      assert.match(result.targetId, /^t\d+$/)
      const name = byName(controls, 'Full name')
      assert.deepEqual([name.role, name.type, name.source], ['textbox', 'text', 'dom'])
      assert.deepEqual(name.actions, ['fill', 'type', 'clear'])
      assert.deepEqual([byName(controls, 'Country').role, byName(controls, 'Country').type], ['combobox', 'select-one'])
      assert.deepEqual([byName(controls, 'Languages').role, byName(controls, 'Languages').type], ['listbox', 'select-multiple'])
      assert.deepEqual(byName(controls, 'Age').actions, ['fill', 'type', 'clear'])
      assert.deepEqual(byName(controls, 'Attachment').actions, ['upload'])
      assert.deepEqual(byName(controls, 'Accept terms').actions, ['check', 'click'])
      assert.deepEqual(byName(controls, 'Create account').actions, ['click'])
      // ARIA widgets on plain elements: source aria, states from aria-* attributes.
      const menu = byName(controls, 'Open menu')
      assert.deepEqual([menu.source, menu.role, menu.expanded], ['aria', 'button', false])
      assert.deepEqual([byName(controls, 'Dark mode').checked, byName(controls, 'Dark mode').source], [true, 'aria'])
      const beta = byName(controls, 'Beta features')
      assert.deepEqual([beta.disabled, beta.checked, beta.actions], [true, false, []])
      assert.deepEqual([byName(controls, 'More options').expanded, byName(controls, 'Notes').type], [false, 'contenteditable'])
    })

    it('every field a control record carries is described in the controls detail the model can read', async () => {
      const topic = await harness.index({ action: 'observe.read.controls' })
      const keys = new Set<string>()
      for (const control of controls) {
        for (const key of Object.keys(control)) keys.add(key)
        for (const key of Object.keys(control.constraints ?? {})) keys.add(key)
        for (const option of control.options ?? []) for (const key of Object.keys(option)) keys.add(key)
      }
      for (const key of keys) assert.match(topic, new RegExp('\\b' + key + '\\b'), `${key} appears in records but not in observe.read.controls`)
      assert.ok(keys.has('ambiguous') && keys.has('sensitive') && keys.has('validity'))
    })

    it('every observed state, constraint, option, and validity agrees with the live DOM, and absent means not observed', async () => {
      const truth = await evaluate(`(() => {
        const out = {}
        const pick = (id) => document.getElementById(id)
        for (const id of ['fullname','email','age','rating','coupon','member','bio','password','reference','country','langs','nothing','terms','news','partial','attach','sneaky']) {
          const el = pick(id)
          out[id] = {
            disabled: el.disabled, readOnly: el.readOnly, required: el.required, min: el.getAttribute('min'), max: el.getAttribute('max'), step: el.getAttribute('step'),
            pattern: el.getAttribute('pattern'), minlength: el.getAttribute('minlength'), maxlength: el.getAttribute('maxlength'), accept: el.getAttribute('accept'),
            multiple: el.multiple, checked: el.checked, indeterminate: el.indeterminate, valid: el.validity.valid, message: el.validationMessage, hasValue: el.value !== '',
            willValidate: el.willValidate,
            options: el.options ? Array.from(el.options).map(o => ({ value: o.value, label: o.label, selected: o.selected, disabled: o.disabled })) : undefined,
            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          }
        }
        return out
      })()`)
      const ids: Record<string, string> = { fullname: 'Full name', email: 'Email', age: 'Age', rating: 'Rating', coupon: 'Coupon', member: 'Member id', bio: 'Bio', password: 'Password', reference: 'Reference', country: 'Country', langs: 'Languages', nothing: 'Empty list', terms: 'Accept terms', news: 'Newsletter', partial: 'Partial', attach: 'Attachment', sneaky: 'Hidden note' }
      for (const [id, name] of Object.entries(ids)) {
        const dom = truth[id]
        const seen = byName(controls, name)
        assert.equal(seen.visible, dom.visible, `${name} visible`)
        assert.equal(seen.disabled, dom.disabled, `${name} disabled`)
        const c = seen.constraints ?? {}
        assert.equal(c.required, dom.required ? true : undefined, `${name} required`)
        for (const key of ['min', 'max', 'step', 'pattern', 'accept']) assert.equal(c[key], dom[key] ?? undefined, `${name} ${key}`)
        for (const key of ['minlength', 'maxlength']) assert.equal(c[key], dom[key] === null ? undefined : Number(dom[key]), `${name} ${key}`)
        assert.equal(c.multiple, dom.multiple && ['langs', 'attach'].includes(id) ? true : undefined, `${name} multiple`)
        if (dom.willValidate) {
          assert.equal(seen.validity.valid, dom.valid, `${name} validity.valid`)
          if (!dom.valid) assert.equal(seen.validity.validationMessage, dom.message, `${name} validationMessage`)
        } else assert.equal(seen.validity, undefined, `${name}: constraint validation does not apply, so no validity is reported`)
        assert.equal(seen.hasValue, id === 'terms' || id === 'news' || id === 'partial' ? undefined : dom.hasValue, `${name} hasValue`)
        if (dom.options) assert.deepEqual(seen.options.map((o: Json) => [o.value, o.label, o.selected, o.disabled === true]), dom.options.map((o: Json) => [o.value, o.label, o.selected, o.disabled]), `${name} options`)
        if (['terms', 'news', 'partial'].includes(id)) assert.equal(seen.checked, dom.indeterminate ? 'mixed' : dom.checked, `${name} checked`)
        if (id === 'member') assert.equal(seen.readonly, true)
      }
      // Explicit values the fixture sets, so a coincidence of two wrong answers cannot pass.
      const age = byName(controls, 'Age')
      assert.deepEqual(age.constraints, { min: '18', max: '99', step: '1' })
      assert.deepEqual([age.validity.valid, age.validity.flags], [false, ['rangeOverflow']])
      const full = byName(controls, 'Full name')
      assert.deepEqual(full.constraints, { required: true, pattern: '[A-Za-z ]+', minlength: 3, maxlength: 40 })
      assert.deepEqual(full.validity.flags, ['valueMissing'])
      assert.ok(full.validity.validationMessage.length > 0)
      assert.equal(byName(controls, 'Email').validity.valid, true)
      assert.equal(byName(controls, 'Email').validity.validationMessage, undefined, 'a valid control carries no message')
      assert.deepEqual(byName(controls, 'Coupon').actions, [], 'disabled: no action can work')
      assert.deepEqual(byName(controls, 'Member id').actions, [], 'readonly: no action can work')
      assert.equal(byName(controls, 'Member id').disabled, false)
      // "Not observed" is absent, never false: a range input has no readonly state, a button no checked state, a link no disabled.
      assert.equal('readonly' in byName(controls, 'Rating'), false)
      assert.equal('checked' in byName(controls, 'Create account'), false)
      assert.equal('expanded' in byName(controls, 'Full name'), false)
      assert.equal('validity' in byName(controls, 'Create account'), false)
      const hidden = byName(controls, 'Hidden note')
      assert.deepEqual([hidden.visible, hidden.actions], [false, []])
      const csrf = controls.find(control => control.type === 'hidden')!
      assert.deepEqual([csrf.visible, csrf.hasValue, csrf.sensitive, csrf.actions], [false, true, true, []])
    })

    it('select and radio group options come from the DOM; a select with no options is an empty list, not missing', async () => {
      const country = byName(controls, 'Country')
      assert.deepEqual(country.options, [
        { value: '', label: 'Choose…', selected: false },
        { value: 'NL', label: 'Netherlands', selected: false },
        { value: 'DE', label: 'Germany', selected: true },
        { value: 'XX', label: 'Closed market', selected: false, disabled: true },
      ])
      assert.deepEqual(byName(controls, 'Languages').options.filter((o: Json) => o.selected).map((o: Json) => o.value), ['nl'])
      const empty = byName(controls, 'Empty list')
      assert.deepEqual(empty.options, [])
      assert.equal(empty.hasValue, false)

      const plan = controls.find(control => control.role === 'radiogroup')!
      assert.equal(plan.name, 'Plan')
      assert.equal(controls.filter(control => control.type === 'radio').length, 1, 'three radios of one name are one group')
      assert.deepEqual(plan.options.map((o: Json) => [o.label, o.value, o.checked, o.disabled === true]), [['Free', 'free', false, false], ['Pro', 'pro', true, false], ['Team', 'team', false, true]])
      assert.ok(plan.options.every((o: Json) => o.locator && !o.ambiguous))
      const domPlan = await evaluate(`Array.from(document.querySelectorAll('input[name=plan]')).map(r => [r.value, r.checked, r.disabled])`)
      assert.deepEqual(domPlan, [['free', false, false], ['pro', true, false], ['team', false, true]])
    })

    it('values are withheld by default; includeValues returns plain fields and never password, hidden, or token-like ones', async () => {
      const text = JSON.stringify((await observe({ sections: ['controls'] })))
      for (const secret of ['hunter2-secret', 'csrf-9f8e7d6c5b4a', 'a8F3kd92LzQw0Xv7Bn41Tt65', 'ada@example.com']) assert.ok(!text.includes(secret), `${secret} must not appear without includeValues`)
      assert.ok(!controls.some(control => 'value' in control))

      const withValues = (await observe({ sections: ['controls'], includeValues: true })).controls as Json[]
      const raw = JSON.stringify(withValues)
      for (const secret of ['hunter2-secret', 'csrf-9f8e7d6c5b4a', 'a8F3kd92LzQw0Xv7Bn41Tt65']) assert.ok(!raw.includes(secret), `${secret} must never be returned`)
      const password = byName(withValues, 'Password')
      assert.deepEqual([password.hasValue, password.sensitive, 'value' in password], [true, true, false])
      const reference = byName(withValues, 'Reference')
      assert.deepEqual([reference.hasValue, reference.sensitive, 'value' in reference], [true, true, false], 'a token-looking value is withheld although the field is named innocently')
      const csrf = withValues.find(control => control.type === 'hidden')!
      assert.deepEqual([csrf.hasValue, 'value' in csrf], [true, false])
      assert.equal(byName(withValues, 'Email').value, 'ada@example.com')
      assert.equal(byName(withValues, 'Bio').value, 'Hello there')
      assert.equal(byName(withValues, 'Country').value, 'DE')
      assert.deepEqual(byName(withValues, 'Languages').value, ['nl'])
      assert.equal(byName(withValues, 'Notes').value, 'Draft notes')
    })

    it('an ambiguous control is flagged with its match count and position, acting on it is refused, and index pins it', async () => {
      const remove = controls.filter(control => control.name === 'Remove')
      assert.equal(remove.length, 2)
      assert.deepEqual(remove.map(control => [control.ambiguous, control.matches, control.nth]), [[true, 2, 0], [true, 2, 1]])
      server.resetHits()
      const refused = await harness.action(S, 'act.click', { locator: remove[0]!.locator, timeoutMs: 1000 })
      assert.equal(refused.error.code, 'LOCATOR_AMBIGUOUS')
      const pinned = await harness.action(S, 'act.click', { locator: { ...remove[1]!.locator, index: remove[1]!.nth, indexReason: 'the second Remove in the list, as observed' }, timeoutMs: 1000 })
      assert.equal(pinned.ok, true)
      // Every other control got a locator that is unique on the page.
      const unique = controls.filter(control => control.name !== 'Remove' && control.role !== 'radiogroup')
      assert.ok(unique.every(control => control.locator && !control.ambiguous), JSON.stringify(unique.filter(control => !control.locator || control.ambiguous)))
    })

    it('closes the loop: locators from the observation drive act.fill, select, check, click, and the form then reads back as filled', async () => {
      const fresh = (await observe({ sections: ['controls'] })).controls as Json[]
      await harness.result(S, 'act.fill', { locator: byName(fresh, 'Full name').locator, text: 'Ada Lovelace' })
      await harness.result(S, 'act.fill', { locator: byName(fresh, 'Age').locator, text: '42' })
      await harness.result(S, 'act.select', { locator: byName(fresh, 'Country').locator, values: ['NL'] })
      await harness.result(S, 'act.check', { locator: byName(fresh, 'Accept terms').locator, checked: true })
      const plan = fresh.find(control => control.role === 'radiogroup')!
      await harness.result(S, 'act.check', { locator: plan.options.find((o: Json) => o.label === 'Free').locator })
      await harness.result(S, 'act.click', { locator: byName(fresh, 'Open menu').locator })

      const after = (await observe({ sections: ['controls'], includeValues: true })).controls as Json[]
      assert.deepEqual([byName(after, 'Full name').value, byName(after, 'Full name').validity.valid], ['Ada Lovelace', true])
      assert.deepEqual([byName(after, 'Age').value, byName(after, 'Age').validity.valid], ['42', true])
      assert.equal(byName(after, 'Country').value, 'NL')
      assert.equal(byName(after, 'Accept terms').checked, true)
      assert.equal(byName(after, 'Accept terms').validity.valid, true)
      assert.deepEqual(after.find(control => control.role === 'radiogroup')!.options.map((o: Json) => o.checked), [true, false, false])
      assert.equal(byName(after, 'Open menu').expanded, true, 'the page updated aria-expanded and the observation follows')

      server.resetHits()
      await harness.result(S, 'act.click', { locator: byName(after, 'Create account').locator })
      await hit('signup')
    })

    it('scoping by locator and by region limits what is listed; a missing scope is LOCATOR_NOT_FOUND, not an empty result', async () => {
      const scoped = await observe({ sections: ['controls'], locator: { selector: 'fieldset' } })
      assert.deepEqual(scoped.controls.map((control: Json) => control.role), ['radiogroup'])
      assert.equal(scoped.counts.controls, 1)

      const everything = await observe({ sections: ['controls'] })
      const top = await observe({ sections: ['controls'], region: { x: 0, y: 0, width: 4000, height: 60 } })
      assert.ok(top.counts.controls < everything.counts.controls && top.counts.controls >= 1, `region keeps a subset (${top.counts.controls} of ${everything.counts.controls})`)

      const missing = await harness.action(S, 'observe.read', { sections: ['controls'], locator: { selector: '#no-such-container' }, timeoutMs: 300 })
      assert.equal(missing.ok, false)
      assert.equal(missing.error.code, 'LOCATOR_NOT_FOUND')
      const several = await harness.action(S, 'observe.read', { sections: ['controls'], locator: { selector: 'label' }, timeoutMs: 300 })
      assert.equal(several.error.code, 'LOCATOR_AMBIGUOUS')
    })
  })

  describe('F03: iframes, shadow DOM, tables, links', () => {
    it('same-origin and nested iframes and open shadow DOM are listed, and each candidate locator clicks the right control', async () => {
      await harness.result(S, 'target.open', { url: url('observe-frames.html') })
      await harness.result(S, 'act.wait', { selector: '#same' })
      // Frames load on their own schedule: observe until the nested one has been entered too.
      let result = await observe({ sections: ['controls'] })
      for (let attempt = 0; attempt < 50 && result.counts.controls < 8; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
        result = await observe({ sections: ['controls'] })
      }
      const controls = result.controls as Json[]
      const names = controls.map(control => control.name)
      assert.deepEqual(names, ['Outer action', 'Inner note', 'Inner save', 'Leaf code', 'Leaf go', 'Card holder', 'Pay with card', 'Deep button'])
      assert.deepEqual(byName(controls, 'Inner save').locator.framePath, ['iframe#same'])
      assert.deepEqual(byName(controls, 'Leaf go').locator.framePath, ['iframe#same', 'iframe#grandchild'])
      assert.equal(byName(controls, 'Deep button').locator.framePath, undefined, 'a shadow root needs no extra path')
      assert.equal(result.scanned.shadowRoots, 2)
      assert.ok(controls.every(control => control.locator && !control.ambiguous))

      server.resetHits()
      await harness.result(S, 'act.fill', { locator: byName(controls, 'Inner note').locator, text: 'from outside' })
      const clicked = await harness.result(S, 'act.click', { locator: byName(controls, 'Inner save').locator })
      assert.ok(clicked.targetId)
      await hit('inner-save')
      await harness.result(S, 'act.fill', { locator: byName(controls, 'Card holder').locator, text: 'Ada' })
      await harness.result(S, 'act.click', { locator: byName(controls, 'Pay with card').locator })
      await harness.result(S, 'act.click', { locator: byName(controls, 'Deep button').locator })
      await harness.result(S, 'act.click', { locator: byName(controls, 'Leaf go').locator })
      await harness.result(S, 'act.click', { locator: byName(controls, 'Outer action').locator })
      await hit('card-pay')
      await hit('deep')
      await hit('leaf-go')
      await hit('outer')
      const state = await evaluate(`document.getElementById('card').shadowRoot.getElementById('card-state').textContent`)
      assert.equal(state, 'Card paid by Ada')
      assert.equal(await evaluate(`document.getElementById('same').contentDocument.getElementById('inner-state').textContent`), 'Inner saved: from outside')
    })

    it('a cross-origin iframe is listed with its limitation, its content is not claimed, and nothing is mistaken for "no controls"', async () => {
      const result = await observe({ sections: ['controls'] })
      const foreign = (result.frames as Json[]).find(frame => frame.crossOrigin)!
      assert.deepEqual(foreign.framePath, ['iframe#foreign'])
      assert.match(foreign.limitation, /not observed/)
      assert.equal(result.frames.filter((frame: Json) => frame.sameOrigin).length, 2)
      assert.ok(result.limits.some((limit: string) => /cross-origin/.test(limit)))
      // The foreign frame holds a "Leaf code" field too; only the same-origin one is reported.
      assert.equal(result.controls.filter((control: Json) => control.name === 'Leaf code').length, 1)
      // Its elements can still be reached by an explicit framePath, as the limitation says.
      const reach = await harness.action(S, 'act.fill', { locator: { label: 'Leaf code', framePath: ['iframe#foreign'] }, text: 'x', timeoutMs: 3000 })
      assert.equal(reach.ok, true)
    })

    it('tables: headers, rows, total, and coverage; an empty body is a real empty result, a virtual grid or pager is partial', async () => {
      await harness.result(S, 'target.open', { url: url('observe-tables.html') })
      const result = await observe({ sections: ['tables', 'controls'] })
      assert.equal(result.counts.tables, 4)
      const tables = result.tables as Json[]
      const orders = tables.find(table => table.name === 'Open orders')!
      assert.deepEqual(orders.headers, ['Order', 'Customer', 'Total'])
      assert.deepEqual(orders.rows, [['1001', 'Ada', '12.50'], ['1002', 'Grace', '8.00'], ['1003', 'Linus', '41.25']])
      assert.deepEqual([orders.totalRows, orders.coverage, orders.reason], [3, 'complete', undefined])
      assert.deepEqual(await evaluate(`document.querySelectorAll('#orders tbody tr').length`), 3)

      const refunds = tables.find(table => table.name === 'Refunds')!
      assert.deepEqual([refunds.rows, refunds.totalRows, refunds.headers], [[], 0, ['Order', 'Reason']])
      assert.equal(refunds.coverage, 'complete', 'empty is a valid answer, not a failure and not partial')

      const history = tables.find(table => table.name === 'History')!
      assert.equal(history.coverage, 'partial')
      assert.match(history.reason, /paginat/)
      const grid = tables.find(table => table.name === 'Events')!
      assert.deepEqual([grid.coverage, grid.totalRows, grid.declaredRows], ['partial', 3, 1000])
      assert.match(grid.reason, /virtualized/)

      // The only controls on this page are the pager's two buttons, and the disabled one says so.
      assert.deepEqual(result.controls.map((control: Json) => [control.name, control.disabled]), [['Previous', true], ['Next', false]])

      // A page with no table and no control answers with empty lists and zero counts, which is not an error and not "not found".
      await harness.result(S, 'target.open', { url: url('index.html') })
      const bare = await observe({ sections: ['tables', 'controls'] })
      assert.deepEqual([bare.tables, bare.controls, bare.counts], [[], [], { tables: 0, controls: 0 }])
      assert.equal(bare.truncation, undefined)
    })

    it('links: text, absolute href, and locators that tell same-text links apart; the second Docs link navigates to its own href', async () => {
      await harness.result(S, 'target.open', { url: url('observe-tables.html') })
      const result = await observe({ sections: ['links'] })
      const links = result.links as Json[]
      assert.equal(result.counts.links, 5)
      assert.deepEqual(links.map(link => link.text), ['Home', 'Form page', 'Docs', 'Docs', ''])
      assert.equal(links[1]!.target, '_blank')
      assert.equal(links[2]!.href, url('search.html?q=1'))
      assert.ok(links.every(link => link.locator && !link.ambiguous))
      assert.notDeepEqual(links[2]!.locator, links[3]!.locator)
      const second = await harness.result(S, 'act.click', { locator: links[3]!.locator })
      assert.equal(second.url, url('search.html?q=2'))
    })
  })

  describe('limits: always valid JSON, with the cut recorded', () => {
    it('a page with hundreds of controls, rows, links, and paragraphs is cut at item boundaries with truncation, never mid-string', async () => {
      await harness.result(S, 'target.open', { url: url('observe-many.html') })
      const envelope = await harness.action(S, 'observe.read', { sections: ['content', 'controls', 'links', 'tables'] })
      assert.equal(envelope.ok, true)
      const wire = JSON.stringify(envelope)
      assert.deepEqual(JSON.parse(wire), envelope, 'the envelope survives a JSON round trip')
      const result = envelope.result as Json
      assert.deepEqual([result.counts.controls, result.counts.links, result.counts.tables], [300, 200, 1])
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 24_000, `result is ${Buffer.byteLength(JSON.stringify(result))} bytes`)
      assert.ok(result.truncation, 'something was cut')
      const omitted = result.truncation.omittedBySection
      assert.ok(omitted.controls > 0 && omitted.links > 0, JSON.stringify(omitted))
      assert.equal(result.controls.length + omitted.controls, 300)
      assert.equal(result.links.length + omitted.links, 200)
      assert.match(result.truncation.reason, /maxBytes=24000|maxItems=50/)
      // What remains is whole: every kept control still has its name and a checked locator.
      assert.ok(result.controls.every((control: Json) => control.name && control.locator))
      assert.ok(result.links.every((link: Json) => link.href && link.locator))
      assert.equal(result.tables[0].totalRows, 400, 'totalRows still says how many rows the page holds')
      assert.ok(omitted.tableRows >= 350 - 1)
      assert.ok(omitted.content > 0)
    })

    it('maxItems and maxBytes are honoured exactly, and the envelope itself stays an ordinary short envelope', async () => {
      const small = await harness.result(S, 'observe.read', { sections: ['controls'], maxItems: 5 })
      assert.equal(small.controls.length, 5)
      assert.equal(small.truncation.omittedBySection.controls, 295)
      assert.match(small.truncation.reason, /maxItems=5 reached for controls/)
      assert.doesNotMatch(small.truncation.reason, /maxBytes/)

      const tight = await harness.result(S, 'observe.read', { sections: ['controls', 'tables'], maxItems: 500, maxBytes: 3_000 })
      assert.ok(Buffer.byteLength(JSON.stringify(tight)) <= 3_000, `${Buffer.byteLength(JSON.stringify(tight))} bytes`)
      assert.ok(tight.controls.length > 0 && tight.controls.length < 300)
      assert.match(tight.truncation.reason, /maxBytes=3000/)
      assert.deepEqual(JSON.parse(JSON.stringify(tight)), tight)

      const big = await harness.result(S, 'observe.read', { sections: ['controls'], maxItems: 500, maxBytes: 90_000 })
      assert.equal(big.controls.length, 300)
      assert.equal(big.truncation, undefined, 'a budget that fits everything cuts nothing')

      const refused = await harness.action(S, 'observe.read', { sections: ['controls'], maxBytes: 10 })
      assert.equal(refused.error.code, 'INVALID_ARGS')
      assert.match(refused.error.message, /maxBytes/)
    })

    it('the default read is unchanged: url, title, text, and the page stamp, with no new sections', async () => {
      const plain = await observe()
      assert.deepEqual(Object.keys(plain).sort(), ['generation', 'targetId', 'text', 'title', 'url'])
      assert.match(plain.text, /Observe many fixture/)
      const contentOnly = await observe({ sections: ['content'], maxBytes: 4_000 })
      assert.ok(contentOnly.text.length < plain.text.length)
      assert.ok(contentOnly.truncation.omittedBySection.content > 0)
    })
  })

  describe('closing the loop with page generations', () => {
    it('an observation names its page version, and an action based on it is refused after the page navigated, with no effect on the server', async () => {
      await harness.result(S, 'target.open', { url: url('generation.html') })
      const seen = await observe({ sections: ['controls'] })
      const submit = (seen.controls as Json[]).find(control => control.name === 'Submit order')!
      assert.ok(submit.locator && !submit.ambiguous)
      await harness.result(S, 'act.click', { selector: '#push' })
      server.resetHits()
      const stale = await harness.action(S, 'act.click', { locator: submit.locator, expectGeneration: seen.generation })
      assert.equal(stale.error.code, 'TARGET_STALE')
      await new Promise(resolve => setTimeout(resolve, 300))
      assert.deepEqual(server.hits(), {})
      const again = await observe({ sections: ['controls'] })
      assert.ok(again.generation > seen.generation)
      await harness.result(S, 'act.click', { locator: submit.locator, expectGeneration: again.generation })
      await hit('submit')
    })
  })
})
