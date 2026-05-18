import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OperationsProvider } from './contexts/OperationsContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Movies from './pages/Movies'
import Shows from './pages/Shows'
import Collections from './pages/Collections'
import CollectionDetail from './pages/CollectionDetail'
import Settings from './pages/Settings'
import PosterStudio from './pages/PosterStudio'
import PosterEditor from './pages/PosterEditor'
import api from './api/client'

function AppRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [needsSetup, setNeedsSetup] = useState(null)

  useEffect(() => {
    api.get('/auth/setup-status').then(({ data }) => {
      setNeedsSetup(data.needs_setup)
    })
  }, [])

  if (loading || needsSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <span className="text-slate-400 text-sm">Loading JellyStacks…</span>
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup onSetupComplete={() => setNeedsSetup(false)} />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" state={{ from: location }} replace />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/collections" replace />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<CollectionDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/poster-studio" element={<PosterStudio />} />
        <Route path="/poster-studio/:id" element={<PosterEditor />} />
        <Route path="*" element={<Navigate to="/collections" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <OperationsProvider>
        <AppRoutes />
      </OperationsProvider>
    </AuthProvider>
  )
}
