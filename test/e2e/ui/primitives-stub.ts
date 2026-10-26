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
export class SettingsFormModel {}

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
