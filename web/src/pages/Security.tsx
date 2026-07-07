import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { getUpdates, getContainers, type PendingUpdate, type Container } from '../api/client'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { Card, EmptyState, TONE, Tone } from '../components/ui'
import { relTime } from '../lib/format'

// ─── Types ─────────────────────────────────────────────────────────────────
type TrivyCVE = {
  VulnerabilityID: string
  Severity: string
  PkgName: string
  Title: string
  Description: string
}

// ─── Constants ─────────────────────────────────────────────────────────────
function useSeverities(): { key: keyof Pick<PendingUpdate, 'cveCritical' | 'cveHigh' | 'cveMedium' | 'cveLow'>; label: string; tone: Tone }[] {
  const { t } = useTranslation()
  return [
    { key: 'cveCritical', label: t('security.severities.critical'), tone: 'coral'   },
    { key: 'cveHigh',     label: t('security.severities.high'),     tone: 'orange'  },
    { key: 'cveMedium',   label: t('security.severities.medium'),   tone: 'amber'   },
    { key: 'cveLow',      label: t('security.severities.low'),      tone: 'neutral' },
  ]
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: TONE.coral, HIGH: TONE.orange, MEDIUM: TONE.amber, LOW: '#94b4d4',
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function parseCVEs(raw: string): TrivyCVE[] {
  try { return JSON.parse(raw) ?? [] } catch { return [] }
}

// ─── CVE Row (expanded) ────────────────────────────────────────────────────
function CVEDetail({ cve }: { cve: TrivyCVE }) {
  const color = SEV_COLOR[cve.Severity] ?? '#94b4d4'
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 border-b border-ocean-surface">
      <span
        className="font-mono rounded-sm border px-1.5 py-0.5 shrink-0 mt-px"
        style={{ color, background: `${color}12`, borderColor: `${color}30`, fontSize: '0.5rem', letterSpacing: '0.06em' }}
      >
        {cve.Severity.slice(0, 4)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-text-bright" style={{ fontSize: '0.68rem' }}>
            {cve.VulnerabilityID}
          </span>
          <span className="font-mono text-2xs text-text-soft">{cve.PkgName}</span>
        </div>
        {cve.Title && (
          <div className="font-display text-text-soft mt-0.5" style={{ fontSize: '0.65rem' }}>
            {cve.Title}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Container CVE Card ────────────────────────────────────────────────────
function CVECard({ update, container }: { update: PendingUpdate; container?: Container }) {
  const { t, i18n } = useTranslation()
  const SEV = useSeverities()
  const [expanded, setExpanded] = useState(false)
  const cves = parseCVEs(update.cveData)
  const total = update.cveCritical + update.cveHigh + update.cveMedium + update.cveLow
  const name = update.containerName.startsWith('/') ? update.containerName.slice(1) : update.containerName

  const maxSev = update.cveCritical > 0 ? SEV[0]
    : update.cveHigh > 0 ? SEV[1]
    : update.cveMedium > 0 ? SEV[2]
    : SEV[3]
  const maxColor = TONE[maxSev.tone]

  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const sortedCVEs = [...cves].sort((a, b) => (sevOrder[a.Severity] ?? 9) - (sevOrder[b.Severity] ?? 9))

  const imageAge = container?.lastUpdated ? relTime(container.lastUpdated, i18n.language) : null
  const detectedAge = relTime(update.foundAt, i18n.language)

  return (
    <Card>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ borderLeft: `3px solid ${maxColor}` }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="text-text-muted shrink-0 flex">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div
          className="w-7 h-7 rounded flex items-center justify-center shrink-0 border"
          style={{ background: `${maxColor}12`, borderColor: `${maxColor}30` }}
        >
          <AlertTriangle size={12} style={{ color: maxColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-text-bright" style={{ fontSize: '0.85rem' }}>
            {name}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="font-mono text-2xs text-text-soft truncate">{update.currentImage}</span>
            {imageAge && imageAge !== '—' && (
              <span className="flex items-center gap-1 font-mono text-label text-text-muted shrink-0">
                <Clock size={9} />{t('security.imageAge', { age: imageAge })}
              </span>
            )}
            <span className="font-mono text-label text-text-muted shrink-0">{t('security.detected', { age: detectedAge })}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {SEV.map(s => {
            const count = update[s.key]
            if (count === 0) return null
            const color = TONE[s.tone]
            return (
              <span
                key={s.key}
                className="font-mono rounded-sm border px-1.5 py-0.5"
                style={{ color, background: `${color}12`, borderColor: `${color}30`, fontSize: '0.58rem', letterSpacing: '0.04em' }}
              >
                {count} {s.label}
              </span>
            )
          })}
          <span className="font-mono text-2xs text-text-soft ml-1">{t('security.total', { count: total })}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          <div className="py-1" style={{ background: '#040810' }}>
            {sortedCVEs.length === 0 ? (
              <div className="font-mono text-text-muted px-4 py-3" style={{ fontSize: '0.65rem' }}>
                {t('security.noCveData')}
              </div>
            ) : (
              <>
                <div className="font-mono text-3xs tracking-widest text-text-muted px-3 pt-2 pb-1 grid gap-3" style={{ gridTemplateColumns: '50px 1fr' }}>
                  <span>SEV</span><span>{t('security.cveTableHeader')}</span>
                </div>
                {sortedCVEs.map((cve, i) => <CVEDetail key={`${cve.VulnerabilityID}-${i}`} cve={cve} />)}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function SecuritySkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="p-4">
            <Skeleton className="h-8 w-10 mb-2" />
            <Skeleton className="h-2 w-14" />
          </Card>
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <Card key={i} className="p-4 flex items-center gap-3">
            <Skeleton className="w-7 h-7 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 w-48" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-12 rounded" />
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function Security() {
  const { t } = useTranslation()
  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['updates'],
    queryFn: () => getUpdates(),
    refetchInterval: 30_000,
  })

  const { data: containers = [] } = useQuery({
    queryKey: ['containers'],
    queryFn: getContainers,
    refetchInterval: 30_000,
  })

  const containerMap = Object.fromEntries(containers.map((c: Container) => [c.id, c]))

  const withCVE = [...updates]
    .filter((u: PendingUpdate) => u.status === 'pending' && (u.cveCritical > 0 || u.cveHigh > 0 || u.cveMedium > 0 || u.cveLow > 0))
    .sort((a: PendingUpdate, b: PendingUpdate) => b.cveCritical - a.cveCritical || b.cveHigh - a.cveHigh)

  const totals = withCVE.reduce(
    (acc, u: PendingUpdate) => ({
      critical: acc.critical + u.cveCritical,
      high:     acc.high     + u.cveHigh,
      medium:   acc.medium   + u.cveMedium,
      low:      acc.low      + u.cveLow,
    }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  )

  return (
    <div className="space-y-8">
      <PageHeader
        slug={t('security.slug')}
        title={t('security.title')}
        subtitle={t('security.subtitle')}
      />

      {isLoading ? (
        <SecuritySkeleton />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: t('security.severities.critical'), value: totals.critical, color: TONE.coral },
              { label: t('security.severities.high'),     value: totals.high,     color: TONE.orange },
              { label: t('security.severities.medium'),   value: totals.medium,   color: TONE.amber },
              { label: t('security.severities.low'),      value: totals.low,      color: '#94b4d4' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded p-4 bg-card-gradient border"
                style={{ borderColor: `${color}22`, borderLeft: `2px solid ${color}` }}
              >
                <div className="font-display font-bold leading-none" style={{ color, fontSize: '2rem' }}>
                  {String(value).padStart(2, '0')}
                </div>
                <div className="font-mono text-label text-text-soft uppercase mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* CVE list */}
          {withCVE.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              tone="emerald"
              title={t('security.empty.title')}
              subtitle={t('security.empty.subtitle')}
            />
          ) : (
            <div>
              <div className="font-mono text-2xs tracking-wider text-text-soft mb-3">
                {t('security.hint', { count: withCVE.length })}
              </div>
              <div className="space-y-2">
                {withCVE.map((u: PendingUpdate) => (
                  <CVECard key={u.id} update={u} container={containerMap[u.containerId]} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
