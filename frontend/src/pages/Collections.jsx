import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Layers, Upload, RefreshCw, Download, LayoutGrid, LayoutList, Film } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import CollectionCard from '../components/CollectionCard'
import CollectionListRow from '../components/CollectionListRow'

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
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [pushingAll, setPushingAll] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [importing, setImporting] = useState(false)
  const [detectingTmdb, setDetectingTmdb] = useState(false)
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

  const handlePushAll = async () => {
    setPushingAll(true)
    const tid = toast.loading('Pushing all collections to Jellyfin…')
    try {
      const { data } = await api.post('/collections/push-all')
      const results = data.results
      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success && !r.skipped).length
      const skipped = results.filter(r => r.skipped).length
      let msg = `${succeeded} pushed`
      if (skipped) msg += `, ${skipped} skipped (empty)`
      if (failed) msg += `, ${failed} failed`
      toast.success(msg, { id: tid })
      fetchCollections()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk push failed.', { id: tid })
    } finally {
      setPushingAll(false)
    }
  }

  const handleVerifyAll = async () => {
    setVerifying(true)
    const tid = toast.loading('Verifying Jellyfin status…')
    try {
      const { data } = await api.post('/collections/verify-all')
      toast.success(`Verified ${data.verified} collections.`, { id: tid })
      fetchCollections()
    } catch {
      toast.error('Verify failed.', { id: tid })
    } finally {
      setVerifying(false)
    }
  }

  const handleDetectTmdb = async () => {
    setDetectingTmdb(true)
    const tid = toast.loading('Detecting TMDB collections…')
    try {
      const { data } = await api.post('/collections/detect-tmdb-all')
      const parts = []
      if (data.linked > 0) parts.push(`${data.linked} TMDB`)
      if (data.custom > 0) parts.push(`${data.custom} Custom`)
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
      toast.success(parts.join(', '), { id: tid })
      fetchCollections()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Detection failed.', { id: tid })
    } finally {
      setDetectingTmdb(false)
    }
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPendingConfirm('import')}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all border border-transparent hover:border-slate-700"
          >
            <Download size={14} className={importing ? 'animate-bounce' : ''} />
            Import from Jellyfin
          </button>
          <button
            onClick={handleVerifyAll}
            disabled={verifying || collections.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all border border-transparent hover:border-slate-700"
          >
            <RefreshCw size={14} className={verifying ? 'animate-spin' : ''} />
            Verify Status
          </button>
          <button
            onClick={handleDetectTmdb}
            disabled={detectingTmdb || collections.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all border border-transparent hover:border-slate-700"
          >
            <Film size={14} className={detectingTmdb ? 'animate-pulse' : ''} />
            Detect TMDB
          </button>
          <button
            onClick={() => setPendingConfirm('pushAll')}
            disabled={pushingAll || collections.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all border border-transparent hover:border-slate-700"
          >
            <Upload size={14} className={pushingAll ? 'animate-spin' : ''} />
            Push All
          </button>
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
