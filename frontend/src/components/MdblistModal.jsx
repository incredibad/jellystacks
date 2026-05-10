import { useState, useRef } from 'react'
import { Search, X, ChevronLeft, Plus, List } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function MdblistModal({ onClose, onCreate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)   // the chosen list metadata
  const [preview, setPreview] = useState(null)      // { movie_count, show_count, total_items }
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const timer = useRef(null)

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const { data } = await api.get('/mdblist/search', { params: { query: q } })
      setResults(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleQueryChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(q), 300)
  }

  const handleSelect = async (list) => {
    setSelected(list)
    setName(list.name)
    setLoadingPreview(true)
    try {
      const { data } = await api.get(`/mdblist/lists/${list.id}/preview`)
      setPreview(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load list preview.')
      setSelected(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleCreate = async () => {
    if (!selected || !name.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/collections/from-mdblist', {
        mdblist_list_id: selected.id,
        name: name.trim(),
      })
      const owned = (preview?.movie_count || 0) + (preview?.show_count || 0)
      toast.success(`"${data.name}" created with ${owned} item${owned !== 1 ? 's' : ''}.`)
      onCreate(data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create collection.')
    } finally {
      setCreating(false)
    }
  }

  const ownedCount = preview ? preview.movie_count + preview.show_count : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => { setSelected(null); setPreview(null) }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {selected ? selected.name : 'Search MDBList'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {selected ? (
          /* Preview / confirm view */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* List meta */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                  <List size={18} className="text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-400 truncate">
                    by <span className="text-slate-300">{selected.user_name}</span>
                    {selected.items != null && (
                      <> · {selected.items} item{selected.items !== 1 ? 's' : ''} total</>
                    )}
                  </p>
                  {selected.description && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-3">{selected.description}</p>
                  )}
                </div>
              </div>

              {/* Owned count */}
              {loadingPreview ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : preview && (
                <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                  {preview.movie_count > 0 && (
                    <p className="text-sm text-emerald-400">{preview.movie_count} movie{preview.movie_count !== 1 ? 's' : ''} in your library</p>
                  )}
                  {preview.show_count > 0 && (
                    <p className="text-sm text-emerald-400">{preview.show_count} show{preview.show_count !== 1 ? 's' : ''} in your library</p>
                  )}
                  {ownedCount === 0 && (
                    <p className="text-sm text-slate-500">None of this list's items are in your library.</p>
                  )}
                </div>
              )}

              {/* Collection name */}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Collection name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-violet-500"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => { setSelected(null); setPreview(null) }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || loadingPreview || !name.trim() || ownedCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={15} />
                {creating ? 'Creating…' : 'Create Collection'}
              </button>
            </div>
          </div>
        ) : (
          /* Search view */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search for a list (e.g. Best Horror, Top 250)…"
                  value={query}
                  onChange={handleQueryChange}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2">
              {searching ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {query.trim() ? 'No lists found.' : 'Start typing to search MDBList…'}
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map(result => (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-white/5 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                        <List size={14} className="text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{result.name}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          by {result.user_name}
                          {result.description ? ` · ${result.description}` : ''}
                        </p>
                      </div>
                      {result.items != null && (
                        <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">{result.items}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
