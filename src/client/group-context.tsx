/**
 * "Page environment": what every new browser context starts from (viewport, user agent, language, time zone, proxy).
 * The agent copies these for a task and changes only what the task needs, so they are plain defaults here.
 *
 * Conditional rows (the custom size, the proxy address) exist only while they apply; the settings are still in the
 * configuration when hidden, which is what lets the render test count every public field exactly once.
 * @module dsh-browser/client/group-context
 */

import { useState } from 'react'
import { controlId, fill, NumberRow, rowLabels, SelectRow, TextRow, useField, useOverriddenCount, type Card } from './field-rows.tsx'
import { Badge, Chips, Group, Row, Select, TextInput, Toggle } from './ui-kit.tsx'

export const CONTEXT_FIELDS = ['viewportMode', 'viewportWidth', 'viewportHeight', 'userAgent', 'locale', 'timezoneId', 'proxyServer', 'proxyBypass'] as const

/** Common user agents; the browser's own is the empty one. Version numbers are examples: a site that checks them needs the custom entry. */
export const USER_AGENT_PRESETS = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
} as const

export const LOCALE_SUGGESTIONS = ['en-US', 'en-GB', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ru-RU'] as const
const TIMEZONE_FALLBACK = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles']
const CUSTOM = '__custom__'

function timeZones(): readonly string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
    if (list && list.length) return list
  } catch { /* use the short list */ }
  return TIMEZONE_FALLBACK
}

/** A preset drop-down over the user agent, with a free input when none of the presets is wanted. */
function UserAgentRow({ card }: { card: Card }) {
  const { t } = card
  const field = useField(card, 'userAgent')
  const [forceCustom, setForceCustom] = useState(false)
  const presets = [['', t('uaDefault')], [USER_AGENT_PRESETS.chromeMac, t('uaChromeMac')], [USER_AGENT_PRESETS.chromeWin, t('uaChromeWin')], [USER_AGENT_PRESETS.iphone, t('uaIphone')]] as const
  const text = field.state.text
  const known = presets.some(([value]) => value === text)
  const custom = forceCustom || !known
  const selected = custom ? CUSTOM : text
  const id = controlId('userAgent')
  return <Row field="userAgent" id={id} label={t('userAgent')} hint={t('userAgentHint')} help={t('userAgentHelp')} overridden={field.state.overridden} invalid={field.state.invalid} problem={t('invalid')}
    disabled={field.disabled} labels={rowLabels(t)} onReset={() => { setForceCustom(false); field.reset() }}>
    <Select id={id} value={selected} muted={!field.state.overridden} invalid={field.state.invalid} disabled={field.disabled}
      options={[...presets.map(([value, label]) => ({ value: value || '__default__', label })), { value: CUSTOM, label: t('uaCustom') }]}
      onChange={value => {
        if (value === CUSTOM) { setForceCustom(true); return }
        setForceCustom(false)
        field.edit(value === '__default__' ? '' : value)
      }} />
    {custom ? <TextInput ariaLabel={t('userAgent')} value={text} placeholder={t('uaCustomPlaceholder')} disabled={field.disabled} invalid={field.state.invalid} code onChange={field.edit} /> : null}
  </Row>
}

/** The proxy switch decides whether the address and bypass rows exist; turning it off clears both settings. */
function ProxyRows({ card }: { card: Card }) {
  const { t } = card
  const server = useField(card, 'proxyServer')
  const bypass = useField(card, 'proxyBypass')
  const [enabledByHand, setEnabledByHand] = useState(false)
  const on = enabledByHand || server.state.text !== ''
  const hosts = bypass.state.text.split(',').map(entry => entry.trim()).filter(Boolean)
  return <>
    <Row label={t('proxyEnabled')} hint={t('proxyEnabledHint')} help={t('proxyEnabledHelp')} labels={rowLabels(t)} inline>
      <Toggle label={t('proxyEnabled')} checked={on} disabled={server.disabled}
        onChange={next => {
          setEnabledByHand(next)
          if (!next) { server.edit(''); bypass.edit('') }
        }} />
    </Row>
    {on ? <>
      <TextRow card={card} name="proxyServer" placeholder="http://127.0.0.1:7890" code />
      <Row field="proxyBypass" id={controlId('proxyBypass')} label={t('proxyBypass')} hint={t('proxyBypassHint')} help={t('proxyBypassHelp')} overridden={bypass.state.overridden} invalid={bypass.state.invalid} problem={t('invalid')}
        disabled={bypass.disabled} labels={rowLabels(t)} onReset={bypass.reset}>
        <Chips id={controlId('proxyBypass')} values={hosts} disabled={bypass.disabled} placeholder={t('proxyBypassPlaceholder')} addLabel={t('proxyBypass')} removeLabel={t('remove')}
          onChange={next => bypass.edit(next.join(','))} />
      </Row>
    </> : null}
  </>
}

export function ContextGroup({ card }: { card: Card }) {
  const { t } = card
  const count = useOverriddenCount(card, CONTEXT_FIELDS)
  const mode = card.useBrowserSettings(snapshot => snapshot.fields.viewportMode.text)
  return <Group id="context" title={t('groupContext')} summary={t('groupContextSub')} badges={count ? <Badge tone="info">{fill(t('overriddenCount'), { n: count })}</Badge> : null}>
    <SelectRow card={card} name="viewportMode" options={[
      { value: 'window', label: t('viewportWindow') }, { value: '720p', label: t('viewport720') }, { value: '1080p', label: t('viewport1080') }, { value: 'custom', label: t('viewportCustom') },
    ]} />
    {mode === 'custom' ? <>
      <NumberRow card={card} name="viewportWidth" unit="px" placeholder="1280" />
      <NumberRow card={card} name="viewportHeight" unit="px" placeholder="720" />
    </> : null}
    <UserAgentRow card={card} />
    <TextRow card={card} name="locale" listId="dsb-locales" placeholder="en-US" />
    <datalist id="dsb-locales">{LOCALE_SUGGESTIONS.map(value => <option key={value} value={value} />)}</datalist>
    <TextRow card={card} name="timezoneId" listId="dsb-timezones" placeholder="Asia/Shanghai" />
    <datalist id="dsb-timezones">{timeZones().map(value => <option key={value} value={value} />)}</datalist>
    <ProxyRows card={card} />
  </Group>
}
