import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Search, X, ChevronUp, ChevronDown, MoreHorizontal, RefreshCcw, RotateCcw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { getContainers, getEnvironments, getUpdates, triggerCheck, triggerUpdate, rollback } from '../api/client'
import type { Container, PendingUpdate } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { TableSkeleton } from '../components/Skeleton'
import { Button, Input, EmptyState, TONE, STATUS_TONE } from '../components/ui'
import { relTime } from '../lib/format'
import clsx from 'clsx'

// ─── Action menu ───────────────────────────────────────────────────────────
function ActionMenu({ container, hasCVE, onClose }: {
  container: Container
  hasCVE: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const ref = useRef<HTMLDivElement>(null)
  const name = container.name.startsWith('/') ? container.name.slice(1) : container.name

  const updateMut = useMutation({
    mutationFn: () => triggerUpdate(container.id),
    onSuccess: () => {
      toast.success(t('containers.toasts.updating', { name }))
      qc.invalidateQueries({ queryKey: ['containers'] })
      onClose()
    },
    onError: () => toast.error(t('containers.toasts.updateFailed', { name })),
  })
  const rollbackMut = useMutation({
    mutationFn: () => rollback(container.id),
    onSuccess: () => {
      toast.success(t('containers.toasts.rolledBack', { name }))
      qc.invalidateQueries({ queryKey: ['containers'] })
      onClose()
    },
    onError: () => toast.error(t('containers.toasts.rollbackFailed', { name })),
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const canUpdate = container.status === 'update_available'
  const canRollback = container.status !== 'updating'

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 min-w-[160px] rounded overflow-hidden bg-ocean-surface border border-border-subtle"
      style={{ boxShadow: '0 8px 24px #000a' }}
    >
      <button
        className={clsx(
          'flex items-center gap-2 w-full text-left px-3 py-2 font-display text-xs bg-transparent border-none',
          canUpdate ? 'text-text-primary cursor-pointer hover:bg-brand-cyan/5' : 'text-text-muted opacity-50 cursor-default',
        )}
        disabled={!canUpdate || updateMut.isPending}
        onClick={() => updateMut.mutate()}
      >
        <RefreshCcw size={12} className="text-brand-cyan" />
        {updateMut.isPending ? t('containers.actions.updating') : t('containers.actions.update')}
      </button>
      <button
        className={clsx(
          'flex items-center gap-2 w-full text-left px-3 py-2 font-display text-xs bg-transparent border-none',
          canRollback ? 'text-text-primary cursor-pointer hover:bg-brand-coral/5' : 'text-text-muted opacity-50 cursor-default',
        )}
        disabled={!canRollback || rollbackMut.isPending}
        onClick={() => rollbackMut.mutate()}
      >
        <RotateCcw size={12} className="text-brand-coral" />
        {rollbackMut.isPending ? t('containers.actions.rollingBack') : t('containers.actions.rollback')}
      </button>
      {hasCVE && (
        <>
          <div className="h-px bg-border-subtle my-0.5" />
          <div className="flex items-center gap-2 px-3 py-2 font-display text-xs text-brand-amber cursor-default">
            <span className="w-2 h-2 rounded-full bg-brand-amber shrink-0" />
            {t('containers.actions.cveDetected')}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sort icon ─────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc')  return <ChevronUp size={11} className="text-brand-cyan" />
  if (dir === 'desc') return <ChevronDown size={11} className="text-brand-cyan" />
  return <ChevronUp size={11} className="text-text-ghost" />
}

type SortCol = 'name' | 'status' | 'env' | 'lastChecked' | 'lastUpdated'

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Containers() {
  const { t, i18n } = useTranslation()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [sort, setSort]           = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
  const [openMenu, setOpenMenu]   = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: containers = [], isLoading, isFetching } = useQuery({
    queryKey: ['containers'], queryFn: getContainers, refetchInterval: 30_000,
  })
  const { data: environments = [] } = useQuery({
    queryKey: ['environments'], queryFn: getEnvironments,
  })
  const { data: updates = [] } = useQuery({
    queryKey: ['updates'], queryFn: () => getUpdates(), refetchInterval: 30_000,
  })
  const checkMut = useMutation({
    mutationFn: triggerCheck,
    onSuccess: () => {
      toast.success(t('containers.toasts.checkStarted'))
      setTimeout(() => qc.invalidateQueries({ queryKey: ['containers'] }), 2000)
    },
    onError: () => toast.error(t('containers.toasts.checkFailed')),
  })

  useWebSocket(event => {
    if (['container.updated', 'container.failed', 'container.status_changed'].includes(event.type))
      qc.invalidateQueries({ queryKey: ['containers'] })
  })

  const envMap = useMemo(() => Object.fromEntries(environments.map(e => [e.id, e.name])), [environments])

  const cveMap = useMemo(() => {
    const m: Record<string, { critical: number; high: number }> = {}
    updates.forEach((u: PendingUpdate) => {
      if (u.cveCritical > 0 || u.cveHigh > 0)
        m[u.containerId] = { critical: u.cveCritical, high: u.cveHigh }
    })
    return m
  }, [updates])

  const cycleSort = (col: SortCol) => {
    setSort(s => s.col === col
      ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' }
    )
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = containers.filter((c: Container) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.image.toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a: Container, b: Container) => {
      let va = '', vb = ''
      if (sort.col === 'name')        { va = a.name;                    vb = b.name }
      if (sort.col === 'status')      { va = a.status;                  vb = b.status }
      if (sort.col === 'env')         { va = envMap[a.environmentId];   vb = envMap[b.environmentId] }
      if (sort.col === 'lastChecked') { va = a.lastChecked;             vb = b.lastChecked }
      if (sort.col === 'lastUpdated') { va = a.lastUpdated;             vb = b.lastUpdated }
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [containers, search, statusFilter, sort, envMap])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: containers.length }
    containers.forEach((c2: Container) => { c[c2.status] = (c[c2.status] ?? 0) + 1 })
    return c
  }, [containers])

  const STATUS_PILLS = [
    { value: 'all',              label: t('containers.filters.all') },
    { value: 'update_available', label: t('containers.filters.pending') },
    { value: 'failed',           label: t('containers.filters.failed') },
  ]

  const SortableTh = ({ col, children }: { col: SortCol; children: string }) => (
    <th
      className={clsx(
        'pb-2.5 px-3 text-left font-mono text-label whitespace-nowrap select-none cursor-pointer',
        sort.col === col ? 'text-brand-cyan' : 'text-text-soft',
      )}
      onClick={() => cycleSort(col)}
    >
      <span className="flex items-center gap-1 uppercase">{children} <SortIcon dir={sort.col === col ? sort.dir : null} /></span>
    </th>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        slug={t('containers.slug')}
        title={t('containers.title')}
        subtitle={
          <>
            {t('containers.subtitle', { filtered: filtered.length, count: containers.length })}
            {isFetching && !isLoading && <span className="text-brand-cyan/30 ml-2">{t('containers.refreshing')}</span>}
          </>
        }
        action={
          <Button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}>
            <RefreshCw size={11} className={checkMut.isPending || isFetching ? 'animate-spin' : ''} />
            {checkMut.isPending ? t('containers.checking') : t('containers.checkNow')}
          </Button>
        }
      />

      {/* Search + status pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative" style={{ minWidth: '260px' }}>
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-soft pointer-events-none z-10" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('containers.searchPlaceholder')}
            className="pl-8 pr-8 text-text-bright"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-text-soft flex p-0"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_PILLS.map(p => {
            const active = statusFilter === p.value
            const count  = counts[p.value] ?? 0
            if (p.value !== 'all' && count === 0) return null
            return (
              <button
                key={p.value}
                onClick={() => setStatus(p.value)}
                className={clsx(
                  'flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-2xs cursor-pointer transition-colors',
                  active
                    ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan'
                    : 'bg-transparent border-border-subtle text-text-soft',
                )}
              >
                {p.label}
                <span className={clsx(
                  'rounded-sm px-1 text-3xs',
                  active ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-ocean-surface text-text-soft',
                )}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Server}
          title={search ? t('containers.empty.noResults', { query: search }) : t('containers.empty.none')}
        />
      ) : (
        <div className="overflow-x-auto rounded bg-card-gradient border border-border-subtle">
          <table className="w-full border-collapse" style={{ minWidth: '640px' }}>
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="w-4 pb-2.5 pl-4" />
                <SortableTh col="name">{t('containers.table.container')}</SortableTh>
                <th className="pb-2.5 px-3 text-left font-mono text-label text-text-soft uppercase">{t('containers.table.image')}</th>
                <SortableTh col="status">{t('containers.table.status')}</SortableTh>
                {environments.length > 1 && <SortableTh col="env">{t('containers.table.environment')}</SortableTh>}
                <SortableTh col="lastChecked">{t('containers.table.checked')}</SortableTh>
                <SortableTh col="lastUpdated">{t('containers.table.updated')}</SortableTh>
                <th className="pb-2.5 px-4 text-center font-mono text-label text-text-soft uppercase">{t('containers.table.cve')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: Container) => {
                const cve = cveMap[c.id]
                const { name: imgName, tag: imgTag } = imageTag(c.image)
                const isMenuOpen = openMenu === c.id

                return (
                  <tr key={c.id} className="border-b border-ocean-surface hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pl-4 pr-1">
                      <StatusDot status={c.status} />
                    </td>
                    <td className="p-3">
                      <span className="font-display font-semibold text-text-bright" style={{ fontSize: '0.82rem' }}>
                        {c.name.startsWith('/') ? c.name.slice(1) : c.name}
                      </span>
                    </td>
                    <td className="p-3 max-w-[220px]">
                      <span className="font-mono" style={{ fontSize: '0.65rem' }} title={c.image}>
                        <span className="text-text-primary">{imgName}</span>
                        <span className="text-text-muted">:{imgTag}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={c.status} />
                    </td>
                    {environments.length > 1 && (
                      <td className="p-3">
                        <span className="font-mono text-text-soft" style={{ fontSize: '0.65rem' }}>
                          {envMap[c.environmentId] ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="p-3">
                      <span className="font-mono text-text-muted" style={{ fontSize: '0.65rem' }}>
                        {relTime(c.lastChecked, i18n.language)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-text-muted" style={{ fontSize: '0.65rem' }}>
                        {relTime(c.lastUpdated, i18n.language)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {cve ? (
                        <span className="inline-flex gap-1 items-center">
                          {cve.critical > 0 && (
                            <span className="font-mono text-3xs rounded-sm border px-1 py-px text-brand-coral bg-brand-coral/10 border-brand-coral/30">
                              {cve.critical}C
                            </span>
                          )}
                          {cve.high > 0 && (
                            <span className="font-mono text-3xs rounded-sm border px-1 py-px text-brand-orange bg-brand-orange/10 border-brand-orange/30">
                              {cve.high}H
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-ghost text-2xs">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 pl-1 relative">
                      <button
                        onClick={() => setOpenMenu(isMenuOpen ? null : c.id)}
                        className="bg-transparent border-none cursor-pointer text-text-muted hover:text-text-primary hover:bg-white/5 flex p-1 rounded transition-colors"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {isMenuOpen && (
                        <ActionMenu container={c} hasCVE={!!cve} onClose={() => setOpenMenu(null)} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color = TONE[STATUS_TONE[status] ?? 'neutral']
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full"
      style={{ background: color, boxShadow: status !== 'unknown' ? `0 0 6px ${color}88` : 'none' }}
    />
  )
}

function imageTag(image: string): { name: string; tag: string } {
  const atIdx = image.lastIndexOf('@')
  if (atIdx !== -1) {
    const name = image.slice(0, atIdx)
    return { name: name.split('/').pop() ?? name, tag: image.slice(atIdx, atIdx + 16) + '…' }
  }
  const colonIdx = image.lastIndexOf(':')
  if (colonIdx !== -1) return { name: image.slice(0, colonIdx).split('/').pop() ?? image, tag: image.slice(colonIdx + 1) }
  return { name: image.split('/').pop() ?? image, tag: 'latest' }
}
