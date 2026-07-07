import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import * as api from '../api/client'

type AuthState =
  | { status: 'loading' }
  | { status: 'needs-setup' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: api.AuthUser }

interface AuthContextValue {
  state: AuthState
  login: (username: string, password: string) => Promise<void>
  setup: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const user = await api.getMe()
      setState({ status: 'authenticated', user })
    } catch {
      try {
        const { needsSetup } = await api.getAuthStatus()
        setState({ status: needsSetup ? 'needs-setup' : 'unauthenticated' })
      } catch {
        setState({ status: 'unauthenticated' })
      }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onUnauthorized = () => setState({ status: 'unauthenticated' })
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const user = await api.login(username, password)
    setState({ status: 'authenticated', user })
  }, [])

  const setup = useCallback(async (username: string, password: string) => {
    const user = await api.setupAdmin(username, password)
    setState({ status: 'authenticated', user })
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setState({ status: 'unauthenticated' })
  }, [])

  return <AuthContext.Provider value={{ state, login, setup, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
