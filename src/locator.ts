/**
 * One locator contract for atomic actions and v2 recipe steps.
 *
 * A locator is strict by default: it must match exactly one element. When it
 * matches several, the step is not performed and the caller gets
 * {@link LocatorAmbiguousError} with a short summary of the first candidates, so
 * the model can tell which element it meant instead of acting on whichever one
 * happened to come first. Choosing one anyway takes an explicit `index` with an
 * `indexReason`; `explicitFirst` is the marker a v1 migration leaves behind for
 * "this used to be `.first()`".
 * @module dsh-browser/locator
 */

export interface BrowserFrameSpec {
  selector?: string
  name?: string
  url?: string
}

export interface BrowserLocatorSpec {
  /** CSS selector. `css` is accepted as an alias (the v2 recipe spelling). */
  selector?: string
  css?: string
  role?: string
  name?: string
  text?: string
  label?: string
  testId?: string
  exact?: boolean
  /** Atomic-action iframe: exactly one of selector, name, url. */
  frame?: BrowserFrameSpec
  /** Nested iframes, outermost first, each a CSS selector for an iframe element. */
  framePath?: string[]
  /** Pick the n-th match (0-based). Requires `indexReason`. */
  index?: number
  indexReason?: string
  /** Take the first match without an ambiguity error. Set by the v1 converter; meant to be resolved later. */
  explicitFirst?: boolean
}

export type BrowserTarget = string | BrowserLocatorSpec

/** What one of several matches looks like, enough to choose between them. */
export interface LocatorCandidate {
  index: number
  role: string
  name: string
  text: string
  visible: boolean
}

export interface LocatorAmbiguity {
  total: number
  items: LocatorCandidate[]
}

/** Raised instead of acting when a strict locator matches more than one element. */
export class LocatorAmbiguousError extends Error {
  constructor(message: string, readonly ambiguity: LocatorAmbiguity) {
    super(message)
    this.name = 'LocatorAmbiguousError'
  }
}

/** Where a page stands now: what a stale caller needs to re-bind to it. */
export interface PageGeneration {
  targetId: string
  generation: number
}

/** Raised, before anything is done, when `expectGeneration` is not the page's current generation. */
export class TargetStaleError extends Error {
  constructor(message: string, readonly current: PageGeneration) {
    super(message)
    this.name = 'TargetStaleError'
  }
}

const MODES = ['selector', 'css', 'role', 'text', 'label', 'testId'] as const
const KNOWN_KEYS = new Set<string>([...MODES, 'name', 'exact', 'frame', 'framePath', 'index', 'indexReason', 'explicitFirst'])
const MAX_FRAME_PATH = 5
export const MAX_CANDIDATES = 5

function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new Error(`${label} must contain 1 to ${max} characters`)
  return value
}

/** Check a locator's shape. Throws a message the model can act on; used before resolving and when a recipe is saved. */
export function validateLocatorSpec(spec: unknown, label = 'browser target'): BrowserLocatorSpec {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${label} must be a selector string or locator object`)
  const value = spec as BrowserLocatorSpec
  for (const key of Object.keys(value)) if (!KNOWN_KEYS.has(key)) throw new Error(`${label} has an unsupported field "${key}"; use ${[...KNOWN_KEYS].join(', ')}`)
  const modes = MODES.filter(mode => value[mode] !== undefined)
  if (modes.length !== 1) throw new Error(`${label} requires exactly one of selector (css), role, text, label, or testId`)
  if (value.name !== undefined && value.role === undefined) throw new Error(`${label} name is only valid with role`)
  if (value.exact !== undefined && typeof value.exact !== 'boolean') throw new Error(`${label} exact must be a boolean`)
  if (value.index !== undefined) {
    if (!Number.isInteger(value.index) || value.index < 0 || value.index > 1000) throw new Error(`${label} index must be an integer from 0 to 1000`)
    if (typeof value.indexReason !== 'string' || !value.indexReason.trim()) throw new Error(`${label} index requires indexReason: say why this match and not the others`)
  }
  if (value.indexReason !== undefined && value.index === undefined) throw new Error(`${label} indexReason is only valid with index`)
  if (value.index !== undefined && value.explicitFirst) throw new Error(`${label} cannot combine index and explicitFirst`)
  if (value.explicitFirst !== undefined && typeof value.explicitFirst !== 'boolean') throw new Error(`${label} explicitFirst must be a boolean`)
  if (value.frame !== undefined && value.framePath !== undefined) throw new Error(`${label} cannot combine frame and framePath`)
  if (value.framePath !== undefined) {
    if (!Array.isArray(value.framePath) || value.framePath.length < 1 || value.framePath.length > MAX_FRAME_PATH) throw new Error(`${label} framePath must list 1 to ${MAX_FRAME_PATH} iframe selectors`)
    value.framePath.forEach(entry => bounded(entry, `${label} framePath entry`, 500))
  }
  if (value.frame !== undefined) {
    const frameModes = [value.frame.selector, value.frame.name, value.frame.url].filter(entry => entry !== undefined)
    if (frameModes.length !== 1) throw new Error('browser frame requires exactly one of selector, name, or url')
  }
  return value
}

/**
 * Build the Playwright locator for a target. No `.first()` unless the spec asks
 * for it, so Playwright's own strict-mode check stays in force.
 */
export function resolveLocator(page: any, target: BrowserTarget): any {
  if (!target || (typeof target !== 'string' && typeof target !== 'object')) throw new Error('browser target must be a selector string or locator object')
  const spec = validateLocatorSpec(typeof target === 'string' ? { selector: target } : target)
  let root: any = page
  if (spec.frame) {
    if (spec.frame.selector) root = page.frameLocator(bounded(spec.frame.selector, 'frame selector', 500))
    else {
      const frame = page.frame(spec.frame.name
        ? { name: bounded(spec.frame.name, 'frame name', 500) }
        : { url: bounded(spec.frame.url, 'frame url', 2_000) })
      if (!frame) throw new Error('browser target frame was not found')
      root = frame
    }
  }
  for (const entry of spec.framePath ?? []) root = root.frameLocator(entry)
  const css = spec.selector ?? spec.css
  let locator: any
  if (css !== undefined) locator = root.locator(bounded(css, 'selector', 500))
  else if (spec.role !== undefined) {
    locator = root.getByRole(bounded(spec.role, 'role', 100), {
      ...spec.name !== undefined ? { name: bounded(spec.name, 'role name', 2_000) } : {},
      exact: spec.exact ?? false,
    })
  } else if (spec.text !== undefined) locator = root.getByText(bounded(spec.text, 'text locator', 2_000), { exact: spec.exact ?? false })
  else if (spec.label !== undefined) locator = root.getByLabel(bounded(spec.label, 'label locator', 2_000), { exact: spec.exact ?? false })
  else locator = root.getByTestId(bounded(spec.testId, 'testId', 500))
  if (spec.index !== undefined) return locator.nth(spec.index)
  if (spec.explicitFirst) return locator.first()
  return locator
}

/** Summarize the matches of an ambiguous locator, in the page. A raw string: it must not carry transpiler helpers. */
const SUMMARIZE = `(els) => {
  const implicit = { a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', img: 'img', ul: 'list', ol: 'list', li: 'listitem', nav: 'navigation', main: 'main', table: 'table', form: 'form', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', summary: 'button', dialog: 'dialog' }
  const inputRole = { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', image: 'button', range: 'slider', search: 'searchbox', number: 'spinbutton' }
  const named = ['button', 'link', 'heading', 'menuitem', 'tab', 'option', 'checkbox', 'radio', 'listitem']
  return els.slice(0, ${MAX_CANDIDATES}).map((el, index) => {
    const tag = el.tagName.toLowerCase()
    let role = el.getAttribute('role') || ''
    if (!role) role = tag === 'input' ? (inputRole[(el.getAttribute('type') || 'text').toLowerCase()] || 'textbox') : (implicit[tag] || '')
    const text = String(el.innerText || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ')
    let name = el.getAttribute('aria-label') || ''
    if (!name && el.labels && el.labels.length) name = el.labels[0].innerText || ''
    if (!name) name = el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || ''
    if (!name && named.includes(role)) name = text
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    return { index, role: role || tag, name: String(name).trim().slice(0, 80), text: text.slice(0, 80), visible }
  })
}`

/** The first candidates of a locator, best effort: a failure here must not hide the ambiguity itself. */
export async function describeCandidates(locator: any): Promise<LocatorAmbiguity> {
  let total = 0
  let items: LocatorCandidate[] = []
  try { total = Number(await locator.count()) || 0 } catch { /* keep 0 */ }
  try {
    // Playwright treats a plain string as an expression, not a function; a Function built from the string serializes as one.
    const rows = await locator.evaluateAll(new Function('els', `return (${SUMMARIZE})(els)`))
    if (Array.isArray(rows)) items = rows.slice(0, MAX_CANDIDATES).map((row: any, index: number): LocatorCandidate => ({
      index: typeof row?.index === 'number' ? row.index : index,
      role: String(row?.role ?? ''), name: String(row?.name ?? ''), text: String(row?.text ?? ''), visible: row?.visible !== false,
    }))
  } catch { /* the summary is optional */ }
  return { total: Math.max(total, items.length), items }
}

export function formatCandidates(ambiguity: LocatorAmbiguity): string {
  const rows = ambiguity.items.map(item => `#${item.index} ${item.role}${item.name ? ' ' + JSON.stringify(item.name) : ''}${item.text && item.text !== item.name ? ' text ' + JSON.stringify(item.text) : ''} ${item.visible ? 'visible' : 'hidden'}`)
  return rows.join('; ') + (ambiguity.total > ambiguity.items.length ? `; …${ambiguity.total - ambiguity.items.length} more` : '')
}

function isStrictViolation(error: unknown): boolean {
  return !(error instanceof LocatorAmbiguousError) && /strict mode violation/i.test(error instanceof Error ? error.message : String(error))
}

/**
 * Run an action on a strict locator. If the locator turns out to match several
 * elements, nothing was acted on (Playwright checks before it acts) and the
 * error is upgraded with the candidate summary.
 */
export async function withStrictLocator<T>(locator: any, run: (locator: any) => Promise<T>): Promise<T> {
  try {
    return await run(locator)
  } catch (error) {
    if (!isStrictViolation(error)) throw error
    const ambiguity = await describeCandidates(locator)
    const first = (error instanceof Error ? error.message : String(error)).split('\n')[0]!
    throw new LocatorAmbiguousError(
      `Locator matched ${ambiguity.total || 'more than one'} elements, so nothing was done. Candidates: ${formatCandidates(ambiguity) || '(unavailable)'}. Make the locator unique (role+name, exact, label, testId, frame), or pass index with indexReason. [${first}]`,
      ambiguity,
    )
  }
}
