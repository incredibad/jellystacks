import { useState } from 'react'
import { Film } from 'lucide-react'

export default function MovieCard({ movie, selected, onToggle }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      onClick={onToggle ? () => onToggle(movie) : undefined}
      className={`relative rounded-xl overflow-hidden group transition-all ${
        onToggle ? 'cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-violet-500' : ''}`}
      style={{ background: 'var(--surface)' }}
    >
      {/* Poster */}
      <div className="aspect-[2/3] relative overflow-hidden bg-slate-800">
        {imgFailed ? (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={32} className="text-slate-600" />
          </div>
        ) : (
          <img
            src={`/api/movies/${movie.id}/poster`}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        )}

        {/* Overlay on hover / selection */}
        {onToggle && (
          <div className={`absolute inset-0 transition-all ${
            selected ? 'bg-violet-600/40' : 'bg-black/0 group-hover:bg-black/30'
          }`}>
            {selected && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-sm font-medium text-slate-200 truncate leading-snug">{movie.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {movie.year && (
            <span className="text-xs text-slate-500">{movie.year}</span>
          )}
          {movie.community_rating && (
            <span className="text-xs text-amber-400">★ {movie.community_rating}</span>
          )}
        </div>
        {movie.library_name && (
          <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/70 text-slate-400 truncate max-w-full">
            {movie.library_name}
          </span>
        )}
      </div>
    </div>
  )
}
