import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Upload, Trash2, Plus, Image as ImageIcon,
  CheckCircle2, Circle, AlertCircle, Pencil, X, Check, RefreshCw,
  LayoutGrid, LayoutList, Import, Film, Settings2, Shuffle, RotateCcw,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { useOperations } from '../contexts/OperationsContext'
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
        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-normal bg-black/70 text-slate-400">
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
  const { lastOpAt } = useOperations()
  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [revertingArtwork, setRevertingArtwork] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showArtwork, setShowArtwork] = useState(false)
  const [uploadingArtwork, setUploadingArtwork] = useState(false)
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null)
  // pendingUpload: { file, width, height, sizeBytes, targetWidth, targetHeight } | null
  const [pendingUpload, setPendingUpload] = useState(null)
  const artworkFileRef = useRef(null)

  // Jellyfin poster quality target — 1000px max dimension (e.g. 1000×1500 for 2:3 portrait)
  const POSTER_MAX_DIM = 1000
  const SIZE_THRESHOLD = 2 * 1024 * 1024  // 2 MB

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
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid')
  const [jfImgError, setJfImgError] = useState(false)
  const [unownedMovies, setUnownedMovies] = useState([])
  const [showUnowned, setShowUnowned] = useState(true)
  const [mdblistMissing, setMdblistMissing] = useState([])
  const [showMdblistMissing, setShowMdblistMissing] = useState(true)
  const [detectionDone, setDetectionDone] = useState(false)
  const [sort, setSort] = useState('name-asc')
  const [libraryFilter, setLibraryFilter] = useState('')

  const switchView = (v) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const doUpload = async (file) => {
    setUploadingArtwork(true)
    setPendingUpload(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(`/collections/${id}/artwork/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setCollection(prev => ({ ...prev, artwork_url: data.artwork_url, updated_at: data.updated_at }))
      setLocalPreviewUrl(null)
      toast.success('Artwork saved.')
    } catch {
      toast.error('Upload failed.')
      setLocalPreviewUrl(null)
    } finally {
      setUploadingArtwork(false)
    }
  }

  const handleArtworkFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const previewUrl = URL.createObjectURL(file)
    setLocalPreviewUrl(previewUrl)
    const analysis = await analyzeImage(file)
    if (analysis.isLarge) {
      setPendingUpload(analysis)
    } else {
      doUpload(file)
    }
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

      // Fetch MDBList missing items if this is an MDBList collection
      if (data.mdblist_list_id) {
        api.get(`/collections/${id}/mdblist-missing`)
          .then(res => setMdblistMissing(res.data))
          .catch(() => {})
      }

      // Always re-run detection on load — handles additions/removals that
      // may have invalidated or newly satisfied the TMDB match.
      if (data.movies.length > 0) {
        api.post(`/collections/${id}/detect-tmdb`)
          .then(res => {
            const linkedId = res.data.tmdb_collection_id
            setCollection(prev => prev ? {
              ...prev,
              tmdb_collection_id: linkedId,
              tmdb_checked: true,
              tmdb_total_parts: res.data.tmdb_total_parts ?? null,
            } : prev)
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
  useEffect(() => { if (lastOpAt) fetchCollection() }, [lastOpAt]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRemoveShow = async (showId) => {
    try {
      const { data } = await api.delete(`/collections/${id}/shows/${showId}`)
      setCollection(data)
      toast.success('Show removed.')
    } catch {
      toast.error('Failed to remove show.')
    }
  }

  const handlePush = async () => {
    setPushing(true)
    const tid = toast.loading('Pushing to Jellyfin…')
    try {
      const { data } = await api.post(`/collections/${id}/push`)
      toast.success(data.message, { id: tid })
      if (data.artwork_error) {
        toast.error(`Artwork upload failed: ${data.artwork_error}`, { duration: 8000 })
      }
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

  const handleRevertArtwork = async () => {
    setRevertingArtwork(true)
    const tid = toast.loading('Reverting artwork…')
    try {
      const { data } = await api.delete(`/collections/${id}/artwork`)
      toast.success(data.reset > 0 ? `Reverted artwork for ${data.reset} item${data.reset !== 1 ? 's' : ''}.` : 'No custom artwork to revert.', { id: tid })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to revert artwork.', { id: tid })
    } finally {
      setRevertingArtwork(false)
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

  const handleConvertToCustom = async () => {
    if (!confirm('Convert to custom collection? This removes the TMDB/MDBList link and allows manual editing.')) return
    try {
      const { data } = await api.post(`/collections/${id}/convert-to-custom`)
      setCollection(data)
      setDetectionDone(true)
      toast.success('Converted to custom collection.')
    } catch {
      toast.error('Failed to convert.')
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

  const isLocked = !!(collection.tmdb_collection_id || collection.mdblist_list_id)

  const collectionLibraries = [...new Set([
    ...(collection.movies || []).map(m => m.library_name),
    ...(collection.shows || []).map(s => s.library_name),
  ].filter(Boolean))]

  const sortItems = (items) => {
    const [field, dir] = sort.split('-')
    return [...items].sort((a, b) => {
      let cmp = 0
      if (field === 'name') {
        const ak = a.title.replace(/^(the|a|an)\s+/i, '').toLowerCase()
        const bk = b.title.replace(/^(the|a|an)\s+/i, '').toLowerCase()
        cmp = ak.localeCompare(bk)
      } else if (field === 'year') {
        cmp = (a.year || 0) - (b.year || 0)
      } else if (field === 'rating') {
        cmp = (parseFloat(a.community_rating) || 0) - (parseFloat(b.community_rating) || 0)
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }

  const sortedMovies = sortItems(
    libraryFilter
      ? (collection.movies || []).filter(m => m.library_name === libraryFilter)
      : (collection.movies || [])
  )

  const sortedShows = sortItems(
    libraryFilter
      ? (collection.shows || []).filter(s => s.library_name === libraryFilter)
      : (collection.shows || [])
  )

  const jfPoster = collection.jellyfin_collection_id
    ? `/api/collections/${collection.id}/poster`
    : null
  const artworkSrc = localPreviewUrl ?? (() => {
    if (collection.artwork_url?.startsWith('/api/')) return collection.artwork_url
    if (collection.artwork_url) {
      return `/api/tmdb/proxy-image?url=${encodeURIComponent(collection.artwork_url.replace('/original/', '/w342/'))}`
    }
    return (!jfImgError && jfPoster) ? jfPoster : null
  })()

  // True when the collection is in Jellyfin but has been modified locally since the last sync.
  const needsSync = collection.in_jellyfin &&
    collection.jellyfin_synced_at &&
    new Date(collection.updated_at) > new Date(collection.jellyfin_synced_at)

  return (
    <div className="p-4 sm:p-8">
      {/* Back */}
      <Link to="/collections" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-400 transition-colors mb-6">
        <ArrowLeft size={15} />
        Back to Collections
      </Link>

      {/* Collection header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-6">
        {/* Artwork */}
        <div className="relative group flex-shrink-0">
          <div
            className="w-36 h-52 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center"
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

            {uploadingArtwork ? (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 rounded-xl">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-white text-xs">Uploading…</span>
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-4">
                <button
                  onClick={() => setShowArtwork(true)}
                  className="flex flex-col items-center gap-1.5 text-white text-[11px] hover:text-violet-300 transition-colors"
                >
                  <ImageIcon size={18} />
                  Browse
                </button>
                <button
                  onClick={() => artworkFileRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 text-white text-[11px] hover:text-violet-300 transition-colors"
                >
                  <Upload size={18} />
                  Upload
                </button>
              </div>
            )}
          </div>
          <input
            ref={artworkFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleArtworkFileChange}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-1 w-full sm:w-auto text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-1 flex-wrap">
            {collection.is_jellyfin_native && (
              <button
                onClick={async () => {
                  try {
                    const { data } = await api.put(`/collections/${id}`, { is_jellyfin_native: false })
                    setCollection(data)
                    toast.success('Marked as local — excluded from bulk Jellyfin delete.')
                  } catch {
                    toast.error('Failed to update.')
                  }
                }}
                title="Click to mark as a locally-created collection (excludes it from bulk Jellyfin delete)"
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-blue-900 text-white hover:bg-blue-800 transition-colors"
              >
                <Import size={12} />
                Imported from Jellyfin
              </button>
            )}
            {needsSync ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-orange-600 text-white">
                <AlertCircle size={12} />
                Needs Sync
              </span>
            ) : collection.in_jellyfin ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-teal-600 text-white">
                <CheckCircle2 size={12} />
                In Jellyfin
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-slate-500 text-white">
                <Circle size={12} />
                Local Only
              </span>
            )}
            {collection.tmdb_collection_id ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-violet-600 text-white">
                <Film size={12} />
                TMDB Collection
              </span>
            ) : detectionDone && !collection.mdblist_list_id ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal bg-pink-600 text-white">
                Custom Collection
              </span>
            ) : null}
            {collection.mdblist_list_id && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-normal text-white" style={{ background: '#f97316' }}>
                MDBList
              </span>
            )}
            <span className="text-xs text-slate-500">
              {(() => {
                const mc = collection.movie_count
                const sc = collection.show_count || 0
                const total = collection.mdblist_total_items
                const parts = []
                if (collection.mdblist_list_id && total) {
                  const owned = mc + sc
                  parts.push(`${owned}/${total} items`)
                } else if (collection.tmdb_collection_id && collection.tmdb_total_parts) {
                  parts.push(`${mc}/${collection.tmdb_total_parts} movies`)
                } else {
                  if (mc > 0) parts.push(`${mc} ${mc === 1 ? 'movie' : 'movies'}`)
                  if (sc > 0) parts.push(`${sc} ${sc === 1 ? 'show' : 'shows'}`)
                }
                return parts.join(' · ') || 'Empty'
              })()}
            </span>
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
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <button
              onClick={handlePush}
              disabled={pushing || (collection.movie_count + (collection.show_count || 0)) === 0 || (collection.in_jellyfin && !needsSync)}
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

            {/* Settings dropdown */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-slate-700"
              >
                <Settings2 size={14} />
              </button>

              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                  <div
                    className="absolute left-0 top-10 z-20 w-52 rounded-xl shadow-xl py-1"
                    style={{ background: '#1e1e30', border: '1px solid var(--border)' }}
                  >
                    {collection.jellyfin_collection_id && (
                      <button
                        onClick={() => { handleVerify(); setSettingsOpen(false) }}
                        disabled={verifying}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={14} className={verifying ? 'animate-spin' : ''} />
                        Verify Status
                      </button>
                    )}
                    {collection.in_jellyfin && (
                      <button
                        onClick={() => { handleRemoveFromJellyfin(); setSettingsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                        Remove from Jellyfin
                      </button>
                    )}
                    {isLocked && (
                      <button
                        onClick={() => { handleConvertToCustom(); setSettingsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-pink-600/10 hover:text-pink-400 transition-colors"
                      >
                        <Shuffle size={14} />
                        Convert to Custom
                      </button>
                    )}
                    <button
                      onClick={() => { handleRevertArtwork(); setSettingsOpen(false) }}
                      disabled={revertingArtwork}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40"
                    >
                      <RotateCcw size={14} className={revertingArtwork ? 'animate-spin' : ''} />
                      Restore Original Artwork
                    </button>
                    <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
                    <button
                      onClick={() => { handleDeleteCollection(); setSettingsOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete Collection
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {collection.jellyfin_synced_at && (
            <p className="text-xs text-slate-600 mt-3">
              Last synced to Jellyfin: {new Date(collection.jellyfin_synced_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Section divider */}
      <div className="border-t mb-8" style={{ borderColor: 'var(--border)' }} />

      {/* Movies + Shows controls */}
      <div className="mb-4 space-y-2">
        {/* Row 1: heading + add button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-normal text-white">Items</h2>
            {collection.movie_count > 0 && (
              <span className="text-xs text-slate-500">{collection.movie_count} {collection.movie_count === 1 ? 'movie' : 'movies'}</span>
            )}
            {(collection.show_count || 0) > 0 && (
              <span className="text-xs text-slate-500">{collection.show_count} {collection.show_count === 1 ? 'show' : 'shows'}</span>
            )}
          </div>
          {!isLocked && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all border border-violet-500/20 hover:border-violet-500/40"
            >
              <Plus size={15} />
              Add Items
            </button>
          )}
        </div>

        {/* Row 2: library pills + sort + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Library pills */}
          {collectionLibraries.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => setLibraryFilter('')}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  libraryFilter === '' ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              {collectionLibraries.map(lib => (
                <button
                  key={lib}
                  onClick={() => setLibraryFilter(lib === libraryFilter ? '' : lib)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    libraryFilter === lib ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {lib}
                </button>
              ))}
            </div>
          )}
          {/* Sort + view toggle pushed to the right */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 outline-none cursor-pointer hover:text-white transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="year-desc">Year (newest)</option>
              <option value="year-asc">Year (oldest)</option>
              <option value="rating-desc">Rating (highest)</option>
              <option value="rating-asc">Rating (lowest)</option>
            </select>
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
          </div>
        </div>
      </div>

      {/* Movies section */}
      {(collection.movies.length > 0 || collection.movie_count > 0) && (
        <div className="mb-6">
          {collection.movie_count > 0 && (
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Movies</h3>
          )}
          {collection.movies.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-10 rounded-xl text-slate-500"
              style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
            >
              <p className="text-sm">No movies in this collection yet.</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(140px,200px))]">
              {sortedMovies.map(movie => (
                <div key={movie.id} className="relative group">
                  <MovieCard
                    movie={movie}
                    onArtworkChange={(updated) => {
                      const field = updated.media_type === 'show' ? 'shows' : 'movies'
                      setCollection(prev => ({
                        ...prev,
                        [field]: prev[field].map(item => item.id === updated.id ? updated : item)
                      }))
                    }}
                  />
                  {!isLocked && (
                    <button
                      onClick={() => handleRemoveMovie(movie.id)}
                      className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-400 shadow-lg"
                      title="Remove from collection"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {sortedMovies.map((movie, i) => (
                <div key={movie.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}>
                  <MovieListRow
                    movie={movie}
                    onRemove={isLocked ? null : handleRemoveMovie}
                    onArtworkChange={(updated) => {
                      const field = updated.media_type === 'show' ? 'shows' : 'movies'
                      setCollection(prev => ({
                        ...prev,
                        [field]: prev[field].map(item => item.id === updated.id ? updated : item)
                      }))
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shows section */}
      {(collection.shows?.length > 0 || (collection.show_count || 0) > 0) && (
        <div className="mb-6">
          {(collection.show_count || 0) > 0 && (
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Shows</h3>
          )}
          {view === 'grid' ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(140px,200px))]">
              {sortedShows.map(show => (
                <div key={show.id} className="relative group">
                  <MovieCard
                    movie={show}
                    onArtworkChange={(updated) => {
                      const field = updated.media_type === 'show' ? 'shows' : 'movies'
                      setCollection(prev => ({
                        ...prev,
                        [field]: prev[field].map(item => item.id === updated.id ? updated : item)
                      }))
                    }}
                  />
                  {!isLocked && (
                    <button
                      onClick={() => handleRemoveShow(show.id)}
                      className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-400 shadow-lg"
                      title="Remove from collection"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {sortedShows.map((show, i) => (
                <div key={show.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}>
                  <MovieListRow
                    movie={show}
                    onRemove={isLocked ? null : handleRemoveShow}
                    onArtworkChange={(updated) => {
                      const field = updated.media_type === 'show' ? 'shows' : 'movies'
                      setCollection(prev => ({
                        ...prev,
                        [field]: prev[field].map(item => item.id === updated.id ? updated : item)
                      }))
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state — no movies and no shows */}
      {collection.movies.length === 0 && !(collection.shows?.length > 0) && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl text-slate-500 mb-6"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
        >
          <p className="text-sm">No items in this collection yet.</p>
          {!isLocked && (
            <button
              onClick={() => setShowPicker(true)}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all"
            >
              <Plus size={15} />
              Add Items
            </button>
          )}
        </div>
      )}

      {/* MDBList missing items */}
      {mdblistMissing.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowMdblistMissing(v => !v)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h2 className="text-lg font-normal text-slate-400 group-hover:text-slate-300 transition-colors">
              Not in your library
              <span className="text-slate-600 font-normal text-base ml-2">({mdblistMissing.length})</span>
            </h2>
            <span className="text-xs text-slate-600 group-hover:text-slate-500 transition-colors">
              {showMdblistMissing ? '▲ hide' : '▼ show'}
            </span>
          </button>
          {showMdblistMissing && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {mdblistMissing.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="flex-1 text-sm text-slate-500 truncate">{item.title}</span>
                  {item.year && <span className="text-xs text-slate-600 tabular-nums flex-shrink-0">{item.year}</span>}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                    item.mediatype === 'movie' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    {item.mediatype === 'movie' ? 'Movie' : 'Show'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unowned movies */}
      {unownedMovies.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowUnowned(v => !v)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h2 className="text-lg font-normal text-slate-400 group-hover:text-slate-300 transition-colors">
              Not in your library
              <span className="text-slate-600 font-normal text-base ml-2">({unownedMovies.length})</span>
            </h2>
            <span className="text-xs text-slate-600 group-hover:text-slate-500 transition-colors">
              {showUnowned ? '▲ hide' : '▼ show'}
            </span>
          </button>

          {showUnowned && (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(auto-fill,minmax(140px,200px))]">
              {unownedMovies.map(movie => (
                <UnownedMovieCard key={movie.tmdb_id} movie={movie} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resize modal */}
      {pendingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { setPendingUpload(null); setLocalPreviewUrl(null) }}
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
              onClick={() => { setPendingUpload(null); setLocalPreviewUrl(null) }}
              className="w-full text-center text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Cancel
            </button>
          </div>
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
