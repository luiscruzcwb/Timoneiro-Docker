import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Shield, CheckCircle, Clock, Ban, ArrowRight,
  AlertTriangle, RefreshCw, ChevronDown, FileText, Save, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getUpdates, getEnvironments, approveUpdate, ignoreUpdate,
  triggerCheck, updateUpdateNotes, PendingUpdate,
} from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'
import PageHeader from '../components/PageHeader'
import { CardSkeleton } from '../components/Skeleton'
import { Card, Badge, Button, Textarea, EmptyState, STATUS_TONE, TONE, Tone } from '../components/ui'
import clsx from 'clsx'

function useStatusLabel(): Record<string, string> {
  const { t } = useTranslation()
  return {
    pending:   t('updates.statusLabel.pending'),
    approved:  t('updates.statusLabel.approved'),
    deploying: t('updates.statusLabel.deploying'),
    deployed:  t('updates.statusLabel.deployed'),
    ignored:   t('updates.statusLabel.ignored'),
    failed:    t('updates.statusLabel.failed'),
  }
}

function useCveSeverity(): { key: keyof Pick<PendingUpdate, 'cveCritical' | 'cveHigh' | 'cveMedium' | 'cveLow'>; label: string; tone: Tone }[] {
  const { t } = useTranslation()
  return [
    { key: 'cveCritical', label: t('updates.cve.critical'), tone: 'coral'   },
    { key: 'cveHigh',     label: t('updates.cve.high'),     tone: 'orange'  },
    { key: 'cveMedium',   label: t('updates.cve.medium'),   tone: 'amber'   },
    { key: 'cveLow',      label: t('updates.cve.low'),      tone: 'neutral' },
  ]
}

function digestShort(d: string) {
  if (!d) return '—'
  const h = d.startsWith('sha256:') ? d.slice(7) : d
  return h.slice(0, 12)
}

function tagOf(img: string) {
  return img.includes(':') ? img.split(':').pop()! : img
}

function CVESummary({ update }: { update: PendingUpdate }) {
  const { t } = useTranslation()
  const CVE_SEVERITY = useCveSeverity()
  const total = update.cveCritical + update.cveHigh + update.cveMedium + update.cveLow
  if (total === 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-label text-brand-emerald">
        <Shield size={9} /> {t('updates.cve.none')}
      </span>
    )
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CVE_SEVERITY.map(({ key, label, tone }) => {
        const count = update[key]
        if (count === 0) return null
        const color = TONE[tone]
        return (
          <span
            key={key}
            className="font-mono rounded-sm border px-1.5 py-px"
            style={{ color, background: `${color}10`, borderColor: `${color}30`, fontSize: '0.56rem', letterSpacing: '0.06em' }}
          >
            {count} {label.slice(0, 4)}
          </span>
        )
      })}
    </div>
  )
}

function UpdateCard({ update, envName, onApprove, onIgnore, isActing }: {
  update: PendingUpdate
  envName: string
  onApprove: () => void
  onIgnore: () => void
  isActing: boolean
}) {
  const { t, i18n } = useTranslation()
  const STATUS_LABEL = useStatusLabel()
  const CVE_SEVERITY = useCveSeverity()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(update.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNotes(update.notes ?? '')
  }, [update.notes])

  useEffect(() => {
    if (expanded && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [expanded])

  const tone = STATUS_TONE[update.status] ?? 'amber'
  const isPending = update.status === 'pending'
  const isDeploying = update.status === 'deploying'
  const shortName = update.containerName.startsWith('/') ? update.containerName.slice(1) : update.containerName
  const hasCritical = update.cveCritical > 0
  const foundDate = new Date(update.foundAt).toLocaleString(i18n.language, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  async function handleSaveNotes() {
    setSaving(true)
    try {
      await updateUpdateNotes(update.id, notes)
      setSavedAt(new Date())
      toast.success(t('updates.notes.toasts.saved'))
    } catch {
      toast.error(t('updates.notes.toasts.failed'))
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
    <Card accent={tone} muted={!isPending && !isDeploying}>
      {/* Critical banner */}
      {hasCritical && isPending && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-coral/5 border-b border-brand-coral/10">
          <AlertTriangle size={10} className="text-brand-coral" />
          <span className="font-mono text-brand-coral tracking-widest" style={{ fontSize: '0.57rem' }}>
            {t('updates.cve.criticalBanner')}
          </span>
        </div>
      )}

      {/* Clickable header */}
      <div className="cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="px-4 pt-3.5 pb-2.5 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
              <span className="font-display font-bold text-text-bright" style={{ fontSize: '0.9rem' }}>
                {shortName}
              </span>
              <span className="font-mono text-label text-text-muted">{envName}</span>
            </div>
            <div className="flex items-center gap-2 font-mono flex-wrap">
              <span className="text-text-soft" style={{ fontSize: '0.7rem' }}>{tagOf(update.currentImage)}</span>
              <ArrowRight size={10} className="text-brand-cyan shrink-0" />
              <span className="text-brand-cyan rounded-sm border border-brand-cyan/20 bg-brand-cyan/5 px-1.5 py-px" style={{ fontSize: '0.7rem' }}>
                {tagOf(update.latestImage)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 shrink-0">
            <div className="pt-0.5">
              <CVESummary update={update} />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge tone={tone} pulse={isDeploying}>{STATUS_LABEL[update.status] ?? update.status}</Badge>
              <span className="font-mono text-label text-text-muted">
                <Clock size={9} className="inline mr-1" />{foundDate}
              </span>
            </div>
            <ChevronDown
              size={14}
              className={clsx('text-text-muted mt-1 shrink-0 transition-transform duration-200', expanded && 'rotate-180')}
            />
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border-subtle bg-ocean-void">
          {/* CVE grid */}
          <div className="grid grid-cols-4 gap-2 p-4 border-b border-border-faint">
            {CVE_SEVERITY.map(({ key, label, tone: sevTone }) => {
              const count = update[key]
              const color = TONE[sevTone]
              return (
                <div key={key} className="rounded p-3 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                  <div className="font-display font-bold leading-none" style={{ color, fontSize: '1.5rem' }}>
                    {String(count).padStart(2, '0')}
                  </div>
                  <div className="font-mono tracking-widest mt-1 opacity-70" style={{ color, fontSize: '0.52rem' }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Digest comparison */}
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-border-faint">
            <span className="font-mono text-3xs tracking-widest text-text-muted">{t('updates.digest')}</span>
            <span className="font-mono text-2xs text-text-soft">{digestShort(update.currentDigest)}</span>
            <ArrowRight size={9} className="text-brand-cyan" />
            <span className="font-mono text-2xs text-brand-cyan">{digestShort(update.latestDigest)}</span>
          </div>

          {/* Notes */}
          <div className={clsx('p-4', isPending && 'border-b border-border-faint')}>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={10} className="text-text-muted" />
              <span className="font-mono text-3xs tracking-widest text-text-muted">{t('updates.notes.label')}</span>
              {savedAt && (
                <span className="font-mono text-3xs text-brand-emerald ml-auto">
                  {t('updates.notes.saved', { time: savedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}
                </span>
              )}
            </div>
            <Textarea
              ref={textareaRef}
              value={notes}
              onChange={handleTextareaInput}
              placeholder={t('updates.notes.placeholder')}
              rows={3}
              className="overflow-hidden"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="font-mono text-3xs text-text-ghost">
                {notes.length > 0 ? t('updates.notes.charCount', { count: notes.length }) : t('updates.notes.freeform')}
              </span>
              <Button size="sm" variant="primary" onClick={handleSaveNotes} disabled={saving}>
                <Save size={9} />
                {saving ? t('updates.notes.saving') : t('updates.notes.save')}
              </Button>
            </div>
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex items-center gap-2 px-4 py-3">
              <Button variant="primary" onClick={e => { e.stopPropagation(); onApprove() }} disabled={isActing}>
                <CheckCircle size={11} />
                {t('updates.actions.approveDeploy')}
              </Button>
              <Button onClick={e => { e.stopPropagation(); onIgnore() }} disabled={isActing}>
                <Ban size={11} />
                {t('updates.actions.ignore')}
              </Button>
              <span className="font-mono text-3xs text-text-ghost ml-auto">
                <XCircle size={9} className="inline mr-1" />{t('updates.actions.approveHint')}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

const FILTERS = ['all', 'pending', 'approved', 'deploying', 'deployed', 'ignored', 'failed'] as const

export default function Updates() {
  const { t } = useTranslation()
  const FILTER_LABEL: Record<string, string> = { all: t('updates.statusLabel.all'), ...useStatusLabel() }
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [actingId, setActingId] = useState<number | null>(null)
  const qc = useQueryClient()

  const checkMut = useMutation({
    mutationFn: triggerCheck,
    onSuccess: () => {
      toast.success(t('updates.toasts.checkStarted'))
      setTimeout(() => qc.invalidateQueries({ queryKey: ['updates'] }), 2000)
    },
    onError: () => toast.error(t('updates.toasts.checkFailed')),
  })

  const { data: allUpdates = [], isLoading } = useQuery({
    queryKey: ['updates'],
    queryFn: () => getUpdates(),
    refetchInterval: 30_000,
  })

  const { data: environments = [] } = useQuery({
    queryKey: ['environments'],
    queryFn: getEnvironments,
  })

  useWebSocket(event => {
    if (['update.completed', 'update.failed', 'cve.scan_completed'].includes(event.type))
      qc.invalidateQueries({ queryKey: ['updates'] })
  })

  const approveMut = useMutation({
    mutationFn: approveUpdate,
    onSuccess: () => toast.success(t('updates.toasts.approved')),
    onError: () => toast.error(t('updates.toasts.approveFailed')),
    onSettled: () => { setActingId(null); qc.invalidateQueries({ queryKey: ['updates'] }) },
  })

  const ignoreMut = useMutation({
    mutationFn: ignoreUpdate,
    onSuccess: () => toast.success(t('updates.toasts.ignored')),
    onError: () => toast.error(t('updates.toasts.ignoreFailed')),
    onSettled: () => { setActingId(null); qc.invalidateQueries({ queryKey: ['updates'] }) },
  })

  const envMap = Object.fromEntries(environments.map(e => [e.id, e.name]))

  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f === 'all' ? allUpdates.length : allUpdates.filter(u => u.status === f).length
    return acc
  }, {} as Record<string, number>)

  const filtered = activeFilter === 'all' ? allUpdates : allUpdates.filter(u => u.status === activeFilter)
  const criticalPending = allUpdates.filter(u => u.status === 'pending' && u.cveCritical > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        slug={t('updates.slug')}
        title={t('updates.title')}
        subtitle={
          <>
            {t('updates.subtitlePending', { count: counts['pending'] })}
            {criticalPending > 0 && (
              <span className="text-brand-coral ml-2">{t('updates.criticalCves', { count: criticalPending })}</span>
            )}
          </>
        }
        action={
          <Button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}>
            <RefreshCw size={11} className={checkMut.isPending ? 'animate-spin' : ''} />
            {checkMut.isPending ? t('updates.checking') : t('updates.checkNow')}
          </Button>
        }
      />

      {/* Filter row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => {
          const isActive = activeFilter === f
          const dot = f === 'all' ? '#94b4d4' : TONE[STATUS_TONE[f] ?? 'neutral']
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-all duration-150 cursor-pointer"
              style={{
                background: isActive ? `${dot}12` : 'transparent',
                borderColor: isActive ? `${dot}44` : '#0e2040',
                color: isActive ? dot : '#3d5a80',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isActive ? dot : '#1e3a5f' }} />
              {FILTER_LABEL[f]}
              {counts[f] > 0 && (
                <span
                  className="rounded-sm px-1 text-center font-mono"
                  style={{ fontSize: '0.53rem', minWidth: '16px', background: isActive ? `${dot}20` : '#0a1628', color: isActive ? dot : '#3d5a80' }}
                >
                  {counts[f]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="font-mono text-3xs text-text-ghost">
          {t('updates.hint')}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={activeFilter === 'pending' ? t('updates.empty.noPending') : t('updates.empty.noStatus', { status: FILTER_LABEL[activeFilter] })}
          subtitle={activeFilter === 'all' ? t('updates.empty.allUpdated') : t('updates.empty.tryDifferent')}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <UpdateCard
              key={u.id}
              update={u}
              envName={envMap[u.environmentId] ?? t('updates.unknownEnv')}
              isActing={actingId === u.id}
              onApprove={() => { setActingId(u.id); approveMut.mutate(u.id) }}
              onIgnore={() => { setActingId(u.id); ignoreMut.mutate(u.id) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
