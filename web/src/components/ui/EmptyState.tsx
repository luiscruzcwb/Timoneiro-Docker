import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'
import { Tone, TONE } from './tokens'

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  /** Icon/title color; defaults to neutral for empty, use emerald for "all clear" states */
  tone?: Tone
}

export default function EmptyState({ icon: Icon, title, subtitle, tone = 'neutral' }: Props) {
  const color = TONE[tone]
  return (
    <div className="rounded py-20 text-center border border-dashed border-border-subtle bg-ocean-void">
      <Icon size={28} className="mx-auto mb-3" style={{ color }} />
      <p className="font-display font-semibold text-sm" style={{ color: tone === 'neutral' ? '#7aa3c0' : color }}>
        {title}
      </p>
      {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
    </div>
  )
}
