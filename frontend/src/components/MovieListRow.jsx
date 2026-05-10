import { useState, useRef } from 'react'
import { Film, X, Upload, Image as ImageIcon, Loader } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { libraryColor } from '../utils/libraryColor'
import MediaArtworkModal from './MediaArtworkModal'

const POSTER_MAX_DIM = 1000
const SIZE_THRESHOLD = 2 * 1024 * 1024

export default function MovieListRow({ movie, onRemove, onArtworkChange }) {
  const [imgFailed, setImgFailed] = useState(false)
  const [cacheBuster, setCacheBuster] = useState(0)
  const [artworkModal, setArtworkModal] = useState(false)
  const [pendingUpload, setPendingUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [localPreview, setLocalPreview] = useState(null)
  const fileInputRef = useRef(null)

  const isShow = movie.media_type === 'show'

  const baseUrl = isShow
    ? `/api/shows/${movie.id}/poster`
    : `/api/movies/${movie.id}/poster`
  const posterUrl = localPreview ?? (cacheBuster ? `${baseUrl}?t=${cacheBuster}` : baseUrl)

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

  return (
    <>
      <div className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
        {/* Mini poster */}
        <div className={`w-9 h-12 rounded overflow-hidden flex-shrink-0 bg-slate-800 ${onArtworkChange ? 'relative' : ''}`}>
          {imgFailed && !localPreview ? (
            <div className="w-full h-full flex items-center justify-center">
              <Film size={14} className="text-slate-600" />
            </div>
          ) : (
            <img
              src={posterUrl}
              alt={movie.title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={() => { if (!localPreview) setImgFailed(true) }}
            />
          )}

          {onArtworkChange && !uploading && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded overflow-hidden flex items-center justify-center gap-1.5">
              <button
                onClick={() => setArtworkModal(true)}
                className="text-white hover:text-violet-300 transition-colors"
                title="Browse artwork"
              >
                <ImageIcon size={11} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-white hover:text-violet-300 transition-colors"
                title="Upload artwork"
              >
                <Upload size={11} />
              </button>
            </div>
          )}
          {onArtworkChange && uploading && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded">
              <Loader size={10} className="animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{movie.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {movie.year && <span className="text-xs text-slate-500">{movie.year}</span>}
            {isShow && movie.seasons != null && (
              <>
                {movie.year && <span className="text-slate-700 text-xs">·</span>}
                <span className="text-xs text-slate-500">{movie.seasons}S</span>
              </>
            )}
            {movie.library_name && (() => {
              const { bg, text } = libraryColor(movie.library_name)
              return (
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold leading-tight"
                  style={{ background: bg, color: text }}
                >
                  {movie.library_name}
                </span>
              )
            })()}
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

      {/* Hidden file input */}
      {onArtworkChange && (
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
    </>
  )
}
