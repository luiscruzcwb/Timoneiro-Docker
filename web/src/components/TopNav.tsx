import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Container, RefreshCw, Shield,
  Database, History, Settings, Lock, User, Menu, X, LogOut, ChevronDown,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getUpdates } from '../api/client'
import { useWSStatus } from '../hooks/useWSStatus'
import { useAuth } from '../hooks/useAuth'
import LanguageSwitcher from './LanguageSwitcher'
import clsx from 'clsx'

function useNavItems() {
  const { t } = useTranslation()
  const main = [
    { to: '/dashboard',  icon: LayoutDashboard, label: t('nav.dashboard')  },
    { to: '/containers', icon: Container,        label: t('nav.containers') },
    { to: '/updates',    icon: RefreshCw,        label: t('nav.updates')   },
    { to: '/security',   icon: Shield,           label: t('nav.security')  },
  ]
  const system = [
    { to: '/registries', icon: Database, label: t('nav.registries') },
    { to: '/audit',      icon: History,  label: t('nav.audit')      },
    { to: '/policies',   icon: Lock,     label: t('nav.policies')   },
    { to: '/settings',   icon: Settings, label: t('nav.settings')   },
  ]
  return { main, system }
}

function Clock() {
  const { i18n } = useTranslation()
  const [time, setTime] = useState(() => new Date().toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(id)
  }, [i18n.language])
  return <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3d5a80', letterSpacing: '0.06em' }}>{time}</span>
}

function NavItem({ to, icon: Icon, label, badge }: {
  to: string; icon: typeof LayoutDashboard; label: string; badge?: number
}) {
  return (
    <NavLink
      to={to}
      className="relative flex items-center gap-1.5 px-3 py-2 transition-all duration-150 shrink-0"
      style={({ isActive }) => ({
        color: isActive ? '#22d3ee' : '#7aa3c0',
        borderBottom: isActive ? '2px solid #22d3ee' : '2px solid transparent',
        fontFamily: 'Sora, sans-serif',
        fontSize: '0.72rem',
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        background: isActive ? 'linear-gradient(180deg, transparent, #22d3ee08)' : 'transparent',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={12} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
          {label}
          {badge != null && badge > 0 && (
            <span style={{
              background: '#f87171', color: '#03060d',
              fontSize: '0.55rem', fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700, borderRadius: '999px',
              minWidth: '16px', height: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', lineHeight: 1, marginLeft: '1px',
            }}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function AccountMenu() {
  const { t } = useTranslation()
  const { state, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (state.status !== 'authenticated') return null
  const username = state.user.username

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 border border-border-subtle hover:border-border-mid transition-colors"
        style={{ background: '#0a1628' }}
      >
        <span className="w-6 h-6 rounded-full flex items-center justify-center bg-brand-cyan/10">
          <User size={12} className="text-brand-cyan" />
        </span>
        <span className="hidden lg:inline font-mono text-3xs text-text-soft max-w-[6rem] truncate">{username}</span>
        <ChevronDown size={11} className="text-text-muted" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-44 rounded border border-border-subtle bg-card-gradient shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b border-border-subtle">
            <div className="text-3xs uppercase tracking-wider text-text-muted font-mono">{t('nav.loggedInAs')}</div>
            <div className="font-mono text-2xs text-text-bright truncate mt-0.5">{username}</div>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/settings') }}
            className="w-full flex items-center gap-2 px-3 py-2 text-2xs text-text-soft hover:bg-ocean-lift hover:text-text-bright transition-colors font-mono"
          >
            <Settings size={13} /> {t('nav.settings')}
          </button>
          <button
            onClick={() => { setOpen(false); logout() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-2xs text-brand-coral hover:bg-brand-coral/10 transition-colors font-mono"
          >
            <LogOut size={13} /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const connected = useWSStatus()
  const { main: NAV_MAIN, system: NAV_SYSTEM } = useNavItems()

  const { data: allUpdates = [] } = useQuery({
    queryKey: ['updates'],
    queryFn: () => getUpdates(),
    refetchInterval: 30_000,
  })

  const pendingCount = allUpdates.filter(u => u.status === 'pending').length
  const cveCount     = allUpdates.filter(u => u.status === 'pending' && (u.cveCritical > 0 || u.cveHigh > 0)).length

  const badges: Record<string, number> = {
    '/updates':  pendingCount,
    '/security': cveCount,
  }

  return (
    <header
      className="shrink-0 flex flex-col"
      style={{ background: 'linear-gradient(180deg, #060d1a, #04090f)', borderBottom: '1px solid #0e2040', zIndex: 50 }}
    >
      {/* Main bar */}
      <div className="flex items-stretch h-12 px-4">

        {/* Logo */}
        <div className="flex items-center gap-2.5 pr-5 shrink-0" style={{ borderRight: '1px solid #0e2040' }}>
          <div
            className="w-7 h-7 rounded flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0a1f3d, #0f2a50)', border: '1px solid #22d3ee33', boxShadow: '0 0 12px -3px #22d3ee55' }}
          >
            <img src="/timoneiro-icon.svg" width={18} height={18} alt="Timoneiro" />
          </div>
          <div className="hidden sm:block">
            <div style={{ fontFamily: 'Sora, sans-serif', color: '#e2f0ff', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.04em', lineHeight: 1 }}>
              Timoneiro
            </div>
            <div style={{ color: '#22d3ee44', fontSize: '0.52rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', lineHeight: 1, marginTop: '2px' }}>
              v0.1.0
            </div>
          </div>
        </div>

        {/* Nav — desktop */}
        <nav className="hidden md:flex items-stretch flex-1 overflow-x-auto gap-0 px-2">
          {NAV_MAIN.map(item => (
            <NavItem key={item.to} {...item} badge={badges[item.to]} />
          ))}

          {/* Separator */}
          <div className="self-center mx-2 shrink-0" style={{ width: '1px', height: '18px', background: '#0e2040' }} />

          {NAV_SYSTEM.map(item => (
            <NavItem key={item.to} {...item} badge={badges[item.to]} />
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto pl-4 shrink-0" style={{ borderLeft: '1px solid #0e2040' }}>
          {/* WS status */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span
              className={clsx('w-1.5 h-1.5 rounded-full shrink-0', connected && 'animate-pulse')}
              style={{ background: connected ? '#34d399' : '#f87171', boxShadow: connected ? '0 0 6px #34d399' : '0 0 6px #f87171' }}
            />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.64rem', color: connected ? '#34d399' : '#f87171', letterSpacing: '0.06em' }}>
              {connected ? 'WS' : 'OFF'}
            </span>
          </div>

          <Clock />

          <LanguageSwitcher className="hidden sm:flex" />

          <AccountMenu />

          {/* Mobile hamburger */}
          <button
            className="md:hidden"
            onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'none', border: 'none', color: '#7aa3c0', cursor: 'pointer', padding: '4px' }}
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <nav
          className="md:hidden flex flex-col py-2"
          style={{ borderTop: '1px solid #0e2040', background: '#04090f' }}
          onClick={() => setMobileOpen(false)}
        >
          {[...NAV_MAIN, ...NAV_SYSTEM].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 20px',
                color: isActive ? '#22d3ee' : '#7aa3c0',
                fontFamily: 'Sora, sans-serif', fontSize: '0.8rem',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                background: isActive ? '#22d3ee08' : 'transparent',
                borderLeft: isActive ? '2px solid #22d3ee' : '2px solid transparent',
              })}
            >
              <item.icon size={14} />
              {item.label}
              {(badges[item.to] ?? 0) > 0 && (
                <span style={{ background: '#f87171', color: '#03060d', fontSize: '0.58rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, borderRadius: '999px', padding: '1px 5px' }}>
                  {badges[item.to]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
