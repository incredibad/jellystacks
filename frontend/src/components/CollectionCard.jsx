import { Link } from 'react-router-dom'
import { Layers, CheckCircle2, Circle, AlertCircle, MoreVertical, Upload, Trash2 } from 'lucide-react'
import { useState } from 'react'

const JellyfinMark = () => (
  <svg viewBox="0 0 512 512" width="19" height="19" aria-hidden>
    <path
      d="M256,23.3c-61.6,0-259.8,359.4-229.6,420.1s429.3,60,459.2,0S317.6,23.3,256,23.3z M406.5,390.8c-19.6,39.3-281.1,39.8-300.9,0s110.1-275.3,150.4-275.3S426.1,351.4,406.5,390.8z"
      fill="white"
      fillRule="evenodd"
    />
    <path
      d="M256,201.6c-20.4,0-86.2,119.3-76.2,139.4s142.5,19.9,152.4,0S276.5,201.6,256,201.6z"
      fill="white"
    />
  </svg>
)

function SourceRibbon({ collection }) {
  let bg, content

  if (collection.tmdb_collection_id) {
    bg = '#01b4e4'
    content = (
      <span style={{ fontSize: 11, fontWeight: 900, color: 'white', letterSpacing: 1.5, lineHeight: 1, fontFamily: 'system-ui, Arial, sans-serif', display: 'block' }}>
        TMDB
      </span>
    )
  } else if (collection.mdblist_list_id) {
    bg = '#e8711a'
    content = (
      <span style={{ fontSize: 11, fontWeight: 900, color: 'white', letterSpacing: 1, lineHeight: 1, fontFamily: 'system-ui, Arial, sans-serif', display: 'block' }}>
        MDB
      </span>
    )
  } else if (collection.trakt_list_id) {
    bg = '#ed1c24'
    content = (
      <span style={{ fontSize: 10, fontWeight: 900, color: 'white', letterSpacing: 1, lineHeight: 1, fontFamily: 'system-ui, Arial, sans-serif', display: 'block' }}>
        TRAKT
      </span>
    )
  } else if (collection.is_jellyfin_native) {
    bg = '#7c3aed'
    content = <JellyfinMark />
  } else {
    bg = '#db2777'
    content = <Layers size={15} color="white" strokeWidth={2.5} />
  }

  // Wrapper is 90×90 with overflow:hidden so the rotated strip's rectangular
  // corners are clipped cleanly. Strip dimensions are chosen so the top-right
  // corner of the wrapper (90,0) satisfies |cx+cy−W| ≤ h/√2, guaranteeing
  // the corner is fully covered (cx≈66, cy≈27, W=90, h=30 → |93−90|=3 ✓).
  return (
    <div className="absolute top-0 right-0 pointer-events-none overflow-hidden" style={{ width: 90, height: 90 }}>
      <div
        className="absolute flex items-center justify-center"
        style={{ background: bg, top: 12, right: -36, width: 120, height: 30, transform: 'rotate(45deg)' }}
      >
        {content}
      </div>
    </div>
  )
}

export default function CollectionCard({ collection, onPush, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [jfImgError, setJfImgError] = useState(false)

  const needsSync = collection.in_jellyfin &&
    collection.jellyfin_synced_at &&
    new Date(collection.updated_at) > new Date(collection.jellyfin_synced_at)

  const artworkSrc = (() => {
    if (collection.artwork_url?.startsWith('/api/')) return collection.artwork_url
    if (collection.jellyfin_collection_id && !jfImgError) return `/api/collections/${collection.id}/poster`
    if (collection.artwork_url) return `/api/tmdb/proxy-image?url=${encodeURIComponent(collection.artwork_url.replace('/original/', '/w342/'))}`
    return null
  })()

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
                if (jfImgError) {
                  e.target.style.display = 'none'
                } else {
                  setJfImgError(true)
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

          {/* Status badge — top left */}
          <div className="absolute top-2 left-2">
            {needsSync ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-orange-600 text-white backdrop-blur-sm">
                <AlertCircle size={11} />
                Needs Sync
              </span>
            ) : collection.in_jellyfin ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-teal-600 text-white backdrop-blur-sm">
                <CheckCircle2 size={11} />
                Synced
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-slate-500 text-white backdrop-blur-sm">
                <Circle size={11} />
                Local
              </span>
            )}
          </div>

          {/* Source ribbon — top right corner */}
          <SourceRibbon collection={collection} />

          {/* Item count badge — bottom right */}
          <div className="absolute bottom-2 right-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/60 text-slate-300">
              {(() => {
                const mc = collection.movie_count
                const sc = collection.show_count || 0
                if (collection.mdblist_list_id && collection.mdblist_total_items) {
                  return `${mc + sc}/${collection.mdblist_total_items} items`
                }
                if (collection.tmdb_collection_id && collection.tmdb_total_parts) {
                  return `${mc}/${collection.tmdb_total_parts} movies${sc > 0 ? ` · ${sc} ${sc === 1 ? 'show' : 'shows'}` : ''}`
                }
                const parts = []
                if (mc > 0) parts.push(`${mc} ${mc === 1 ? 'movie' : 'movies'}`)
                if (sc > 0) parts.push(`${sc} ${sc === 1 ? 'show' : 'shows'}`)
                return parts.join(' · ') || 'Empty'
              })()}
            </span>
          </div>
        </div>
      </Link>

      {/* Info + actions */}
      <div className="p-3 relative">
        <div className="min-w-0 pr-7 text-center sm:text-left">
          <Link to={`/collections/${collection.id}`}>
            <h3 className="text-sm font-normal text-slate-200 truncate hover:text-violet-400 transition-colors">
              {collection.name}
            </h3>
          </Link>
          {collection.description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{collection.description}</p>
          )}
        </div>

        {/* Context menu */}
        <div className="absolute top-2 right-2">
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
