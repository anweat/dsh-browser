/**
 * Rows for the configuration fields the groups edit, wired to the card's staged form state.
 *
 * One component per control kind (switch, select, text, number). Each is the single entry of its field: it renders
 * `data-dsb-field="<name>"`, which test/settings-card-render.test.ts counts, and it reads the label, the one-line hint
 * and the optional `?` text from the dictionary by the field's name (`<name>`, `<name>Hint`, `<name>Help`).
 * @module dsh-browser/client/field-rows
 */

import type { ReactNode } from 'react'
import type { BrowserSettingsCardProps } from './index.ts'
import type { BrowserCardState, CardFieldState } from './form.ts'
import { Row, Select, TextInput, Toggle, UnitInput, type RowLabels, type SelectOption } from './ui-kit.tsx'

export type Card = BrowserSettingsCardProps
export type Translator = Card['t']
export type LabelKey = Parameters<Translator>[0]

/** Fill `{name}` placeholders of a dictionary entry. */
export const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''))

/** The words every row shares. */
export function rowLabels(t: Translator): RowLabels {
  return { overridden: t('overridden'), reset: t('reset'), help: t('helpLabel'), invalid: t('invalid') }
}

/** The id of a field's control, tied to its label. */
export const controlId = (name: string): string => `plugin-config-dsh-browser-${name}`

/** The names that have a `?` text of their own in the dictionary. */
const WITH_HELP: ReadonlySet<string> = new Set([
  'automationMode', 'toolSurface', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort', 'maxSessions', 'args', 'snapshotDir', 'storageStatePath',
  'viewportMode', 'userAgent', 'locale', 'timezoneId', 'proxyServer', 'proxyBypass', 'downloadDir', 'downloadMaxBytes', 'allowPrivateHosts', 'authProfiles', 'usagePolicy', 'automationAssets',
])

export interface FieldProps {
  card: Card
  name: string
  /** Replaces the dictionary's hint; a function receives the field's current text (for a hint that depends on the value). */
  hint?: string | ((text: string) => string)
  /** Text shown when the field has no value of its own (the default in force), as the input's placeholder. */
  placeholder?: string
  /** Skip the label/hint lookup by name: the row is labelled by these. */
  label?: string
}

/** How many of these fields carry an override: the number a group's badge shows. */
export function useOverriddenCount(card: Card, names: readonly string[]): number {
  return card.useBrowserSettings(snapshot => names.filter(name => stateOf(snapshot, name)?.overridden).length)
}

/** A field's staged state, whether it is a single-input field or one of the JSON-shaped ones (launch arguments, policies). */
export function stateOf(snapshot: BrowserCardState, name: string): CardFieldState | undefined {
  return snapshot.fields[name as keyof typeof snapshot.fields] ?? snapshot.jsonFields[name]
}

/** Read one single-input field's staged state. */
export function useField(card: Card, name: string) {
  const state = card.useBrowserSettings(snapshot => stateOf(snapshot, name)!)
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  const problem = card.useBrowserSettings(snapshot => snapshot.problems?.[name])
  return { state, disabled, problem, edit: (text: string) => card.edit(name, text), reset: () => card.resetField(name) }
}

function rowFor(props: FieldProps, field: ReturnType<typeof useField>, children: ReactNode, extra: { id?: string; inline?: boolean; wide?: boolean; problem?: string } = {}) {
  const { card, name } = props
  const { t } = card
  return <Row field={name} id={extra.id} label={props.label ?? t(name as LabelKey)} hint={typeof props.hint === 'function' ? props.hint(field.state.text) : props.hint ?? t(`${name}Hint` as LabelKey)}
    help={WITH_HELP.has(name) ? t(`${name}Help` as LabelKey) : undefined}
    overridden={field.state.overridden} invalid={field.state.invalid || !!field.problem} problem={extra.problem ?? field.problem ?? t('invalid')} disabled={field.disabled}
    labels={rowLabels(t)} onReset={field.reset} inline={extra.inline} wide={extra.wide}>{children}</Row>
}

/** A boolean field as a switch. */
export function SwitchRow(props: FieldProps) {
  const field = useField(props.card, props.name)
  const label = props.label ?? props.card.t(props.name as LabelKey)
  return rowFor(props, field, <Toggle label={label} checked={field.state.text === 'true'} disabled={field.disabled} onChange={next => field.edit(String(next))} />, { inline: true })
}

/** An enumerated field as a drop-down. */
export function SelectRow(props: FieldProps & { options: readonly SelectOption[] }) {
  const field = useField(props.card, props.name)
  const id = controlId(props.name)
  return rowFor(props, field, <Select id={id} value={field.state.text} options={props.options} disabled={field.disabled} muted={!field.state.overridden} invalid={field.state.invalid || !!field.problem} onChange={field.edit} />, { id })
}

/** A free-text field. `listId` names a `<datalist>` of suggestions rendered by the caller. */
export function TextRow(props: FieldProps & { listId?: string; code?: boolean }) {
  const field = useField(props.card, props.name)
  const id = controlId(props.name)
  return rowFor(props, field, <TextInput id={id} value={field.state.text} placeholder={props.placeholder} list={props.listId} code={props.code} disabled={field.disabled} muted={!field.state.overridden} invalid={field.state.invalid || !!field.problem} onChange={field.edit} />, { id })
}

/** A whole-number field with its unit written after the input. */
export function NumberRow(props: FieldProps & { unit?: string }) {
  const field = useField(props.card, props.name)
  const id = controlId(props.name)
  const input = props.unit
    ? <UnitInput id={id} value={field.state.text} unit={props.unit} placeholder={props.placeholder} disabled={field.disabled} muted={!field.state.overridden} invalid={field.state.invalid || !!field.problem} onChange={field.edit} />
    : <TextInput id={id} value={field.state.text} placeholder={props.placeholder} numeric disabled={field.disabled} muted={!field.state.overridden} invalid={field.state.invalid || !!field.problem} onChange={field.edit} />
  return rowFor(props, field, input, { id })
}
