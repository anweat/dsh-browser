/**
 * "Browser": which engine runs and how. Four everyday choices up front; the rest folded under "Advanced".
 * @module dsh-browser/client/group-browser
 */

import { controlId, fill, NumberRow, SelectRow, SwitchRow, TextRow, rowLabels, useField, useOverriddenCount, type Card } from './field-rows.tsx'
import { Badge, Chips, Fold, Group, Row } from './ui-kit.tsx'

export const BROWSER_FIELDS = ['browserRuntime', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort', 'maxSessions', 'args', 'snapshotDir', 'verbose'] as const

/** The Chromium launch arguments as chips; the staged text is a JSON array (or empty). */
function ArgsRow({ card }: { card: Card }) {
  const { t } = card
  const field = useField(card, 'args')
  let values: string[] = []
  try {
    const parsed = field.state.text.trim() === '' ? [] : JSON.parse(field.state.text) as unknown
    if (Array.isArray(parsed)) values = parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch { /* shown as invalid by the row */ }
  return <Row field="args" id={controlId('args')} label={t('args')} hint={t('argsHint')} help={t('argsHelp')} overridden={field.state.overridden} invalid={field.state.invalid} problem={t('invalid')}
    disabled={field.disabled} labels={rowLabels(t)} onReset={field.reset}>
    <Chips id={controlId('args')} values={values} disabled={field.disabled} placeholder={t('argsPlaceholder')} addLabel={t('args')} removeLabel={t('remove')}
      onChange={next => field.edit(next.length ? JSON.stringify(next) : '')} />
  </Row>
}

export function BrowserGroup({ card }: { card: Card }) {
  const { t } = card
  const count = useOverriddenCount(card, BROWSER_FIELDS)
  return <Group id="browser" title={t('groupBrowser')} summary={t('groupBrowserSub')} badges={count ? <Badge tone="info">{fill(t('overriddenCount'), { n: count })}</Badge> : null}>
    <SelectRow card={card} name="browserRuntime" options={[{ value: 'playwright', label: 'playwright' }, { value: 'patchright', label: 'patchright' }]} />
    <SelectRow card={card} name="channel" options={[{ value: 'chromium', label: 'chromium' }, { value: 'chrome', label: 'chrome' }, { value: 'msedge', label: 'msedge' }]} />
    <SwitchRow card={card} name="headless" />
    <SwitchRow card={card} name="autoInstall" />
    <Fold id="browser-advanced" title={t('browserAdvanced')} hint={t('browserAdvancedHint')}>
      <TextRow card={card} name="executablePath" code />
      <NumberRow card={card} name="cdpPort" />
      <NumberRow card={card} name="maxSessions" />
      <ArgsRow card={card} />
      <TextRow card={card} name="snapshotDir" code />
      <SwitchRow card={card} name="verbose" />
    </Fold>
  </Group>
}
