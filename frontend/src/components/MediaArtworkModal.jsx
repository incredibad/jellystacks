import { useState, useEffect } from 'react'
import { X, Image as ImageIcon, CheckCircle2 } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

function ImageGrid({ images, selected, onSelect }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {images.map((img, i) => (
        <button
          key={i}
          onClick={() => onSelect(img)}
          className={`relative rounded-lg overflow-hidden transition-all ${
            selected?.file_path === img.file_path
              ? 'ring-2 ring-violet-500'
              : 'hover:ring-1 hover:ring-violet-400/50'
          }`}
        >
          <img src={img.thumb_url} alt="" className="w-full h-full object-cover aspect-[2/3]" />
          {selected?.file_path === img.file_path && (
            <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-violet-400" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

export default function MediaArtworkModal({ item, mediaType, onClose, onUpdated }) {
  const [tmdbImages, setTmdbImages] = useState([])
  const [tvdbImages, setTvdbImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [activeProvider, setActiveProvider] = useState('all')

  const isShow = mediaType === 'show'

  useEffect(() => {
    if (!item.tmdb_id && !item.tvdb_id) { setLoading(false); return }

    const fetches = []

    if (item.tmdb_id) {
      const endpoint = isShow
        ? `/tmdb/tv/${item.tmdb_id}/images`
        : `/tmdb/movie/${item.tmdb_id}/images`
      fetches.push(
        api.get(endpoint)
          .then(({ data }) => setTmdbImages(data.posters || []))
          .catch(() => {})
      )
    }

    if (isShow && item.tvdb_id) {
      fetches.push(
        api.get(`/tvdb/show/${item.tvdb_id}/posters`)
          .then(({ data }) => setTvdbImages(data || []))
          .catch(() => {})
      )
    }

    Promise.all(fetches).finally(() => setLoading(false))
  }, []) // eslint-disable-line

  const providers = [
    { key: 'all', label: 'All' },
    ...(tmdbImages.length > 0 ? [{ key: 'tmdb', label: 'TMDB' }] : []),
    ...(tvdbImages.length > 0 ? [{ key: 'tvdb', label: 'TheTVDB' }] : []),
  ]

  const displayImages =
    activeProvider === 'tmdb' ? tmdbImages
    : activeProvider === 'tvdb' ? tvdbImages
    : [...tmdbImages, ...tvdbImages]

  const handleConfirm = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const endpoint = isShow
        ? `/shows/${item.id}/artwork`
        : `/movies/${item.id}/artwork`
      const { data } = await api.put(endpoint, { url: selected.full_url })
      onUpdated(data)
      toast.success('Artwork updated.')
    } catch {
      toast.error('Failed to set artwork.')
    } finally {
      setSaving(false)
    }
  }

  const hasAnyId = item.tmdb_id || (isShow && item.tvdb_id)
  const totalImages = tmdbImages.length + tvdbImages.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ImageIcon size={17} className="text-violet-400" />
              Choose Artwork
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{item.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Provider filter */}
        {!loading && providers.length > 1 && (
          <div className="flex gap-1 px-4 pt-3 pb-1">
            {providers.map(p => (
              <button
                key={p.key}
                onClick={() => { setActiveProvider(p.key); setSelected(null) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeProvider === p.key
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {p.label}
                {p.key !== 'all' && (
                  <span className="ml-1.5 opacity-60">
                    {p.key === 'tmdb' ? tmdbImages.length : tvdbImages.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Image grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && !hasAnyId && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <ImageIcon size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No provider ID — artwork browsing unavailable.</p>
              <p className="text-xs mt-1">You can still upload a custom image.</p>
            </div>
          )}
          {!loading && hasAnyId && totalImages === 0 && (
            <p className="text-center text-sm text-slate-500 py-8">No posters available.</p>
          )}
          {!loading && activeProvider !== 'all' && displayImages.length > 0 && (
            <ImageGrid images={displayImages} selected={selected} onSelect={setSelected} />
          )}
          {!loading && activeProvider === 'all' && (tmdbImages.length > 0 || tvdbImages.length > 0) && (
            <div className="space-y-6">
              {tmdbImages.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">TMDB</span>
                    <hr className="flex-1" style={{ borderColor: 'var(--border)' }} />
                  </div>
                  <ImageGrid images={tmdbImages} selected={selected} onSelect={setSelected} />
                </section>
              )}
              {tvdbImages.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">TheTVDB</span>
                    <hr className="flex-1" style={{ borderColor: 'var(--border)' }} />
                  </div>
                  <ImageGrid images={tvdbImages} selected={selected} onSelect={setSelected} />
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm text-slate-400">
            {selected ? 'Image selected' : 'Click an image to select it'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected || saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Use This Artwork'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
