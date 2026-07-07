import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Database, Plus, Trash2, Pencil, CheckCircle, XCircle, Loader2, X } from 'lucide-react'
import { getRegistries, createRegistry, updateRegistry, deleteRegistry, testRegistry, Registry } from '../api/client'
import PageHeader from '../components/PageHeader'
import { Card, Button, Input, Label, EmptyState } from '../components/ui'
import clsx from 'clsx'

type RegistryType = 'dockerhub' | 'ghcr' | 'generic'

function useTypeMeta(): Record<RegistryType, { label: string; color: string; abbr: string; logo?: string; host: string; hostLabel: string }> {
  const { t } = useTranslation()
  return {
    dockerhub: { label: t('registries.types.dockerhub'), color: '#2496ED', abbr: 'DH', logo: '/docker-hub.png', host: 'index.docker.io', hostLabel: t('registries.hostLabels.dockerhub') },
    ghcr:      { label: t('registries.types.ghcr'),      color: '#e8eaed', abbr: 'GH', logo: '/github.png',     host: 'ghcr.io',         hostLabel: t('registries.hostLabels.ghcr') },
    generic:   { label: t('registries.types.generic'),   color: '#7aa3c0', abbr: 'R',                           host: '',                hostLabel: t('registries.hostLabels.generic') },
  }
}

interface FormState {
  name: string
  type: RegistryType
  host: string
  username: string
  password: string
}

const EMPTY: FormState = { name: '', type: 'dockerhub', username: '', password: '', host: '' }

function TypeBadge({ type }: { type: RegistryType }) {
  const TYPE_META = useTypeMeta()
  const m = TYPE_META[type]
  return (
    <span
      className="inline-flex items-center justify-center rounded shrink-0 w-8 h-8 border"
      style={{ background: `${m.color}18`, borderColor: `${m.color}44` }}
    >
      {m.logo
        ? <img src={m.logo} width={18} height={18} alt={m.label} className="object-contain" />
        : <span className="font-mono font-bold text-2xs" style={{ color: m.color }}>{m.abbr}</span>
      }
    </span>
  )
}

export default function Registries() {
  const { t } = useTranslation()
  const TYPE_META = useTypeMeta()
  const qc = useQueryClient()
  const { data: registries = [], isLoading } = useQuery({ queryKey: ['registries'], queryFn: getRegistries })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Registry | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const createMut = useMutation({ mutationFn: createRegistry, onSuccess: () => { qc.invalidateQueries({ queryKey: ['registries'] }); closePanel() } })
  const updateMut = useMutation({ mutationFn: ({ id, r }: { id: number; r: Partial<Registry> }) => updateRegistry(id, r), onSuccess: () => { qc.invalidateQueries({ queryKey: ['registries'] }); closePanel() } })
  const deleteMut = useMutation({ mutationFn: deleteRegistry, onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }) })

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setTestResult(null)
    setOpen(true)
  }

  function openEdit(r: Registry) {
    setEditing(r)
    setForm({ name: r.name, type: r.type, host: r.host, username: r.username, password: '' })
    setTestResult(null)
    setOpen(true)
  }

  function closePanel() {
    setOpen(false)
    setEditing(null)
    setTestResult(null)
  }

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const host = form.type === 'generic' ? form.host : undefined
      const res = await testRegistry({ host, type: form.type, username: form.username, password: form.password })
      setTestResult(res)
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    const payload: Partial<Registry> = {
      name: form.name || TYPE_META[form.type].label,
      type: form.type,
      host: form.type === 'generic' ? form.host : TYPE_META[form.type].host,
      username: form.username,
      password: form.password,
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, r: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const meta = TYPE_META[form.type]
  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-8">
      <PageHeader
        slug={t('registries.slug')}
        title={t('registries.title')}
        subtitle={t('registries.subtitle')}
        action={
          <Button variant="primary" onClick={openAdd}>
            <Plus size={13} />
            {t('registries.add')}
          </Button>
        }
      />

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : registries.length === 0 ? (
        <EmptyState
          icon={Database}
          title={t('registries.empty.title')}
          subtitle={t('registries.empty.subtitle')}
        />
      ) : (
        <div className="space-y-1.5">
          {registries.map(r => (
            <Card key={r.id} className="flex items-center gap-3 px-4 py-3">
              <TypeBadge type={r.type} />
              <div className="flex-1 min-w-0">
                <div className="font-display font-medium text-text-bright" style={{ fontSize: '0.82rem' }}>
                  {r.name}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="font-mono text-text-soft" style={{ fontSize: '0.65rem' }}>{r.host}</span>
                  {r.username && (
                    <span className="font-mono text-2xs text-text-muted">{t('registries.user', { username: r.username })}</span>
                  )}
                </div>
              </div>
              <span
                className="font-mono text-label rounded border px-1.5 py-0.5"
                style={{
                  background: `${TYPE_META[r.type]?.color ?? '#7aa3c0'}18`,
                  borderColor: `${TYPE_META[r.type]?.color ?? '#7aa3c0'}33`,
                  color: TYPE_META[r.type]?.color ?? '#7aa3c0',
                }}
              >
                {TYPE_META[r.type]?.label ?? r.type}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded transition-colors hover:bg-white/5 bg-transparent border-none cursor-pointer">
                  <Pencil size={13} className="text-text-soft" />
                </button>
                <button onClick={() => deleteMut.mutate(r.id)} className="p-1.5 rounded transition-colors hover:bg-brand-coral/10 bg-transparent border-none cursor-pointer">
                  <Trash2 size={13} className="text-brand-coral" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-void/80" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-xl p-6 space-y-5 bg-ocean-surface border border-border-subtle">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-text-bright text-base">
                {editing ? t('registries.panel.editTitle') : t('registries.panel.addTitle')}
              </h2>
              <button onClick={closePanel} className="p-1 rounded hover:bg-white/5 bg-transparent border-none cursor-pointer">
                <X size={15} className="text-text-soft" />
              </button>
            </div>

            {/* Type selector */}
            <div>
              <Label>{t('registries.panel.type')}</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(Object.keys(TYPE_META) as RegistryType[]).map(rt => (
                  <button
                    key={rt}
                    onClick={() => set('type', rt)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 p-2.5 rounded border transition-all cursor-pointer',
                      form.type === rt ? '' : 'border-border-subtle bg-ocean-deep',
                    )}
                    style={form.type === rt ? { borderColor: `${TYPE_META[rt].color}55`, background: `${TYPE_META[rt].color}10` } : {}}
                  >
                    <span className="rounded flex items-center justify-center w-7 h-7" style={{ background: `${TYPE_META[rt].color}18` }}>
                      {TYPE_META[rt].logo
                        ? <img src={TYPE_META[rt].logo} width={16} height={16} alt={TYPE_META[rt].label} className="object-contain" />
                        : <span className="font-mono font-bold text-2xs" style={{ color: TYPE_META[rt].color }}>{TYPE_META[rt].abbr}</span>
                      }
                    </span>
                    <span className={clsx('font-display text-2xs text-center leading-tight', form.type === rt ? 'text-text-bright' : 'text-text-soft')}>
                      {TYPE_META[rt].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <Label>{t('registries.panel.name')}</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={meta.label} />
            </div>

            {/* Host — only for generic */}
            {form.type === 'generic' ? (
              <div>
                <Label>{t('registries.panel.host')}</Label>
                <Input value={form.host} onChange={e => set('host', e.target.value)} placeholder={meta.hostLabel} />
              </div>
            ) : (
              <div>
                <Label className="text-text-muted">{t('registries.panel.hostGeneric')}</Label>
                <div className="px-3 py-2 rounded font-mono text-2xs bg-ocean-deep border border-border-subtle text-text-muted">
                  {meta.hostLabel}
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <Label>{form.type === 'ghcr' ? t('registries.panel.usernameGhcr') : t('registries.panel.username')}</Label>
              <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder={t('registries.panel.usernamePlaceholder')} autoComplete="username" />
            </div>

            {/* Password / Token */}
            <div>
              <Label>{form.type === 'ghcr' ? t('registries.panel.passwordGhcr') : form.type === 'dockerhub' ? t('registries.panel.passwordDockerhub') : t('registries.panel.password')}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={editing ? t('registries.panel.passwordKeepCurrent') : '••••••••'}
                autoComplete="new-password"
              />
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded font-mono text-2xs border',
                  testResult.ok
                    ? 'bg-brand-emerald/10 border-brand-emerald/20 text-brand-emerald'
                    : 'bg-brand-coral/10 border-brand-coral/20 text-brand-coral',
                )}
              >
                {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                {testResult.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleTest} disabled={testing || !form.username}>
                {testing && <Loader2 size={11} className="animate-spin" />}
                {t('registries.panel.testConnection')}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={closePanel}>{t('registries.panel.cancel')}</Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || (!editing && !form.password) || (form.type === 'generic' && !form.host)}
              >
                {saving && <Loader2 size={11} className="animate-spin" />}
                {t('registries.panel.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
