import { ReactNode } from 'react'
import clsx from 'clsx'
import { Tone, TONE } from './tokens'

interface Props {
  tone?: Tone
  children: ReactNode
  /** Show the status dot before the label */
  dot?: boolean
  /** Pulse animation on the dot (deploying/updating states) */
  pulse?: boolean
  className?: string
}

export default function Badge({ tone = 'neutral', dot = true, pulse, children, className }: Props) {
  const color = TONE[tone]
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-label uppercase', className)}
      style={{ color, borderColor: `${color}33`, background: `${color}08` }}
    >
      {dot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full shrink-0', pulse && 'animate-pulse')}
          style={{ background: color }}
        />
      )}
      {children}
    </span>
  )
}
