import { useState, useRef } from 'react'
import { Search, X, Film, ChevronLeft, Plus, CheckCircle2 } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function TmdbCollectionModal({ onClose, onCreate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [importing, setImporting] = useState(false)
  const timer = useRef(null)

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const { data } = await api.get('/tmdb/search-collections', { params: { q } })
      setResults(data)
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

  const handleSelect = async (result) => {
    setLoadingDetail(true)
    try {
      const { data } = await api.get(`/tmdb/collection/${result.id}`)
      setDetail(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load collection.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleImport = async () => {
    if (!detail) return
    setImporting(true)
    try {
      const { data } = await api.post('/collections/import-from-tmdb', {
        tmdb_collection_id: detail.id,
      })
      toast.success(`"${detail.name}" imported with ${data.movie_count} movies.`)
      onCreate(data)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

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
            {detail && (
              <button
                onClick={() => setDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {detail ? detail.name : 'Search TMDB Collections'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {detail ? (
          /* Detail view */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 p-5">
              <div className="flex gap-4 mb-5">
                {detail.poster_thumb ? (
                  <img src={detail.poster_thumb} alt="" className="w-24 rounded-lg object-cover flex-shrink-0 self-start" />
                ) : (
                  <div className="w-24 h-36 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Film size={24} className="text-slate-600" />
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-400 mb-1">
                    {detail.total_parts} movies in franchise ·{' '}
                    <span className="text-emerald-400">{detail.owned_count} in your library</span>
                  </p>
                  {detail.overview && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-4">{detail.overview}</p>
                  )}
                </div>
              </div>

              <div className="space-y-0.5">
                {detail.parts.map(part => (
                  <div
                    key={part.id}
                    className={`flex items-center gap-3 p-2 rounded-lg ${part.owned ? '' : 'opacity-35'}`}
                  >
                    <div className="w-7 h-10 rounded overflow-hidden flex-shrink-0 bg-slate-800">
                      {part.poster_path ? (
                        <img
                          src={`/api/tmdb/proxy-image?url=https://image.tmdb.org/t/p/w92${part.poster_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film size={10} className="text-slate-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{part.title}</p>
                      {part.year && <p className="text-xs text-slate-500">{part.year}</p>}
                    </div>
                    {part.owned && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs text-slate-500">
                {detail.owned_count === 0
                  ? 'None of these movies are in your library.'
                  : `${detail.owned_count} of ${detail.total_parts} movies will be added.`}
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setDetail(null)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || detail.owned_count === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={15} />
                  {importing ? 'Importing…' : 'Import Collection'}
                </button>
              </div>
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
                  placeholder="Search for a franchise (e.g. Avengers, John Wick)…"
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
                  {query.trim() ? 'No collections found.' : 'Start typing to search TMDB…'}
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map(result => (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      disabled={loadingDetail}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                      <div className="w-9 h-12 rounded overflow-hidden flex-shrink-0 bg-slate-800">
                        {result.poster_thumb ? (
                          <img src={result.poster_thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film size={14} className="text-slate-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{result.name}</p>
                        {result.overview && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{result.overview}</p>
                        )}
                      </div>
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
