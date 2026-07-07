import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Server, CheckCircle, RefreshCw, ShieldAlert, ArrowRight,
  ChevronLeft, ChevronRight, SlidersHorizontal, Activity,
  AlertTriangle,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts'
import { toast } from 'sonner'
import {
  getContainers, getEnvironments, getUpdates, getHistory,
  triggerCheck, Container, UpdateHistory,
} from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { StatCardSkeleton, TableSkeleton, Skeleton } from '../components/Skeleton'
import { useWebSocket } from '../hooks/useWebSocket'
import { Card, CardHeader, CardBody, Button, Stat, Table, TableHead, TableHeadCell, TableRow, TONE } from '../components/ui'

function useDonutItems() {
  const { t } = useTranslation()
  return [
    { key: 'up_to_date',       label: t('dashboard.donut.labels.upToDate'),        color: TONE.emerald },
    { key: 'update_available', label: t('dashboard.donut.labels.updateAvailable'), color: TONE.amber   },
    { key: 'failed',           label: t('dashboard.donut.labels.failed'),          color: TONE.coral   },
    { key: 'local',            label: t('dashboard.donut.labels.local'),           color: TONE.violet  },
    { key: 'unknown',          label: t('dashboard.donut.labels.unknown'),         color: TONE.neutral },
  ]
}

const TABLE_COLS = '1fr 1fr 120px 130px 80px'

function UptimeRing({ pct }: { pct: number }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct > 90 ? TONE.emerald : pct > 70 ? TONE.amber : TONE.coral
  return (
    <svg width="76" height="76" viewBox="0 0 76 76">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#0e2040" strokeWidth="5" />
      <circle
        cx="38" cy="38" r={r} fill="none"
        stroke={color}
        strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 0.7s ease', filter: `drop-shadow(0 0 4px ${color}88)` }}
      />
      <text x="38" y="43" textAnchor="middle" fontSize="14" fontWeight="800"
        fill="#e2f0ff" fontFamily="Sora, sans-serif">{pct}%</text>
    </svg>
  )
}

function sparklineData(history: UpdateHistory[], locale: string) {
  const slots: Record<string, number> = {}
  const now = Date.now()
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now - i * 3600000)
    slots[t.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })] = 0
  }
  history.forEach(h => {
    const t = new Date(h.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    if (t in slots) slots[t]++
  })
  return Object.entries(slots).map(([name, value]) => ({ name, value }))
}

const PAGE_SIZE = 8

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const DONUT_ITEMS = useDonutItems()
  const [page, setPage] = useState(0)
  const qc = useQueryClient()

  const { data: containers = [], isLoading } = useQuery({ queryKey: ['containers'], queryFn: getContainers, refetchInterval: 30_000 })
  const { data: environments = [] }           = useQuery({ queryKey: ['environments'], queryFn: getEnvironments })
  const { data: pending = [] }                = useQuery({ queryKey: ['updates', 'pending'], queryFn: () => getUpdates('pending'), refetchInterval: 30_000 })
  const { data: history = [] }                = useQuery({ queryKey: ['history'], queryFn: () => getHistory({ limit: 100 }), refetchInterval: 30_000 })

  const checkMut = useMutation({
    mutationFn: triggerCheck,
    onSuccess: () => {
      toast.success(t('dashboard.toasts.checkStarted'))
      setTimeout(() => qc.invalidateQueries(), 2000)
    },
    onError: () => toast.error(t('dashboard.toasts.checkFailed')),
  })

  useWebSocket(event => {
    if (['container.status_changed', 'update.completed', 'update.failed'].includes(event.type)) {
      qc.invalidateQueries({ queryKey: ['containers'] })
      qc.invalidateQueries({ queryKey: ['updates', 'pending'] })
      qc.invalidateQueries({ queryKey: ['history'] })
    }
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader slug={t('dashboard.slug')} title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {[0,1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-72" style={{ background: '#060d1a' }} />)}
        </div>
        <TableSkeleton rows={6} />
      </div>
    )
  }

  const envMap = Object.fromEntries(environments.map((e: any) => [e.id, e.name]))

  const total   = containers.length
  const synced  = containers.filter((c: Container) => c.status === 'up_to_date').length
  const avail   = containers.filter((c: Container) => c.status === 'update_available').length
  const vulnCt  = containers.filter((c: Container) => c.status === 'failed').length

  const donutData = DONUT_ITEMS.map(item => ({
    ...item,
    value: containers.filter((c: Container) => c.status === item.key).length,
  }))

  const spark      = sparklineData(history, i18n.language)
  const totalH     = history.length
  const successH   = history.filter((h: UpdateHistory) => h.status === 'success').length
  const failedH    = history.filter((h: UpdateHistory) => h.status === 'failed').length
  const rolledH    = history.filter((h: UpdateHistory) => h.status === 'rolled_back').length
  const successRate = totalH > 0 ? Math.round((successH / totalH) * 100) : 0

  const pageCount = Math.ceil(containers.length / PAGE_SIZE)
  const paginated = containers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <PageHeader
        slug={t('dashboard.slug')}
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={
          <Button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}>
            <RefreshCw size={11} className={checkMut.isPending ? 'animate-spin' : ''} />
            {checkMut.isPending ? t('dashboard.checking') : t('dashboard.checkNow')}
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat icon={Server}      tone="cyan"    label={t('dashboard.stats.containers')} value={total}    sub={t('dashboard.stats.environments', { count: environments.length })} />
        <Stat icon={CheckCircle} tone="emerald" label={t('dashboard.stats.updated')}    value={synced}   sub={t('dashboard.stats.ofMonitored', { count: total })} />
        <Stat icon={Activity}    tone="cyan"    label={t('dashboard.stats.recent')}     value={successH} sub={t('dashboard.stats.recentSub')} />
        {avail > 0
          ? <Stat icon={AlertTriangle} tone="amber" label={t('dashboard.stats.available')}      value={avail}  sub={t('dashboard.stats.availableSub')} />
          : <Stat icon={ShieldAlert}   tone="coral" label={t('dashboard.stats.vulnerabilities')} value={vulnCt} sub={t('dashboard.stats.vulnerabilitiesSub')} />
        }

        {/* Taxa de Sucesso */}
        <Card
          accent={successRate > 90 ? 'emerald' : successRate > 70 ? 'amber' : 'coral'}
          className="p-4 flex flex-col items-center justify-center gap-2"
        >
          <div className="font-mono text-label text-text-muted uppercase">{t('dashboard.stats.success')}</div>
          <UptimeRing pct={successRate} />
          <div className="font-mono text-label text-text-soft text-center">
            {totalH > 0 ? t('dashboard.stats.ofTotal', { success: successH, total: totalH }) : t('dashboard.stats.noHistory')}
          </div>
        </Card>
      </div>

      {/* Middle row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">

        {/* Status das Atualizações — donut */}
        <Card>
          <CardHeader title={t('dashboard.donut.title')} />
          <CardBody>
            <div className="relative" style={{ height: '170px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData.map(d => ({ ...d, value: d.value || 0.001 }))}
                    cx="50%" cy="50%"
                    innerRadius={54} outerRadius={72}
                    dataKey="value" strokeWidth={0}
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.value > 0 ? d.color : '#0e2040'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="font-display font-extrabold text-text-bright leading-none" style={{ fontSize: '2rem' }}>{total}</div>
                <div className="font-mono text-3xs tracking-widest text-text-muted mt-0.5">{t('dashboard.donut.total')}</div>
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {donutData.map(d => (
                <div key={d.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.color, boxShadow: d.value > 0 ? `0 0 4px ${d.color}` : 'none' }} />
                    <span className="font-mono text-2xs text-text-soft">{d.label}</span>
                  </div>
                  <span className={`font-display font-bold text-xs ${d.value > 0 ? 'text-text-bright' : 'text-text-ghost'}`}>{d.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <Link to="/updates" className="flex items-center gap-1 font-mono text-2xs text-brand-cyan no-underline">
                {t('dashboard.donut.viewAll')} <ArrowRight size={10} />
              </Link>
            </div>
          </CardBody>
        </Card>

        {/* Automação — sparkline + counters */}
        <Card>
          <CardHeader title={t('dashboard.automation.title')} />
          <CardBody>
            <div style={{ height: '130px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={TONE.cyan} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={TONE.cyan} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fill: '#1e3a5f', fontSize: 8, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval={Math.floor(spark.length / 4)} />
                  <Tooltip
                    contentStyle={{ background: '#0a1628', border: '1px solid #0e2040', borderRadius: '3px', fontSize: '0.65rem', color: '#94b4d4' }}
                    cursor={{ stroke: '#22d3ee22' }}
                    formatter={(v) => [v, t('dashboard.automation.tooltip')]}
                  />
                  <Area type="monotone" dataKey="value" stroke={TONE.cyan} strokeWidth={1.5} fill="url(#cg)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border-subtle">
              {[
                { label: t('dashboard.automation.pending'),    value: pending.length, color: TONE.amber   },
                { label: t('dashboard.automation.success'),    value: successH,       color: TONE.emerald },
                { label: t('dashboard.automation.failures'),   value: failedH,        color: TONE.coral   },
                { label: t('dashboard.automation.rolledBack'), value: rolledH,        color: TONE.violet  },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="font-display font-extrabold leading-none" style={{ color, fontSize: '1.6rem', textShadow: `0 0 14px ${color}44` }}>
                    {value}
                  </div>
                  <div className="font-mono text-3xs tracking-wider text-text-muted mt-1 uppercase">{label}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Eventos Recentes */}
        <Card>
          <CardHeader title={t('dashboard.events.title')} />
          <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
            {history.length === 0 ? (
              <div className="py-12 text-center font-mono text-2xs text-text-ghost">
                {t('dashboard.events.empty')}
              </div>
            ) : (
              history.slice(0, 10).map((h: UpdateHistory) => {
                const name  = h.containerName.startsWith('/') ? h.containerName.slice(1) : h.containerName
                const color = h.status === 'success' ? TONE.emerald : h.status === 'rolled_back' ? TONE.violet : TONE.coral
                const label = h.status === 'success' ? t('dashboard.events.updateCompleted') : h.status === 'rolled_back' ? t('dashboard.events.rollbackDone') : t('dashboard.events.updateFailed')
                const time  = new Date(h.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={h.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border-faint">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-semibold text-text-bright text-xs truncate">{name}</div>
                      <div className="font-mono text-label mt-0.5" style={{ color }}>{label}</div>
                    </div>
                    <span className="font-mono text-label text-text-muted shrink-0 mt-0.5">{time}</span>
                  </div>
                )
              })
            )}
          </div>
          {totalH > 0 && (
            <div className="px-4 py-2.5 border-t border-border-subtle">
              <Link to="/audit" className="flex items-center gap-1 font-mono text-2xs text-brand-cyan no-underline">
                {t('dashboard.events.viewAudit')} <ArrowRight size={10} />
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Containers table */}
      <Card>
        <CardHeader
          title={t('dashboard.table.title')}
          action={
            <Link to="/containers" className="flex items-center gap-1 font-mono text-label text-text-muted no-underline">
              <SlidersHorizontal size={10} /> {t('dashboard.table.viewAll')}
            </Link>
          }
        />

        <Table>
          <TableHead columns={TABLE_COLS} minWidth={580}>
            {[
              t('dashboard.table.columns.container'),
              t('dashboard.table.columns.image'),
              t('dashboard.table.columns.status'),
              t('dashboard.table.columns.nextCheck'),
              t('dashboard.table.columns.action'),
            ].map(h => (
              <TableHeadCell key={h}>{h}</TableHeadCell>
            ))}
          </TableHead>

          {containers.length === 0 ? (
            <div className="py-14 text-center font-mono text-2xs text-text-ghost">
              {t('dashboard.table.empty')}
            </div>
          ) : (
            paginated.map((c: Container) => {
              const name    = c.name.startsWith('/') ? c.name.slice(1) : c.name
              const envName = envMap[c.environmentId] ?? t('dashboard.table.local')
              const nextCheck = c.lastChecked
                ? new Date(new Date(c.lastChecked).getTime() + 5 * 60000).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
                : '—'
              return (
                <TableRow key={c.id} columns={TABLE_COLS} minWidth={580}>
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-text-bright truncate" style={{ fontSize: '0.78rem' }}>{name}</div>
                    <div className="font-mono text-label text-text-muted">{envName}</div>
                  </div>
                  <div className="font-mono text-2xs text-text-soft truncate" title={c.image}>{c.image}</div>
                  <div><StatusBadge status={c.status} /></div>
                  <div className="font-mono text-2xs text-text-soft">{nextCheck}</div>
                  <div>
                    {c.status === 'update_available' && (
                      <Link
                        to="/updates"
                        className="font-mono text-label text-brand-cyan no-underline rounded-sm border border-brand-cyan/20 bg-brand-cyan/5 px-1.5 py-0.5"
                      >
                        {t('dashboard.table.update')}
                      </Link>
                    )}
                  </div>
                </TableRow>
              )
            })
          )}
        </Table>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-subtle">
            <span className="font-mono text-label text-text-muted">
              {t('dashboard.table.pageRange', { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, containers.length), total: containers.length })}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft size={12} />
              </Button>
              {Array.from({ length: pageCount }, (_, i) => (
                <Button key={i} size="sm" variant={i === page ? 'primary' : 'ghost'} onClick={() => setPage(i)}>
                  {i + 1}
                </Button>
              ))}
              <Button size="sm" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1}>
                <ChevronRight size={12} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
