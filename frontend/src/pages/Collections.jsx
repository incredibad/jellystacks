import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Layers, Upload, RefreshCw, Download, LayoutGrid, LayoutList, Film, ChevronDown, Loader } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import CollectionCard from '../components/CollectionCard'
import CollectionListRow from '../components/CollectionListRow'
import { useOperations } from '../contexts/OperationsContext'

const VIEW_KEY = 'jellystacks:collections-view'

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
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
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

function CreateModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const { data } = await api.post('/collections', { name: name.trim(), description: description.trim() || undefined })
      onCreate(data)
      onClose()
      toast.success(`Collection "${data.name}" created.`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create collection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-lg font-semibold text-white mb-4">New Collection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Marvel Cinematic Universe"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
              style={{ background: '#0d0d14', border: '1px solid var(--border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-600">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="A short description…"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              style={{ background: '#0d0d14', border: '1px solid var(--border)' }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Collections() {
  const navigate = useNavigate()
  const { runOperation, isRunning } = useOperations()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [importing, setImporting] = useState(false)
  const [opsOpen, setOpsOpen] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'local' | 'jellyfin'
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid')
  const [pendingConfirm, setPendingConfirm] = useState(null) // 'import' | 'pushAll'

  const switchView = (v) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const fetchCollections = async () => {
    try {
      const { data } = await api.get('/collections')
      setCollections(data)
    } catch {
      toast.error('Failed to load collections.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCollections() }, [])

  const handlePush = async (collection) => {
    const tid = toast.loading(`Pushing "${collection.name}" to Jellyfin…`)
    try {
      const { data } = await api.post(`/collections/${collection.id}/push`)
      toast.success(data.message, { id: tid })
      fetchCollections()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Push failed.', { id: tid })
    }
  }

  const handleDelete = async (collection) => {
    if (!confirm(`Delete "${collection.name}"? This will also remove it from Jellyfin if it has been synced.`)) return
    try {
      await api.delete(`/collections/${collection.id}`)
      setCollections(prev => prev.filter(c => c.id !== collection.id))
      toast.success('Collection deleted.')
    } catch {
      toast.error('Failed to delete.')
    }
  }

  const handlePushAll = () => {
    const targets = collections.filter(c => c.movie_count > 0)
    const skipped = collections.length - targets.length
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
        fetchCollections()
      },
    })
  }

  const handleVerifyAll = () => {
    const targets = collections.filter(c => c.jellyfin_collection_id)
    if (!targets.length) { toast('Nothing to verify.', { icon: 'ℹ️' }); return }
    runOperation({
      type: 'verify',
      targets,
      onDone: (results) => {
        toast.success(`Verified ${results.length} collections.`)
        fetchCollections()
      },
    })
  }

  const handleDetectTmdb = () => {
    const targets = collections.filter(c => c.movie_count > 0)
    if (!targets.length) { toast('No collections to scan.', { icon: 'ℹ️' }); return }
    runOperation({
      type: 'detect-tmdb',
      targets,
      onEach: (target, result) => {
        if (result.ok) {
          setCollections(prev => prev.map(c => c.id === target.id ? { ...c, ...result.data } : c))
        }
      },
      onDone: (results) => {
        const linked = results.filter(r => r.ok && r.data?.tmdb_collection_id).length
        const custom = results.filter(r => r.ok && !r.data?.tmdb_collection_id).length
        const skipped = results.filter(r => !r.ok).length
        const parts = []
        if (linked) parts.push(`${linked} TMDB`)
        if (custom) parts.push(`${custom} Custom`)
        if (skipped) parts.push(`${skipped} skipped`)
        toast.success(parts.join(', '))
      },
    })
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
      fetchCollections()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed.', { id: tid })
    } finally {
      setImporting(false)
    }
  }

  const sortKey = (name) => name.replace(/^(the|a|an)\s+/i, '').toLowerCase()

  const filtered = useMemo(() => {
    let result
    if (filter === 'local') result = collections.filter(c => !c.is_jellyfin_native)
    else if (filter === 'jellyfin') result = collections.filter(c => c.is_jellyfin_native)
    else result = collections
    return [...result].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
  }, [collections, filter])

  const jellyfinNative = collections.filter(c => c.is_jellyfin_native).length
  const localCount = collections.filter(c => !c.is_jellyfin_native).length
  const inJellyfin = collections.filter(c => c.in_jellyfin).length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Collections</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
            {inJellyfin > 0 && ` · ${inJellyfin} in Jellyfin`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Operations dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpsOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-slate-700"
            >
              {(importing || isRunning)
                ? <Loader size={14} className="animate-spin" />
                : <ChevronDown size={14} className={`transition-transform ${opsOpen ? 'rotate-180' : ''}`} />
              }
              Operations
            </button>

            {opsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpsOpen(false)} />
                <div
                  className="absolute right-0 top-10 z-20 w-52 rounded-xl shadow-xl py-1"
                  style={{ background: '#1e1e30', border: '1px solid var(--border)' }}
                >
                  {[
                    {
                      label: 'Import from Jellyfin',
                      icon: importing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />,
                      busy: importing,
                      onClick: () => { setPendingConfirm('import'); setOpsOpen(false) },
                    },
                    {
                      label: 'Verify Status',
                      icon: <RefreshCw size={14} />,
                      busy: false,
                      disabled: collections.length === 0 || isRunning,
                      onClick: () => { handleVerifyAll(); setOpsOpen(false) },
                    },
                    {
                      label: 'Detect TMDB',
                      icon: <Film size={14} />,
                      busy: false,
                      disabled: collections.length === 0 || isRunning,
                      onClick: () => { handleDetectTmdb(); setOpsOpen(false) },
                    },
                    null, // divider
                    {
                      label: 'Push All to Jellyfin',
                      icon: <Upload size={14} />,
                      busy: false,
                      disabled: collections.length === 0 || isRunning,
                      onClick: () => { setPendingConfirm('pushAll'); setOpsOpen(false) },
                    },
                  ].map((item, i) =>
                    item === null ? (
                      <div key={i} className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
                    ) : (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        disabled={item.busy || item.disabled}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
          >
            <Plus size={16} />
            New Collection
          </button>
        </div>
      </div>

      {/* Filter + view toggle bar */}
      {!loading && collections.length > 0 && (
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          {/* Filter pills */}
          <div className="flex items-center gap-1.5">
            {[
              { key: 'all', label: `All (${collections.length})` },
              { key: 'jellyfin', label: `From Jellyfin (${jellyfinNative})` },
              { key: 'local', label: `Local (${localCount})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filter === key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <button
              onClick={() => switchView('grid')}
              title="Grid view"
              className={`p-2 transition-colors ${view === 'grid' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => switchView('list')}
              title="List view"
              className={`p-2 transition-colors ${view === 'list' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <LayoutList size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Layers size={48} className="mb-4 opacity-30" />
          <p className="text-sm font-medium text-slate-400">No collections yet</p>
          <p className="text-xs mt-1 mb-4">Create a collection to start organizing your movies.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
          >
            <Plus size={16} />
            Create First Collection
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <p className="text-sm">No collections match this filter.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map(col => (
            <CollectionCard
              key={col.id}
              collection={col}
              onPush={handlePush}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {filtered.map(col => (
            <CollectionListRow
              key={col.id}
              collection={col}
              onPush={handlePush}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(col) => navigate(`/collections/${col.id}`)}
        />
      )}

      {pendingConfirm === 'import' && (
        <ConfirmModal
          title="Import from Jellyfin"
          description="This will pull all collections currently in Jellyfin into Jellystacks. New collections will be created locally and existing ones will be updated to reflect their current Jellyfin state. Your local-only collections are not affected."
          confirmLabel="Import"
          onConfirm={handleImport}
          onClose={() => setPendingConfirm(null)}
        />
      )}

      {pendingConfirm === 'pushAll' && (
        <ConfirmModal
          title="Push All to Jellyfin"
          description={`This will sync all ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} to Jellyfin — creating or updating each one with its current movies and artwork. Empty collections will be skipped.`}
          confirmLabel="Push All"
          onConfirm={handlePushAll}
          onClose={() => setPendingConfirm(null)}
        />
      )}

    </div>
  )
}
