import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid, LayoutList, Search } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import CollectionCard from '../components/CollectionCard'
import CollectionListRow from '../components/CollectionListRow'
import TmdbCollectionModal from '../components/TmdbCollectionModal'
import MdblistModal from '../components/MdblistModal'
import TraktModal from '../components/TraktModal'
import { useOperations } from '../contexts/OperationsContext'

const VIEW_KEY = 'jellystacks:collections-view'


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
  const { lastOpAt } = useOperations()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showNewChoice, setShowNewChoice] = useState(false)
  const [showTmdbSearch, setShowTmdbSearch] = useState(false)
  const [showMdblist, setShowMdblist] = useState(false)
  const [showTrakt, setShowTrakt] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid')

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
  useEffect(() => { if (lastOpAt) fetchCollections() }, [lastOpAt])

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


  const sortKey = (name) => name.replace(/^(the|a|an)\s+/i, '').toLowerCase()

  const filtered = useMemo(() => {
    let result
    if (filter === 'local') result = collections.filter(c => !c.is_jellyfin_native)
    else if (filter === 'jellyfin') result = collections.filter(c => c.is_jellyfin_native)
    else if (filter === 'incomplete') result = collections.filter(c =>
      c.movie_count === 0 || (c.tmdb_total_parts && c.movie_count < c.tmdb_total_parts) ||
      (c.mdblist_list_id && c.mdblist_total_items && (c.movie_count + (c.show_count || 0)) < c.mdblist_total_items) ||
      (c.trakt_list_id && c.trakt_total_items && (c.movie_count + (c.show_count || 0)) < c.trakt_total_items)
    )
    else result = collections
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q))
    }
    return [...result].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
  }, [collections, filter, search])

  const jellyfinLinked = collections.filter(c => c.jellyfin_collection_id).length
  const jellyfinNative = collections.filter(c => c.is_jellyfin_native).length
  const localCount = collections.filter(c => !c.is_jellyfin_native).length
  const inJellyfin = collections.filter(c => c.in_jellyfin).length
  const incompleteCount = collections.filter(c =>
    c.movie_count === 0 || (c.tmdb_total_parts && c.movie_count < c.tmdb_total_parts) ||
    (c.mdblist_list_id && c.mdblist_total_items && (c.movie_count + (c.show_count || 0)) < c.mdblist_total_items)
  ).length

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between mb-5 gap-3">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-white">Collections</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
            {inJellyfin > 0 && ` · ${inJellyfin} in Jellyfin`}
          </p>
        </div>
        <button
          onClick={() => setShowNewChoice(true)}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
        >
          <Plus size={16} />
          New Collection
        </button>
      </div>

      {/* Filter + view toggle bar */}
      {!loading && collections.length > 0 && (
        <div className="mb-5 flex flex-col gap-2.5">
          {/* Filter pills — centred and horizontally scrollable on mobile */}
          <div className="flex justify-center sm:justify-start items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            {[
              { key: 'all', label: `All (${collections.length})` },
              { key: 'jellyfin', label: `From Jellyfin (${jellyfinNative})` },
              { key: 'local', label: `Local (${localCount})` },
              { key: 'incomplete', label: `Incomplete (${incompleteCount})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filter === key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search collections…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
                style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
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
            onClick={() => setShowNewChoice(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
          >
            <Plus size={16} />
            Create First Collection
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <p className="text-sm">
            {search.trim() ? `No collections matching "${search.trim()}".` : 'No collections match this filter.'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
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

      {showNewChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowNewChoice(false)} />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-lg font-semibold text-white mb-1">New Collection</h2>
            <p className="text-sm text-slate-400 mb-5">How would you like to create this collection?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowNewChoice(false); setShowCreate(true) }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl text-center hover:bg-white/5 transition-colors border border-slate-700 hover:border-violet-500/40"
              >
                <Plus size={24} className="text-violet-400" />
                <div>
                  <p className="text-sm font-medium text-white">Custom</p>
                  <p className="text-xs text-slate-500 mt-0.5">Build a collection manually</p>
                </div>
              </button>
              <button
                onClick={() => { setShowNewChoice(false); setShowTmdbSearch(true) }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl text-center hover:bg-white/5 transition-colors border border-slate-700 hover:border-violet-500/40"
              >
                <span
                  className="px-2 py-1 rounded text-white text-sm font-black tracking-wider"
                  style={{ background: 'linear-gradient(135deg, #90cea1, #01b4e4)' }}
                >
                  TMDB
                </span>
                <div>
                  <p className="text-sm font-medium text-white">From TMDB</p>
                  <p className="text-xs text-slate-500 mt-0.5">Import a known franchise</p>
                </div>
              </button>
              <button
                onClick={() => { setShowNewChoice(false); setShowMdblist(true) }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl text-center hover:bg-white/5 transition-colors border border-slate-700 hover:border-violet-500/40"
              >
                <span
                  className="px-2 py-1 rounded text-white text-xs font-black tracking-widest"
                  style={{ background: 'linear-gradient(135deg, #f97316, #eab308)' }}
                >
                  MDB
                </span>
                <div>
                  <p className="text-sm font-medium text-white">From MDBList</p>
                  <p className="text-xs text-slate-500 mt-0.5">Import a curated list</p>
                </div>
              </button>
              <button
                onClick={() => { setShowNewChoice(false); setShowTrakt(true) }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl text-center hover:bg-white/5 transition-colors border border-slate-700 hover:border-red-500/40"
              >
                <span
                  className="px-2 py-1 rounded text-white text-xs font-black tracking-wider"
                  style={{ background: '#ed1c24' }}
                >
                  TRAKT
                </span>
                <div>
                  <p className="text-sm font-medium text-white">From Trakt</p>
                  <p className="text-xs text-slate-500 mt-0.5">Import a public Trakt list</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowNewChoice(false)}
              className="mt-3 w-full py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(col) => navigate(`/collections/${col.id}`)}
        />
      )}

      {showTmdbSearch && (
        <TmdbCollectionModal
          onClose={() => setShowTmdbSearch(false)}
          onBack={() => { setShowTmdbSearch(false); setShowNewChoice(true) }}
          onCreate={(col) => navigate(`/collections/${col.id}`)}
        />
      )}

      {showMdblist && (
        <MdblistModal
          onClose={() => setShowMdblist(false)}
          onBack={() => { setShowMdblist(false); setShowNewChoice(true) }}
          onCreate={(col) => navigate(`/collections/${col.id}`)}
        />
      )}

      {showTrakt && (
        <TraktModal
          onClose={() => setShowTrakt(false)}
          onBack={() => { setShowTrakt(false); setShowNewChoice(true) }}
          onCreate={(col) => navigate(`/collections/${col.id}`)}
        />
      )}

    </div>
  )
}
