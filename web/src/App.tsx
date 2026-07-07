import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Containers from './pages/Containers'
import Updates from './pages/Updates'
import Security from './pages/Security'
import Registries from './pages/Registries'
import Audit from './pages/Audit'
import Settings from './pages/Settings'
import Policies from './pages/Policies'
import { Login, Setup } from './pages/Auth'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ocean-void">
        <Loader2 className="animate-spin text-brand-cyan" size={24} />
      </div>
    )
  }

  if (state.status === 'needs-setup') return <Setup />
  if (state.status === 'unauthenticated') return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/containers" element={<Containers />} />
        <Route path="/updates" element={<Updates />} />
        <Route path="/security" element={<Security />} />
        <Route path="/approvals" element={<Navigate to="/updates" replace />} />
        <Route path="/registries" element={<Registries />} />
        <Route path="/images" element={<Navigate to="/registries" replace />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
