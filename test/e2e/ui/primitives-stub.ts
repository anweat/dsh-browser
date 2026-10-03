// Stand-in for @deepseek-ai/dsh-client-ui-primitives in the UI bundles (the Chromium e2e and the server-rendered card
// test). The form chrome is the platform's; what this stub keeps faithful is what the card decides: SettingsValueField
// renders its label tied to its input by id, exactly as the real component does, so the card's field list and the
// accessible names of its controls are observable in the rendered output.
import { createElement, type ReactNode } from 'react'

export const SettingsForm = ({ children }: { children?: ReactNode }) => children ?? null
export const SettingsValueField = (props: { id: string; label: string; hint?: string; text: string; invalid: boolean; invalidLabel: string; disabled: boolean }) =>
  createElement('div', { 'data-dsh-field': props.id },
    createElement('label', { htmlFor: props.id }, props.label),
    createElement('input', { id: props.id, type: 'text', defaultValue: props.text, disabled: props.disabled, ...props.invalid ? { 'aria-invalid': true } : {} }),
    createElement('p', null, props.invalid ? props.invalidLabel : props.hint ?? ''))
export const settingsTextField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'string' ? value : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() } })
export const settingsNumberField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'number' ? String(value) : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(text) } })
export class SettingsFormModel {}
