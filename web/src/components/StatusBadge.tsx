import { useTranslation } from 'react-i18next'
import Badge from './ui/Badge'
import { STATUS_TONE } from './ui/tokens'

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const key = status || 'unknown'
  return (
    <Badge tone={STATUS_TONE[key] ?? 'neutral'} pulse={key === 'updating'}>
      {t(`common.statusBadge.${key}`, key)}
    </Badge>
  )
}
