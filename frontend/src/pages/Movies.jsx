import { useState, useEffect } from 'react'
import { Search, RefreshCw, Film } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import MovieCard from '../components/MovieCard'

export default function Movies() {
  const [movies, setMovies] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchMovies = async (q = search) => {
    setLoading(true)
    try {
      const { data } = await api.get('/movies', { params: { q } })
      setMovies(data)
    } catch {
      toast.error('Failed to load movies.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => fetchMovies(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post('/movies/sync')
      toast.success(`Synced ${data.synced} movies.`)
      fetchMovies()
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
            {movies.length} {movies.length === 1 ? 'movie' : 'movies'} in your library
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

      {/* Search */}
      <div className="relative mb-6 max-w-md">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          {movies.map(movie => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </div>
  )
}
