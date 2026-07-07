import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus, Trash2, Calendar, Clock, ToggleLeft, ToggleRight,
  Zap, Hand, Timer, Package, Layers, type LucideIcon,
} from 'lucide-react'
import { getEnvironments, getContainers, getSettings, updateSettings } from '../api/client'
import type { Environment, Container, PolicySettings, MaintenanceWindow } from '../api/client'
import PageHeader from '../components/PageHeader'
import { Card, Button, Badge, Input, Select, Label, Tone } from '../components/ui'
import clsx from 'clsx'

// ─── Types ─────────────────────────────────────────────────────────────────
type UpdateMode = 'automatic' | 'manual' | 'scheduled'
type ExceptionMode = UpdateMode | 'skip'

const DEFAULT_STATE: PolicySettings = {
  updateMode: 'manual',
  versionPolicy: { major: false, minor: true, patch: true },
  containerExceptions: [],
  stackExceptions: [],
  maintenanceWindows: [],
}

const MODE_TONE: Record<ExceptionMode, Tone> = {
  automatic: 'emerald', manual: 'cyan', scheduled: 'violet', skip: 'amber',
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDays(days: number[], dayNames: string[], allLabel: string, noneLabel: string): string {
  if (days.length === 7) return allLabel
  if (days.length === 0) return noneLabel
  return days.sort((a, b) => a - b).map(d => dayNames[d]).join(', ')
}

function nextOccurrence(days: number[], startTime: string, locale: string): string {
  if (days.length === 0) return '—'
  const now = new Date()
  const [h, m] = startTime.split(':').map(Number)
  for (let i = 0; i < 8; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    if (days.includes(d.getDay())) {
      d.setHours(h, m, 0, 0)
      if (d > now)
        return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + startTime
    }
  }
  return '—'
}

function ChipRow({ items, selected, onToggle, emptyLabel }: {
  items: { id: string | number; label: string }[]
  selected: (string | number)[]
  onToggle: (id: string | number) => void
  emptyLabel?: string
}) {
  const { t } = useTranslation()
  if (items.length === 0)
    return <span className="font-mono text-text-muted" style={{ fontSize: '0.65rem' }}>{emptyLabel ?? t('policies.noItems')}</span>
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map(item => {
        const active = selected.includes(item.id)
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={clsx(
              'rounded border px-2.5 py-1 font-mono cursor-pointer transition-colors',
              active
                ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan'
                : 'bg-ocean-ink border-border-subtle text-text-soft',
            )}
            style={{ fontSize: '0.65rem' }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function SectionHead({ num, title, subtitle, action }: { num: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
      <div>
        <div className="font-mono text-label text-brand-cyan/40">{`// ${num}`}</div>
        <div className="font-display font-bold text-text-bright text-base">{title}</div>
        {subtitle && <div className="font-mono text-2xs text-text-soft mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

function MiniEmpty({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="py-10 text-center rounded border border-dashed border-border-subtle">
      <Icon size={20} className="mx-auto mb-2 text-text-muted" />
      <p className="font-display font-semibold text-text-soft" style={{ fontSize: '0.8rem' }}>{title}</p>
      <p className="text-text-muted mt-1" style={{ fontSize: '0.65rem' }}>{subtitle}</p>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function Policies() {
  const { t, i18n } = useTranslation()
  const DAYS = t('policies.days', { returnObjects: true }) as string[]

  const MODE_OPTIONS: { value: UpdateMode; label: string; desc: string; Icon: LucideIcon }[] = [
    { value: 'automatic', label: t('policies.section1.modes.automatic.label'), desc: t('policies.section1.modes.automatic.desc'), Icon: Zap },
    { value: 'manual',    label: t('policies.section1.modes.manual.label'),    desc: t('policies.section1.modes.manual.desc'),    Icon: Hand },
    { value: 'scheduled', label: t('policies.section1.modes.scheduled.label'), desc: t('policies.section1.modes.scheduled.desc'), Icon: Timer },
  ]

  const EXCEPTION_MODES: { value: ExceptionMode; label: string }[] = [
    { value: 'automatic', label: t('policies.exceptionModes.automatic') },
    { value: 'manual',    label: t('policies.exceptionModes.manual') },
    { value: 'scheduled', label: t('policies.exceptionModes.scheduled') },
    { value: 'skip',      label: t('policies.exceptionModes.skip') },
  ]

  const MODE_LABEL: Record<ExceptionMode, string> = {
    automatic: t('policies.modeBadge.automatic'),
    manual: t('policies.modeBadge.manual'),
    scheduled: t('policies.modeBadge.scheduled'),
    skip: t('policies.modeBadge.skip'),
  }

  const qc = useQueryClient()
  const [state, setState] = useState<PolicySettings>(DEFAULT_STATE)
  const [excTab, setExcTab] = useState<'container' | 'stack'>('container')

  const { data: environments = [] } = useQuery<Environment[]>({ queryKey: ['environments'], queryFn: getEnvironments })
  const { data: containers = [] } = useQuery<Container[]>({ queryKey: ['containers'], queryFn: getContainers })

  const { data: serverSettings } = useQuery<PolicySettings>({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  useEffect(() => {
    if (serverSettings) setState(serverSettings)
  }, [serverSettings])

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      setState(data)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const persist = (updates: Partial<PolicySettings>) => {
    const next = { ...state, ...updates }
    setState(next)
    saveMutation.mutate(next)
  }

  // ── Exceções por container ───────────────────────────────────────────────
  const [showContForm, setShowContForm] = useState(false)
  const [contForm, setContForm] = useState({ containerId: '', mode: 'skip' as ExceptionMode })

  const addContainerException = () => {
    const cont = containers.find(c => c.id === contForm.containerId)
    if (!cont) return
    const env = environments.find(e => e.id === cont.environmentId)
    persist({
      containerExceptions: [...state.containerExceptions, {
        id: crypto.randomUUID(), containerId: cont.id, containerName: cont.name,
        environmentId: cont.environmentId, environmentName: env?.name ?? '', mode: contForm.mode,
      }],
    })
    setContForm({ containerId: '', mode: 'skip' })
    setShowContForm(false)
  }

  // ── Exceções por stack ───────────────────────────────────────────────────
  const [showStackForm, setShowStackForm] = useState(false)
  const [stackForm, setStackForm] = useState({ stackName: '', mode: 'skip' as ExceptionMode })

  const addStackException = () => {
    if (!stackForm.stackName.trim()) return
    persist({
      stackExceptions: [...state.stackExceptions, {
        id: crypto.randomUUID(), stackName: stackForm.stackName.trim(), mode: stackForm.mode,
      }],
    })
    setStackForm({ stackName: '', mode: 'skip' })
    setShowStackForm(false)
  }

  // ── Janelas de manutenção ────────────────────────────────────────────────
  const emptyWin = () => ({ name: '', days: [] as number[], startTime: '02:00', endTime: '04:00', scope: 'all' as MaintenanceWindow['scope'], environmentIds: [] as number[], containerIds: [] as string[] })
  const [showWinForm, setShowWinForm] = useState(false)
  const [winForm, setWinForm] = useState(emptyWin)

  const addWindow = () => {
    if (!winForm.name || winForm.days.length === 0) return
    persist({
      maintenanceWindows: [...state.maintenanceWindows, {
        id: crypto.randomUUID(), enabled: true,
        name: winForm.name, days: winForm.days, startTime: winForm.startTime, endTime: winForm.endTime,
        scope: winForm.scope, environmentIds: winForm.environmentIds, containerIds: winForm.containerIds,
      }],
    })
    setWinForm(emptyWin())
    setShowWinForm(false)
  }

  const scopeLabel = (w: MaintenanceWindow) => {
    if (w.scope === 'all') return t('policies.section3.allEnvironments')
    if (w.scope === 'environment') return w.environmentIds.map(id => environments.find(e => e.id === id)?.name ?? String(id)).join(', ') || '—'
    return w.containerIds.map(id => containers.find(c => c.id === id)?.name ?? id.slice(0, 8)).join(', ') || '—'
  }

  return (
    <div className="space-y-8">
      <PageHeader
        slug={t('policies.slug')}
        title={t('policies.title')}
        subtitle={t('policies.subtitle')}
      />

      <div className="max-w-3xl mx-auto space-y-4">

        {/* ── 1. Regras de Atualização ── */}
        <Card>
          <SectionHead num={t('policies.section1.num')} title={t('policies.section1.title')} />
          <div className="p-5 space-y-5">
            {/* Mode cards */}
            <div className="grid grid-cols-3 gap-3">
              {MODE_OPTIONS.map(({ value, label, desc, Icon }) => {
                const active = state.updateMode === value
                return (
                  <button
                    key={value}
                    onClick={() => persist({ updateMode: value })}
                    className={clsx(
                      'text-left p-4 rounded border cursor-pointer transition-colors',
                      active ? 'bg-brand-cyan/10 border-brand-cyan/30' : 'bg-ocean-ink border-border-subtle',
                    )}
                  >
                    <div className={clsx('mb-2', active ? 'text-brand-cyan' : 'text-text-soft')}><Icon size={18} /></div>
                    <div className={clsx('font-display font-bold mb-1', active ? 'text-text-bright' : 'text-text-primary')} style={{ fontSize: '0.85rem' }}>{label}</div>
                    <div className="font-mono text-2xs text-text-soft leading-relaxed">{desc}</div>
                    {active && <div className="mt-2.5 font-mono text-brand-cyan tracking-widest" style={{ fontSize: '0.52rem' }}>● {t('policies.section1.active')}</div>}
                  </button>
                )
              })}
            </div>

            {/* Version toggles — inline, dimmed on manual */}
            <div className="border-t border-border-subtle pt-4">
              <div className="mb-2.5">
                <div className="font-display font-semibold text-text-bright" style={{ fontSize: '0.85rem' }}>{t('policies.section1.whichVersions')}</div>
                {state.updateMode === 'manual'
                  ? <div className="font-mono text-2xs text-brand-amber mt-0.5">{t('policies.section1.manualHint')}</div>
                  : <div className="font-mono text-2xs text-text-soft mt-0.5">{t('policies.section1.autoHint')}</div>
                }
              </div>
              <div className={clsx(state.updateMode === 'manual' && 'opacity-35 pointer-events-none')}>
                {([
                  ['major', t('policies.section1.major.name'), t('policies.section1.major.example'), t('policies.section1.major.hint')],
                  ['minor', t('policies.section1.minor.name'), t('policies.section1.minor.example'), t('policies.section1.minor.hint')],
                  ['patch', t('policies.section1.patch.name'), t('policies.section1.patch.example'), t('policies.section1.patch.hint')],
                ] as const).map(([key, name, example, hint]) => {
                  const enabled = state.versionPolicy[key]
                  return (
                    <div key={key} className="flex items-center justify-between py-2.5 border-b border-ocean-surface">
                      <div>
                        <span className="font-display font-semibold text-text-bright text-xs">{name}</span>
                        <span className="font-mono text-2xs text-text-soft ml-2.5">{example}</span>
                        <span className="font-mono text-2xs text-text-muted ml-2">— {hint}</span>
                      </div>
                      <button
                        onClick={() => persist({ versionPolicy: { ...state.versionPolicy, [key]: !enabled } })}
                        className={clsx('bg-transparent border-none cursor-pointer flex shrink-0 ml-4', enabled ? 'text-brand-cyan' : 'text-text-muted')}
                      >
                        {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* ── 2. Exceções ── */}
        <Card>
          <SectionHead
            num={t('policies.section2.num')}
            title={t('policies.section2.title')}
            subtitle={t('policies.section2.subtitle')}
            action={
              <Button variant="primary" onClick={() => { excTab === 'container' ? setShowContForm(v => !v) : setShowStackForm(v => !v) }}>
                <Plus size={11} /> {t('policies.section2.add')}
              </Button>
            }
          />

          {/* Tabs */}
          <div className="flex border-b border-border-subtle">
            {([['container', t('policies.section2.tabContainer'), state.containerExceptions.length], ['stack', t('policies.section2.tabStack'), state.stackExceptions.length]] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                onClick={() => setExcTab(tab)}
                className={clsx(
                  'flex items-center gap-1.5 px-5 py-2.5 font-display bg-transparent border-0 border-b-2 -mb-px cursor-pointer transition-colors',
                  excTab === tab
                    ? 'font-semibold text-brand-cyan border-brand-cyan'
                    : 'font-normal text-text-soft border-transparent',
                )}
                style={{ fontSize: '0.68rem' }}
              >
                {label}
                {count > 0 && (
                  <span className={clsx(
                    'rounded-sm px-1 text-3xs',
                    excTab === tab ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-ocean-surface text-text-soft',
                  )}>{count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Container exception form */}
            {excTab === 'container' && showContForm && (
              <div className="rounded border border-brand-cyan/10 bg-ocean-deep p-4 mb-3 space-y-3">
                <div className="font-mono text-3xs tracking-wider text-text-soft">{t('policies.section2.contFormHint')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('policies.section2.container')}</Label>
                    <Select value={contForm.containerId} onChange={e => setContForm(f => ({ ...f, containerId: e.target.value }))}>
                      <option value="">{t('policies.section2.selectPlaceholder')}</option>
                      {containers.map(c => { const env = environments.find(e => e.id === c.environmentId); return <option key={c.id} value={c.id}>{c.name}{env ? ` (${env.name})` : ''}</option> })}
                    </Select>
                  </div>
                  <div>
                    <Label>{t('policies.section2.policy')}</Label>
                    <Select value={contForm.mode} onChange={e => setContForm(f => ({ ...f, mode: e.target.value as ExceptionMode }))}>
                      {EXCEPTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowContForm(false)}>{t('policies.section2.cancel')}</Button>
                  <Button variant="primary" onClick={addContainerException} disabled={!contForm.containerId}>
                    <Plus size={11} /> {t('policies.section2.save')}
                  </Button>
                </div>
              </div>
            )}

            {/* Stack exception form */}
            {excTab === 'stack' && showStackForm && (
              <div className="rounded border border-brand-cyan/10 bg-ocean-deep p-4 mb-3 space-y-3">
                <div className="font-mono text-3xs tracking-wider text-text-soft">{t('policies.section2.stackFormHint')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('policies.section2.stackName')}</Label>
                    <Input value={stackForm.stackName} onChange={e => setStackForm(f => ({ ...f, stackName: e.target.value }))} placeholder={t('policies.section2.stackPlaceholder')} autoFocus />
                  </div>
                  <div>
                    <Label>{t('policies.section2.policy')}</Label>
                    <Select value={stackForm.mode} onChange={e => setStackForm(f => ({ ...f, mode: e.target.value as ExceptionMode }))}>
                      {EXCEPTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowStackForm(false)}>{t('policies.section2.cancel')}</Button>
                  <Button variant="primary" onClick={addStackException} disabled={!stackForm.stackName.trim()}>
                    <Plus size={11} /> {t('policies.section2.save')}
                  </Button>
                </div>
              </div>
            )}

            {/* Container exception list */}
            {excTab === 'container' && (
              state.containerExceptions.length === 0 && !showContForm ? (
                <MiniEmpty icon={Package} title={t('policies.section2.emptyContainerTitle')} subtitle={t('policies.section2.emptyContainerSubtitle')} />
              ) : (
                <div className="space-y-2">
                  {state.containerExceptions.map(ex => (
                    <div key={ex.id} className="flex items-center gap-3 px-3 py-2.5 rounded bg-ocean-ink border border-border-subtle">
                      <Package size={13} className="text-text-soft shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold text-text-bright" style={{ fontSize: '0.78rem' }}>{ex.containerName}</div>
                        {ex.environmentName && <div className="font-mono text-2xs text-text-soft">{ex.environmentName}</div>}
                      </div>
                      <Badge tone={MODE_TONE[ex.mode as ExceptionMode]} dot={false}>{MODE_LABEL[ex.mode as ExceptionMode]}</Badge>
                      <button
                        onClick={() => persist({ containerExceptions: state.containerExceptions.filter(e => e.id !== ex.id) })}
                        className="text-text-muted hover:text-brand-coral bg-transparent border-none cursor-pointer flex transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Stack exception list */}
            {excTab === 'stack' && (
              state.stackExceptions.length === 0 && !showStackForm ? (
                <MiniEmpty icon={Layers} title={t('policies.section2.emptyStackTitle')} subtitle={t('policies.section2.emptyStackSubtitle')} />
              ) : (
                <div className="space-y-2">
                  {state.stackExceptions.map(ex => (
                    <div key={ex.id} className="flex items-center gap-3 px-3 py-2.5 rounded bg-ocean-ink border border-border-subtle">
                      <Layers size={13} className="text-text-soft shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-semibold text-text-bright" style={{ fontSize: '0.78rem' }}>{ex.stackName}</div>
                        <div className="font-mono text-2xs text-text-soft">{t('policies.section2.dockerComposeProject')}</div>
                      </div>
                      <Badge tone={MODE_TONE[ex.mode as ExceptionMode]} dot={false}>{MODE_LABEL[ex.mode as ExceptionMode]}</Badge>
                      <button
                        onClick={() => persist({ stackExceptions: state.stackExceptions.filter(e => e.id !== ex.id) })}
                        className="text-text-muted hover:text-brand-coral bg-transparent border-none cursor-pointer flex transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </Card>

        {/* ── 3. Janelas de Manutenção ── */}
        <Card>
          <SectionHead
            num={t('policies.section3.num')}
            title={t('policies.section3.title')}
            subtitle={t('policies.section3.subtitle')}
            action={
              <Button variant="primary" onClick={() => setShowWinForm(v => !v)}>
                <Plus size={11} /> {t('policies.section3.newWindow')}
              </Button>
            }
          />

          <div className="p-5 space-y-4">
            {/* Warning when not in scheduled mode */}
            {state.updateMode !== 'scheduled' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-brand-violet/5 border border-brand-violet/10">
                <Timer size={12} className="text-brand-violet shrink-0 mt-0.5" />
                <span className="font-mono text-2xs text-brand-violet leading-relaxed">
                  {t('policies.section3.scheduleWarning')}{' '}
                  <span onClick={() => persist({ updateMode: 'scheduled' })} className="underline cursor-pointer font-bold">{t('policies.section3.scheduledModeName')}</span>.
                  {' '}{t('policies.section3.scheduleWarningSuffix')}
                </span>
              </div>
            )}

            {/* Add form */}
            {showWinForm && (
              <div className="rounded border border-brand-cyan/10 bg-ocean-deep p-4 space-y-4">
                <div>
                  <Label>{t('policies.section3.windowName')}</Label>
                  <Input value={winForm.name} onChange={e => setWinForm(f => ({ ...f, name: e.target.value }))} placeholder={t('policies.section3.windowNamePlaceholder')} autoFocus />
                </div>

                <div>
                  <Label>{t('policies.section3.scope')}</Label>
                  <div className="flex gap-2">
                    {([['all', t('policies.section3.scopeAll')], ['environment', t('policies.section3.scopeEnv')], ['containers', t('policies.section3.scopeContainers')]] as const).map(([v, l]) => (
                      <button
                        key={v}
                        onClick={() => setWinForm(f => ({ ...f, scope: v }))}
                        className={clsx(
                          'rounded border px-3 py-1 font-mono text-2xs cursor-pointer transition-colors',
                          winForm.scope === v
                            ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan'
                            : 'bg-ocean-ink border-border-subtle text-text-soft',
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {winForm.scope === 'environment' && (
                  <div>
                    <Label>{t('policies.section3.environments')}</Label>
                    <ChipRow items={environments.map(e => ({ id: e.id, label: e.name }))} selected={winForm.environmentIds} onToggle={id => setWinForm(f => ({ ...f, environmentIds: f.environmentIds.includes(id as number) ? f.environmentIds.filter(x => x !== id) : [...f.environmentIds, id as number] }))} emptyLabel={t('policies.section3.noEnv')} />
                  </div>
                )}

                {winForm.scope === 'containers' && (
                  <div>
                    <Label>{t('policies.section3.containers')}</Label>
                    <ChipRow items={containers.map(c => ({ id: c.id, label: c.name }))} selected={winForm.containerIds} onToggle={id => setWinForm(f => ({ ...f, containerIds: f.containerIds.includes(id as string) ? f.containerIds.filter(x => x !== id) : [...f.containerIds, id as string] }))} emptyLabel={t('policies.section3.noContainers')} />
                  </div>
                )}

                <div>
                  <Label>{t('policies.section3.weekdays')}</Label>
                  <ChipRow items={DAYS.map((d, i) => ({ id: i, label: d }))} selected={winForm.days} onToggle={id => setWinForm(f => ({ ...f, days: f.days.includes(id as number) ? f.days.filter(x => x !== id) : [...f.days, id as number] }))} />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label>{t('policies.section3.start')}</Label>
                    <Input type="time" value={winForm.startTime} onChange={e => setWinForm(f => ({ ...f, startTime: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <Label>{t('policies.section3.end')}</Label>
                    <Input type="time" value={winForm.endTime} onChange={e => setWinForm(f => ({ ...f, endTime: e.target.value }))} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setShowWinForm(false); setWinForm(emptyWin()) }}>{t('policies.section2.cancel')}</Button>
                  <Button variant="primary" onClick={addWindow} disabled={!winForm.name || winForm.days.length === 0}>
                    <Plus size={11} /> {t('policies.section2.save')}
                  </Button>
                </div>
              </div>
            )}

            {/* Windows list */}
            {state.maintenanceWindows.length === 0 && !showWinForm ? (
              <MiniEmpty icon={Calendar} title={t('policies.section3.emptyTitle')} subtitle={t('policies.section3.emptySubtitle')} />
            ) : (
              <div className="space-y-2">
                {state.maintenanceWindows.map(w => (
                  <div key={w.id} className="rounded bg-ocean-ink border border-border-subtle">
                    <div className="flex items-center gap-3 px-3 py-3">
                      <button
                        onClick={() => persist({ maintenanceWindows: state.maintenanceWindows.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x) })}
                        className={clsx('bg-transparent border-none cursor-pointer shrink-0 flex', w.enabled ? 'text-brand-cyan' : 'text-text-muted')}
                      >
                        {w.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={clsx('font-display font-semibold', w.enabled ? 'text-text-bright' : 'text-text-soft')} style={{ fontSize: '0.8rem' }}>{w.name}</div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-mono text-2xs text-text-soft"><Calendar size={10} />{formatDays(w.days, DAYS, t('policies.allDays'), t('policies.noDays'))}</span>
                          <span className="flex items-center gap-1 font-mono text-2xs text-text-soft"><Clock size={10} />{w.startTime} – {w.endTime}</span>
                          <span className="font-mono text-label text-text-muted">{t('policies.section3.scopeLabel', { scope: scopeLabel(w) })}</span>
                        </div>
                        {w.enabled && <div className="font-mono text-label text-brand-cyan/30 mt-0.5">{t('policies.section3.nextOccurrence', { when: nextOccurrence(w.days, w.startTime, i18n.language) })}</div>}
                      </div>
                      <Badge tone={w.enabled ? 'cyan' : 'neutral'} dot={false}>{w.enabled ? t('policies.section3.active') : t('policies.section3.inactive')}</Badge>
                      <button
                        onClick={() => { if (confirm(t('policies.section3.removeConfirm', { name: w.name }))) persist({ maintenanceWindows: state.maintenanceWindows.filter(x => x.id !== w.id) }) }}
                        className="text-text-muted hover:text-brand-coral bg-transparent border-none cursor-pointer flex transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  )
}
