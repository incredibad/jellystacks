import { useState, useEffect } from 'react'
import { Search, X, Image as ImageIcon, CheckCircle2, Layers } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

// movies: optional array of collection movies — when provided, shows them in the left panel
//         instead of a TMDB search box.
export default function ArtworkPicker({ onSelect, onClose, initialQuery = '', movies = null }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [images, setImages] = useState(null)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [activeTab, setActiveTab] = useState('posters')
  const [searchLoading, setSearchLoading] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [isRelatedMode, setIsRelatedMode] = useState(false)
  const [relatedCollections, setRelatedCollections] = useState(null)
  const [relatedLoading, setRelatedLoading] = useState(false)

  const fetchImages = async (tmdbId) => {
    setImgLoading(true)
    setImages(null)
    setSelectedImage(null)
    try {
      const { data } = await api.get(`/tmdb/movie/${tmdbId}/images`)
      setImages(data)
    } catch {
      toast.error('Failed to load images.')
    } finally {
      setImgLoading(false)
    }
  }

  const runSearch = async (q) => {
    if (!q.trim()) return
    setSearchLoading(true)
    setImages(null)
    setSelectedMovie(null)
    try {
      const { data } = await api.get('/tmdb/search', { params: { q } })
      setResults(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'TMDB search failed. Check your API key in Settings.')
    } finally {
      setSearchLoading(false)
    }
  }

  // Auto-search when opened with a pre-filled query (e.g. from collection name)
  useEffect(() => {
    if (!movies && initialQuery.trim()) {
      runSearch(initialQuery)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (e) => {
    e.preventDefault()
    runSearch(query)
  }

  const handleSelectMovie = async (movie) => {
    setSelectedMovie(movie)
    await fetchImages(movie.id)
  }

  const handleSelectCollectionMovie = async (movie) => {
    if (!movie.tmdb_id) {
      toast.error('This movie has no TMDB ID — artwork unavailable.')
      return
    }
    setIsRelatedMode(false)
    setSelectedMovie(movie)
    await fetchImages(movie.tmdb_id)
  }

  const handleRelatedCollections = async () => {
    setIsRelatedMode(true)
    setSelectedMovie(null)
    setSelectedImage(null)
    if (relatedCollections !== null) return // already fetched
    setRelatedLoading(true)
    try {
      const tmdbIds = movies.filter(m => m.tmdb_id).map(m => m.tmdb_id)
      if (tmdbIds.length === 0) { setRelatedCollections([]); return }
      const { data } = await api.post('/tmdb/related-collections', { tmdb_ids: tmdbIds })
      setRelatedCollections(data)
    } catch {
      toast.error('Failed to load related collections.')
      setRelatedCollections([])
    } finally {
      setRelatedLoading(false)
    }
  }

  const handleSelectImage = (img) => {
    setSelectedImage(img)
  }

  const handleConfirm = () => {
    if (!selectedImage) return
    onSelect(selectedImage.full_url)
  }

  const displayImages = images
    ? (activeTab === 'posters' ? images.posters : images.backdrops)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-4xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ImageIcon size={20} className="text-violet-400" />
            Choose Artwork
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: collection movie list OR search + results */}
          <div className="w-72 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border)' }}>
            {movies ? (
              <>
                <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Movies in collection</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {/* Related Collections special item */}
                  <button
                    onClick={handleRelatedCollections}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all mb-1 ${
                      isRelatedMode
                        ? 'bg-violet-600/20 border border-violet-500/40'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-9 h-12 rounded flex-shrink-0 flex items-center justify-center bg-violet-900/40">
                      <Layers size={16} className="text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">Related Collections</p>
                      <p className="text-xs text-slate-500">From TMDB</p>
                    </div>
                  </button>
                  <div className="border-t my-1.5" style={{ borderColor: 'var(--border)' }} />
                  {movies.map(movie => (
                    <button
                      key={movie.id}
                      onClick={() => handleSelectCollectionMovie(movie)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all mb-1 ${
                        selectedMovie?.id === movie.id
                          ? 'bg-violet-600/20 border border-violet-500/40'
                          : movie.tmdb_id
                            ? 'hover:bg-white/5 border border-transparent'
                            : 'opacity-40 cursor-not-allowed border border-transparent'
                      }`}
                    >
                      <img
                        src={`/api/movies/${movie.id}/poster`}
                        alt=""
                        className="w-9 h-12 object-cover rounded flex-shrink-0 bg-slate-700"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{movie.title}</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {movie.year && <span className="text-xs text-slate-500">{movie.year}</span>}
                          {movie.library_name && (
                            <>
                              {movie.year && <span className="text-slate-700 text-xs">·</span>}
                              <span className="text-xs text-slate-500 truncate">{movie.library_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  {movies.length === 0 && (
                    <p className="text-center text-xs text-slate-500 py-8">No movies in this collection.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <form onSubmit={handleSearch} className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search TMDB…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      className="w-full pl-8 pr-10 py-2 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
                      style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-xs bg-violet-600 text-white hover:bg-violet-500 transition-colors">
                      Go
                    </button>
                  </div>
                </form>

                <div className="flex-1 overflow-y-auto p-2">
                  {searchLoading && (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!searchLoading && results.map(movie => (
                    <button
                      key={movie.id}
                      onClick={() => handleSelectMovie(movie)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all mb-1 ${
                        selectedMovie?.id === movie.id
                          ? 'bg-violet-600/20 border border-violet-500/40'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {movie.poster_thumb ? (
                        <img
                          src={movie.poster_thumb}
                          alt=""
                          className="w-9 h-12 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-12 bg-slate-700 rounded flex-shrink-0 flex items-center justify-center">
                          <ImageIcon size={14} className="text-slate-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{movie.title}</p>
                        <p className="text-xs text-slate-500">{movie.year}</p>
                      </div>
                    </button>
                  ))}
                  {!searchLoading && results.length === 0 && query && (
                    <p className="text-center text-xs text-slate-500 py-8">No results. Try a different search.</p>
                  )}
                  {!searchLoading && results.length === 0 && !query && (
                    <p className="text-center text-xs text-slate-500 py-8">Search to find artwork</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: image grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isRelatedMode && selectedMovie && (
              <div className="flex gap-1 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                {['posters', 'backdrops'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setSelectedImage(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      activeTab === tab
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab} {images && `(${(tab === 'posters' ? images.posters : images.backdrops).length})`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3">
              {isRelatedMode ? (
                <>
                  {relatedLoading && (
                    <div className="flex justify-center py-12">
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!relatedLoading && relatedCollections?.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <Layers size={40} className="mb-3 opacity-30" />
                      <p className="text-sm">No related TMDB collections found.</p>
                    </div>
                  )}
                  {!relatedLoading && relatedCollections?.map(col => (
                    <div key={col.id} className="mb-6">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{col.name}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {col.posters.map((img, i) => (
                          <button
                            key={i}
                            onClick={() => handleSelectImage(img)}
                            className={`relative rounded-lg overflow-hidden transition-all ${
                              selectedImage?.file_path === img.file_path
                                ? 'ring-2 ring-violet-500'
                                : 'hover:ring-1 hover:ring-violet-400/50'
                            }`}
                          >
                            <img src={img.thumb_url} alt="" className="w-full h-full object-cover aspect-[2/3]" />
                            {selectedImage?.file_path === img.file_path && (
                              <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                                <CheckCircle2 size={24} className="text-violet-400" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {!selectedMovie && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <ImageIcon size={40} className="mb-3 opacity-30" />
                      <p className="text-sm">Select a movie to browse artwork</p>
                    </div>
                  )}
                  {imgLoading && (
                    <div className="flex justify-center py-12">
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!imgLoading && displayImages.length > 0 && (
                    <div className={`grid gap-2 ${activeTab === 'posters' ? 'grid-cols-4' : 'grid-cols-2'}`}>
                      {displayImages.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectImage(img)}
                          className={`relative rounded-lg overflow-hidden transition-all ${
                            selectedImage?.file_path === img.file_path
                              ? 'ring-2 ring-violet-500'
                              : 'hover:ring-1 hover:ring-violet-400/50'
                          }`}
                        >
                          <img
                            src={img.thumb_url}
                            alt=""
                            className={`w-full h-full object-cover ${activeTab === 'posters' ? 'aspect-[2/3]' : 'aspect-video'}`}
                          />
                          {selectedImage?.file_path === img.file_path && (
                            <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                              <CheckCircle2 size={24} className="text-violet-400" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {!imgLoading && images && displayImages.length === 0 && (
                    <p className="text-center text-sm text-slate-500 py-8">No {activeTab} available.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm text-slate-400">
            {selectedImage ? 'Image selected' : 'Click an image to select it'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedImage}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Use This Artwork
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
