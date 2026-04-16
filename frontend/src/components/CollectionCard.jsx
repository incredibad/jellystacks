import { Link } from 'react-router-dom'
import { Layers, CheckCircle2, Circle, AlertCircle, MoreVertical, Upload, Trash2, Import, Film } from 'lucide-react'
import { useState } from 'react'

export default function CollectionCard({ collection, onPush, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [jfImgError, setJfImgError] = useState(false)

  const needsSync = collection.in_jellyfin &&
    collection.jellyfin_synced_at &&
    new Date(collection.updated_at) > new Date(collection.jellyfin_synced_at)

  // Prefer Jellyfin poster; fall back to TMDB artwork_url
  const jfPoster = collection.jellyfin_collection_id && !jfImgError
    ? `/api/collections/${collection.id}/poster`
    : null
  const tmdbPoster = collection.artwork_url
    ? `/api/tmdb/proxy-image?url=${encodeURIComponent(collection.artwork_url.replace('/original/', '/w342/'))}`
    : null
  const artworkSrc = jfPoster || tmdbPoster

  return (
    <div
      className="relative rounded-xl group"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Artwork */}
      <Link to={`/collections/${collection.id}`}>
        <div className="aspect-[2/3] relative overflow-hidden bg-slate-800 rounded-t-xl">
          {artworkSrc ? (
            <img
              src={artworkSrc}
              alt={collection.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                if (jfPoster && !jfImgError) {
                  setJfImgError(true)
                } else {
                  e.target.style.display = 'none'
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Layers size={36} className="text-slate-600" />
              <span className="text-xs text-slate-600 px-3 text-center">{collection.name}</span>
            </div>
          )}
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          {/* Status badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {needsSync ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-600 text-white backdrop-blur-sm">
                <AlertCircle size={11} />
                Needs Sync
              </span>
            ) : collection.is_jellyfin_native ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-900 text-white backdrop-blur-sm">
                <Import size={11} />
                Jellyfin
              </span>
            ) : collection.in_jellyfin ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-600 text-white backdrop-blur-sm">
                <CheckCircle2 size={11} />
                Synced
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500 text-white backdrop-blur-sm">
                <Circle size={11} />
                Local
              </span>
            )}
          </div>

          {/* TMDB / Custom type badge — top right, only shown once detection has run */}
          {collection.tmdb_checked && (
            <div className="absolute top-2 right-2">
              {collection.tmdb_collection_id ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-600 text-white backdrop-blur-sm">
                  <Film size={11} />
                  TMDB
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white backdrop-blur-sm">
                  Custom
                </span>
              )}
            </div>
          )}

          {/* Movie count badge */}
          <div className="absolute bottom-2 right-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/60 text-slate-300">
              {collection.tmdb_collection_id && collection.tmdb_total_parts
                ? `${collection.movie_count}/${collection.tmdb_total_parts} movies`
                : `${collection.movie_count} ${collection.movie_count === 1 ? 'movie' : 'movies'}`
              }
            </span>
          </div>
        </div>
      </Link>

      {/* Info + actions */}
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/collections/${collection.id}`}>
            <h3 className="text-sm font-semibold text-slate-200 truncate hover:text-violet-400 transition-colors">
              {collection.name}
            </h3>
          </Link>
          {collection.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{collection.description}</p>
          )}
        </div>

        {/* Context menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-7 z-20 w-44 rounded-lg shadow-xl py-1 text-sm"
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
    </div>
  )
}
