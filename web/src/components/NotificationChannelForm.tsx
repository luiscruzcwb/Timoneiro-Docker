import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { addChannel, NotificationChannel } from '../api/client'

interface Props {
  onClose: () => void
}

type ChannelType = 'slack' | 'telegram' | 'discord' | 'webhook' | 'gotify' | 'email'

const channelTypes: { value: ChannelType; label: string }[] = [
  { value: 'slack', label: 'Slack' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'webhook', label: 'Generic Webhook' },
  { value: 'gotify', label: 'Gotify' },
  { value: 'email', label: 'Email (SMTP)' },
]

function ConfigFields({ type, config, onChange }: { type: ChannelType; config: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const field = (key: string, label: string, placeholder?: string, password = false) => (
    <div key={key} className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      <input
        type={password ? 'password' : 'text'}
        placeholder={placeholder}
        value={config[key] || ''}
        onChange={(e) => onChange(key, e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
      />
    </div>
  )

  switch (type) {
    case 'slack':
      return <>{field('webhookUrl', 'Webhook URL', 'https://hooks.slack.com/services/…')}</>
    case 'telegram':
      return (
        <>
          {field('botToken', 'Bot Token', '123456:ABC-DEF…', true)}
          {field('chatId', 'Chat ID', '-1001234567890')}
        </>
      )
    case 'discord':
      return <>{field('webhookUrl', 'Webhook URL', 'https://discord.com/api/webhooks/…')}</>
    case 'webhook':
      return <>{field('url', 'URL', 'https://your-server.com/hook')}</>
    case 'gotify':
      return (
        <>
          {field('url', 'Server URL', 'https://gotify.example.com')}
          {field('token', 'App Token', '', true)}
        </>
      )
    case 'email':
      return (
        <>
          {field('host', 'SMTP Host', 'smtp.gmail.com')}
          {field('port', 'Port', '587')}
          {field('username', 'Username')}
          {field('password', 'Password', '', true)}
          {field('to', 'To Address', 'you@example.com')}
        </>
      )
    default:
      return null
  }
}

export default function NotificationChannelForm({ onClose }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('slack')
  const [config, setConfig] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      addChannel({
        name,
        type,
        config: JSON.stringify(config),
        enabled: true,
      } as Partial<NotificationChannel>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels'] })
      onClose()
    },
  })

  const handleConfigChange = (k: string, v: string) =>
    setConfig((prev) => ({ ...prev, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">Add Notification Channel</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">Channel Name</label>
            <input
              type="text"
              placeholder="My Slack Alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-400">Type</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as ChannelType); setConfig({}) }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {channelTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <ConfigFields type={type} config={config} onChange={handleConfigChange} />
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || mutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save Channel'}
          </button>
        </div>
      </div>
    </div>
  )
}
