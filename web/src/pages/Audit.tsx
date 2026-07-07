import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getHistory, getEnvironments, UpdateHistory } from '../api/client'
import { CheckCircle, XCircle, RotateCcw, ArrowRight, Clock, Server } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { Card, Badge, EmptyState, STATUS_TONE, TONE } from '../components/ui'
import { formatDate } from '../lib/format'

function useStatusMeta() {
  const { t } = useTranslation()
  return {
    success:     { label: t('audit.status.success'),     Icon: CheckCircle },
    failed:      { label: t('audit.status.failed'),      Icon: XCircle },
    rolled_back: { label: t('audit.status.rolled_back'), Icon: RotateCcw },
  } as const
}

function duration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function tagOf(img: string) {
  return img.includes(':') ? img.split(':').pop()! : img
}

function AuditSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map(i => (
        <Card key={i}>
          <div className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 w-56" />
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-2 w-28" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function Audit() {
  const { t, i18n } = useTranslation()
  const STATUS = useStatusMeta()
  const qc = useQueryClient()

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => getHistory({ limit: 100 }),
    refetchInterval: 30_000,
  })

  const { data: environments = [] } = useQuery({
    queryKey: ['environments'],
    queryFn: getEnvironments,
  })

  useWebSocket(event => {
    if (['update.completed', 'update.failed'].includes(event.type))
      qc.invalidateQueries({ queryKey: ['history'] })
  })

  const envMap = Object.fromEntries(environments.map((e: any) => [e.id, e.name]))

  return (
    <div className="space-y-8">
      <PageHeader
        slug={t('audit.slug')}
        title={t('audit.title')}
        subtitle={isLoading ? t('audit.loading') : t('audit.subtitle', { count: history.length })}
      />

      {isLoading ? (
        <AuditSkeleton />
      ) : history.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={t('audit.empty.title')}
          subtitle={t('audit.empty.subtitle')}
        />
      ) : (
        <div className="space-y-2">
          {history.map((h: UpdateHistory) => {
            const cfg = STATUS[h.status as keyof typeof STATUS] ?? STATUS.failed
            const tone = STATUS_TONE[h.status] ?? 'coral'
            const color = TONE[tone]
            const { Icon } = cfg
            const name = h.containerName.startsWith('/') ? h.containerName.slice(1) : h.containerName
            const envName = envMap[h.environmentId] ?? t('audit.envFallback', { id: h.environmentId })
            const sameTag = h.oldImage === h.newImage

            return (
              <Card key={h.id} accent={tone}>
                <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
                  <Icon size={14} style={{ color }} className="shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-semibold text-text-bright" style={{ fontSize: '0.85rem' }}>{name}</span>
                      <span className="flex items-center gap-1 font-mono text-label text-text-muted">
                        <Server size={9} />
                        {envName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1 font-mono flex-wrap">
                      <span className="text-2xs text-text-soft">{h.oldImage}</span>
                      <ArrowRight size={10} className="text-brand-cyan" />
                      <span className="text-2xs text-brand-cyan rounded-sm border border-brand-cyan/20 bg-brand-cyan/5 px-1.5">
                        {sameTag ? t('audit.digestUpdated') : tagOf(h.newImage)}
                      </span>
                    </div>

                    {h.error && (
                      <div className="mt-1 font-mono text-2xs text-brand-coral">{h.error}</div>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <Badge tone={tone} dot={false}>{cfg.label}</Badge>
                    <div className="flex items-center gap-2 font-mono text-label text-text-muted">
                      <span className="flex items-center gap-1"><Clock size={9} />{duration(h.duration)}</span>
                      <span>{formatDate(h.createdAt, i18n.language)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
