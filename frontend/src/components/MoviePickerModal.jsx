import { useState, useEffect } from 'react'
import { Search, X, Plus } from 'lucide-react'
import { Film } from 'lucide-react'
import api from '../api/client'

export default function MoviePickerModal({ collection, onClose, onAdded }) {
  const [movies, setMovies] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [libraries, setLibraries] = useState([])
  const [activeLibrary, setActiveLibrary] = useState('')

  const existingIds = new Set(collection.movies?.map(m => m.id) || [])

  useEffect(() => {
    api.get('/movies/libraries').then(({ data }) => setLibraries(data)).catch(() => {})
  }, [])

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true)
      try {
        const params = { q: search }
        if (activeLibrary) params.library = activeLibrary
        const { data } = await api.get('/movies', { params })
        setMovies(data)
      } finally {
        setLoading(false)
      }
    }
    const t = setTimeout(fetchMovies, 200)
    return () => clearTimeout(t)
  }, [search, activeLibrary])

  const toggle = (id) => {
    if (existingIds.has(id)) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setAdding(true)
    try {
      const { data } = await api.post(`/collections/${collection.id}/movies`, {
        movie_ids: [...selected],
      })
      onAdded(data)
      onClose()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-semibold text-white">Add Movies</h2>
            <p className="text-sm text-slate-400 mt-0.5">to "{collection.name}"</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search + library filter */}
        <div className="p-4 border-b space-y-2.5" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              type="text"
              placeholder="Search movies…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
            />
          </div>
          {libraries.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveLibrary('')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeLibrary === ''
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              {libraries.map(lib => (
                <button
                  key={lib}
                  onClick={() => setActiveLibrary(lib === activeLibrary ? '' : lib)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeLibrary === lib
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {lib}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Movie list */}
        <div className="overflow-y-auto flex-1 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : movies.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No movies found.</div>
          ) : (
            <div className="space-y-1">
              {movies.map(movie => {
                const isIn = existingIds.has(movie.id)
                const isSel = selected.has(movie.id)
                return (
                  <button
                    key={movie.id}
                    onClick={() => toggle(movie.id)}
                    disabled={isIn}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
                      isIn
                        ? 'opacity-50 cursor-not-allowed'
                        : isSel
                        ? 'bg-violet-600/20 border border-violet-500/40'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {/* Mini poster */}
                    <div className="w-9 h-12 rounded overflow-hidden flex-shrink-0 bg-slate-800 relative">
                      <img
                        src={`/api/movies/${movie.id}/poster`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Film size={14} className="text-slate-600" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{movie.title}</p>
                      <p className="text-xs text-slate-500">{movie.year}</p>
                    </div>
                    {isIn && <span className="text-xs text-slate-500 flex-shrink-0">Already added</span>}
                    {isSel && (
                      <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm text-slate-400">
            {selected.size > 0 ? `${selected.size} selected` : 'Select movies to add'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
