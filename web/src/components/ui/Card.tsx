import { ReactNode, HTMLAttributes } from 'react'
import clsx from 'clsx'
import { Tone, TONE } from './tokens'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Colored left border accent */
  accent?: Tone
  /** Dimmed appearance for resolved/inactive items */
  muted?: boolean
}

export function Card({ children, accent, muted, className, style, ...rest }: CardProps) {
  return (
    <div
      className={clsx('rounded overflow-hidden border border-border-subtle bg-card-gradient', muted && 'opacity-60', className)}
      style={{ ...(accent ? { borderLeft: `2px solid ${TONE[accent]}` } : {}), ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  /** Mono uppercase label, e.g. "STATUS DAS ATUALIZAÇÕES" */
  title: string
  /** Right-aligned slot (link, button) */
  action?: ReactNode
}

export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between border-b border-border-subtle">
      <span className="font-mono text-label text-text-primary uppercase">{title}</span>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('p-4', className)}>{children}</div>
}
