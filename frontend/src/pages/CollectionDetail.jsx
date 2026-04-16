import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Upload, Trash2, Plus, Image as ImageIcon,
  CheckCircle2, Circle, AlertCircle, Pencil, X, Check, RefreshCw,
  LayoutGrid, LayoutList, Import, Film,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import MovieCard from '../components/MovieCard'
import MovieListRow from '../components/MovieListRow'
import MoviePickerModal from '../components/MoviePickerModal'
import ArtworkPicker from '../components/ArtworkPicker'

const VIEW_KEY = 'jellystacks:collection-view'

function EditableField({ label, value, onSave, multiline = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const handleSave = () => {
    onSave(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            style={{ background: '#0d0d14', border: '1px solid var(--border)' }}
          />
        ) : (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-200 outline-none focus:ring-1 focus:ring-violet-500"
            style={{ background: '#0d0d14', border: '1px solid var(--border)' }}
          />
        )}
        <button onClick={handleSave} className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors">
          <Check size={16} />
        </button>
        <button onClick={() => setEditing(false)} className="p-2 rounded-lg text-slate-500 hover:bg-white/5 transition-colors">
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value || ''); setEditing(true) }}
      className="group flex items-center gap-2 text-left hover:text-slate-200 transition-colors"
    >
      <span className={!value ? 'text-slate-600 italic text-sm' : ''}>
        {value || `Add ${label.toLowerCase()}…`}
      </span>
      <Pencil size={13} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  )
}

function UnownedMovieCard({ movie }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'var(--surface)' }}>
      <div className="aspect-[2/3] relative overflow-hidden bg-slate-800">
        {movie.poster_url && !imgFailed ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={32} className="text-slate-700" />
          </div>
        )}
        {/* Dim overlay */}
        <div className="absolute inset-0 bg-black/50" />
        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-black/70 text-slate-400">
          Not in library
        </span>
      </div>
      <div className="p-2.5">
        <p className="text-sm font-medium text-slate-500 truncate leading-snug">{movie.title}</p>
        {movie.year && <span className="text-xs text-slate-600">{movie.year}</span>}
      </div>
    </div>
  )
}

export default function CollectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showArtwork, setShowArtwork] = useState(false)
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid')
  const [jfImgError, setJfImgError] = useState(false)
  const [unownedMovies, setUnownedMovies] = useState([])
  const [showUnowned, setShowUnowned] = useState(true)
  const [detectionDone, setDetectionDone] = useState(false)

  const switchView = (v) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const fetchUnowned = async (colId) => {
    try {
      const { data } = await api.get(`/collections/${colId}/unowned`)
      setUnownedMovies(data)
    } catch {
      // silently ignore — unowned section just stays empty
    }
  }

  const fetchCollection = async () => {
    try {
      const { data } = await api.get(`/collections/${id}`)
      setCollection(data)

      // Auto-verify Jellyfin status in the background
      if (data.jellyfin_collection_id) {
        api.post(`/collections/${id}/verify`)
          .then(res => setCollection(prev => prev ? { ...prev, in_jellyfin: res.data.in_jellyfin } : prev))
          .catch(() => {})
      }

      // Always re-run detection on load — handles additions/removals that
      // may have invalidated or newly satisfied the TMDB match.
      if (data.movies.length > 0) {
        api.post(`/collections/${id}/detect-tmdb`)
          .then(res => {
            const linkedId = res.data.tmdb_collection_id
            setCollection(prev => prev ? { ...prev, tmdb_collection_id: linkedId } : prev)
            if (linkedId) {
              fetchUnowned(id)
            } else {
              setUnownedMovies([])
            }
          })
          .catch(() => {
            // Detection failed (e.g. no TMDB key) — fall back to stored value
            if (data.tmdb_collection_id) fetchUnowned(id)
          })
          .finally(() => setDetectionDone(true))
      } else {
        setDetectionDone(true)
      }
    } catch {
      toast.error('Collection not found.')
      navigate('/collections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCollection() }, [id])

  const handleUpdate = async (patch) => {
    try {
      const { data } = await api.put(`/collections/${id}`, patch)
      setCollection(data)
    } catch {
      toast.error('Failed to update collection.')
    }
  }

  const handleRemoveMovie = async (movieId) => {
    try {
      const { data } = await api.delete(`/collections/${id}/movies/${movieId}`)
      setCollection(data)
      toast.success('Movie removed.')
    } catch {
      toast.error('Failed to remove movie.')
    }
  }

  const handlePush = async () => {
    setPushing(true)
    const tid = toast.loading('Pushing to Jellyfin…')
    try {
      const { data } = await api.post(`/collections/${id}/push`)
      toast.success(data.message, { id: tid })
      fetchCollection()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Push failed.', { id: tid })
    } finally {
      setPushing(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const { data } = await api.post(`/collections/${id}/verify`)
      setCollection(prev => ({ ...prev, in_jellyfin: data.in_jellyfin }))
      toast.success(data.in_jellyfin ? 'Collection confirmed in Jellyfin.' : 'Collection not found in Jellyfin.')
    } catch {
      toast.error('Verify failed.')
    } finally {
      setVerifying(false)
    }
  }

  const handleRemoveFromJellyfin = async () => {
    if (!confirm('Remove this collection from Jellyfin? Movies will not be deleted.')) return
    try {
      await api.delete(`/collections/${id}/jellyfin`)
      toast.success('Removed from Jellyfin.')
      fetchCollection()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed.')
    }
  }

  const handleArtworkSelect = async (url) => {
    await handleUpdate({ artwork_url: url })
    setShowArtwork(false)
    toast.success('Artwork updated.')
  }

  const handleDeleteCollection = async () => {
    if (!confirm(`Delete "${collection.name}"? This will also remove it from Jellyfin if it has been synced.`)) return
    try {
      await api.delete(`/collections/${id}`)
      navigate('/collections')
      toast.success('Collection deleted.')
    } catch {
      toast.error('Failed to delete.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!collection) return null

  const jfPoster = collection.jellyfin_collection_id
    ? `/api/collections/${collection.id}/poster`
    : null
  const tmdbPoster = collection.artwork_url
    ? `/api/tmdb/proxy-image?url=${encodeURIComponent(collection.artwork_url.replace('/original/', '/w342/'))}`
    : null
  const artworkSrc = (!jfImgError && jfPoster) ? jfPoster : tmdbPoster

  // True when the collection is in Jellyfin but has been modified locally since the last sync.
  const needsSync = collection.in_jellyfin &&
    collection.jellyfin_synced_at &&
    new Date(collection.updated_at) > new Date(collection.jellyfin_synced_at)

  return (
    <div className="p-8 max-w-7xl">
      {/* Back */}
      <Link to="/collections" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-400 transition-colors mb-6">
        <ArrowLeft size={15} />
        Back to Collections
      </Link>

      {/* Collection header */}
      <div className="flex items-start gap-6 mb-8" style={{ flexWrap: 'wrap' }}>
        {/* Artwork */}
        <div className="relative group flex-shrink-0">
          <div
            className="w-36 h-52 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center cursor-pointer"
            onClick={() => setShowArtwork(true)}
            style={{ border: '1px solid var(--border)' }}
          >
            {artworkSrc ? (
              <img
                src={artworkSrc}
                alt=""
                className="w-full h-full object-cover"
                onError={() => {
                  if (jfPoster && !jfImgError) setJfImgError(true)
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <ImageIcon size={28} />
                <span className="text-xs">No artwork</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
              <div className="flex flex-col items-center gap-1 text-white text-xs">
                <ImageIcon size={18} />
                Change
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            {collection.is_jellyfin_native && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
                <Import size={12} />
                Imported from Jellyfin
              </span>
            )}
            {needsSync ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <AlertCircle size={12} />
                Needs Sync
              </span>
            ) : collection.in_jellyfin ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={12} />
                In Jellyfin
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/30">
                <Circle size={12} />
                Local Only
              </span>
            )}
            {collection.tmdb_collection_id ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/20">
                <Film size={12} />
                TMDB Collection
              </span>
            ) : detectionDone ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/30">
                Custom Collection
              </span>
            ) : null}
            <span className="text-xs text-slate-500">{collection.movie_count} movies</span>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">
            <EditableField
              label="Name"
              value={collection.name}
              onSave={v => handleUpdate({ name: v })}
            />
          </h1>

          <div className="text-sm text-slate-400 mb-4">
            <EditableField
              label="Description"
              value={collection.description}
              onSave={v => handleUpdate({ description: v })}
              multiline
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePush}
              disabled={pushing || collection.movie_count === 0 || (collection.in_jellyfin && !needsSync)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                pushing || collection.movie_count === 0
                  ? 'bg-violet-600 text-white opacity-50 cursor-not-allowed'
                  : needsSync
                    ? 'bg-amber-500 hover:bg-amber-400 text-white'
                    : collection.in_jellyfin
                      ? 'bg-slate-700 text-slate-400 cursor-default'
                      : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              <Upload size={15} />
              {pushing ? 'Pushing…' : needsSync ? 'Update in Jellyfin' : collection.in_jellyfin ? 'Synced' : 'Push to Jellyfin'}
            </button>

            {collection.jellyfin_collection_id && (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-slate-700"
              >
                <RefreshCw size={14} className={verifying ? 'animate-spin' : ''} />
                Verify
              </button>
            )}

            {collection.in_jellyfin && (
              <button
                onClick={handleRemoveFromJellyfin}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
              >
                <X size={14} />
                Remove from Jellyfin
              </button>
            )}

            <button
              onClick={() => setShowArtwork(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-slate-700"
            >
              <ImageIcon size={14} />
              Change Artwork
            </button>

            <button
              onClick={handleDeleteCollection}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20 ml-auto"
            >
              <Trash2 size={14} />
              Delete Collection
            </button>
          </div>

          {collection.jellyfin_synced_at && (
            <p className="text-xs text-slate-600 mt-3">
              Last synced to Jellyfin: {new Date(collection.jellyfin_synced_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Movies section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Movies <span className="text-slate-500 font-normal text-base">({collection.movie_count})</span>
          </h2>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all border border-violet-500/20 hover:border-violet-500/40"
            >
              <Plus size={15} />
              Add Movies
            </button>
          </div>
        </div>

        {collection.movies.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-xl text-slate-500"
            style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
          >
            <p className="text-sm">No movies in this collection yet.</p>
            <button
              onClick={() => setShowPicker(true)}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
            >
              <Plus size={15} />
              Add Movies
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {collection.movies.map(movie => (
              <div key={movie.id} className="relative group">
                <MovieCard movie={movie} />
                <button
                  onClick={() => handleRemoveMovie(movie.id)}
                  className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-400 shadow-lg"
                  title="Remove from collection"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {collection.movies.map((movie, i) => (
              <div key={movie.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}>
                <MovieListRow movie={movie} onRemove={handleRemoveMovie} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unowned movies */}
      {unownedMovies.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowUnowned(v => !v)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h2 className="text-lg font-semibold text-slate-400 group-hover:text-slate-300 transition-colors">
              Not in your library
              <span className="text-slate-600 font-normal text-base ml-2">({unownedMovies.length})</span>
            </h2>
            <span className="text-xs text-slate-600 group-hover:text-slate-500 transition-colors">
              {showUnowned ? '▲ hide' : '▼ show'}
            </span>
          </button>

          {showUnowned && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
              {unownedMovies.map(movie => (
                <UnownedMovieCard key={movie.tmdb_id} movie={movie} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPicker && (
        <MoviePickerModal
          collection={collection}
          onClose={() => setShowPicker(false)}
          onAdded={(updated) => setCollection(updated)}
        />
      )}
      {showArtwork && (
        <ArtworkPicker
          movies={collection.movies}
          onClose={() => setShowArtwork(false)}
          onSelect={handleArtworkSelect}
        />
      )}
    </div>
  )
}
