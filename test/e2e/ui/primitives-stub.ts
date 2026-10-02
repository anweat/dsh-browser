// Stand-in for @deepseek-ai/dsh-client-ui-primitives in the UI e2e bundle: the asset panel does not use the
// settings form chrome, only form.ts imports these names at load time.
import type { ReactNode } from 'react'
export const SettingsForm = ({ children }: { children?: ReactNode }) => children ?? null
export const SettingsValueField = () => null
export const settingsTextField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'string' ? value : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() } })
export const settingsNumberField = (field: string) => ({ field, format: (value: unknown) => typeof value === 'number' ? String(value) : '', parse: (text: string) => text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(text) } })
export class SettingsFormModel {}
