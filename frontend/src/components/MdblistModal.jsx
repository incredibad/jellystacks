import { useState, useRef, useEffect } from 'react'
import { Search, X, ChevronLeft, Plus, List, Heart, Check } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function MdblistModal({ onClose, onCreate, onBack }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [topLists, setTopLists] = useState([])
  const [loadingTop, setLoadingTop] = useState(true)
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [visibleCount, setVisibleCount] = useState(15)
  const [previewVisible, setPreviewVisible] = useState(50)
  const timer = useRef(null)

  useEffect(() => {
    api.get('/mdblist/top')
      .then(({ data }) => setTopLists(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingTop(false))
  }, [])

  const handleBrowseScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setVisibleCount(c => c + 15)
    }
  }

  const handlePreviewScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setPreviewVisible(c => c + 50)
    }
  }

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); setVisibleCount(15); return }
    setSearching(true)
    try {
      const { data } = await api.get('/mdblist/search', { params: { query: q } })
      const list = Array.isArray(data) ? data : []
      setResults(list.sort((a, b) => (b.likes || 0) - (a.likes || 0)))
      setVisibleCount(15)
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
    setPreviewVisible(50)
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
        source_url: selected.slug ? `https://mdblist.com/lists/${selected.user_name}/${selected.slug}` : null,
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
            {(selected || onBack) && (
              <button
                onClick={selected ? () => { setSelected(null); setPreview(null) } : onBack}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-white text-xs font-black tracking-wider" style={{ background: '#e8711a' }}>
                MDBLIST
              </span>
              <h2 className="text-lg font-semibold text-white truncate max-w-[220px]">
                {selected ? selected.name : 'Lists'}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {selected ? (
          /* Preview / confirm view */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 p-5 space-y-4" onScroll={handlePreviewScroll}>
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
                  {selected.slug && (
                    <a
                      href={`https://mdblist.com/lists/${selected.user_name}/${selected.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs mt-1 inline-block hover:underline"
                      style={{ color: '#e8711a' }}
                    >
                      View on MDBList ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Item list */}
              {loadingPreview ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : preview && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    {ownedCount > 0
                      ? <><span className="text-emerald-400">{ownedCount}</span> of {preview.total_items} items in your library</>
                      : `${preview.total_items} items — none in your library`}
                  </p>
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {(preview.items || []).slice(0, previewVisible).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0"
                        style={{ borderColor: 'var(--border)', background: item.owned ? 'rgba(16,185,129,0.05)' : undefined }}
                      >
                        {item.owned
                          ? <Check size={13} className="text-emerald-400 flex-shrink-0" />
                          : <div className="w-[13px] flex-shrink-0" />}
                        <span className={`flex-1 text-sm truncate ${item.owned ? 'text-slate-200' : 'text-slate-500'}`}>
                          {item.title}
                        </span>
                        {item.year && (
                          <span className="text-xs text-slate-600 tabular-nums">{item.year}</span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                          item.mediatype === 'movie' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
                        }`}>
                          {item.mediatype === 'movie' ? 'Movie' : 'Show'}
                        </span>
                      </div>
                    ))}
                  </div>
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

            <div className="overflow-y-auto flex-1 p-2" onScroll={handleBrowseScroll}>
              {(searching || (loadingTop && !query.trim())) ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (() => {
                const displayList = query.trim() ? results : topLists
                const isSearch = !!query.trim()
                if (isSearch && displayList.length === 0) {
                  return <div className="text-center py-12 text-slate-500 text-sm">No lists found.</div>
                }
                const visibleItems = displayList.slice(0, visibleCount)
                const hasMore = displayList.length > visibleCount
                return (
                  <div className="space-y-1">
                    {!isSearch && (
                      <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Top Lists</p>
                    )}
                    {visibleItems.map(result => (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <List size={14} className="text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-200 truncate">{result.name}</p>
                            <div className="flex items-center gap-2.5 flex-shrink-0 text-xs text-slate-500 tabular-nums">
                              {result.items > 0 && (
                                <span>{result.items} Items</span>
                              )}
                              {result.likes > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Heart size={10} />
                                  {result.likes}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {result.user_name}{result.description ? ` · ${result.description}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
