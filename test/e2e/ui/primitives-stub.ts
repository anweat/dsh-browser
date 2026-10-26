// Stand-in for @deepseek-ai/dsh-client-ui-primitives in the UI bundles (the Chromium e2e and the server-rendered card
// test). The Host's components are not what these tests are about; what the stubs keep faithful is what the card
// decides and what a person (or a test) can observe of it:
//   - Switch is a labelled checkbox with role=switch, so its state and accessible name are real;
//   - Button passes its attributes through; Tag is a span carrying its tone;
//   - Modal renders its children (and the footer) in place, only while it is open, with role=dialog and its title as
//     the accessible name, and closes on its close button;
//   - Tooltip puts its label in a `title`, so a test can read what the `?` button would say;
//   - SettingsValueField renders its label tied to its input by id, as the real one does.
import { Children, cloneElement, createElement, forwardRef, isValidElement, type ReactElement, type ReactNode } from 'react'

export const SettingsForm = ({ children }: { children?: ReactNode }) => children ?? null
export const SettingsValueField = (props: { id: string; label: string; hint?: string; text: string; invalid: boolean; invalidLabel: string; disabled: boolean }) =>
  createElement('div', { 'data-dsh-field': props.id },
    createElement('label', { htmlFor: props.id }, props.label),
    createElement('input', { id: props.id, type: 'text', defaultValue: props.text, disabled: props.disabled, ...props.invalid ? { 'aria-invalid': true } : {} }),
    createElement('p', null, props.invalid ? props.invalidLabel : props.hint ?? ''))
export const settingsTextField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'string' ? value : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() } })
export const settingsNumberField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'number' ? String(value) : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(text) } })

// The staged-edit model, mirroring @deepseek-ai/dsh-client-ui-primitives' SettingsFormModel (the same behavior the
// controller tests stand it in with): a draft is staged per field, a field is overridden by its presence in the user
// layer, a save is one `mutate(ops, revision)`, and a save that did not land keeps its drafts.
export class SettingsFormModel {
  scope: any; specs: Map<string, any>; staged = new Map<string, { text: string; clear: boolean }>(); listeners = new Set<() => void>()
  baseline: any = undefined; saving = false; failed = false; unsubscribe: (() => void) | undefined
  constructor(scope: any, specs: any[]) { this.scope = scope; this.specs = new Map(specs.map(spec => [spec.field, spec])); this.unsubscribe = scope.subscribe(() => this.publish()) }
  publish() { for (const listener of this.listeners) listener() }
  bind(project: () => unknown) {
    let snapshot = project()
    this.listeners.add(() => { snapshot = project(); for (const listener of storeListeners) listener() })
    const storeListeners = new Set<() => void>()
    return { getSnapshot: () => snapshot, subscribe(listener: () => void) { storeListeners.add(listener); return () => { storeListeners.delete(listener) } } }
  }
  shell() {
    const snap = this.scope.getSnapshot()
    const plan = this.plan()
    return { available: snap.status === 'ready', writable: snap.writable, dirty: plan.length > 0, invalid: plan.some((item: any) => item.write === undefined && !item.clear), saving: this.saving, failed: this.failed }
  }
  field(field: string) {
    const spec = this.specs.get(field)
    if (!spec) throw new Error(`plugin card has no field ${field}`)
    const draft = this.staged.get(field)
    if (!draft) return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    const write = draft.clear ? { kind: 'clear' } : spec.parse(draft.text)
    return { text: draft.text, overridden: write?.kind === 'set', invalid: write === undefined }
  }
  actions() {
    const stage = (field: string, edit: { text: string; clear: boolean }) => { this.baseline ??= this.scope.getSnapshot(); this.staged.set(field, edit); this.failed = false; this.publish() }
    return {
      edit: (field: string, text: string) => stage(field, { text, clear: false }),
      resetField: (field: string) => stage(field, { text: this.specs.get(field).format(this.baseValue(field)), clear: true }),
      save: () => { void this.save() },
      discard: () => { if (this.staged.size === 0 && !this.failed) return; this.staged.clear(); this.baseline = undefined; this.failed = false; this.publish() },
    }
  }
  async save() {
    const plan = this.plan()
    if (this.saving || plan.length === 0 || plan.some((item: any) => item.write === undefined && !item.clear)) return
    this.saving = true; this.failed = false; this.publish()
    const ops = plan.map((item: any) => item.clear || item.write.kind === 'clear' ? { op: 'unset', path: [item.field] } : { op: 'set', path: [item.field], value: item.write.value })
    let landed = false
    try { landed = await this.scope.mutate(ops, this.baseline?.revision) } catch { landed = false }
    if (landed) { this.staged.clear(); this.baseline = undefined }
    this.saving = false; this.failed = !landed; this.publish()
  }
  plan(): { field: string; write?: any; clear?: boolean }[] {
    const out: { field: string; write?: any; clear?: boolean }[] = []
    for (const [field, draft] of this.staged) {
      const spec = this.specs.get(field)
      if (draft.clear) { if (this.stored(field)) out.push({ field, clear: true }); continue }
      if (draft.text === spec.format(this.sectionValue(field))) continue
      out.push({ field, write: spec.parse(draft.text) })
    }
    return out
  }
  sectionValue(field: string) { return this.scope.getSnapshot().value?.[field] }
  baseValue(field: string) { return this.scope.getSnapshot().base?.[field] }
  stored(field: string) { const user = this.scope.getSnapshot().user; return user !== undefined && Object.hasOwn(user, field) }
  dispose() { this.unsubscribe?.(); this.listeners.clear() }
}

/** A fake settings scope over plain objects: what the Host's configuration form for the entry reports, plus the writes it was asked for. */
export function fakeScope(initial: { value?: Record<string, unknown>; base?: Record<string, unknown>; user?: Record<string, unknown>; writable?: boolean; accept?: boolean } = {}) {
  const state = { value: initial.value ?? {}, base: initial.base ?? {}, user: initial.user ?? {}, writable: initial.writable ?? true, revision: 1 }
  const listeners = new Set<() => void>()
  const writes: { ops: readonly any[]; revision: number | undefined }[] = []
  return {
    writes,
    getSnapshot: () => ({ status: 'ready' as const, value: state.value, base: state.base, user: state.user, writable: state.writable, revision: state.revision }),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async mutate(ops: readonly any[], revision?: number) {
      writes.push({ ops, revision })
      if (initial.accept === false) return false
      // The Host accepts the write: the user layer and the resolved value now carry it.
      const user = { ...state.user }, value = { ...state.value }
      for (const op of ops) {
        const key = op.path[0]
        if (op.op === 'set') { user[key] = op.value; value[key] = op.value } else { delete user[key]; if (key in state.base) value[key] = state.base[key]; else delete value[key] }
      }
      state.user = user; state.value = value; state.revision += 1
      for (const listener of listeners) listener()
      return true
    },
  }
}

export const Button = forwardRef<HTMLButtonElement, Record<string, unknown>>(function Button({ variant, size, icon, children, ...rest }, ref) {
  void icon
  return createElement('button', { ref, 'data-variant': variant, 'data-size': size, ...rest }, children as ReactNode)
})
export const Switch = (props: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) =>
  createElement('input', { type: 'checkbox', role: 'switch', 'aria-label': props.label, checked: props.checked, disabled: props.disabled, onChange: (event: { currentTarget: HTMLInputElement }) => props.onChange(event.currentTarget.checked) })
export const Tag = (props: { tone?: string; children?: ReactNode }) => createElement('span', { 'data-tag': props.tone ?? 'outline' }, props.children)
export const Tooltip = (props: { label: string | (() => string); children: ReactElement }) => {
  const only = Children.only(props.children)
  return isValidElement(only) ? cloneElement(only as ReactElement<Record<string, unknown>>, { title: typeof props.label === 'function' ? props.label() : props.label }) : only
}
export const Modal = (props: { open: boolean; onClose: () => void; title: string; closeLabel?: string; description?: string; children?: ReactNode; footer?: ReactNode; className?: string }) =>
  props.open
    ? createElement('div', { role: 'dialog', 'aria-modal': true, 'aria-label': props.title, className: props.className },
      createElement('h2', null, props.title),
      createElement('button', { type: 'button', 'aria-label': props.closeLabel, onClick: props.onClose }, '×'),
      props.description ? createElement('p', null, props.description) : null,
      createElement('div', null, props.children),
      props.footer ? createElement('div', null, props.footer) : null)
    : null
export const SegmentedControl = (props: { id: string; value: string; options: { value: string; label: string; disabled?: boolean }[]; onChange: (next: string) => void; label: string; disabled?: boolean }) =>
  createElement('div', { role: 'tablist', 'aria-label': props.label },
    props.options.map(option => createElement('button', { key: option.value, type: 'button', role: 'tab', id: `${props.id}-${option.value}`, 'aria-selected': option.value === props.value, disabled: props.disabled || option.disabled, onClick: () => { if (option.value !== props.value) props.onChange(option.value) } }, option.label)))
