/**
 * "Usage limits": the call buffer as grouped number inputs with their unit, range and default, and the asset policy
 * in a fold. Each key edits the same staged JSON object the raw box (folded away under "Advanced: raw JSON") shows.
 * @module dsh-browser/client/group-limits
 */

import { SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } from '../policy-keys.ts'
import { fill, rowLabels, stateOf, type Card, type LabelKey } from './field-rows.tsx'
import { boundsOf, defaultOf, POLICY_SPECS, valueText, type PolicyFieldName, type PolicyKeySpec } from './policy-fields.ts'
import { styles as css } from './styles.ts'
import { Badge, Fold, Group, Help, Row, Select, TextInput, Toggle, UnitInput } from './ui-kit.tsx'

const UNIT_KEYS = { ms: 'limitsUnitMs', days: 'limitsUnitDays', tokens: 'limitsUnitTokens', count: 'limitsUnitCount', ratio: 'limitsUnitRatio' } as const
const SECTION_KEYS = { candidates: 'limitsSectionCandidates', library: 'limitsSectionLibrary', activation: 'limitsSectionActivation' } as const
const RAW_KEY_LISTS = { usagePolicy: USAGE_POLICY_KEYS, automationAssets: ASSET_POLICY_KEYS } as const

function PolicyKeyRow({ card, field, spec }: { card: Card; field: PolicyFieldName; spec: PolicyKeySpec }) {
  const { t } = card
  const state = card.useBrowserSettings(snapshot => snapshot.policies[field][spec.key]!)
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  const overlay = card.usePolicyStatus(snapshot => field === 'usagePolicy' ? snapshot.report?.usagePolicy[spec.key] : undefined)
  const id = `plugin-config-dsh-browser-${field}-${spec.key}`
  const edit = (text: string) => card.editPolicyKey(field, spec.key, text)
  const range = boundsOf(field, spec.key)
  const fallback = defaultOf(field, spec.key)
  const unit = spec.unit ? t(UNIT_KEYS[spec.unit]) : ''
  const meta = [range ? fill(t('limitsRange'), { min: range[0], max: range[1] }) : '', fallback !== undefined ? fill(t('limitsDefault'), { value: valueText(fallback) }) : '',
    overlay?.overridden ? fill(t('limitsOverlayNote'), { value: overlay.value, baseline: overlay.baseline }) : ''].filter(Boolean).join(' · ')
  const common = { disabled, muted: !state.overridden, invalid: !!state.problem }
  let control
  switch (spec.kind) {
    case 'bool': control = <Toggle label={t(`pk_${spec.key}` as LabelKey)} checked={state.text === 'true'} disabled={disabled} onChange={next => edit(String(next))} />; break
    case 'enum': control = <Select id={id} value={state.text} options={(spec.options ?? []).map(value => ({ value, label: value }))} {...common} onChange={edit} />; break
    case 'text': control = <TextInput id={id} value={state.text} placeholder="$DSH_HOME/data/browser/automations" code {...common} onChange={edit} />; break
    default: control = <UnitInput id={id} value={state.text} unit={unit} {...common} onChange={edit} />
  }
  return <Row policyKey={`${field}.${spec.key}`} id={spec.kind === 'bool' ? undefined : id} label={t(`pk_${spec.key}` as LabelKey)} hint={t(`pk_${spec.key}Hint` as LabelKey)} meta={meta}
    overridden={state.overridden} invalid={!!state.problem} problem={state.problem ? t(state.problem) : undefined} disabled={disabled} labels={rowLabels(t)}
    onReset={() => edit('')} inline={spec.kind === 'bool'}>{control}</Row>
}

/** The raw JSON of one policy object, the same data as its rows. */
function RawBox({ card, field, label }: { card: Card; field: PolicyFieldName; label: LabelKey }) {
  const { t } = card
  const state = card.useBrowserSettings(snapshot => stateOf(snapshot, field)!)
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  return <SettingsValueField id={`plugin-config-dsh-browser-${field}-json`} label={t(label)} hint={`${t('limitsRawHint')} ${t('policyKeys')} ${RAW_KEY_LISTS[field].join(', ')}`}
    overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('invalidJson')} numeric={false} disabled={disabled} {...state}
    onEdit={text => card.edit(field, text)} onReset={() => card.resetField(field)} />
}

export function LimitsGroup({ card }: { card: Card }) {
  const { t } = card
  const count = card.useBrowserSettings(snapshot => (Object.values(snapshot.policies.usagePolicy).filter(entry => entry.overridden).length + Object.values(snapshot.policies.automationAssets).filter(entry => entry.overridden).length))
  const sections = ['candidates', 'library', 'activation'] as const
  return <Group id="limits" title={t('groupLimits')} summary={t('groupLimitsSub')} badges={count ? <Badge tone="info">{fill(t('overriddenCount'), { n: count })}</Badge> : null}>
    <div data-dsb-field="usagePolicy">
      <div className={css.subHead}><span>{t('limitsUsageTitle')}</span> <Help label={t('helpLabel')} text={t('usagePolicyHelp')} /></div>
      <p className={css.rowHint}>{t('limitsUsageSub')}</p>
      {POLICY_SPECS.usagePolicy.map(spec => <PolicyKeyRow key={spec.key} card={card} field="usagePolicy" spec={spec} />)}
    </div>
    <Fold id="limits-assets" title={t('limitsAssetsFold')} hint={t('limitsAssetsFoldHint')}>
      <div data-dsb-field="automationAssets">
        <p className={css.rowHint}>{t('automationAssetsHelp')}</p>
        {sections.map(section => <div key={section}>
          <div className={css.subHead}>{t(SECTION_KEYS[section])}</div>
          {POLICY_SPECS.automationAssets.filter(spec => spec.section === section).map(spec => <PolicyKeyRow key={spec.key} card={card} field="automationAssets" spec={spec} />)}
        </div>)}
      </div>
    </Fold>
    <Fold id="limits-raw" title={t('limitsRawFold')}>
      <RawBox card={card} field="usagePolicy" label="limitsRawUsage" />
      <RawBox card={card} field="automationAssets" label="limitsRawAssets" />
    </Fold>
    <p className={css.notice} role="note">{t('restart')}</p>
  </Group>
}
