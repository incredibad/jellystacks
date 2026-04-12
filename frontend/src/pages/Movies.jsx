import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, RefreshCw, Film, LayoutGrid, LayoutList } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import MovieCard from '../components/MovieCard'
import MovieListRow from '../components/MovieListRow'

const VIEW_KEY = 'jellystacks:movies-view'

const PAGE_SIZE = 100

export default function Movies() {
  const [movies, setMovies] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [libraries, setLibraries] = useState([])
  const [activeLibrary, setActiveLibrary] = useState('')
  const [totalCount, setTotalCount] = useState(0)

  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid')

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)

  const switchView = (v) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const fetchPage = useCallback(async ({ q, lib, offset, append }) => {
    const params = { q, limit: PAGE_SIZE, offset }
    if (lib) params.library = lib
    const { data } = await api.get('/movies', { params })
    if (append) {
      setMovies(prev => [...prev, ...data])
    } else {
      setMovies(data)
    }
    offsetRef.current = offset + data.length
    setHasMore(data.length === PAGE_SIZE)
    return data
  }, [])

  // Initial / filter-changed load
  const reload = useCallback(async (q, lib) => {
    setLoading(true)
    offsetRef.current = 0
    try {
      await fetchPage({ q, lib, offset: 0, append: false })
    } catch {
      toast.error('Failed to load movies.')
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    api.get('/movies/libraries').then(({ data }) => setLibraries(data)).catch(() => {})
    api.get('/movies/count').then(({ data }) => setTotalCount(data.count)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => reload(search, activeLibrary), 250)
    return () => clearTimeout(t)
  }, [search, activeLibrary]) // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !loading) {
          setLoadingMore(true)
          fetchPage({ q: search, lib: activeLibrary, offset: offsetRef.current, append: true })
            .catch(() => toast.error('Failed to load more movies.'))
            .finally(() => setLoadingMore(false))
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [search, activeLibrary, loading, loadingMore, fetchPage])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post('/movies/sync')
      toast.success(`Synced ${data.synced} movies.`)
      api.get('/movies/count').then(({ data }) => setTotalCount(data.count)).catch(() => {})
      reload(search, activeLibrary)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sync failed. Check Settings.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Movies</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {totalCount > 0 ? `${totalCount} movies in your library` : 'No movies synced yet'}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Jellyfin'}
        </button>
      </div>

      {/* Search + library filter */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search movies…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500 transition-all"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                ×
              </button>
            )}
          </div>
          {/* View toggle */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <button
              onClick={() => switchView('grid')}
              title="Grid view"
              className={`p-2 transition-colors ${view === 'grid' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => switchView('list')}
              title="List view"
              className={`p-2 transition-colors ${view === 'list' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <LayoutList size={16} />
            </button>
          </div>
        </div>
        {libraries.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveLibrary('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeLibrary === ''
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              All Libraries
            </button>
            {libraries.map(lib => (
              <button
                key={lib}
                onClick={() => setActiveLibrary(lib === activeLibrary ? '' : lib)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeLibrary === lib
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {lib}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : movies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Film size={48} className="mb-4 opacity-30" />
          {search ? (
            <p className="text-sm">No movies match "{search}"</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-400">No movies synced yet</p>
              <p className="text-xs mt-1">Configure Jellyfin in Settings, then sync your library.</p>
            </>
          )}
        </div>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
              {movies.map(movie => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {movies.map((movie, i) => (
                <div key={movie.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}>
                  <MovieListRow movie={movie} />
                </div>
              ))}
            </div>
          )}

          {/* Sentinel — triggers next page load when scrolled into view */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              {loadingMore && (
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          )}

          {!hasMore && movies.length > 0 && (
            <p className="text-center text-xs text-slate-600 py-8">
              {movies.length} of {totalCount} movies
            </p>
          )}
        </>
      )}
    </div>
  )
}
