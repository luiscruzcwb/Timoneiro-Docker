import { LucideIcon } from 'lucide-react'
import { Tone, TONE } from './tokens'

interface Props {
  icon: LucideIcon
  label: string
  value: number | string
  sub?: string
  tone?: Tone
  /** Pad numeric values to two digits (dashboard style) */
  pad?: boolean
}

/** Dashboard stat card: big glowing number + icon chip + mono label */
export default function Stat({ icon: Icon, label, value, sub, tone = 'cyan', pad = true }: Props) {
  const color = TONE[tone]
  const display = pad && typeof value === 'number' ? String(value).padStart(2, '0') : String(value)
  return (
    <div
      className="rounded p-4 relative overflow-hidden border border-border-subtle bg-card-gradient"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 0% 50%, ${color}0a, transparent 70%)` }}
      />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="font-mono text-label text-text-muted uppercase mb-2.5">{label}</div>
          <div
            className="font-display font-extrabold leading-none"
            style={{ color, fontSize: '2.4rem', textShadow: `0 0 20px ${color}44` }}
          >
            {display}
          </div>
          {sub && <div className="font-mono text-label text-text-soft mt-1.5">{sub}</div>}
        </div>
        <div
          className="w-8 h-8 rounded flex items-center justify-center shrink-0"
          style={{ background: `${color}10`, border: `1px solid ${color}25` }}
        >
          <Icon size={14} style={{ color }} />
        </div>
      </div>
    </div>
  )
}
