import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, Layers, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

function StatCard({ icon: Icon, label, value, color, to }) {
  const inner = (
    <div
      className="rounded-xl p-5 flex items-center gap-4 transition-all hover:border-slate-600"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ movies: null, collections: null, inJellyfin: null })
  const [syncing, setSyncing] = useState(false)

  const fetchStats = async () => {
    try {
      const [moviesRes, colsRes] = await Promise.all([
        api.get('/movies/count'),
        api.get('/collections'),
      ])
      const cols = colsRes.data
      setStats({
        movies: moviesRes.data.count,
        collections: cols.length,
        inJellyfin: cols.filter(c => c.in_jellyfin).length,
      })
    } catch {
      // Silently ignore — settings not yet configured
    }
  }

  useEffect(() => { fetchStats() }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post('/movies/sync')
      toast.success(`Synced ${data.synced} movies from Jellyfin.`)
      fetchStats()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sync failed. Check your Jellyfin settings.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {user?.username}
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Here's an overview of your JellyStacks library.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-600/20"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Jellyfin'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Film} label="Movies in Library" value={stats.movies} color="bg-blue-600" to="/movies" />
        <StatCard icon={Layers} label="Collections" value={stats.collections} color="bg-violet-600" to="/collections" />
        <StatCard icon={CheckCircle2} label="Synced to Jellyfin" value={stats.inJellyfin} color="bg-emerald-600" to="/collections" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/collections"
          className="group flex items-center justify-between p-5 rounded-xl transition-all hover:border-violet-500/50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Layers size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Manage Collections</p>
              <p className="text-xs text-slate-500 mt-0.5">Create and organize your movie collections</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
        </Link>

        <Link
          to="/settings"
          className="group flex items-center justify-between p-5 rounded-xl transition-all hover:border-violet-500/50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
              <Film size={18} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Configure Jellyfin</p>
              <p className="text-xs text-slate-500 mt-0.5">Connect your Jellyfin server and TMDB</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
        </Link>
      </div>

      {stats.movies === 0 && (
        <div
          className="mt-6 p-5 rounded-xl flex items-center gap-4"
          style={{ background: 'var(--surface)', border: '1px solid #f59e0b33' }}
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <RefreshCw size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-300">No movies found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure your Jellyfin server in{' '}
              <Link to="/settings" className="text-violet-400 hover:underline">Settings</Link>
              , then click "Sync Jellyfin" to import your library.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
