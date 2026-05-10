import { useState, useRef } from 'react'
import { Film, Upload, Image as ImageIcon, Loader, RotateCcw } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { libraryColor } from '../utils/libraryColor'
import MediaArtworkModal from './MediaArtworkModal'

const POSTER_MAX_DIM = 1000
const SIZE_THRESHOLD = 2 * 1024 * 1024

export default function MovieCard({ movie, selected, onToggle, onArtworkChange }) {
  const [imgFailed, setImgFailed] = useState(false)
  const [cacheBuster, setCacheBuster] = useState(0)
  const [artworkModal, setArtworkModal] = useState(false)
  const [pendingUpload, setPendingUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [localPreview, setLocalPreview] = useState(null)
  const fileInputRef = useRef(null)

  const isShow = movie.media_type === 'show'
  const canEditArtwork = !!onArtworkChange && !onToggle

  const baseUrl = isShow
    ? `/api/shows/${movie.id}/poster`
    : `/api/movies/${movie.id}/poster`
  // Stable buster from prop data so artwork shows correctly after cross-page navigation.
  // Local files use 'local' — backend returns Cache-Control: no-store so re-uploads always fetch fresh.
  const stableBuster = movie.custom_artwork_url
    ? (movie.custom_artwork_url.startsWith('/data/') ? 'local' : encodeURIComponent(movie.custom_artwork_url).slice(-24))
    : null
  const posterUrl = localPreview ?? (cacheBuster ? `${baseUrl}?t=${cacheBuster}` : stableBuster ? `${baseUrl}?t=${stableBuster}` : baseUrl)

  const analyzeImage = (file) => new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(POSTER_MAX_DIM / width, POSTER_MAX_DIM / height)
      resolve({
        file,
        width,
        height,
        sizeBytes: file.size,
        isLarge: file.size > SIZE_THRESHOLD || width > POSTER_MAX_DIM || height > POSTER_MAX_DIM,
        targetWidth: Math.round(width * scale),
        targetHeight: Math.round(height * scale),
      })
    }
    img.src = url
  })

  const resizeImageFile = (file, targetW, targetH) => new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH)
      canvas.toBlob(blob => resolve(new File([blob], 'poster.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
    }
    img.src = url
  })

  const doUpload = async (file) => {
    setUploading(true)
    setPendingUpload(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const endpoint = isShow
        ? `/shows/${movie.id}/artwork/upload`
        : `/movies/${movie.id}/artwork/upload`
      const { data } = await api.post(endpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setLocalPreview(null)
      onArtworkChange(data)
      setCacheBuster(Date.now())
      toast.success('Artwork saved.')
    } catch {
      toast.error('Upload failed.')
      setLocalPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const previewUrl = URL.createObjectURL(file)
    setLocalPreview(previewUrl)
    const analysis = await analyzeImage(file)
    if (analysis.isLarge) {
      setPendingUpload(analysis)
    } else {
      doUpload(file)
    }
  }

  const handleArtworkUpdated = (updated) => {
    onArtworkChange(updated)
    setCacheBuster(Date.now())
    setArtworkModal(false)
  }

  const handleRevert = async (e) => {
    e.stopPropagation()
    setUploading(true)
    try {
      const endpoint = isShow ? `/shows/${movie.id}/artwork` : `/movies/${movie.id}/artwork`
      const { data } = await api.delete(endpoint)
      onArtworkChange(data)
      // JF re-scrape is async — poll every 3s for up to 12s to pick up the new poster
      const retry = (delay) => setTimeout(() => { setImgFailed(false); setCacheBuster(Date.now()) }, delay)
      retry(2000); retry(5000); retry(9000)
      toast.success('Reverted — fetching original poster…')
    } catch {
      toast.error('Failed to revert artwork.')
    } finally {
      setUploading(false)
    }
  }

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
        {imgFailed && !localPreview ? (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={32} className="text-slate-600" />
          </div>
        ) : (
          <img
            src={posterUrl}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => { if (!localPreview) setImgFailed(true) }}
          />
        )}

        {/* Library pill — top-right */}
        {movie.library_name && (() => {
          const { bg, text } = libraryColor(movie.library_name)
          return (
            <span
              className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-semibold leading-tight truncate max-w-[80%] backdrop-blur-sm"
              style={{ background: bg, color: text }}
            >
              {movie.library_name}
            </span>
          )
        })()}

        {/* Custom artwork badge — top-left */}
        {movie.custom_artwork_url && (
          <span
            className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-semibold leading-tight backdrop-blur-sm"
            style={{ background: 'rgba(109, 40, 217, 0.9)', color: '#fff' }}
          >
            Custom
          </span>
        )}

        {/* Selection overlay */}
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

        {/* Artwork edit overlay */}
        {canEditArtwork && !uploading && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              onClick={e => { e.stopPropagation(); setArtworkModal(true) }}
              className="flex flex-col items-center gap-1 text-white text-[10px] hover:text-violet-300 transition-colors"
            >
              <ImageIcon size={16} />
              Browse
            </button>
            <button
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
              className="flex flex-col items-center gap-1 text-white text-[10px] hover:text-violet-300 transition-colors"
            >
              <Upload size={16} />
              Upload
            </button>
            {movie.custom_artwork_url && (
              <button
                onClick={handleRevert}
                className="flex flex-col items-center gap-1 text-white text-[10px] hover:text-rose-300 transition-colors"
              >
                <RotateCcw size={16} />
                Revert
              </button>
            )}
          </div>
        )}
        {canEditArtwork && uploading && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <Loader size={16} className="animate-spin text-white" />
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
          {isShow && movie.seasons != null && (
            <span className="text-xs text-slate-500">{movie.seasons}S</span>
          )}
          {movie.community_rating && (
            <span className="text-xs text-amber-400">★ {movie.community_rating}</span>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      {canEditArtwork && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {/* Resize modal */}
      {pendingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { setPendingUpload(null); setLocalPreview(null) }}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-base font-semibold text-white">Image is too large</h3>
            <div
              className="rounded-lg p-3 space-y-1.5"
              style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm text-slate-400">
                Current:{' '}
                <span className="text-slate-200">
                  {pendingUpload.width} × {pendingUpload.height}px · {(pendingUpload.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
              </p>
              <p className="text-sm text-slate-400">
                Resized to:{' '}
                <span className="text-slate-200">
                  {pendingUpload.targetWidth} × {pendingUpload.targetHeight}px
                </span>
                {' '}— optimal for Jellyfin poster display
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const resized = await resizeImageFile(pendingUpload.file, pendingUpload.targetWidth, pendingUpload.targetHeight)
                  doUpload(resized)
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                Resize &amp; Upload
              </button>
              <button
                onClick={() => doUpload(pendingUpload.file)}
                className="flex-1 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                style={{ border: '1px solid var(--border)' }}
              >
                Upload Original
              </button>
            </div>
            <button
              onClick={() => { setPendingUpload(null); setLocalPreview(null) }}
              className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TMDB artwork picker modal */}
      {artworkModal && (
        <MediaArtworkModal
          item={movie}
          mediaType={isShow ? 'show' : 'movie'}
          onClose={() => setArtworkModal(false)}
          onUpdated={handleArtworkUpdated}
        />
      )}
    </div>
  )
}
