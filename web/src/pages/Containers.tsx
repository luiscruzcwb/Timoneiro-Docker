import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  RefreshCw, Search, X, ChevronUp, ChevronDown, ChevronRight, MoreHorizontal,
  RefreshCcw, RotateCcw, Server, CheckCircle, Ban, ArrowRight, AlertTriangle,
  Clock, FileText, Save,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getContainers, getEnvironments, getUpdates, triggerCheck, triggerUpdate, rollback,
  approveUpdate, ignoreUpdate, updateUpdateNotes,
} from '../api/client'
import type { Container, PendingUpdate } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { TableSkeleton } from '../components/Skeleton'
import { Button, Input, Textarea, Badge, EmptyState, TONE, STATUS_TONE, Tone } from '../components/ui'
import { relTime } from '../lib/format'
import clsx from 'clsx'

// ─── Helpers ───────────────────────────────────────────────────────────────
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

function tagOf(img: string) {
  return img.includes(':') ? img.split(':').pop()! : img
}

function digestShort(d: string) {
  if (!d) return '—'
  const h = d.startsWith('sha256:') ? d.slice(7) : d
  return h.slice(0, 12)
}

function useCveSeverity(): { key: keyof Pick<PendingUpdate, 'cveCritical' | 'cveHigh' | 'cveMedium' | 'cveLow'>; label: string; tone: Tone }[] {
  const { t } = useTranslation()
  return [
    { key: 'cveCritical', label: t('containers.cve.critical'), tone: 'coral'   },
    { key: 'cveHigh',     label: t('containers.cve.high'),     tone: 'orange'  },
    { key: 'cveMedium',   label: t('containers.cve.medium'),   tone: 'amber'   },
    { key: 'cveLow',      label: t('containers.cve.low'),      tone: 'neutral' },
  ]
}

function useStatusLabel(): Record<string, string> {
  const { t } = useTranslation()
  return {
    pending:   t('containers.statusLabel.pending'),
    approved:  t('containers.statusLabel.approved'),
    deploying: t('containers.statusLabel.deploying'),
    deployed:  t('containers.statusLabel.deployed'),
    ignored:   t('containers.statusLabel.ignored'),
    failed:    t('containers.statusLabel.failed'),
  }
}

// ─── Sort icon ─────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc')  return <ChevronUp size={11} className="text-brand-cyan" />
  if (dir === 'desc') return <ChevronDown size={11} className="text-brand-cyan" />
  return <ChevronUp size={11} className="text-text-ghost" />
}

type SortCol = 'name' | 'status' | 'env' | 'lastChecked' | 'lastUpdated'

function StatusDot({ status }: { status: string }) {
  const color = TONE[STATUS_TONE[status] ?? 'neutral']
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
      style={{ background: color, boxShadow: status !== 'unknown' ? `0 0 6px ${color}88` : 'none' }}
    />
  )
}

// ─── Action menu (manual update / rollback) ─────────────────────────────────
function ActionMenu({ container, showUpdate, onClose }: {
  container: Container
  showUpdate: boolean
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
      qc.invalidateQueries({ queryKey: ['updates'] })
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

  const canUpdate = showUpdate && container.status === 'update_available'
  const canRollback = container.status !== 'updating'

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 min-w-[160px] rounded overflow-hidden bg-ocean-surface border border-border-subtle"
      style={{ boxShadow: '0 8px 24px #000a' }}
    >
      {showUpdate && (
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
      )}
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
    </div>
  )
}

// ─── Expanded row: pending-update detail (CVEs, digest, notes, approve/ignore) ──
function UpdateDetail({ update, isActing, onApprove, onIgnore }: {
  update: PendingUpdate
  isActing: boolean
  onApprove: () => void
  onIgnore: () => void
}) {
  const { t, i18n } = useTranslation()
  const CVE_SEVERITY = useCveSeverity()
  const [notes, setNotes] = useState(update.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isPending = update.status === 'pending'
  const isFailed = update.status === 'failed'
  const hasCritical = update.cveCritical > 0

  useEffect(() => { setNotes(update.notes ?? '') }, [update.notes])

  useEffect(() => {
    if (textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [])

  async function handleSaveNotes() {
    setSaving(true)
    try {
      await updateUpdateNotes(update.id, notes)
      setSavedAt(new Date())
      toast.success(t('containers.notes.toasts.saved'))
    } catch {
      toast.error(t('containers.notes.toasts.failed'))
    } finally {
      setSaving(false)
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNotes(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  return (
    <div className="bg-ocean-void">
      {hasCritical && isPending && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-coral/5 border-b border-brand-coral/10">
          <AlertTriangle size={10} className="text-brand-coral" />
          <span className="font-mono text-brand-coral tracking-widest text-3xs">
            {t('containers.cve.criticalBanner')}
          </span>
        </div>
      )}

      {/* Image transition */}
      <div className="px-4 py-3 flex items-center gap-2 font-mono flex-wrap border-b border-border-faint">
        <span className="text-text-soft text-xs">{tagOf(update.currentImage)}</span>
        <ArrowRight size={10} className="text-brand-cyan shrink-0" />
        <span className="text-brand-cyan rounded-sm border border-brand-cyan/20 bg-brand-cyan/5 px-1.5 py-px text-xs">
          {tagOf(update.latestImage)}
        </span>
      </div>

      {/* CVE grid */}
      <div className="grid grid-cols-4 gap-2 p-4 border-b border-border-faint">
        {CVE_SEVERITY.map(({ key, label, tone: sevTone }) => {
          const count = update[key]
          const color = TONE[sevTone]
          return (
            <div key={key} className="rounded p-3 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
              <div className="font-display font-bold leading-none text-2xl" style={{ color }}>
                {String(count).padStart(2, '0')}
              </div>
              <div className="font-mono tracking-widest mt-1 opacity-70 text-3xs" style={{ color }}>
                {label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Digest comparison */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-border-faint">
        <span className="font-mono text-3xs tracking-widest text-text-muted">{t('containers.digest')}</span>
        <span className="font-mono text-2xs text-text-soft">{digestShort(update.currentDigest)}</span>
        <ArrowRight size={9} className="text-brand-cyan" />
        <span className="font-mono text-2xs text-brand-cyan">{digestShort(update.latestDigest)}</span>
      </div>

      {/* Notes */}
      <div className={clsx('p-4', isPending && 'border-b border-border-faint')}>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={10} className="text-text-muted" />
          <span className="font-mono text-3xs tracking-widest text-text-muted">{t('containers.notes.label')}</span>
          {savedAt && (
            <span className="font-mono text-3xs text-brand-emerald ml-auto">
              {t('containers.notes.saved', { time: savedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}
            </span>
          )}
        </div>
        <Textarea
          ref={textareaRef}
          value={notes}
          onChange={handleTextareaInput}
          placeholder={t('containers.notes.placeholder')}
          rows={2}
          className="overflow-hidden"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="font-mono text-3xs text-text-ghost">
            {notes.length > 0 ? t('containers.notes.charCount', { count: notes.length }) : t('containers.notes.freeform')}
          </span>
          <Button size="sm" variant="primary" onClick={handleSaveNotes} disabled={saving}>
            <Save size={9} />
            {saving ? t('containers.notes.saving') : t('containers.notes.save')}
          </Button>
        </div>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 px-4 py-3">
          <Button variant="primary" onClick={onApprove} disabled={isActing}>
            <CheckCircle size={11} />
            {t('containers.actions.approve')}
          </Button>
          <Button onClick={onIgnore} disabled={isActing}>
            <Ban size={11} />
            {t('containers.actions.ignore')}
          </Button>
          <span className="font-mono text-3xs text-text-ghost ml-auto">
            {t('containers.actions.approveHint')}
          </span>
        </div>
      )}
      {isFailed && (
        <div className="px-4 py-3 font-mono text-3xs text-brand-coral">
          {t('containers.statusLabel.failed')}
        </div>
      )}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Containers() {
  const { t, i18n } = useTranslation()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [sort, setSort]           = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
  const [openMenu, setOpenMenu]   = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [actingId, setActingId]   = useState<number | null>(null)
  const qc = useQueryClient()
  const STATUS_LABEL = useStatusLabel()

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

  const approveMut = useMutation({
    mutationFn: approveUpdate,
    onSuccess: () => toast.success(t('containers.toasts.approved')),
    onError: () => toast.error(t('containers.toasts.approveFailed')),
    onSettled: () => { setActingId(null); qc.invalidateQueries({ queryKey: ['updates'] }) },
  })
  const ignoreMut = useMutation({
    mutationFn: ignoreUpdate,
    onSuccess: () => toast.success(t('containers.toasts.ignored')),
    onError: () => toast.error(t('containers.toasts.ignoreFailed')),
    onSettled: () => { setActingId(null); qc.invalidateQueries({ queryKey: ['updates'] }) },
  })

  useWebSocket(event => {
    if (['container.updated', 'container.failed', 'container.status_changed'].includes(event.type))
      qc.invalidateQueries({ queryKey: ['containers'] })
    if (['update.completed', 'update.failed', 'cve.scan_completed'].includes(event.type))
      qc.invalidateQueries({ queryKey: ['updates'] })
  })

  const envMap = useMemo(() => Object.fromEntries(environments.map(e => [e.id, e.name])), [environments])

  // Most recent pending_updates row per container, if any
  const pendingMap = useMemo(() => {
    const m: Record<string, PendingUpdate> = {}
    const sorted = [...updates].sort((a, b) => new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime())
    sorted.forEach(u => { if (!m[u.containerId]) m[u.containerId] = u })
    return m
  }, [updates])

  const pendingApprovals = updates.filter(u => u.status === 'pending').length
  const criticalPending = updates.filter(u => u.status === 'pending' && u.cveCritical > 0).length

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
            {pendingApprovals > 0 && <span className="text-brand-amber ml-1">{t('containers.pendingApprovals', { count: pendingApprovals })}</span>}
            {criticalPending > 0 && <span className="text-brand-coral ml-1">{t('containers.criticalCves', { count: criticalPending })}</span>}
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
          <table className="w-full border-collapse" style={{ minWidth: '680px' }}>
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="w-4 pb-2.5 pl-4" />
                <SortableTh col="name">{t('containers.table.container')}</SortableTh>
                <th className="pb-2.5 px-3 text-left font-mono text-label text-text-soft uppercase">{t('containers.table.image')}</th>
                <SortableTh col="status">{t('containers.table.status')}</SortableTh>
                {environments.length > 1 && <SortableTh col="env">{t('containers.table.environment')}</SortableTh>}
                <SortableTh col="lastChecked">{t('containers.table.checked')}</SortableTh>
                <SortableTh col="lastUpdated">{t('containers.table.updated')}</SortableTh>
                <th className="pb-2.5 px-3 text-left font-mono text-label text-text-soft uppercase">{t('containers.table.update')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: Container) => {
                const pu = pendingMap[c.id]
                const { name: imgName, tag: imgTag } = imageTag(c.image)
                const isMenuOpen = openMenu === c.id
                const isExpanded = expanded === c.id
                const isExpandable = !!pu
                const isActionable = pu?.status === 'pending' || pu?.status === 'approved' || pu?.status === 'deploying'

                return (
                  <Fragment key={c.id}>
                    <tr
                      className={clsx(
                        'border-b border-ocean-surface transition-colors',
                        isExpandable ? 'cursor-pointer hover:bg-white/[0.02]' : 'hover:bg-white/[0.01]',
                      )}
                      onClick={() => isExpandable && setExpanded(isExpanded ? null : c.id)}
                    >
                      <td className="py-3 pl-4 pr-1">
                        <StatusDot status={c.status} />
                      </td>
                      <td className="p-3">
                        <span className="font-display font-semibold text-text-bright text-sm">
                          {c.name.startsWith('/') ? c.name.slice(1) : c.name}
                        </span>
                      </td>
                      <td className="p-3 max-w-[220px]">
                        <span className="font-mono text-xs" title={c.image}>
                          <span className="text-text-primary">{imgName}</span>
                          <span className="text-text-muted">:{imgTag}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={c.status} />
                      </td>
                      {environments.length > 1 && (
                        <td className="p-3">
                          <span className="font-mono text-text-soft text-xs">
                            {envMap[c.environmentId] ?? '—'}
                          </span>
                        </td>
                      )}
                      <td className="p-3">
                        <span className="font-mono text-text-muted text-xs">
                          {relTime(c.lastChecked, i18n.language)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-text-muted text-xs">
                          {relTime(c.lastUpdated, i18n.language)}
                        </span>
                      </td>
                      <td className="p-3">
                        {pu?.status === 'pending' ? (
                          <div className="inline-flex gap-1 items-center flex-wrap">
                            <span className="font-mono text-3xs rounded-sm border px-1.5 py-px text-brand-cyan bg-brand-cyan/10 border-brand-cyan/30">
                              {tagOf(pu.latestImage)}
                            </span>
                            {pu.cveCritical > 0 && (
                              <span className="font-mono text-3xs rounded-sm border px-1 py-px text-brand-coral bg-brand-coral/10 border-brand-coral/30">
                                {pu.cveCritical}C
                              </span>
                            )}
                            {pu.cveHigh > 0 && (
                              <span className="font-mono text-3xs rounded-sm border px-1 py-px text-brand-orange bg-brand-orange/10 border-brand-orange/30">
                                {pu.cveHigh}H
                              </span>
                            )}
                          </div>
                        ) : isActionable ? (
                          <Badge tone="violet" pulse>{STATUS_LABEL[pu!.status] ?? pu!.status}</Badge>
                        ) : pu?.status === 'failed' ? (
                          <Badge tone="coral">{STATUS_LABEL.failed}</Badge>
                        ) : (
                          <span className="text-text-ghost text-2xs">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 pl-1 relative" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          {isExpandable && (
                            <ChevronRight size={13} className={clsx('text-text-muted shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')} />
                          )}
                          <button
                            onClick={() => setOpenMenu(isMenuOpen ? null : c.id)}
                            className="bg-transparent border-none cursor-pointer text-text-muted hover:text-text-primary hover:bg-white/5 flex p-1 rounded transition-colors"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                        {isMenuOpen && (
                          <ActionMenu container={c} showUpdate={!isActionable} onClose={() => setOpenMenu(null)} />
                        )}
                      </td>
                    </tr>
                    {isExpanded && pu && (
                      <tr key={`${c.id}-detail`} className="border-b border-ocean-surface">
                        <td colSpan={environments.length > 1 ? 9 : 8} className="p-0">
                          <UpdateDetail
                            update={pu}
                            isActing={actingId === pu.id}
                            onApprove={() => { setActingId(pu.id); approveMut.mutate(pu.id) }}
                            onIgnore={() => { setActingId(pu.id); ignoreMut.mutate(pu.id) }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
