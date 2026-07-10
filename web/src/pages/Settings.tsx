import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Bell, CheckCircle, XCircle, Loader, Copy, Check, RefreshCw, Server, HardDrive, Network, Bot, Pencil, X, ChevronDown, LogOut, KeyRound } from 'lucide-react'
import {
  getEnvironments, addEnvironment, deleteEnvironment, updateEnvironment, testEnvironmentConnection,
  getNotificationChannels, addChannel, deleteChannel, testChannel, updateChannel,
  changePassword,
  NotificationChannel, Environment,
} from '../api/client'
import PageHeader from '../components/PageHeader'
import { Card, Button, Input, Label } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { copyToClipboard } from '../lib/clipboard'

// Kept for composed variants (http:// prefix inputs, pre block, token display)
const inputStyle = {
  background: '#06090f', border: '1px solid #0e2040', color: '#94b4d4',
  borderRadius: '3px', padding: '7px 10px', fontSize: '0.75rem',
  fontFamily: 'JetBrains Mono, monospace', width: '100%', outline: 'none',
}

function SectionCard({ title, comment, children }: { title: string; comment: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border-subtle">
        <div className="font-mono text-label text-brand-cyan/40">{comment}</div>
        <div className="font-display font-bold text-text-bright text-base mt-0.5">{title}</div>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

type EnvType = 'socket' | 'tcp' | 'agent'

function genToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(t('common.copyFailed', 'Não foi possível copiar'))
    }
  }, [text, t])
  return (
    <button onClick={copy} title={t('common.copy', 'Copiar')}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#34d399' : '#7aa3c0', display: 'flex', alignItems: 'center' }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function useTypeOptions(): { value: EnvType; label: string; desc: string; icon: React.ReactNode }[] {
  const { t } = useTranslation()
  return [
    { value: 'socket', label: t('settings.environments.types.socket.label'), desc: t('settings.environments.types.socket.desc'), icon: <HardDrive size={16} /> },
    { value: 'tcp',    label: t('settings.environments.types.tcp.label'),    desc: t('settings.environments.types.tcp.desc'),    icon: <Network size={16} /> },
    { value: 'agent',  label: t('settings.environments.types.agent.label'), desc: t('settings.environments.types.agent.desc'), icon: <Bot size={16} /> },
  ]
}

function EnvSection() {
  const { t } = useTranslation()
  const TYPE_OPTIONS = useTypeOptions()
  const qc = useQueryClient()
  const [step, setStep] = useState<1 | 2>(1)
  const [envType, setEnvType] = useState<EnvType>('socket')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [token, setToken] = useState(genToken)
  const [testState, setTestState] = useState<null | 'testing' | 'ok' | 'err'>(null)
  const [testMsg, setTestMsg] = useState('')

  // Edit state
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null)
  const [editName, setEditName] = useState('')
  const [editHost, setEditHost] = useState('')
  const [editToken, setEditToken] = useState('')

  const startEdit = (e: Environment) => {
    setEditingEnv(e)
    setEditName(e.name)
    setEditHost(e.type === 'agent' ? e.host.replace('http://', '') : e.host)
    setEditToken(e.token || '')
  }
  const cancelEdit = () => setEditingEnv(null)

  const { data: envs = [] } = useQuery({ queryKey: ['environments'], queryFn: getEnvironments })
  const deleteMut = useMutation({ mutationFn: deleteEnvironment, onSuccess: () => qc.invalidateQueries({ queryKey: ['environments'] }) })
  const editMut = useMutation({
    mutationFn: () => updateEnvironment(editingEnv!.id, {
      name: editName,
      host: editingEnv!.type === 'agent' ? `http://${editHost}` : editHost,
      type: editingEnv!.type,
      token: editingEnv!.type === 'agent' ? editToken : '',
    }),
    onSuccess: () => { setEditingEnv(null); qc.invalidateQueries({ queryKey: ['environments'] }) },
  })
  const addMut = useMutation({
    mutationFn: () => addEnvironment({
      name,
      host: envType === 'agent' ? agentURL : (host || 'unix:///var/run/docker.sock'),
      type: envType,
      token: envType === 'agent' ? token : '',
    }),
    onSuccess: () => {
      setStep(1); setName(''); setHost(''); setToken(genToken()); setTestState(null)
      qc.invalidateQueries({ queryKey: ['environments'] })
    },
  })

  const handleTest = async () => {
    setTestState('testing'); setTestMsg('')
    try {
      const h = envType === 'agent' ? agentURL : (host || 'unix:///var/run/docker.sock')
      const res = await testEnvironmentConnection({ host: h, type: envType, token: envType === 'agent' ? token : undefined })
      if (res.ok) { setTestState('ok'); setTestMsg(`Docker API ${res.apiVersion}`) }
      else { setTestState('err'); setTestMsg(res.error || t('common.failed', 'falha')) }
    } catch (e: any) { setTestState('err'); setTestMsg(e.message) }
  }

  const agentURL = host ? `http://${host}` : ''
  const [installTab, setInstallTab] = useState<'run' | 'compose'>('run')
  const dockerRunCmd = `docker run -d --name timoneiro-agent \\
  --restart unless-stopped \\
  -p 1895:1895 \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -e TIMONEIRO_AGENT_TOKEN=${token} \\
  ghcr.io/luiscruzcwb/timoneiro-agent:latest`
  const dockerComposeCmd = `services:
  timoneiro-agent:
    image: ghcr.io/luiscruzcwb/timoneiro-agent:latest
    container_name: timoneiro-agent
    restart: unless-stopped
    ports:
      - "1895:1895"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - TIMONEIRO_AGENT_TOKEN=${token}
    labels:
      - "dev.timoneiro.enable=false"`

  const typeIcon = (t: string) => t === 'agent' ? <Bot size={11} /> : t === 'tcp' ? <Network size={11} /> : <HardDrive size={11} />

  return (
    <SectionCard title={t('settings.environments.title')} comment={t('settings.environments.comment')}>
      <div className="space-y-4">
        {/* Existing environments */}
        {(envs as Environment[]).map(e => (
          <div key={e.id} style={{ border: '1px solid #0e2040', borderRadius: '3px', background: '#06090f', overflow: 'hidden' }}>
            {/* Row */}
            <div className="flex items-center gap-3 px-3 py-2">
              <div style={{ color: '#22d3ee66', flexShrink: 0 }}>{typeIcon(e.type)}</div>
              <div className="flex-1 min-w-0">
                <div style={{ color: '#e2f0ff', fontSize: '0.8rem', fontFamily: 'Sora, sans-serif', fontWeight: 600 }}>{e.name}</div>
                <div className="font-mono truncate" style={{ color: '#7aa3c0', fontSize: '0.62rem' }}>{e.host}</div>
              </div>
              <div style={{ color: '#22d3ee44', fontSize: '0.55rem', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', flexShrink: 0 }}>{e.type}</div>
              <button onClick={() => editingEnv?.id === e.id ? cancelEdit() : startEdit(e)}
                style={{ color: editingEnv?.id === e.id ? '#22d3ee' : '#3d5a80', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={ev => (ev.currentTarget.style.color = '#22d3ee')}
                onMouseLeave={ev => (ev.currentTarget.style.color = editingEnv?.id === e.id ? '#22d3ee' : '#3d5a80')}>
                {editingEnv?.id === e.id ? <X size={13} /> : <Pencil size={13} />}
              </button>
              <button onClick={() => { if (confirm(t('settings.environments.removeConfirm', { name: e.name }))) deleteMut.mutate(e.id) }}
                style={{ color: '#7aa3c0', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={ev => (ev.currentTarget.style.color = '#f87171')}
                onMouseLeave={ev => (ev.currentTarget.style.color = '#3d5a80')}>
                <Trash2 size={13} />
              </button>
            </div>

            {/* Inline edit form */}
            {editingEnv?.id === e.id && (
              <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid #0e2040' }}>
                <div className="flex gap-2 pt-3">
                  <div style={{ flex: '0 0 160px' }}>
                    <Label>{t('settings.environments.name')}</Label>
                    <Input value={editName} onChange={ev => setEditName(ev.target.value)} autoFocus />
                  </div>
                  <div className="flex-1">
                    <Label>{e.type === 'agent' ? t('settings.environments.agentAddress') : t('settings.environments.dockerHost')}</Label>
                    {e.type === 'agent' ? (
                      <div className="flex items-center" style={{ border: '1px solid #0e2040', borderRadius: '3px', background: '#06090f', overflow: 'hidden' }}>
                        <span style={{ padding: '7px 8px', color: '#7aa3c0', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', borderRight: '1px solid #0e2040', whiteSpace: 'nowrap', userSelect: 'none' }}>http://</span>
                        <input style={{ ...inputStyle, border: 'none', borderRadius: 0, flex: 1 }} value={editHost} onChange={ev => setEditHost(ev.target.value)} />
                      </div>
                    ) : (
                      <Input value={editHost} onChange={ev => setEditHost(ev.target.value)} />
                    )}
                  </div>
                  {e.type === 'agent' && (
                    <div className="flex-1">
                      <Label>{t('settings.environments.token')}</Label>
                      <Input value={editToken} onChange={ev => setEditToken(ev.target.value)} />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={cancelEdit}
                    style={{ background: 'none', border: 'none', color: '#7aa3c0', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                    {t('settings.environments.cancel')}
                  </button>
                  <button onClick={() => editMut.mutate()} disabled={!editName || editMut.isPending}
                    className="flex items-center gap-1.5 disabled:opacity-40"
                    style={{ background: '#22d3ee12', border: '1px solid #22d3ee33', color: '#22d3ee', padding: '5px 12px', borderRadius: '3px', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                    {editMut.isPending ? <Loader size={11} className="animate-spin" /> : <Check size={11} />}
                    {t('settings.environments.save')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Wizard */}
        <div style={{ border: '1px solid #0e2040', borderRadius: '4px', overflow: 'hidden' }}>
          {/* Step 1: choose type */}
          <div className="p-4" style={{ borderBottom: step === 2 ? '1px solid #0e2040' : undefined }}>
            <div style={{ color: '#7aa3c0', fontSize: '0.55rem', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace', marginBottom: '10px' }}>
              {t('settings.environments.step1')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => { setEnvType(opt.value); setStep(2) }}
                  style={{
                    background: envType === opt.value && step === 2 ? '#22d3ee0f' : '#06090f',
                    border: `1px solid ${envType === opt.value && step === 2 ? '#22d3ee44' : '#0e2040'}`,
                    borderRadius: '3px', padding: '10px 8px', cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ color: envType === opt.value && step === 2 ? '#22d3ee' : '#7aa3c0', marginBottom: '4px' }}>{opt.icon}</div>
                  <div style={{ color: '#e2f0ff', fontSize: '0.72rem', fontFamily: 'Sora, sans-serif', fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ color: '#7aa3c0', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px', lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: details */}
          {step === 2 && (
            <div className="p-4 space-y-4">
              <div style={{ color: '#7aa3c0', fontSize: '0.55rem', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace', marginBottom: '2px' }}>
                {t('settings.environments.step2')}
              </div>

              <div>
                <Label>{t('settings.environments.envName')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={envType === 'agent' ? t('settings.environments.envNamePlaceholderAgent') : t('settings.environments.envNamePlaceholderLocal')} autoFocus />
              </div>

              {envType === 'agent' && (
                <>
                  <div>
                    <Label>{t('settings.environments.authToken')}</Label>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 flex items-center gap-2 px-2" style={{ ...inputStyle, padding: '7px 10px', display: 'flex' }}>
                        <span className="flex-1 truncate" style={{ color: '#22d3ee', letterSpacing: '0.05em' }}>{token}</span>
                        <CopyButton text={token} />
                      </div>
                      <button onClick={() => setToken(genToken())} title={t('settings.environments.generateNewToken')}
                        style={{ background: '#06090f', border: '1px solid #0e2040', borderRadius: '3px', padding: '7px 9px', cursor: 'pointer', color: '#7aa3c0', display: 'flex' }}>
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-1.5">{t('settings.environments.runOnRemote')}</Label>
                    {/* Tabs */}
                    <div className="flex" style={{ borderBottom: '1px solid #0e2040', marginBottom: '0' }}>
                      {(['run', 'compose'] as const).map(tab => (
                        <button key={tab} onClick={() => setInstallTab(tab)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '5px 12px', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace',
                            color: installTab === tab ? '#22d3ee' : '#7aa3c0',
                            borderBottom: installTab === tab ? '1px solid #22d3ee' : '1px solid transparent',
                            marginBottom: '-1px',
                          }}>
                          {tab === 'run' ? 'docker run' : 'docker compose'}
                        </button>
                      ))}
                      <div className="flex-1" />
                      <CopyButton text={installTab === 'run' ? dockerRunCmd : dockerComposeCmd} />
                    </div>
                    <pre style={{ ...inputStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6, color: '#94b4d4', padding: '10px', minHeight: 'unset', borderRadius: '0 0 3px 3px', marginTop: 0 }}>
                      {installTab === 'run' ? dockerRunCmd : dockerComposeCmd}
                    </pre>
                  </div>

                  <div>
                    <Label>{t('settings.environments.agentAddress')}</Label>
                    <div className="flex items-center" style={{ border: '1px solid #0e2040', borderRadius: '3px', background: '#06090f', overflow: 'hidden' }}>
                      <span style={{ padding: '7px 8px', color: '#7aa3c0', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', borderRight: '1px solid #0e2040', whiteSpace: 'nowrap', userSelect: 'none' }}>http://</span>
                      <input style={{ ...inputStyle, border: 'none', borderRadius: 0, flex: 1 }} value={host} onChange={e => setHost(e.target.value)} placeholder={t('settings.environments.agentAddressPlaceholder')} />
                    </div>
                  </div>
                </>
              )}

              {(envType === 'socket' || envType === 'tcp') && (
                <div>
                  <Label>{t('settings.environments.dockerHost')}</Label>
                  <Input value={host}
                    onChange={e => setHost(e.target.value)}
                    placeholder={envType === 'socket' ? t('settings.environments.dockerHostPlaceholderSocket') : t('settings.environments.dockerHostPlaceholderTcp')} />
                </div>
              )}

              {/* Test + Add */}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleTest} disabled={testState === 'testing' || (envType === 'agent' && !host)}
                  className="flex items-center gap-1.5 disabled:opacity-40"
                  style={{ background: '#06090f', border: '1px solid #0e2040', color: '#94b4d4', padding: '7px 12px', borderRadius: '3px', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                  {testState === 'testing' ? <Loader size={11} className="animate-spin" /> : <Server size={11} />}
                  {t('settings.environments.testConnection')}
                </button>
                {testState === 'ok' && <span style={{ color: '#34d399', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={11} />{testMsg}</span>}
                {testState === 'err' && <span style={{ color: '#f87171', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={11} />{testMsg}</span>}

                <div className="flex-1" />

                <button onClick={() => { setStep(1); setTestState(null) }}
                  style={{ background: 'none', border: 'none', color: '#7aa3c0', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                  {t('settings.environments.cancel')}
                </button>
                <button onClick={() => addMut.mutate()} disabled={!name || addMut.isPending || (envType === 'agent' && !host)}
                  className="flex items-center gap-1.5 disabled:opacity-40"
                  style={{ background: '#22d3ee12', border: '1px solid #22d3ee33', color: '#22d3ee', padding: '7px 14px', borderRadius: '3px', fontSize: '0.62rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                  {addMut.isPending ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
                  {t('settings.environments.add')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Service definitions ───────────────────────────────────────────────────
type FieldDef = {
  key: string; label: string; placeholder: string
  hint?: string; type?: 'text' | 'password' | 'url'
}
type ServiceDef = {
  type: string; label: string; color: string; abbr: string; description: string
  fields?: FieldDef[]
  buildUrl?: (f: Record<string, string>) => string
  placeholder?: string // raw URL mode
}

function usePopularServices(): ServiceDef[] {
  const { t } = useTranslation()
  return [
    {
      type: 'discord', label: 'Discord', color: '#5865F2', abbr: 'DC',
      description: t('settings.notifications.services.discord.description'),
      fields: [
        { key: 'webhookUrl', label: t('settings.notifications.services.discord.webhookUrl'), type: 'url',
          placeholder: 'https://discord.com/api/webhooks/000/xxx',
          hint: t('settings.notifications.services.discord.webhookHint') },
      ],
      buildUrl: (f) => {
        const m = f.webhookUrl.match(/webhooks\/(\d+)\/([^/?]+)/)
        return m ? `discord://${m[2]}@${m[1]}` : f.webhookUrl
      },
    },
    {
      type: 'telegram', label: 'Telegram', color: '#2AABEE', abbr: 'TG',
      description: t('settings.notifications.services.telegram.description'),
      fields: [
        { key: 'token', label: t('settings.notifications.services.telegram.token'), placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
          hint: t('settings.notifications.services.telegram.tokenHint') },
        { key: 'chatId', label: t('settings.notifications.services.telegram.chatId'), placeholder: '-1001234567890',
          hint: t('settings.notifications.services.telegram.chatIdHint') },
      ],
      buildUrl: (f) => `telegram://${f.token}@telegram?channels=${f.chatId}`,
    },
    {
      type: 'slack', label: 'Slack', color: '#4A154B', abbr: 'SL',
      description: t('settings.notifications.services.slack.description'),
      fields: [
        { key: 'webhookUrl', label: t('settings.notifications.services.slack.webhookUrl'), type: 'url',
          placeholder: 'https://hooks.slack.com/services/T.../B.../...',
          hint: t('settings.notifications.services.slack.webhookHint') },
      ],
      buildUrl: (f) => {
        const m = f.webhookUrl.match(/services\/([^/]+)\/([^/]+)\/([^/?]+)/)
        return m ? `slack://hook:${m[1]}-${m[2]}-${m[3]}@slack` : f.webhookUrl
      },
    },
    {
      type: 'smtp', label: 'E-mail', color: '#22d3ee', abbr: '@',
      description: t('settings.notifications.services.smtp.description'), // handled by SmtpForm
    },
    {
      type: 'gotify', label: 'Gotify', color: '#F26522', abbr: 'GT',
      description: t('settings.notifications.services.gotify.description'),
      fields: [
        { key: 'host', label: t('settings.notifications.services.gotify.server'), placeholder: 'notify.meudominio.com',
          hint: t('settings.notifications.services.gotify.serverHint') },
        { key: 'token', label: t('settings.notifications.services.gotify.token'), placeholder: 'Axxxxxxxxxx_xxxx',
          hint: t('settings.notifications.services.gotify.tokenHint') },
      ],
      buildUrl: (f) => `gotify://${f.host.replace(/^https?:\/\//, '')}/${f.token}`,
    },
    {
      type: 'ntfy', label: 'Ntfy', color: '#338573', abbr: 'NT',
      description: t('settings.notifications.services.ntfy.description'),
      fields: [
        { key: 'topic', label: t('settings.notifications.services.ntfy.topic'), placeholder: 'timoneiro-alertas',
          hint: t('settings.notifications.services.ntfy.topicHint') },
        { key: 'host', label: t('settings.notifications.services.ntfy.server'), placeholder: 'ntfy.sh',
          hint: t('settings.notifications.services.ntfy.serverHint') },
      ],
      buildUrl: (f) => {
        const host = f.host?.trim() || 'ntfy.sh'
        return `ntfy://${host}/${f.topic}`
      },
    },
    {
      type: 'webhook', label: 'Webhook', color: '#7aa3c0', abbr: '{}',
      description: t('settings.notifications.services.webhook.description'),
      fields: [
        { key: 'url', label: t('settings.notifications.services.webhook.url'), type: 'url', placeholder: 'https://meuservidor.com/hooks/timoneiro' },
      ],
      buildUrl: (f) => {
        const u = f.url.replace(/^https?:\/\//, '')
        return f.url.startsWith('https') ? `generic+https://${u}` : `generic+http://${u}`
      },
    },
  ]
}

const OTHERS: ServiceDef[] = [
  { type: 'pushover',   label: 'Pushover',    color: '#249CE0', abbr: 'PO', description: '', placeholder: 'pushover://shh/USERKEY@APP_API_TOKEN' },
  { type: 'pushbullet', label: 'Pushbullet',  color: '#4AB367', abbr: 'PB', description: '', placeholder: 'pushbullet://API_TOKEN/#CHANNEL_TAG' },
  { type: 'rocketchat', label: 'Rocket.Chat', color: '#F5455C', abbr: 'RC', description: '', placeholder: 'rocketchat://USER:PASSWORD@HOSTNAME/CHANNEL' },
  { type: 'mattermost', label: 'Mattermost',  color: '#0273B7', abbr: 'MM', description: '', placeholder: 'mattermost://USER:PASSWORD@HOSTNAME/TOKEN' },
  { type: 'matrix',     label: 'Matrix',      color: '#0DBD8B', abbr: 'MX', description: '', placeholder: 'matrix://USER:PASSWORD@HOSTNAME/!ROOMID' },
  { type: 'teams',      label: 'MS Teams',    color: '#6264A7', abbr: 'MT', description: '', placeholder: 'teams://WEBHOOKID@WEBHOOKTOKEN/GROUPID/TENANTID' },
  { type: 'googlechat', label: 'Google Chat', color: '#1A73E8', abbr: 'GC', description: '', placeholder: 'googlechat://WEBHOOK_URL' },
  { type: 'opsgenie',   label: 'OpsGenie',    color: '#172B4D', abbr: 'OG', description: '', placeholder: 'opsgenie://API_KEY@HOST?responders=RESPONDER' },
  { type: 'zulip',      label: 'Zulip',       color: '#48B0AC', abbr: 'ZP', description: '', placeholder: 'zulip://BOT_MAIL:API_KEY@HOSTNAME/STREAM/TOPIC' },
]

function ServiceBadge({ svc, size = 28 }: { svc: ServiceDef; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '6px', flexShrink: 0,
      background: `${svc.color}22`, border: `1px solid ${svc.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 28 ? '0.5rem' : '0.62rem',
      fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
      color: svc.color, letterSpacing: '0.04em',
    }}>
      {svc.abbr}
    </div>
  )
}

// ─── Guided form (generic) ─────────────────────────────────────────────────
function GuidedForm({ svc, name, setName, fields, onAdd, onAddAndTest, isPending }: {
  svc: ServiceDef; name: string; setName: (v: string) => void
  fields: Record<string, string>
  onAdd: (url: string) => void; onAddAndTest: (url: string) => void; isPending: boolean
}) {
  const { t } = useTranslation()
  const [vals, setVals] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setVals(p => ({ ...p, [k]: v }))

  const url = svc.buildUrl && svc.fields?.every(f => !f.key.includes('optional') || vals[f.key])
    ? (() => { try { return svc.buildUrl!({ ...vals }) } catch { return '' } })()
    : ''
  const filled = !!(name && svc.fields?.filter(f => !f.hint?.includes('opcional')).every(f => vals[f.key]?.trim()))

  return (
    <div className="p-4 space-y-3">
      <div>
        <Label>{t('settings.notifications.channelName')}</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={`${svc.label} — ${t('settings.notifications.channelNameSuffix')}`} autoFocus />
      </div>
      {svc.fields?.map(f => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <input
            style={inputStyle} type={f.type === 'password' ? 'password' : 'text'}
            value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
            placeholder={f.placeholder} autoComplete={f.type === 'password' ? 'new-password' : 'off'}
          />
          {f.hint && <div style={{ color: '#3d5a80', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>// {f.hint}</div>}
        </div>
      ))}
      {url && (
        <div style={{ background: '#03060d', border: '1px solid #0e2040', borderRadius: '3px', padding: '8px 10px' }}>
          <div style={{ color: '#3d5a80', fontSize: '0.52rem', fontFamily: 'JetBrains Mono, monospace', marginBottom: '3px' }}>{t('settings.notifications.generatedUrl')}</div>
          <div className="truncate" style={{ color: '#7aa3c0', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>{url.replace(/:([^:@]{2})[^:@]*@/, ':$1•••@')}</div>
        </div>
      )}
      <AddButtons url={url} name={name} filled={filled} isPending={isPending} onAdd={onAdd} onAddAndTest={onAddAndTest} />
    </div>
  )
}

// ─── SMTP guided form ──────────────────────────────────────────────────────
function SmtpForm({ name, setName, onAdd, onAddAndTest, isPending }: {
  name: string; setName: (v: string) => void
  onAdd: (url: string) => void; onAddAndTest: (url: string) => void; isPending: boolean
}) {
  const { t } = useTranslation()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const [enc, setEnc]   = useState<'none' | 'starttls' | 'tls'>('starttls')

  const buildUrl = () => {
    const u = encodeURIComponent(user), p = encodeURIComponent(pass)
    const f = encodeURIComponent(from)
    const t = to.split(',').map(s => `to=${encodeURIComponent(s.trim())}`).filter(Boolean).join('&')
    const tls = enc === 'tls' ? '&tls=true' : enc === 'starttls' ? '&starttls=true' : ''
    return `smtp://${u}:${p}@${host}:${port}/?from=${f}&${t}${tls}`
  }
  const url    = host && user && from && to ? buildUrl() : ''
  const filled = !!(name && host && user && from && to)

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t('settings.notifications.channelName')}</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={t('settings.notifications.smtp.namePlaceholder')} autoFocus /></div>
        <div><Label>{t('settings.notifications.smtp.server')}</Label><Input value={host} onChange={e => setHost(e.target.value)} placeholder={t('settings.notifications.smtp.serverPlaceholder')} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label>{t('settings.notifications.smtp.encryption')}</Label>
          <div className="flex gap-1.5">
            {([['none', t('settings.notifications.smtp.none'), '25'], ['starttls', 'STARTTLS', '587'], ['tls', 'SSL/TLS', '465']] as const).map(([v, l, p]) => (
              <button key={v} onClick={() => { setEnc(v); setPort(p) }}
                style={{ flex:1, padding:'6px 4px', borderRadius:'3px', fontSize:'0.62rem', fontFamily:'JetBrains Mono, monospace', cursor:'pointer', background: enc===v ? '#22d3ee12' : '#06090f', border:`1px solid ${enc===v ? '#22d3ee44' : '#0e2040'}`, color: enc===v ? '#22d3ee' : '#7aa3c0' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div><Label>{t('settings.notifications.smtp.port')}</Label><Input value={port} onChange={e => setPort(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t('settings.notifications.smtp.user')}</Label><Input value={user} onChange={e => setUser(e.target.value)} placeholder={t('settings.notifications.smtp.userPlaceholder')} autoComplete="off" /></div>
        <div><Label>{t('settings.notifications.smtp.pass')}</Label><Input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" autoComplete="new-password" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t('settings.notifications.smtp.from')}</Label><Input value={from} onChange={e => setFrom(e.target.value)} placeholder={t('settings.notifications.smtp.fromPlaceholder')} /></div>
        <div><Label>{t('settings.notifications.smtp.to')}</Label><Input value={to} onChange={e => setTo(e.target.value)} placeholder={t('settings.notifications.smtp.toPlaceholder')} /></div>
      </div>
      {url && (
        <div style={{ background: '#03060d', border: '1px solid #0e2040', borderRadius: '3px', padding: '8px 10px' }}>
          <div style={{ color: '#3d5a80', fontSize: '0.52rem', fontFamily: 'JetBrains Mono, monospace', marginBottom: '3px' }}>{t('settings.notifications.generatedUrl')}</div>
          <div className="truncate" style={{ color: '#7aa3c0', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>{url.replace(/:([^:@]{2})[^:@]*@/, ':$1•••@')}</div>
        </div>
      )}
      <AddButtons url={url} name={name} filled={filled} isPending={isPending} onAdd={onAdd} onAddAndTest={onAddAndTest} />
    </div>
  )
}

// ─── Add buttons ───────────────────────────────────────────────────────────
function AddButtons({ url, name, filled, isPending, onAdd, onAddAndTest }: {
  url: string; name: string; filled: boolean; isPending: boolean
  onAdd: (url: string) => void; onAddAndTest: (url: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button onClick={() => onAdd(url)} disabled={!filled || !url || isPending}>
        {isPending ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
        {t('settings.notifications.saveButton')}
      </Button>
      <Button variant="primary" onClick={() => onAddAndTest(url)} disabled={!filled || !url || isPending}>
        {isPending ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
        {t('settings.notifications.saveAndTest')}
      </Button>
    </div>
  )
}

// ─── Raw URL form (for less common services) ───────────────────────────────
function RawUrlForm({ svc, name, setName, onAdd, onAddAndTest, isPending }: {
  svc: ServiceDef; name: string; setName: (v: string) => void
  onAdd: (url: string) => void; onAddAndTest: (url: string) => void; isPending: boolean
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <div style={{ flex: '0 0 150px' }}>
          <Label>{t('settings.environments.name')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={svc.label} autoFocus />
        </div>
        <div className="flex-1">
          <Label>
            {t('settings.notifications.raw.urlLabel')}{' '}
            <a href="https://containrrr.dev/shoutrrr/services/" target="_blank" rel="noopener" style={{ color: '#22d3ee55', textDecoration: 'none' }}>{t('settings.notifications.raw.docs')}</a>
          </Label>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={svc.placeholder} />
        </div>
      </div>
      <AddButtons url={url} name={name} filled={!!(name && url)} isPending={isPending} onAdd={onAdd} onAddAndTest={onAddAndTest} />
    </div>
  )
}

// ─── Notification section ──────────────────────────────────────────────────
function NotifSection() {
  const { t } = useTranslation()
  const POPULAR = usePopularServices()
  const qc = useQueryClient()
  const [name, setName]           = useState('')
  const [selected, setSelected]   = useState('discord')
  const [showOthers, setShowOthers] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'err'>>({})
  const [formKey, setFormKey]     = useState(0) // reset form on service change
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName]   = useState('')
  const [editConfig, setEditConfig] = useState('')

  const allSvcs = [...POPULAR, ...OTHERS]
  const svc = allSvcs.find(s => s.type === selected) ?? POPULAR[0]

  const { data: channels = [] } = useQuery({ queryKey: ['notifications/channels'], queryFn: getNotificationChannels })

  const addMut = useMutation({
    mutationFn: (config: string) => addChannel({ name, type: selected as any, config, enabled: true }),
    onSuccess: () => {
      setName(''); setFormKey(k => k + 1)
      qc.invalidateQueries({ queryKey: ['notifications/channels'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications/channels'] }),
  })

  const handleTest = async (id: number) => {
    setTestingId(id)
    try { await testChannel(id); setTestResult(r => ({ ...r, [id]: 'ok' })) }
    catch { setTestResult(r => ({ ...r, [id]: 'err' })) }
    finally { setTestingId(null) }
  }

  const handleAdd = async (url: string) => {
    addMut.mutate(url)
  }

  const handleAddAndTest = async (url: string) => {
    try {
      const created = await addChannel({ name, type: selected as any, config: url, enabled: true })
      setName(''); setFormKey(k => k + 1)
      qc.invalidateQueries({ queryKey: ['notifications/channels'] })
      await handleTest(created.id)
    } catch {}
  }

  const updateMut = useMutation({
    mutationFn: ({ id, name, config }: { id: number; name: string; config: string }) =>
      updateChannel(id, { name, config }),
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['notifications/channels'] })
    },
  })

  const startEdit = (ch: NotificationChannel) => {
    setEditingId(ch.id); setEditName(ch.name); setEditConfig(ch.config)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateMut.mutate({ id: editingId, name: editName, config: editConfig })
  }

  const selectSvc = (type: string) => {
    setSelected(type); setName(''); setFormKey(k => k + 1)
    if (OTHERS.find(s => s.type === type)) setShowOthers(true)
  }

  return (
    <SectionCard title={t('settings.notifications.title')} comment={t('settings.notifications.comment')}>
      <div className="space-y-4">

        {/* ── Saved channels ── */}
        {(channels as NotificationChannel[]).map(ch => {
          const chSvc = allSvcs.find(s => s.type === ch.type)
          const isEditing = editingId === ch.id

          return (
            <div key={ch.id} className="rounded overflow-hidden" style={{ border: `1px solid ${isEditing ? '#22d3ee33' : '#0e2040'}`, background: '#06090f' }}>
              {isEditing ? (
                /* ── Edit mode ── */
                <div className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <div style={{ flex: '0 0 160px' }}>
                      <Label>{t('settings.environments.name')}</Label>
                      <input
                        style={inputStyle} value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex-1">
                      <Label>{t('settings.notifications.shoutrrrUrl')}</Label>
                      <input
                        style={inputStyle} value={editConfig}
                        onChange={e => setEditConfig(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit()}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1.5"
                      style={{ background: 'transparent', border: '1px solid #0e2040', color: '#7aa3c0', padding: '4px 10px', borderRadius: '2px', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                      <X size={10} /> {t('settings.notifications.cancel')}
                    </button>
                    <button onClick={saveEdit} disabled={updateMut.isPending || !editName || !editConfig}
                      className="flex items-center gap-1.5 disabled:opacity-40"
                      style={{ background: '#22d3ee12', border: '1px solid #22d3ee33', color: '#22d3ee', padding: '4px 12px', borderRadius: '2px', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                      {updateMut.isPending ? <Loader size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                      {t('settings.notifications.save')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {chSvc
                    ? <ServiceBadge svc={chSvc} />
                    : <Bell size={13} style={{ color: '#22d3ee', flexShrink: 0 }} />
                  }
                  <div className="flex-1 min-w-0">
                    <div style={{ color: '#e2f0ff', fontSize: '0.8rem', fontFamily: 'Sora, sans-serif', fontWeight: 600 }}>{ch.name}</div>
                    <div className="truncate" style={{ color: '#7aa3c0', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {ch.config.replace(/:([^:@]{2})[^:@]*@/, ':$1•••@')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {testResult[ch.id] === 'ok'  && <span style={{ color: '#34d399', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', display:'flex', alignItems:'center', gap:'4px' }}><CheckCircle size={11} /> {t('settings.notifications.sent')}</span>}
                    {testResult[ch.id] === 'err' && <span style={{ color: '#f87171', fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', display:'flex', alignItems:'center', gap:'4px' }}><XCircle size={11} /> {t('settings.notifications.failed')}</span>}
                    <button onClick={() => handleTest(ch.id)} disabled={testingId === ch.id}
                      style={{ color: '#7aa3c0', background: 'none', border: '1px solid #0e2040', padding: '3px 8px', borderRadius: '2px', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' }}>
                      {testingId === ch.id ? <Loader size={10} className="animate-spin" /> : t('settings.notifications.test')}
                    </button>
                    <button onClick={() => startEdit(ch)}
                      title={t('settings.notifications.editChannel')}
                      style={{ color: '#3d5a80', background: 'none', border: 'none', cursor: 'pointer', display:'flex', padding: '2px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#22d3ee')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#3d5a80')}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { if (confirm(t('settings.notifications.removeConfirm', { name: ch.name }))) deleteMut.mutate(ch.id) }}
                      style={{ color: '#3d5a80', background: 'none', border: 'none', cursor: 'pointer', display:'flex', padding: '2px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#3d5a80')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* ── Add form ── */}
        <div style={{ border: '1px solid #0e2040', borderRadius: '4px', overflow: 'hidden' }}>

          {/* Service picker — popular */}
          <div className="p-3" style={{ borderBottom: '1px solid #0e2040' }}>
            <div style={{ color: '#7aa3c0', fontSize: '0.55rem', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono, monospace', marginBottom: '8px' }}>{t('settings.notifications.service')}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {POPULAR.map(s => (
                <button key={s.type} onClick={() => selectSvc(s.type)}
                  style={{
                    padding: '8px 6px', borderRadius: '3px', cursor: 'pointer', textAlign: 'left',
                    background: selected === s.type ? `${s.color}12` : '#06090f',
                    border: `1px solid ${selected === s.type ? `${s.color}44` : '#0e2040'}`,
                    display: 'flex', alignItems: 'center', gap: '7px',
                  }}>
                  <ServiceBadge svc={s} size={22} />
                  <span style={{ color: selected === s.type ? '#e2f0ff' : '#7aa3c0', fontSize: '0.68rem', fontFamily: 'Sora, sans-serif', fontWeight: selected === s.type ? 600 : 400 }}>
                    {s.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Others toggle */}
            <button onClick={() => setShowOthers(v => !v)}
              style={{ marginTop: '8px', color: '#3d5a80', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ChevronDown size={10} style={{ transform: showOthers ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
              {showOthers ? t('settings.notifications.moreServices') : t('settings.notifications.othersCount', { count: OTHERS.length })}
            </button>

            {showOthers && (
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {OTHERS.map(s => (
                  <button key={s.type} onClick={() => selectSvc(s.type)}
                    style={{
                      padding: '6px', borderRadius: '3px', cursor: 'pointer', textAlign: 'left',
                      background: selected === s.type ? `${s.color}12` : 'transparent',
                      border: `1px solid ${selected === s.type ? `${s.color}44` : '#0e2040'}`,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                    <ServiceBadge svc={s} size={20} />
                    <span style={{ color: selected === s.type ? '#e2f0ff' : '#7aa3c0', fontSize: '0.62rem', fontFamily: 'Sora, sans-serif' }}>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected service description */}
          {svc.description && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #0e2040', background: '#03060d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ServiceBadge svc={svc} size={24} />
              <span style={{ color: '#7aa3c0', fontSize: '0.65rem', fontFamily: 'Sora, sans-serif' }}>{svc.description}</span>
            </div>
          )}

          {/* Form body */}
          {svc.type === 'smtp' ? (
            <SmtpForm key={`smtp-${formKey}`} name={name} setName={setName} onAdd={handleAdd} onAddAndTest={handleAddAndTest} isPending={addMut.isPending} />
          ) : svc.fields ? (
            <GuidedForm key={`${svc.type}-${formKey}`} svc={svc} name={name} setName={setName} fields={{}} onAdd={handleAdd} onAddAndTest={handleAddAndTest} isPending={addMut.isPending} />
          ) : (
            <RawUrlForm key={`raw-${formKey}`} svc={svc} name={name} setName={setName} onAdd={handleAdd} onAddAndTest={handleAddAndTest} isPending={addMut.isPending} />
          )}
        </div>
      </div>
    </SectionCard>
  )
}

function AccountSection() {
  const { t } = useTranslation()
  const { state, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: async () => {
      toast.success(t('settings.account.toasts.changed'))
      setCurrent(''); setNext(''); setConfirm('')
      await logout()
    },
    onError: (err: Error) => toast.error(err.message || t('settings.account.toasts.failed')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) { toast.error(t('settings.account.toasts.newPasswordTooShort')); return }
    if (next !== confirm) { toast.error(t('settings.account.toasts.mismatch')); return }
    mutation.mutate()
  }

  const username = state.status === 'authenticated' ? state.user.username : ''

  return (
    <SectionCard title={t('settings.account.title')} comment={t('settings.account.comment')}>
      <div className="flex items-center justify-between mb-5 pb-5 border-b border-border-subtle">
        <div>
          <div className="text-3xs uppercase tracking-wider text-text-muted font-mono mb-1">{t('settings.account.loggedInAs')}</div>
          <div className="font-mono text-sm text-text-bright">{username}</div>
        </div>
        <Button variant="outline" onClick={() => logout()}>
          <LogOut size={12} /> {t('settings.account.logout')}
        </Button>
      </div>

      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <div>
          <Label>{t('settings.account.currentPassword')}</Label>
          <Input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
        </div>
        <div>
          <Label>{t('settings.account.newPassword')}</Label>
          <Input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} required minLength={8} />
        </div>
        <div>
          <Label>{t('settings.account.confirmNewPassword')}</Label>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          <KeyRound size={12} /> {mutation.isPending ? t('settings.account.changing') : t('settings.account.changePassword')}
        </Button>
      </form>
    </SectionCard>
  )
}

export default function Settings() {
  const { t } = useTranslation()
  return (
    <div className="space-y-8">
      <PageHeader
        slug={t('settings.slug')}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />
      <div className="space-y-5 max-w-3xl mx-auto">
        <AccountSection />
        <EnvSection />
        <NotifSection />
      </div>
    </div>
  )
}
