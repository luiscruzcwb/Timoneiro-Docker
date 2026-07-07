import clsx from 'clsx'
import type { CSSProperties } from 'react'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={clsx('rounded animate-pulse', className)}
      style={{ background: '#0e2040', ...style }}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded p-4" style={{ background: 'linear-gradient(135deg, #0a1628, #060d1a)', border: '1px solid #0e2040' }}>
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="w-8 h-8 rounded" />
      </div>
      <Skeleton className="h-8 w-10 mb-2" />
      <Skeleton className="h-2 w-20" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #0a1628, #060d1a)', border: '1px solid #0e2040', borderRadius: '4px', overflow: 'hidden' }}>
      <div className="flex items-center gap-4 px-4 py-2.5" style={{ background: '#06090f', borderBottom: '1px solid #0e2040' }}>
        {[80, 200, 120, 120, 80, 80].map((w, i) => (
          <Skeleton key={i} className="h-2" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: '1px solid #08101f' }}>
          <Skeleton className="w-2 h-2 rounded-full shrink-0" />
          <Skeleton className="h-3 w-32 shrink-0" />
          <Skeleton className="h-3 flex-1 max-w-xs" />
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-3 w-10 shrink-0" />
          <Skeleton className="h-3 w-10 shrink-0 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded p-4" style={{ background: 'linear-gradient(135deg, #0a1628, #060d1a)', border: '1px solid #0e2040' }}>
      <div className="flex items-start gap-3 mb-3">
        <Skeleton className="w-7 h-7 rounded shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-2 w-48" />
        </div>
        <Skeleton className="h-5 w-16 rounded shrink-0" />
      </div>
      <Skeleton className="h-2 w-full mb-3 mt-2" />
      <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid #0e2040' }}>
        <Skeleton className="h-7 w-32 rounded" />
        <Skeleton className="h-7 w-20 rounded" />
      </div>
    </div>
  )
}
