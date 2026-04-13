import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  Layers, CheckCircle2, Circle, AlertCircle, Import,
  Upload, Trash2, MoreVertical,
} from 'lucide-react'

export default function CollectionListRow({ collection, onPush, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [imgError, setImgError] = useState(false)

  const needsSync = collection.in_jellyfin &&
    collection.jellyfin_synced_at &&
    new Date(collection.updated_at) > new Date(collection.jellyfin_synced_at)

  // Prefer Jellyfin poster if the collection is synced; fall back to TMDB
  const jfPoster = collection.jellyfin_collection_id && !imgError
    ? `/api/collections/${collection.id}/poster`
    : null
  const tmdbPoster = collection.artwork_url
    ? `/api/tmdb/proxy-image?url=${encodeURIComponent(collection.artwork_url.replace('/original/', '/w342/'))}`
    : null
  const posterSrc = jfPoster || tmdbPoster

  const badge = needsSync ? (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <AlertCircle size={10} />
      Needs Sync
    </span>
  ) : collection.is_jellyfin_native ? (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
      <Import size={10} />
      Jellyfin
    </span>
  ) : collection.in_jellyfin ? (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 size={10} />
      Synced
    </span>
  ) : (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600/30">
      <Circle size={10} />
      Local
    </span>
  )

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-colors"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Mini poster */}
      <Link to={`/collections/${collection.id}`} className="flex-shrink-0">
        <div className="w-10 h-14 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center">
          {posterSrc ? (
            <img
              src={posterSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={() => {
                if (jfPoster) setImgError(true)
              }}
            />
          ) : (
            <Layers size={16} className="text-slate-600" />
          )}
        </div>
      </Link>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <Link to={`/collections/${collection.id}`}>
          <span className="text-sm font-semibold text-slate-200 hover:text-violet-400 transition-colors line-clamp-1">
            {collection.name}
          </span>
        </Link>
        <p className="text-xs text-slate-500 mt-0.5">
          {collection.movie_count} {collection.movie_count === 1 ? 'movie' : 'movies'}
          {collection.description && ` · ${collection.description}`}
        </p>
      </div>

      {/* Badge */}
      <div className="flex-shrink-0 hidden sm:block">{badge}</div>

      {/* Context menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-0 top-8 z-20 w-44 rounded-lg shadow-xl py-1 text-sm"
              style={{ background: '#1e1e30', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => { onPush(collection); setMenuOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-white/5 hover:text-violet-400 transition-colors"
              >
                <Upload size={14} />
                Push to Jellyfin
              </button>
              <button
                onClick={() => { onDelete(collection); setMenuOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-red-400/10 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
