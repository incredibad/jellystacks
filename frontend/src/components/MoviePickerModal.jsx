import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Plus, Film, Sparkles, Tv } from 'lucide-react'
import api from '../api/client'

const BREAKDOWN_LABELS = {
  director:        'Director match',
  person:          'Cast / crew match',
  tag_phrase:      'Tag phrase match',
  tag_word:        'Tag word match',
  genre:           'Genre match',
  title_phrase:    'Title phrase match',
  title_word:      'Title word match',
  overview_phrase: 'Overview phrase match',
  overview_word:   'Overview word match',
  year_range:      'Year range match',
  recommended_by:  'Recommended by',
}

function scoreColor(score) {
  if (score >= 6) return 'text-emerald-400'
  if (score >= 3) return 'text-amber-400'
  return 'text-slate-400'
}

function ScoreBadge({ score, breakdown }) {
  const badgeRef = useRef(null)
  const [tooltipStyle, setTooltipStyle] = useState(null)

  const sections = breakdown
    ? Object.entries(breakdown).filter(([, v]) => v.score > 0)
    : []

  const showTooltip = () => {
    if (!badgeRef.current || !sections.length) return
    const rect = badgeRef.current.getBoundingClientRect()
    const above = rect.top > window.innerHeight * 0.4
    setTooltipStyle(
      above
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right }
        : { position: 'fixed', top: rect.bottom + 8, right: window.innerWidth - rect.right }
    )
  }

  const hideTooltip = () => setTooltipStyle(null)

  return (
    <div ref={badgeRef} className="flex-shrink-0" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      <span className={`text-sm font-bold tabular-nums cursor-default ${scoreColor(score)}`}>
        {score.toFixed(1)}
      </span>
      {tooltipStyle && sections.length > 0 && createPortal(
        <div
          className="w-72 z-[9999] pointer-events-none"
          style={tooltipStyle}
        >
          <div
            className="rounded-xl p-3 text-xs shadow-2xl space-y-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
              <span className="font-semibold text-white">Score breakdown</span>
              <span className={`font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(1)}</span>
            </div>
            {sections.map(([key, val]) => (
              <div key={key}>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">{BREAKDOWN_LABELS[key] ?? key}</span>
                  <span className="text-slate-400 tabular-nums">+{val.score.toFixed(1)}</span>
                </div>
                {val.matches?.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-2">
                    {val.matches.map((m, i) => (
                      <li key={i} className="text-slate-500">
                        <span className="text-violet-400">"{m.term}"</span>
                        {m.via && <span> → {m.via}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {val.match && (
                  <p className="mt-1 pl-2 text-slate-500">{val.match}</p>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const PAGE_SIZE = 75

function ItemRow({ item, isIn, isSel, onToggle, score, breakdown, index }) {
  const isShow = item.media_type === 'show'
  const posterUrl = isShow ? `/api/shows/${item.id}/poster` : `/api/movies/${item.id}/poster`

  return (
    <button
      onClick={(e) => onToggle(item.id, index, e.shiftKey)}
      disabled={isIn}
      className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
        isIn
          ? 'opacity-50 cursor-not-allowed'
          : isSel
          ? 'bg-violet-600/20 border border-violet-500/40'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <div className="w-9 h-12 rounded overflow-hidden flex-shrink-0 bg-slate-800 relative">
        <img
          src={posterUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={e => { e.target.style.display = 'none' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {isShow ? <Tv size={14} className="text-slate-600" /> : <Film size={14} className="text-slate-600" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{item.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.year && <span className="text-xs text-slate-500">{item.year}</span>}
          {isShow && item.seasons != null && (
            <>
              {item.year && <span className="text-slate-700 text-xs">·</span>}
              <span className="text-xs text-slate-500">{item.seasons}S</span>
            </>
          )}
          {item.library_name && (
            <>
              {(item.year || (isShow && item.seasons != null)) && <span className="text-slate-700 text-xs">·</span>}
              <span className="text-xs text-slate-500 truncate">{item.library_name}</span>
            </>
          )}
        </div>
      </div>
      {isIn && <span className="text-xs text-slate-500 flex-shrink-0">Already added</span>}
      {!isIn && score != null && !isSel && (
        <ScoreBadge score={score} breakdown={breakdown} />
      )}
      {isSel && (
        <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </button>
  )
}

export default function MoviePickerModal({ collection, onClose, onAdded }) {
  // ── Media type: movies vs shows ───────────────────────────────────────────
  const [mediaType, setMediaType] = useState('movies')

  // ── Movies state ──────────────────────────────────────────────────────────
  const [movies, setMovies] = useState([])
  const [movieSearch, setMovieSearch] = useState('')
  const [selectedMovies, setSelectedMovies] = useState(new Set())
  const [movieLoading, setMovieLoading] = useState(false)
  const [movieLoadingMore, setMovieLoadingMore] = useState(false)
  const [movieHasMore, setMovieHasMore] = useState(true)
  const [movieLibraries, setMovieLibraries] = useState([])
  const [movieActiveLibrary, setMovieActiveLibrary] = useState('')
  const [movieSuggestions, setMovieSuggestions] = useState([])
  const [movieSuggestionsLoading, setMovieSuggestionsLoading] = useState(false)
  const [movieSuggestionsFetched, setMovieSuggestionsFetched] = useState(false)
  const [related, setRelated] = useState([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedFetched, setRelatedFetched] = useState(false)
  const [relatedEnabled, setRelatedEnabled] = useState(false)

  // ── Shows state ───────────────────────────────────────────────────────────
  const [shows, setShows] = useState([])
  const [showSearch, setShowSearch] = useState('')
  const [selectedShows, setSelectedShows] = useState(new Set())
  const [showLoading, setShowLoading] = useState(false)
  const [showLoadingMore, setShowLoadingMore] = useState(false)
  const [showHasMore, setShowHasMore] = useState(true)
  const [showLibraries, setShowLibraries] = useState([])
  const [showActiveLibrary, setShowActiveLibrary] = useState('')
  const [showSuggestions, setShowSuggestions] = useState([])
  const [showSuggestionsLoading, setShowSuggestionsLoading] = useState(false)
  const [showSuggestionsFetched, setShowSuggestionsFetched] = useState(false)

  // ── Shared ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('search')
  const [adding, setAdding] = useState(false)

  const sentinelRef = useRef(null)
  const movieOffsetRef = useRef(0)
  const showOffsetRef = useRef(0)
  const movieSearchRef = useRef('')
  const movieLibraryRef = useRef('')
  const showSearchRef = useRef('')
  const showLibraryRef = useRef('')
  const lastClickedIdx = useRef(null)

  const existingMovieIds = new Set(collection.movies?.map(m => m.id) || [])
  const existingShowIds = new Set(collection.shows?.map(s => s.id) || [])

  const filteredMovieSuggestions = movieActiveLibrary
    ? movieSuggestions.filter(s => s.movie.library_name === movieActiveLibrary)
    : movieSuggestions

  const filteredRelated = movieActiveLibrary
    ? related.filter(r => r.movie.library_name === movieActiveLibrary)
    : related

  const filteredShowSuggestions = showActiveLibrary
    ? showSuggestions.filter(s => s.show.library_name === showActiveLibrary)
    : showSuggestions

  useEffect(() => {
    api.get('/movies/libraries').then(({ data }) => setMovieLibraries(data)).catch(() => {})
    api.get('/shows/libraries').then(({ data }) => setShowLibraries(data)).catch(() => {})
    api.get('/settings').then(({ data }) => {
      setRelatedEnabled(data.tmdb_related_enabled && data.tmdb_api_key_set)
    }).catch(() => {})
  }, [])

  // ── Movies fetch ──────────────────────────────────────────────────────────
  const fetchMoviePage = useCallback(async (newOffset) => {
    if (newOffset === 0) setMovieLoading(true)
    else setMovieLoadingMore(true)
    try {
      const params = { q: movieSearchRef.current, limit: PAGE_SIZE, offset: newOffset }
      if (movieLibraryRef.current) params.library = movieLibraryRef.current
      const { data } = await api.get('/movies', { params })
      const items = Array.isArray(data) ? data : (data.movies ?? [])
      setMovies(prev => newOffset === 0 ? items : [...prev, ...items])
      setMovieHasMore(items.length === PAGE_SIZE)
      movieOffsetRef.current = newOffset + items.length
    } finally {
      setMovieLoading(false)
      setMovieLoadingMore(false)
    }
  }, [])

  const fetchMovieSuggestions = useCallback(async () => {
    if (movieSuggestionsFetched) return
    setMovieSuggestionsLoading(true)
    try {
      const { data } = await api.get(`/collections/${collection.id}/suggestions`)
      setMovieSuggestions(data)
      setMovieSuggestionsFetched(true)
    } catch {
      // silent
    } finally {
      setMovieSuggestionsLoading(false)
    }
  }, [collection.id, movieSuggestionsFetched])

  const fetchRelated = useCallback(async () => {
    if (relatedFetched) return
    setRelatedLoading(true)
    try {
      const { data } = await api.get(`/collections/${collection.id}/related`)
      setRelated(data)
      setRelatedFetched(true)
    } catch {
      // silent
    } finally {
      setRelatedLoading(false)
    }
  }, [collection.id, relatedFetched])

  // ── Shows fetch ───────────────────────────────────────────────────────────
  const fetchShowPage = useCallback(async (newOffset) => {
    if (newOffset === 0) setShowLoading(true)
    else setShowLoadingMore(true)
    try {
      const params = { q: showSearchRef.current, limit: PAGE_SIZE, offset: newOffset }
      if (showLibraryRef.current) params.library = showLibraryRef.current
      const { data } = await api.get('/shows', { params })
      const items = Array.isArray(data) ? data : []
      setShows(prev => newOffset === 0 ? items : [...prev, ...items])
      setShowHasMore(items.length === PAGE_SIZE)
      showOffsetRef.current = newOffset + items.length
    } finally {
      setShowLoading(false)
      setShowLoadingMore(false)
    }
  }, [])

  const fetchShowSuggestions = useCallback(async () => {
    if (showSuggestionsFetched) return
    setShowSuggestionsLoading(true)
    try {
      const { data } = await api.get(`/collections/${collection.id}/show-suggestions`)
      setShowSuggestions(data)
      setShowSuggestionsFetched(true)
    } catch {
      // silent
    } finally {
      setShowSuggestionsLoading(false)
    }
  }, [collection.id, showSuggestionsFetched])

  // ── Tab changes ───────────────────────────────────────────────────────────
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    lastClickedIdx.current = null
    if (tab === 'suggestions') {
      if (mediaType === 'movies') fetchMovieSuggestions()
      else fetchShowSuggestions()
    }
    if (tab === 'related') fetchRelated()
  }

  const handleMediaTypeChange = (type) => {
    setMediaType(type)
    setActiveTab('search')
    lastClickedIdx.current = null
  }

  useEffect(() => { lastClickedIdx.current = null }, [movieActiveLibrary, showActiveLibrary])

  // ── Trigger movie searches ────────────────────────────────────────────────
  useEffect(() => {
    movieSearchRef.current = movieSearch
    movieLibraryRef.current = movieActiveLibrary
    movieOffsetRef.current = 0
    setMovieHasMore(true)
    if (mediaType !== 'movies') return
    const t = setTimeout(() => fetchMoviePage(0), movieSearch ? 200 : 0)
    return () => clearTimeout(t)
  }, [movieSearch, movieActiveLibrary, mediaType, fetchMoviePage])

  // Initial movie load when switching to movies tab
  useEffect(() => {
    if (mediaType === 'movies' && movies.length === 0) {
      fetchMoviePage(0)
    }
  }, [mediaType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trigger show searches ─────────────────────────────────────────────────
  useEffect(() => {
    showSearchRef.current = showSearch
    showLibraryRef.current = showActiveLibrary
    showOffsetRef.current = 0
    setShowHasMore(true)
    if (mediaType !== 'shows') return
    const t = setTimeout(() => fetchShowPage(0), showSearch ? 200 : 0)
    return () => clearTimeout(t)
  }, [showSearch, showActiveLibrary, mediaType, fetchShowPage])

  // Initial show load when switching to shows tab
  useEffect(() => {
    if (mediaType === 'shows' && shows.length === 0) {
      fetchShowPage(0)
    }
  }, [mediaType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Infinite scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || activeTab !== 'search') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        if (mediaType === 'movies' && !movieLoadingMore && !movieLoading && movieHasMore && movieOffsetRef.current > 0) {
          fetchMoviePage(movieOffsetRef.current)
        }
        if (mediaType === 'shows' && !showLoadingMore && !showLoading && showHasMore && showOffsetRef.current > 0) {
          fetchShowPage(showOffsetRef.current)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [activeTab, mediaType, movieLoading, movieLoadingMore, movieHasMore, showLoading, showLoadingMore, showHasMore, fetchMoviePage, fetchShowPage])

  // ── Toggle selection ──────────────────────────────────────────────────────
  const handleToggle = (id, index, shiftKey, displayedIds, isShow) => {
    const existingIds = isShow ? existingShowIds : existingMovieIds
    const setSelected = isShow ? setSelectedShows : setSelectedMovies

    if (existingIds.has(id)) return
    if (shiftKey && lastClickedIdx.current !== null) {
      const lo = Math.min(lastClickedIdx.current, index)
      const hi = Math.max(lastClickedIdx.current, index)
      const rangeIds = displayedIds.slice(lo, hi + 1).filter(rid => !existingIds.has(rid))
      setSelected(prev => {
        const next = new Set(prev)
        rangeIds.forEach(rid => next.add(rid))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
      lastClickedIdx.current = index
    }
  }

  // ── Add ───────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (selectedMovies.size === 0 && selectedShows.size === 0) return
    setAdding(true)
    try {
      let updated = null
      if (selectedMovies.size > 0) {
        const { data } = await api.post(`/collections/${collection.id}/movies`, {
          movie_ids: [...selectedMovies],
        })
        updated = data
      }
      if (selectedShows.size > 0) {
        const { data } = await api.post(`/collections/${collection.id}/shows`, {
          show_ids: [...selectedShows],
        })
        updated = data
      }
      if (updated) onAdded(updated)
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const totalSelected = selectedMovies.size + selectedShows.size

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderSearchList = () => {
    if (mediaType === 'movies') {
      if (movieLoading) return <Spinner />
      if (movies.length === 0) return <Empty text="No movies found." />
      return (
        <div className="space-y-1">
          {movies.map((movie, idx) => (
            <ItemRow
              key={movie.id}
              item={movie}
              isIn={existingMovieIds.has(movie.id)}
              isSel={selectedMovies.has(movie.id)}
              onToggle={(id, i, shift) => handleToggle(id, i, shift, movies.map(m => m.id), false)}
              index={idx}
            />
          ))}
          <div ref={sentinelRef} className="py-2 flex items-center justify-center">
            {movieLoadingMore && <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>
      )
    }
    // shows
    if (showLoading) return <Spinner />
    if (shows.length === 0) return <Empty text="No shows found." />
    return (
      <div className="space-y-1">
        {shows.map((show, idx) => (
          <ItemRow
            key={show.id}
            item={show}
            isIn={existingShowIds.has(show.id)}
            isSel={selectedShows.has(show.id)}
            onToggle={(id, i, shift) => handleToggle(id, i, shift, shows.map(s => s.id), true)}
            index={idx}
          />
        ))}
        <div ref={sentinelRef} className="py-2 flex items-center justify-center">
          {showLoadingMore && <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
        </div>
      </div>
    )
  }

  const renderSuggestionsList = () => {
    if (mediaType === 'movies') {
      if (movieSuggestionsLoading) return <Spinner />
      if (filteredMovieSuggestions.length === 0) return (
        <Empty text={movieSuggestionsFetched ? 'No suggestions for this collection name.' : 'Loading suggestions…'} />
      )
      return (
        <div className="space-y-1">
          {filteredMovieSuggestions.map(({ movie, score, breakdown }, idx) => (
            <ItemRow
              key={movie.id}
              item={movie}
              isIn={existingMovieIds.has(movie.id)}
              isSel={selectedMovies.has(movie.id)}
              onToggle={(id, i, shift) => handleToggle(id, i, shift, filteredMovieSuggestions.map(s => s.movie.id), false)}
              score={score}
              breakdown={breakdown}
              index={idx}
            />
          ))}
        </div>
      )
    }
    // show suggestions
    if (showSuggestionsLoading) return <Spinner />
    if (filteredShowSuggestions.length === 0) return (
      <Empty text={showSuggestionsFetched ? 'No show suggestions for this collection name.' : 'Loading suggestions…'} />
    )
    return (
      <div className="space-y-1">
        {filteredShowSuggestions.map(({ show, score, breakdown }, idx) => (
          <ItemRow
            key={show.id}
            item={show}
            isIn={existingShowIds.has(show.id)}
            isSel={selectedShows.has(show.id)}
            onToggle={(id, i, shift) => handleToggle(id, i, shift, filteredShowSuggestions.map(s => s.show.id), true)}
            score={score}
            breakdown={breakdown}
            index={idx}
          />
        ))}
      </div>
    )
  }

  const renderRelatedList = () => {
    if (relatedLoading) return <Spinner />
    if (filteredRelated.length === 0) return (
      <Empty text={relatedFetched ? 'No related movies found in your library.' : 'Loading related movies…'} />
    )
    return (
      <div className="space-y-1">
        {filteredRelated.map(({ movie, score, breakdown }, idx) => (
          <ItemRow
            key={movie.id}
            item={movie}
            isIn={existingMovieIds.has(movie.id)}
            isSel={selectedMovies.has(movie.id)}
            onToggle={(id, i, shift) => handleToggle(id, i, shift, filteredRelated.map(r => r.movie.id), false)}
            score={score}
            breakdown={breakdown}
            index={idx}
          />
        ))}
      </div>
    )
  }

  const currentSearch = mediaType === 'movies' ? movieSearch : showSearch
  const setCurrentSearch = mediaType === 'movies' ? setMovieSearch : setShowSearch
  const currentLibraries = mediaType === 'movies' ? movieLibraries : showLibraries
  const currentActiveLibrary = mediaType === 'movies' ? movieActiveLibrary : showActiveLibrary
  const setCurrentActiveLibrary = mediaType === 'movies' ? setMovieActiveLibrary : setShowActiveLibrary

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
            <h2 className="text-lg font-semibold text-white">Add to Collection</h2>
            <p className="text-sm text-slate-400 mt-0.5">"{collection.name}"</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Media type toggle */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-0">
          <button
            onClick={() => handleMediaTypeChange('movies')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mediaType === 'movies' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film size={14} />
            Movies
          </button>
          <button
            onClick={() => handleMediaTypeChange('shows')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mediaType === 'shows' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tv size={14} />
            Shows
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b mt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => handleTabChange('search')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'search'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search size={14} />
            Search
          </button>
          <button
            onClick={() => handleTabChange('suggestions')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'suggestions'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={14} />
            Suggestions
          </button>
          {relatedEnabled && mediaType === 'movies' && (
            <button
              onClick={() => handleTabChange('related')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'related'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Film size={14} />
              Related
            </button>
          )}
        </div>

        {/* Controls */}
        {(activeTab === 'search' || currentLibraries.length > 1) && (
          <div className="p-4 border-b space-y-2.5" style={{ borderColor: 'var(--border)' }}>
            {activeTab === 'search' && (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  placeholder={`Search ${mediaType}…`}
                  value={currentSearch}
                  onChange={e => setCurrentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                />
              </div>
            )}
            {currentLibraries.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCurrentActiveLibrary('')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    currentActiveLibrary === '' ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {currentLibraries.map(lib => (
                  <button
                    key={lib}
                    onClick={() => setCurrentActiveLibrary(lib === currentActiveLibrary ? '' : lib)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      currentActiveLibrary === lib ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lib}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Item list */}
        <div className="overflow-y-auto flex-1 p-2">
          {activeTab === 'search' && renderSearchList()}
          {activeTab === 'suggestions' && renderSuggestionsList()}
          {activeTab === 'related' && renderRelatedList()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm text-slate-400">
            {totalSelected > 0 ? `${totalSelected} selected` : `Select ${mediaType} to add`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={totalSelected === 0 || adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Add {totalSelected > 0 ? `(${totalSelected})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-center py-12 text-slate-500 text-sm">{text}</div>
}
