import { useState } from 'react'
import { Film, X } from 'lucide-react'

export default function MovieListRow({ movie, onRemove }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
      {/* Mini poster */}
      <div className="w-9 h-12 rounded overflow-hidden flex-shrink-0 bg-slate-800">
        {imgFailed ? (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={14} className="text-slate-600" />
          </div>
        ) : (
          <img
            src={`/api/movies/${movie.id}/poster`}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{movie.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {movie.year && <span className="text-xs text-slate-500">{movie.year}</span>}
          {movie.library_name && (
            <>
              {movie.year && <span className="text-slate-700 text-xs">·</span>}
              <span className="text-xs text-slate-500">{movie.library_name}</span>
            </>
          )}
          {movie.community_rating && (
            <>
              <span className="text-slate-700 text-xs">·</span>
              <span className="text-xs text-amber-400">★ {movie.community_rating}</span>
            </>
          )}
        </div>
      </div>

      {/* Optional remove button */}
      {onRemove && (
        <button
          onClick={() => onRemove(movie.id)}
          className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove from collection"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
