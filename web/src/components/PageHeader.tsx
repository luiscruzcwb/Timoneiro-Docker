import type { ReactNode } from 'react'

interface Props {
  slug: string
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}

export default function PageHeader({ slug, title, subtitle, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div style={{ color: '#22d3ee66', fontSize: '0.6rem', letterSpacing: '0.14em', fontFamily: 'JetBrains Mono, monospace', marginBottom: '8px' }}>
          // {slug}
        </div>
        <h1 style={{ fontFamily: 'Sora, sans-serif', color: '#e2f0ff', fontSize: '1.875rem', fontWeight: 700, lineHeight: 1 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: '#7aa3c0', fontSize: '0.75rem', marginTop: '8px' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
