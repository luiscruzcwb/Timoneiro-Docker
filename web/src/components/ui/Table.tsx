import { ReactNode } from 'react'
import clsx from 'clsx'

interface TableProps {
  /** CSS grid template, e.g. "1fr 1fr 120px 80px" */
  columns: string
  /** Minimum width before horizontal scroll kicks in */
  minWidth?: number
  children: ReactNode
}

/** Grid-based table wrapper with horizontal scroll */
export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function TableHead({ columns, minWidth = 560, children }: TableProps) {
  return (
    <div
      className="grid px-4 py-2 gap-3 border-b border-border-faint bg-ocean-void"
      style={{ gridTemplateColumns: columns, minWidth }}
    >
      {children}
    </div>
  )
}

export function TableHeadCell({ children }: { children: ReactNode }) {
  return <div className="font-mono text-3xs tracking-widest text-text-ghost uppercase">{children}</div>
}

export function TableRow({ columns, minWidth = 560, children, className }: TableProps & { className?: string }) {
  return (
    <div
      className={clsx('grid px-4 py-2.5 gap-3 items-center border-b border-border-faint', className)}
      style={{ gridTemplateColumns: columns, minWidth }}
    >
      {children}
    </div>
  )
}
