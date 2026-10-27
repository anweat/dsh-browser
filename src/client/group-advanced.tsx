/**
 * "Advanced: text mode": the default parameters as one commented `key = value` text, for people who prefer to read and
 * edit them that way. It is a view of the controls above, not a second place the settings live: editing the text stages
 * the same fields, and editing a control prints the text again. Every key has a comment in front of it (what it is for,
 * the allowed values, the default, the risk); comment lines are ignored when the text is read.
 * @module dsh-browser/client/group-advanced
 */

import { useEffect, useState } from 'react'
import { CONFIG_FILE_ONLY_FIELDS } from './form.ts'
import { rowLabels, type Card, type LabelKey } from './field-rows.tsx'
import { styles as css } from './styles.ts'
import { Btn, Group, Row } from './ui-kit.tsx'

/** A public field the card has no form for, on purpose: its name, what it is for, and where to edit it. */
function ConfigFileNote({ card, name }: { card: Card; name: string }) {
  const { t } = card
  return <div className={css.field} data-dsh-browser-config-note={name}>
    <div className={css.fieldHead}><span className={css.label}>{t(name as LabelKey)}</span></div>
    <p className={css.hint}>{t(`${name}Hint` as LabelKey)} {t('configFileOnly')}</p>
  </div>
}

export function AdvancedGroup({ card }: { card: Card }) {
  const { t } = card
  const view = card.useBrowserSettings(snapshot => snapshot.properties)
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  const [copied, setCopied] = useState(false)
  const lang = t('lang')
  const { setPropertyLanguage } = card
  useEffect(() => { setPropertyLanguage(lang) }, [lang, setPropertyLanguage])
  const errors = view.issues.filter(issue => issue.level === 'error')
  const warnings = view.issues.filter(issue => issue.level === 'warning')
  const id = 'plugin-config-dsh-browser-properties'
  return <Group id="advanced" title={t('groupAdvanced')} summary={t('groupAdvancedSub')}>
    <div className={css.stack} data-dsh-browser-properties>
      <Row id={id} label={t('propertiesEditor')} hint={t('advancedHint')} labels={rowLabels(t)} wide>
        <textarea id={id} className={`${css.input} ${css.textarea} ${css.code} ${errors.length ? css.invalidInput : ''}`} rows={26} spellCheck={false} data-dsb-mirror
          disabled={disabled} aria-invalid={errors.length > 0 || undefined} value={view.text} onChange={event => { setCopied(false); card.editProperties(event.currentTarget.value) }} />
        {errors.length ? <ul className={css.failed} role="alert" data-dsh-browser-properties-errors>{errors.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
        {warnings.length ? <ul className={css.hint} data-dsh-browser-properties-warnings>{warnings.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
        <p className={css.hint}>{t('propertiesFormat')}</p>
        <div><Btn onClick={() => { void navigator.clipboard?.writeText(view.text).then(() => setCopied(true)).catch(() => undefined) }} data="properties-copy">{copied ? t('advancedCopied') : t('advancedCopy')}</Btn></div>
      </Row>
      <p className={css.notice} role="note">{t('advancedNote')}</p>
      {CONFIG_FILE_ONLY_FIELDS.map(name => <ConfigFileNote key={name} card={card} name={name} />)}
    </div>
  </Group>
}
