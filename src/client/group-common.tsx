/**
 * "Common": the four settings nearly everyone touches. Open by default; every other group starts closed.
 * @module dsh-browser/client/group-common
 */

import { fill, SelectRow, SwitchRow, useOverriddenCount, type Card } from './field-rows.tsx'
import { Badge, Group } from './ui-kit.tsx'

/** The names of the common group's fields, in order. */
export const COMMON_FIELDS = ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled'] as const

const MODE_LINES = { 'read-only': 'modeReadOnlyLine', standard: 'modeStandardLine', autonomous: 'modeAutonomousLine', unrestricted: 'modeUnrestrictedLine' } as const

export function CommonGroup({ card }: { card: Card }) {
  const { t } = card
  const count = useOverriddenCount(card, COMMON_FIELDS)
  return <Group id="common" title={t('groupCommon')} summary={t('groupCommonSub')} defaultOpen badges={count ? <Badge tone="info">{fill(t('overriddenCount'), { n: count })}</Badge> : null}>
    <SwitchRow card={card} name="enabled" />
    <SelectRow card={card} name="automationMode"
      hint={text => t(MODE_LINES[text as keyof typeof MODE_LINES] ?? 'automationModeHint')}
      options={[
        { value: 'read-only', label: t('modeReadOnly') },
        { value: 'standard', label: t('modeStandard') },
        { value: 'autonomous', label: t('modeAutonomous') },
        { value: 'unrestricted', label: t('modeUnrestricted') },
      ]} />
    <SelectRow card={card} name="toolSurface" options={[{ value: 'indexed', label: t('surfaceIndexed') }, { value: 'flat', label: t('surfaceFlat') }]} />
    <SwitchRow card={card} name="opencliEnabled" />
  </Group>
}
