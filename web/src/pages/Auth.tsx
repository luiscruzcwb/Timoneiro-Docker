import { useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Anchor, Loader2 } from 'lucide-react'
import { Card, Button, Input, Label } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import LanguageSwitcher from '../components/LanguageSwitcher'

function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-ocean-void px-4"
      style={{
        backgroundImage: `
          linear-gradient(#0e204020 1px, transparent 1px),
          linear-gradient(90deg, #0e204020 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        backgroundPosition: '-1px -1px',
      }}
    >
      <LanguageSwitcher className="flex fixed top-4 right-4" />
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 h-64 opacity-20"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #22d3ee14, transparent)' }}
      />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
            src="/timoneiro-icon.svg" width={52} height={52} alt="Timoneiro"
            style={{ filter: 'drop-shadow(0 0 18px #22d3ee55)' }}
          />
          <div className="text-center">
            <div className="font-display font-bold text-text-bright text-2xl tracking-tight">Timoneiro</div>
            <div className="font-mono text-2xs uppercase tracking-wider text-text-muted mt-1">{t('auth.tagline')}</div>
          </div>
        </div>
        <Card className="p-7 shadow-2xl">{children}</Card>
      </div>
    </div>
  )
}

export function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.errors.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="font-mono text-label text-brand-cyan/50 mb-1.5">{t('auth.loginComment')}</div>
      <div className="font-display font-bold text-text-bright text-lg mb-6">{t('auth.loginTitle')}</div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>{t('auth.username')}</Label>
          <Input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div>
          <Label>{t('auth.password')}</Label>
          <Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center text-xs py-2.5 mt-2" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Anchor size={14} />}
          {loading ? t('auth.loggingIn') : t('auth.loginButton')}
        </Button>
      </form>
    </AuthShell>
  )
}

export function Setup() {
  const { t } = useTranslation()
  const { setup } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { toast.error(t('auth.errors.passwordTooShort')); return }
    if (password !== confirm) { toast.error(t('auth.errors.passwordMismatch')); return }
    setLoading(true)
    try {
      await setup(username, password)
      toast.success(t('auth.toasts.accountCreated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.errors.setupFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="font-mono text-label text-brand-cyan/50 mb-1.5">{t('auth.setupComment')}</div>
      <div className="font-display font-bold text-text-bright text-lg mb-1.5">{t('auth.setupTitle')}</div>
      <p className="text-xs text-text-muted mb-6 leading-relaxed">{t('auth.setupSubtitle')}</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>{t('auth.username')}</Label>
          <Input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div>
          <Label>{t('auth.password')}</Label>
          <Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        </div>
        <div>
          <Label>{t('auth.confirmPassword')}</Label>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center text-xs py-2.5 mt-2" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Anchor size={14} />}
          {loading ? t('auth.creating') : t('auth.createAccount')}
        </Button>
      </form>
    </AuthShell>
  )
}
