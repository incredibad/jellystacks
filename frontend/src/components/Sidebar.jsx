import { NavLink, useNavigate } from 'react-router-dom'
import { Film, Tv, Layers, Settings, LogOut, RefreshCw, Upload, Download, Trash2, LayoutGrid, Loader, ChevronDown, Image } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useOperations } from '../contexts/OperationsContext'
import { useState, useEffect } from 'react'
import api from '../api/client'
import toast from 'react-hot-toast'
import pkg from '../../package.json'
import BulkArtworkModal from './BulkArtworkModal'

const NAV_ITEMS = [
  { to: '/collections', icon: Layers, label: 'Collections', countKey: 'collections' },
  { to: '/movies',      icon: Film,   label: 'Movies',      countKey: 'movies' },
  { to: '/shows',       icon: Tv,     label: 'Shows',       countKey: 'shows' },
]

function ConfirmModal({ title, description, confirmLabel, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { runOperation, isRunning, syncing, syncLibraries, lastSynced, lastOpAt } = useOperations()
  const [counts, setCounts] = useState({})
  const [opsOpen, setOpsOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deletingJf, setDeletingJf] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const refreshCounts = () => {
    Promise.all([
      api.get('/movies/count'),
      api.get('/shows/count'),
      api.get('/collections/count'),
    ]).then(([movies, shows, collections]) => {
      setCounts({
        movies: movies.data.count,
        shows: shows.data.count,
        collections: collections.data.count,
      })
    }).catch(() => {})
  }

  useEffect(() => { refreshCounts() }, [])
  useEffect(() => { if (lastSynced) refreshCounts() }, [lastSynced])
  useEffect(() => { if (lastOpAt) refreshCounts() }, [lastOpAt])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const fetchCollections = async () => {
    const { data } = await api.get('/collections')
    return data
  }

  const handleImport = async () => {
    setImporting(true)
    const tid = toast.loading('Importing from Jellyfin…')
    try {
      const { data } = await api.post('/collections/import-from-jellyfin')
      let msg = ''
      if (data.imported > 0) msg += `${data.imported} imported`
      if (data.updated > 0) msg += `${msg ? ', ' : ''}${data.updated} updated`
      if (!msg) msg = 'Nothing new to import'
      toast.success(msg, { id: tid })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed.', { id: tid })
    } finally {
      setImporting(false)
    }
  }

  const handleVerifyAll = async () => {
    try {
      const collections = await fetchCollections()
      const targets = collections.filter(c => c.jellyfin_collection_id)
      if (!targets.length) { toast('Nothing to verify.', { icon: 'ℹ️' }); return }
      runOperation({ type: 'verify', targets, onDone: (results) => toast.success(`Verified ${results.length} collections.`) })
    } catch {
      toast.error('Failed to fetch collections.')
    }
  }

  const handlePushAll = async () => {
    try {
      const collections = await fetchCollections()
      const targets = collections.filter(c => c.movie_count > 0)
      const skipped = collections.length - targets.length
      if (!targets.length) { toast('No collections to push.', { icon: 'ℹ️' }); return }
      runOperation({
        type: 'push-all',
        targets,
        onDone: (results) => {
          const succeeded = results.filter(r => r.ok).length
          const failed = results.filter(r => !r.ok).length
          let msg = `${succeeded} pushed`
          if (skipped) msg += `, ${skipped} skipped (empty)`
          if (failed) msg += `, ${failed} failed`
          toast.success(msg)
        },
      })
    } catch {
      toast.error('Failed to fetch collections.')
    }
  }

  const handleDeleteJfNative = async () => {
    setDeletingJf(true)
    const tid = toast.loading('Deleting Jellyfin collections…')
    try {
      const { data } = await api.delete('/collections/jellyfin-native')
      toast.success(`${data.deleted} collection${data.deleted === 1 ? '' : 's'} deleted.`, { id: tid })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed.', { id: tid })
    } finally {
      setDeletingJf(false)
    }
  }

  const busy = importing || isRunning || syncing || deletingJf

  const opsGroups = [
    {
      label: 'Library',
      items: [
        {
          label: 'Sync Jellyfin',
          icon: syncing ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />,
          busy: syncing,
          onClick: () => setPendingConfirm('sync'),
        },
        {
          label: 'Import from Jellyfin',
          icon: importing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />,
          busy: importing,
          onClick: () => setPendingConfirm('import'),
        },
      ],
    },
    {
      label: 'Artwork',
      items: [
        {
          label: 'Bulk Artwork Upload',
          icon: <Image size={14} />,
          onClick: () => { setShowBulkUpload(true); setOpsOpen(false) },
        },
      ],
    },
    {
      label: 'Collections',
      items: [
        {
          label: 'Verify Collection Status',
          icon: <RefreshCw size={14} />,
          disabled: isRunning,
          onClick: () => setPendingConfirm('verify'),
        },
        {
          label: 'Push All to Jellyfin',
          icon: <Upload size={14} />,
          disabled: isRunning,
          onClick: () => setPendingConfirm('push-all'),
        },
      ],
    },
    {
      label: 'Danger',
      danger: true,
      items: [
        {
          label: 'Delete Jellyfin Collections',
          icon: <Trash2 size={14} />,
          danger: true,
          disabled: isRunning || deletingJf,
          onClick: () => setPendingConfirm('delete-jf-native'),
        },
      ],
    },
  ]

  const confirms = {
    sync: {
      title: 'Sync Jellyfin',
      description: 'Fetch all movies and TV shows from your Jellyfin library and update the local database. New items are added, existing ones are updated. This may take a while for large libraries.',
      confirmLabel: 'Sync',
      onConfirm: syncLibraries,
    },
    import: {
      title: 'Import from Jellyfin',
      description: 'Import collections that exist in Jellyfin but not yet in JellyStacks.',
      confirmLabel: 'Import',
      onConfirm: handleImport,
    },
    verify: {
      title: 'Verify Collection Status',
      description: 'Check all collections against Jellyfin to update their sync status.',
      confirmLabel: 'Verify',
      onConfirm: handleVerifyAll,
    },
    'push-all': {
      title: 'Push All to Jellyfin',
      description: 'Push all collections with items to Jellyfin. This may take a while.',
      confirmLabel: 'Push All',
      onConfirm: handlePushAll,
    },
    'delete-jf-native': {
      title: 'Delete Jellyfin Collections',
      description: 'Remove all Jellyfin-native collections from JellyStacks. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: handleDeleteJfNative,
    },
  }

  return (
    <>
      <aside className="w-60 flex-shrink-0 flex flex-col h-screen sticky top-0"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <img src="/logo.png" alt="JellyStacks" className="h-9 w-auto flex-shrink-0" />
          <span
            className="text-xl font-bold uppercase tracking-wide select-none"
            style={{
              fontFamily: "'Oswald', sans-serif",
              background: 'linear-gradient(to right, #9333ea, #14b8a6, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            JellyStacks
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label, countKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {countKey && counts[countKey] != null && (
                <span className="text-xs tabular-nums text-slate-500">
                  {counts[countKey].toLocaleString()}
                </span>
              )}
            </NavLink>
          ))}

          {/* Operations accordion */}
          <div className="pt-1">
            <button
              onClick={() => setOpsOpen(v => !v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-white/5"
            >
              {busy
                ? <Loader size={18} className="animate-spin" />
                : <LayoutGrid size={18} />
              }
              <span className="flex-1 text-left">Operations</span>
              <ChevronDown size={14} className={`transition-transform ${opsOpen ? 'rotate-180' : ''}`} />
            </button>

            {opsOpen && (
              <div className="mt-1 mb-1">
                {opsGroups.map((group) => (
                  <div key={group.label} className="mb-2">
                    <p className={`px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider ${group.danger ? 'text-red-900' : 'text-slate-600'}`}>
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        disabled={item.busy || item.disabled}
                        className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                          item.danger
                            ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-4 flex-shrink-0 flex items-center justify-center">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Settings */}
        <div className="px-3 pb-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-violet-600/20 text-violet-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`
            }
          >
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </div>

        {/* User */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-slate-300 truncate">{user?.username}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <LogOut size={16} />
            Sign out
          </button>
          <p className="text-xs text-slate-700 px-3 pt-2">v{pkg.version}</p>
        </div>
      </aside>

      {pendingConfirm && confirms[pendingConfirm] && (
        <ConfirmModal
          {...confirms[pendingConfirm]}
          onClose={() => setPendingConfirm(null)}
        />
      )}

      {showBulkUpload && (
        <BulkArtworkModal onClose={() => setShowBulkUpload(false)} />
      )}
    </>
  )
}
