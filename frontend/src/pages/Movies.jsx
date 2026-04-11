import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Film } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import MovieCard from '../components/MovieCard'

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

  const fetchMovies = useCallback(async ({ q = search, lib = activeLibrary, reset = true } = {}) => {
    if (reset) setLoading(true)
    try {
      const params = { q, limit: PAGE_SIZE, offset: reset ? 0 : movies.length }
      if (lib) params.library = lib
      const { data } = await api.get('/movies', { params })
      if (reset) {
        setMovies(data)
      } else {
        setMovies(prev => [...prev, ...data])
      }
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      toast.error('Failed to load movies.')
    } finally {
      if (reset) setLoading(false)
      else setLoadingMore(false)
    }
  }, [search, activeLibrary, movies.length])

  useEffect(() => {
    api.get('/movies/libraries').then(({ data }) => setLibraries(data)).catch(() => {})
    api.get('/movies/count').then(({ data }) => setTotalCount(data.count)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchMovies({ q: search, lib: activeLibrary, reset: true }), 250)
    return () => clearTimeout(t)
  }, [search, activeLibrary]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = () => {
    setLoadingMore(true)
    fetchMovies({ reset: false })
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post('/movies/sync')
      toast.success(`Synced ${data.synced} movies.`)
      api.get('/movies/count').then(({ data }) => setTotalCount(data.count)).catch(() => {})
      fetchMovies({ q: search, lib: activeLibrary, reset: true })
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
        <div className="relative max-w-md">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
            {movies.map(movie => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>

          {hasMore && (
            <div className="flex flex-col items-center mt-8 gap-2">
              <p className="text-xs text-slate-500">
                Showing {movies.length} of {totalCount > 0 ? totalCount : '?'}
              </p>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50 transition-all border border-slate-700"
              >
                {loadingMore ? (
                  <><div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Loading…</>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
