/**
 * The in-page half of observe.read: one function, shipped to the page as source text.
 *
 * It is a raw string on purpose: it runs inside the page, so it must not carry transpiler helpers, and
 * it must not use template literals (the string is written with String.raw). It reads the DOM and
 * returns plain data; it never changes the page. The only thing it leaves behind is a WeakMap stored
 * under a registered symbol on each scanned window, which maps each listed element to its number, so
 * that the Node side can later prove that a candidate locator points at that very element.
 *
 * Coverage: the document, open shadow roots (recursively), and same-origin iframes (recursively, up to
 * the frame-path limit). A cross-origin or sandboxed iframe is listed as a frame with its limitation,
 * never entered. Closed shadow roots cannot be seen from page script and are not covered.
 * @module dsh-browser/observe-script
 */

/** Symbol (registered with Symbol.for) under which each scanned window keeps its element-number map. */
export const OBSERVE_SYMBOL = 'dsh.observe'

/** Maximum iframe nesting the scan enters; matches the locator framePath limit. */
export const OBSERVE_MAX_FRAME_DEPTH = 5

/** Maximum number of iframes entered in one observation. */
export const OBSERVE_MAX_FRAMES = 20

/** Reads, in the element's own window, the numbers of the elements a locator matched. */
export const IDENTITY_SOURCE = String.raw`(els) => {
  const map = window[Symbol.for('dsh.observe')]
  return els.map((el) => { const n = map ? map.get(el) : undefined; return typeof n === 'number' ? n : -1 })
}`

/**
 * `(root, opts) => result`. `root` is a Document or the Element an observation is scoped to.
 * opts: { controls, links, tables, maxItems, includeValues, region?, maxFrameDepth, maxFrames }.
 */
export const OBSERVE_SOURCE = String.raw`(root, opts) => {
  const SYM = Symbol.for('dsh.observe')
  const MAX = opts.maxItems
  const out = { controls: [], links: [], tables: [], frames: [], counts: { controls: 0, links: 0, tables: 0 }, shadowRoots: 0 }
  let nextId = 0
  const items = []
  const radioGroups = new Map()
  const formIds = new WeakMap()
  let nextForm = 0
  const state = { framesEntered: 0 }

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  const cut = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n) : s }
  const cssStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const cssId = (s) => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c)
  const has = (el, a) => el.hasAttribute(a)
  const attr = (el, a) => { const v = el.getAttribute(a); return v == null ? undefined : v }
  const isEl = (n) => n && n.nodeType === 1

  // ---- element numbering (identity proof for the Node side) ----
  const numbered = (el, win) => {
    let map = win[SYM]
    if (!map) { map = new WeakMap(); try { Object.defineProperty(win, SYM, { value: map, configurable: true, enumerable: false, writable: true }) } catch (e) { win[SYM] = map } }
    const id = nextId++
    map.set(el, id)
    return id
  }

  // ---- visibility and geometry ----
  const rectOf = (el) => { try { return el.getBoundingClientRect() } catch (e) { return { left: 0, top: 0, width: 0, height: 0 } } }
  const isVisible = (el) => {
    try {
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) return false
      const r = rectOf(el)
      if (r.width > 0 && r.height > 0) return true
      return false
    } catch (e) { return false }
  }
  const inRegion = (el, frame) => {
    if (!opts.region) return true
    const r = rectOf(el)
    const x = r.left + frame.ox, y = r.top + frame.oy
    const g = opts.region
    return x < g.x + g.width && x + r.width > g.x && y < g.y + g.height && y + r.height > g.y
  }

  // ---- roles, names ----
  const INPUT_ROLE = { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', image: 'button', range: 'slider', number: 'spinbutton', search: 'searchbox', email: 'textbox', tel: 'textbox', url: 'textbox', text: 'textbox' }
  const WIDGET_ROLES = new Set(['button', 'checkbox', 'radio', 'switch', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'treeitem'])
  const explicitRole = (el) => { const r = norm(attr(el, 'role') || '').split(' ')[0].toLowerCase(); return r || '' }
  const typeOf = (el) => (el.localName === 'input' ? String(el.type || 'text').toLowerCase() : '')
  const implicitRole = (el) => {
    const tag = el.localName
    if (tag === 'input') {
      const t = typeOf(el)
      if ((t === 'text' || t === 'search' || t === 'tel' || t === 'url' || t === 'email') && el.list) return 'combobox'
      return INPUT_ROLE[t] || ''
    }
    if (tag === 'select') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'button') return 'button'
    if (tag === 'a' && has(el, 'href')) return 'link'
    if (tag === 'table') return 'table'
    return ''
  }
  const idText = (el, ids) => {
    const rootNode = el.getRootNode ? el.getRootNode() : document
    return ids.split(/\s+/).map((id) => { const t = rootNode.getElementById ? rootNode.getElementById(id) : null; return t ? norm(t.innerText || t.textContent) : '' }).filter(Boolean).join(' ')
  }
  const nameOf = (el, role) => {
    const tag = el.localName
    const lb = attr(el, 'aria-labelledby')
    if (lb) { const t = idText(el, lb); if (t) return cut(t, 200) }
    const al = norm(attr(el, 'aria-label') || '')
    if (al) return cut(al, 200)
    if (el.labels && el.labels.length) {
      const t = norm(Array.from(el.labels).map((l) => l.innerText || l.textContent).join(' '))
      if (t) return cut(t, 200)
    }
    if (tag === 'input') {
      const t = typeOf(el)
      if (t === 'button' || t === 'submit' || t === 'reset') { const v = norm(el.value); if (v) return cut(v, 200) }
      if (t === 'image') { const v = norm(attr(el, 'alt') || attr(el, 'value') || ''); if (v) return cut(v, 200) }
    }
    if (tag === 'table') { const c = el.caption ? norm(el.caption.innerText || el.caption.textContent) : ''; if (c) return cut(c, 200) }
    if (tag === 'button' || tag === 'summary' || tag === 'a' || role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio' || role === 'option' || role === 'treeitem' || role === 'checkbox' || role === 'radio' || role === 'switch') {
      let t = norm(el.innerText || el.textContent)
      if (!t && tag === 'a') { const img = el.querySelector('img[alt]'); if (img) t = norm(img.getAttribute('alt')) }
      if (t) return cut(t, 200)
    }
    const title = norm(attr(el, 'title') || '')
    if (title) return cut(title, 200)
    const ph = norm(attr(el, 'placeholder') || '')
    if (ph) return cut(ph, 200)
    return ''
  }
  const labelText = (el) => {
    const lb = attr(el, 'aria-labelledby')
    if (lb) { const t = idText(el, lb); if (t) return cut(t, 200) }
    const al = norm(attr(el, 'aria-label') || '')
    if (al) return cut(al, 200)
    if (el.labels && el.labels.length) { const t = norm(Array.from(el.labels).map((l) => l.innerText || l.textContent).join(' ')); if (t) return cut(t, 200) }
    return ''
  }

  // ---- sensitive values ----
  const SENSITIVE = /(^|[^a-z])(pass(word|wd|phrase|code)?|pwd|secret|token|api[-_ ]?key|credential|bearer|jwt|otp|csrf|xsrf|session[-_ ]?(id|key)?|ssn|cvv|cvc|private[-_ ]?key|authori[sz]ation|auth[-_ ]?(token|key|code))([^a-z]|$)/i
  const tokenLike = (v) => {
    if (!v || v.length < 20 || /\s/.test(v)) return false
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(v)) return true
    return /^[A-Za-z0-9_\-+\/=.~]+$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)
  }
  const camel = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2')
  const nameHint = (el) => {
    const parts = [attr(el, 'name'), el.id, attr(el, 'autocomplete'), attr(el, 'aria-label'), attr(el, 'placeholder'), attr(el, 'data-testid')]
    return parts.some((p) => p && SENSITIVE.test(camel(p)))
  }

  // ---- frames: CSS selectors for iframe elements, unique in their own document ----
  const allRoots = (frame) => {
    if (frame.roots) return frame.roots
    const roots = [frame.doc]
    const walk = (node) => { node.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) { roots.push(e.shadowRoot); walk(e.shadowRoot) } }) }
    walk(frame.doc)
    frame.roots = roots
    return roots
  }
  const countDeep = (frame, selector) => {
    let n = 0
    try { for (const r of allRoots(frame)) n += r.querySelectorAll(selector).length } catch (e) { return -1 }
    return n
  }
  const cssPath = (el) => {
    const parts = []
    let cur = el
    while (cur && cur.nodeType === 1) {
      const tag = cur.localName
      if (cur.id && cur !== el) { parts.unshift(tag + '#' + cssId(cur.id)); break }
      const p = cur.parentNode
      let idx = 1
      if (p && p.children) for (const s of p.children) { if (s === cur) break; if (s.localName === tag) idx++ }
      parts.unshift(tag + ':nth-of-type(' + idx + ')')
      if (!p || p.nodeType !== 1) break
      cur = p
    }
    return parts.join(' > ')
  }
  const frameSelector = (node, frame) => {
    const tag = node.localName
    const tries = []
    if (node.id) tries.push(tag + '#' + cssId(node.id))
    const name = attr(node, 'name'); if (name) tries.push(tag + '[name="' + cssStr(name) + '"]')
    const title = attr(node, 'title'); if (title) tries.push(tag + '[title="' + cssStr(title) + '"]')
    const src = attr(node, 'src'); if (src) tries.push(tag + '[src="' + cssStr(src) + '"]')
    for (const s of tries) if (countDeep(frame, s) === 1) return s
    return cssPath(node)
  }
  const enterFrame = (node, frame) => {
    let doc = null
    try { doc = node.contentDocument } catch (e) { doc = null }
    const selector = frameSelector(node, frame)
    const path = frame.path.concat([selector])
    const rec = { framePath: path }
    const src = attr(node, 'src'); if (src) rec.src = cut(src, 300)
    if (!doc) {
      rec.crossOrigin = true
      rec.limitation = 'content not observed (cross-origin or sandboxed frame)'
    } else if (path.length > opts.maxFrameDepth || opts.noFrames) {
      rec.skipped = 'frame nesting limit reached'
    } else if (state.framesEntered >= opts.maxFrames) {
      rec.skipped = 'frame count limit reached'
    } else {
      state.framesEntered++
      rec.sameOrigin = true
      try { rec.url = cut(doc.location.href, 300) } catch (e) {}
      const r = rectOf(node)
      const child = { path, doc, win: doc.defaultView, ox: frame.ox + r.left, oy: frame.oy + r.top, roots: null }
      out.frames.push(rec)
      if (doc.documentElement) scan(doc.documentElement, child)
      return
    }
    out.frames.push(rec)
  }

  // ---- classification ----
  const NATIVE_INPUT_FILL = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'])
  const classify = (el) => {
    const tag = el.localName
    const role = explicitRole(el)
    if (tag === 'input') return { native: true, kind: 'input' }
    if (tag === 'option' || tag === 'optgroup') return null
    if (tag === 'select' || tag === 'textarea' || tag === 'button') return { native: true, kind: tag }
    if (tag === 'summary' && el.parentNode && el.parentNode.localName === 'details') return { native: true, kind: 'summary' }
    if (has(el, 'contenteditable') && attr(el, 'contenteditable') !== 'false' && el.isContentEditable) return { native: true, kind: 'contenteditable' }
    if (role && WIDGET_ROLES.has(role)) return { native: false, kind: 'aria' }
    return null
  }

  const stateOf = (el, kind) => {
    const s = {}
    s.visible = isVisible(el)
    const native = kind.native
    const tag = el.localName
    if (native && (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button')) s.disabled = !!el.matches(':disabled')
    else if (has(el, 'aria-disabled')) s.disabled = attr(el, 'aria-disabled') === 'true'
    if (native && (tag === 'textarea' || (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'hidden', 'range', 'color'].includes(typeOf(el))))) s.readonly = !!el.readOnly
    else if (has(el, 'aria-readonly')) s.readonly = attr(el, 'aria-readonly') === 'true'
    if (tag === 'input' && (typeOf(el) === 'checkbox' || typeOf(el) === 'radio')) s.checked = el.indeterminate ? 'mixed' : !!el.checked
    else if (has(el, 'aria-checked')) { const v = attr(el, 'aria-checked'); s.checked = v === 'mixed' ? 'mixed' : v === 'true' }
    if (tag === 'summary' && el.parentNode && el.parentNode.localName === 'details') s.expanded = !!el.parentNode.open
    else if (has(el, 'aria-expanded')) s.expanded = attr(el, 'aria-expanded') === 'true'
    return s
  }

  const constraintsOf = (el, kind) => {
    const c = {}
    const tag = el.localName
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (has(el, 'required')) c.required = true
      for (const a of ['min', 'max', 'step', 'pattern', 'accept']) if (tag === 'input' && has(el, a)) c[a] = cut(attr(el, a), 200)
      for (const a of ['minlength', 'maxlength']) if ((tag === 'input' || tag === 'textarea') && has(el, a)) { const n = Number(attr(el, a)); c[a] = Number.isFinite(n) ? n : cut(attr(el, a), 20) }
      if (has(el, 'multiple') && (tag === 'select' || typeOf(el) === 'file' || typeOf(el) === 'email')) c.multiple = true
    } else {
      if (attr(el, 'aria-required') === 'true') c.required = true
      if (has(el, 'aria-valuemin')) c.min = attr(el, 'aria-valuemin')
      if (has(el, 'aria-valuemax')) c.max = attr(el, 'aria-valuemax')
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (attr(el, 'aria-required') === 'true') c.required = true }
    return c
  }

  const validityOf = (el) => {
    try {
      if (!el.willValidate || !el.validity) return undefined
      const v = el.validity
      if (v.valid) return { valid: true }
      const flags = []
      for (const k of ['valueMissing', 'typeMismatch', 'patternMismatch', 'tooLong', 'tooShort', 'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput', 'customError']) if (v[k]) flags.push(k)
      return { valid: false, flags, validationMessage: cut(el.validationMessage || '', 200) }
    } catch (e) { return undefined }
  }

  const valueOf = (el, kind) => {
    const tag = el.localName
    const info = {}
    if (tag === 'input') {
      const t = typeOf(el)
      if (t === 'checkbox' || t === 'radio' || t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return info
      if (t === 'file') { info.hasValue = !!(el.files && el.files.length); return info }
      const v = String(el.value == null ? '' : el.value)
      info.hasValue = v.length > 0
      if (t === 'password' || t === 'hidden' || nameHint(el) || tokenLike(v)) { info.sensitive = true; return info }
      if (opts.includeValues) info.value = cut(v, 500)
      return info
    }
    if (tag === 'textarea') {
      const v = String(el.value || '')
      info.hasValue = v.length > 0
      if (nameHint(el) || tokenLike(v)) { info.sensitive = true; return info }
      if (opts.includeValues) info.value = cut(v, 500)
      return info
    }
    if (tag === 'select') {
      const sel = Array.from(el.selectedOptions || [])
      info.hasValue = sel.some((o) => o.value !== '')
      if (nameHint(el)) { info.sensitive = true; return info }
      if (opts.includeValues) info.value = el.multiple ? sel.map((o) => cut(o.value, 200)) : (sel[0] ? cut(sel[0].value, 200) : '')
      return info
    }
    if (kind.kind === 'contenteditable') {
      const v = norm(el.innerText || el.textContent)
      info.hasValue = v.length > 0
      if (nameHint(el)) { info.sensitive = true; return info }
      if (opts.includeValues) info.value = cut(v, 500)
    }
    return info
  }

  const actionsFor = (el, kind, role, st) => {
    if (st.visible === false || st.disabled === true) return []
    const tag = el.localName
    if (tag === 'input') {
      const t = typeOf(el)
      if (t === 'hidden') return []
      if (t === 'checkbox' || t === 'radio') return ['check', 'click']
      if (t === 'file') return ['upload']
      if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return ['click']
      if (st.readonly === true) return []
      if (t === 'range' || t === 'color' || t === 'date' || t === 'time' || t === 'datetime-local' || t === 'month' || t === 'week') return ['fill']
      return ['fill', 'type', 'clear']
    }
    if (tag === 'textarea') return st.readonly === true ? [] : ['fill', 'type', 'clear']
    if (tag === 'select') return ['select']
    if (tag === 'button' || tag === 'summary') return ['click']
    if (kind.kind === 'contenteditable') return ['fill', 'type', 'clear']
    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox' || role === 'menuitemradio') return ['check', 'click']
    if (role === 'textbox' || role === 'searchbox') return ['fill', 'type', 'clear']
    if (role === 'combobox') return ['click', 'type']
    if (role === 'slider' || role === 'spinbutton') return ['press']
    return ['click']
  }

  const candidatesFor = (el, role, name) => {
    const c = []
    const tag = el.localName
    if (role && name && name.length <= 150) c.push({ role, name, exact: true })
    const lt = labelText(el)
    if (lt && lt.length <= 150 && (tag === 'input' || tag === 'select' || tag === 'textarea')) c.push({ label: lt, exact: true })
    const tid = attr(el, 'data-testid'); if (tid) c.push({ testId: tid })
    if (el.id) c.push({ selector: '#' + cssId(el.id) })
    const nm = attr(el, 'name')
    if (nm && (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button')) {
      const t = tag === 'input' ? '[type="' + cssStr(typeOf(el)) + '"]' : ''
      const v = tag === 'input' && typeOf(el) === 'radio' && has(el, 'value') ? '[value="' + cssStr(attr(el, 'value')) + '"]' : ''
      c.push({ selector: tag + t + '[name="' + cssStr(nm) + '"]' + v })
    }
    const ph = attr(el, 'placeholder')
    if (ph && (tag === 'input' || tag === 'textarea')) c.push({ selector: tag + '[placeholder="' + cssStr(ph) + '"]' })
    if (tag === 'a' && has(el, 'href')) c.push({ selector: 'a[href="' + cssStr(attr(el, 'href')) + '"]' })
    return c
  }

  const optionRows = (el) => {
    const rows = []
    const list = Array.from(el.options || [])
    for (const o of list.slice(0, 100)) {
      const row = { value: cut(o.value, 200), label: cut(norm(o.label || o.textContent), 200), selected: !!o.selected }
      if (o.disabled) row.disabled = true
      rows.push(row)
    }
    return { rows, total: list.length }
  }

  const buildControl = (item) => {
    const el = item.el
    const frame = item.frame
    const kind = item.kind
    if (item.group) return buildRadioGroup(item)
    const role = explicitRole(el) || implicitRole(el)
    const name = nameOf(el, role)
    const rec = { id: numbered(el, frame.win), source: kind.native ? 'dom' : 'aria', path: frame.path }
    if (role) rec.role = role
    if (name) rec.name = name
    const t = typeOf(el)
    if (el.localName === 'input') rec.type = t
    else if (el.localName === 'select') rec.type = el.multiple ? 'select-multiple' : 'select-one'
    else if (el.localName === 'textarea') rec.type = 'textarea'
    else if (el.localName === 'button') rec.type = String(el.type || 'submit')
    else if (kind.kind === 'contenteditable') rec.type = 'contenteditable'
    const st = stateOf(el, kind)
    Object.assign(rec, st)
    Object.assign(rec, valueOf(el, kind))
    if (el.localName === 'select') { const o = optionRows(el); rec.options = o.rows; if (o.total > o.rows.length) rec.optionsTotal = o.total }
    const c = constraintsOf(el, kind)
    if (Object.keys(c).length) rec.constraints = c
    const v = el.localName === 'button' ? undefined : validityOf(el)
    if (v) rec.validity = v
    rec.actions = actionsFor(el, kind, role, st)
    rec.cands = candidatesFor(el, role, name)
    return rec
  }

  const buildRadioGroup = (item) => {
    const members = item.members
    const first = members[0]
    const frame = item.frame
    const rec = { source: 'dom', path: frame.path, role: 'radiogroup', type: 'radio' }
    // The group is named by its fieldset legend or role=radiogroup label, else by its name attribute.
    let name = ''
    const fs = first.closest ? first.closest('fieldset') : null
    if (fs && fs.querySelector('legend')) name = norm(fs.querySelector('legend').innerText || fs.querySelector('legend').textContent)
    if (!name) { const rg = first.closest ? first.closest('[role=radiogroup]') : null; if (rg) name = norm(attr(rg, 'aria-label') || (attr(rg, 'aria-labelledby') ? idText(rg, attr(rg, 'aria-labelledby')) : '')) }
    if (!name) name = attr(first, 'name') || ''
    if (name) rec.name = cut(name, 200)
    rec.visible = members.some((m) => isVisible(m))
    const dis = members.every((m) => m.matches(':disabled'))
    rec.disabled = dis
    rec.options = members.map((m) => {
      const mrole = 'radio'
      const mname = nameOf(m, mrole)
      const row = { id: numbered(m, frame.win), label: cut(mname, 200), value: cut(String(m.value), 200), checked: !!m.checked, cands: candidatesFor(m, mrole, mname) }
      if (m.matches(':disabled')) row.disabled = true
      return row
    })
    const c = constraintsOf(first, item.kind)
    if (Object.keys(c).length) rec.constraints = c
    const v = validityOf(first)
    if (v) rec.validity = v
    rec.actions = rec.visible && !dis ? ['check'] : []
    return rec
  }

  const buildLink = (el, frame) => {
    const rec = { id: numbered(el, frame.win), path: frame.path }
    rec.text = nameOf(el, 'link')
    let href = ''
    try { href = typeof el.href === 'string' ? el.href : String(el.href && el.href.baseVal || '') } catch (e) {}
    rec.href = cut(href || attr(el, 'href') || '', 500)
    rec.visible = isVisible(el)
    if (attr(el, 'target') === '_blank') rec.target = '_blank'
    rec.cands = candidatesFor(el, 'link', rec.text)
    return rec
  }

  // ---- tables ----
  const cells = (row) => Array.from(row.cells || []).map((c) => cut(norm(c.innerText || c.textContent), 120))
  const ariaCells = (row) => Array.from(row.querySelectorAll('[role=gridcell],[role=cell],[role=rowheader],[role=columnheader]')).map((c) => cut(norm(c.innerText || c.textContent), 120))
  const PAGER = /^(next|next page|older|more|load more|show more|›|»|>|下一页|下页|更多)$/i
  const paginationNear = (t) => {
    const scopes = []
    let cur = t
    // An ancestor counts only while this table is the only one in it; otherwise a pager belongs to some other table.
    const tablesIn = (n) => n.querySelectorAll('table, [role=table], [role=grid], [role=treegrid]').length
    for (let i = 0; i < 3 && cur; i++) { cur = cur.parentElement; if (cur && tablesIn(cur) === 1) scopes.push(cur); else break }
    if (t.nextElementSibling && tablesIn(t.nextElementSibling) === 0) scopes.push(t.nextElementSibling)
    if (t.previousElementSibling && tablesIn(t.previousElementSibling) === 0) scopes.push(t.previousElementSibling)
    for (const s of scopes) {
      let hit = null
      try { hit = s.querySelector('[aria-label*="agination" i], nav.pagination, .pagination, [class*="pagination" i], [data-pagination], [rel="next"]') } catch (e) {}
      if (s.matches && s.matches('[aria-label*="agination" i], .pagination, [class*="pagination" i]')) hit = s
      if (hit && !t.contains(hit)) return 'pagination controls found next to the table'
      for (const b of s.querySelectorAll('a, button, [role=button]')) {
        if (t.contains(b)) continue
        if (PAGER.test(norm(b.innerText || b.textContent || attr(b, 'aria-label') || ''))) return 'a "' + cut(norm(b.innerText || b.textContent || attr(b, 'aria-label')), 30) + '" control is next to the table'
      }
    }
    return ''
  }
  const buildTable = (t, frame) => {
    const native = t.localName === 'table'
    let headers = []
    let body = []
    let headerRows = 0
    let rowsAll = []
    if (native) {
      rowsAll = Array.from(t.rows)
      const head = rowsAll.filter((r) => r.parentNode && r.parentNode.localName === 'thead')
      if (head.length) { headers = cells(head[head.length - 1]); headerRows = head.length; body = rowsAll.filter((r) => head.indexOf(r) < 0) }
      else if (rowsAll.length && rowsAll[0].cells.length && Array.from(rowsAll[0].cells).every((c) => c.localName === 'th')) { headers = cells(rowsAll[0]); headerRows = 1; body = rowsAll.slice(1) }
      else body = rowsAll
    } else {
      rowsAll = Array.from(t.querySelectorAll('[role=row]'))
      const head = rowsAll.filter((r) => r.querySelector('[role=columnheader]') && !r.querySelector('[role=gridcell],[role=cell]'))
      if (head.length) { headers = ariaCells(head[0]); headerRows = head.length }
      body = rowsAll.filter((r) => head.indexOf(r) < 0)
    }
    const rec = { id: numbered(t, frame.win), path: frame.path, headers, totalRows: body.length, coverage: 'complete' }
    const role = native ? 'table' : explicitRole(t)
    const name = nameOf(t, role) || (attr(t, 'aria-label') || '')
    if (name) rec.name = cut(name, 200)
    rec.rows = body.slice(0, MAX).map((r) => (native ? cells(r) : ariaCells(r)))
    const reasons = []
    const declared = has(t, 'aria-rowcount') ? Number(attr(t, 'aria-rowcount')) : undefined
    if (declared === -1) { reasons.push('row count unknown (aria-rowcount=-1): the list is loaded in pieces'); }
    else if (declared !== undefined && Number.isFinite(declared) && declared > body.length + headerRows) { rec.declaredRows = declared - headerRows; reasons.push('virtualized: aria-rowcount says ' + declared + ' rows, ' + (body.length + headerRows) + ' are in the DOM') }
    const idx = body.map((r) => Number(attr(r, 'aria-rowindex'))).filter((n) => Number.isFinite(n))
    if (idx.length && !reasons.length && Math.min.apply(null, idx) > headerRows + 1) reasons.push('virtualized: the first rendered row is aria-rowindex ' + Math.min.apply(null, idx))
    const pager = paginationNear(t)
    if (pager) reasons.push('paginated: ' + pager + '; this is one page of the data')
    if (reasons.length) { rec.coverage = 'partial'; rec.reason = reasons.join('; ') }
    rec.cands = []
    if (name) rec.cands.push({ role: role || 'table', name, exact: true })
    const tid = attr(t, 'data-testid'); if (tid) rec.cands.push({ testId: tid })
    if (t.id) rec.cands.push({ selector: '#' + cssId(t.id) })
    return rec
  }

  const ARIA_TABLE = new Set(['table', 'grid', 'treegrid'])

  // ---- the scan ----
  const handle = (el, frame) => {
    const tag = el.localName
    if (tag === 'iframe' || tag === 'frame') { if (opts.controls || opts.links || opts.tables) enterFrame(el, frame); return }
    if (opts.controls) {
      const kind = classify(el)
      if (kind && inRegion(el, frame)) {
        if (kind.kind === 'input' && typeOf(el) === 'radio' && attr(el, 'name')) {
          const rootNode = el.getRootNode()
          let groups = radioGroups.get(rootNode)
          if (!groups) { groups = new Map(); radioGroups.set(rootNode, groups) }
          if (el.form && !formIds.has(el.form)) formIds.set(el.form, nextForm++)
          const key = (el.form ? 'f' + formIds.get(el.form) : '') + '|' + attr(el, 'name') + '|' + frame.path.join('>')
          const existing = groups.get(key)
          if (existing) existing.members.push(el)
          else { const it = { el, kind, frame, group: true, members: [el] }; groups.set(key, it); items.push(it) }
        } else items.push({ el, kind, frame })
      }
    }
    if (opts.links && (tag === 'a' || tag === 'area') && has(el, 'href') && inRegion(el, frame)) {
      out.counts.links++
      if (out.links.length < MAX) out.links.push(buildLink(el, frame))
    }
    if (opts.tables && (tag === 'table' || (explicitRole(el) && ARIA_TABLE.has(explicitRole(el)))) && inRegion(el, frame)) {
      out.counts.tables++
      if (out.tables.length < MAX) out.tables.push(buildTable(el, frame))
    }
  }
  const scan = (start, frame) => {
    const stack = [start]
    while (stack.length) {
      const el = stack.pop()
      if (!isEl(el)) continue
      handle(el, frame)
      const kids = el.children
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
      if (el.shadowRoot) {
        out.shadowRoots++
        const sk = el.shadowRoot.children
        for (let i = sk.length - 1; i >= 0; i--) stack.push(sk[i])
      }
    }
  }

  const topDoc = root.nodeType === 9 ? root : root.ownerDocument
  const frame0 = { path: [], doc: topDoc, win: topDoc.defaultView, ox: 0, oy: 0, roots: null }
  if (root.nodeType === 9) { if (root.documentElement) scan(root.documentElement, frame0) } else scan(root, frame0)

  out.counts.controls = items.length
  for (const it of items.slice(0, MAX)) out.controls.push(buildControl(it))
  return out
}`
