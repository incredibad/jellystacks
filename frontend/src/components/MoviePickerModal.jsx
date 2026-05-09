import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Plus, Film, Sparkles } from 'lucide-react'
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

function MovieRow({ movie, isIn, isSel, onToggle, score, breakdown }) {
  return (
    <button
      onClick={() => onToggle(movie.id)}
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
          src={`/api/movies/${movie.id}/poster`}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={e => { e.target.style.display = 'none' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Film size={14} className="text-slate-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{movie.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {movie.year && <span className="text-xs text-slate-500">{movie.year}</span>}
          {movie.library_name && (
            <>
              {movie.year && <span className="text-slate-700 text-xs">·</span>}
              <span className="text-xs text-slate-500 truncate">{movie.library_name}</span>
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
  const [movies, setMovies] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [libraries, setLibraries] = useState([])
  const [activeLibrary, setActiveLibrary] = useState('')

  const [activeTab, setActiveTab] = useState('search')
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsFetched, setSuggestionsFetched] = useState(false)
  const [related, setRelated] = useState([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedFetched, setRelatedFetched] = useState(false)
  const [relatedEnabled, setRelatedEnabled] = useState(false)

  const sentinelRef = useRef(null)
  const offsetRef = useRef(0)
  const searchRef = useRef('')
  const libraryRef = useRef('')

  const existingIds = new Set(collection.movies?.map(m => m.id) || [])

  const filteredSuggestions = activeLibrary
    ? suggestions.filter(s => s.movie.library_name === activeLibrary)
    : suggestions

  const filteredRelated = activeLibrary
    ? related.filter(r => r.movie.library_name === activeLibrary)
    : related

  useEffect(() => {
    api.get('/movies/libraries').then(({ data }) => setLibraries(data)).catch(() => {})
    api.get('/settings').then(({ data }) => {
      setRelatedEnabled(data.tmdb_related_enabled && data.tmdb_api_key_set)
    }).catch(() => {})
  }, [])

  const fetchPage = useCallback(async (newOffset, resetList) => {
    if (newOffset === 0) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = { q: searchRef.current, limit: PAGE_SIZE, offset: newOffset }
      if (libraryRef.current) params.library = libraryRef.current
      const { data } = await api.get('/movies', { params })
      const items = Array.isArray(data) ? data : (data.movies ?? [])
      setMovies(prev => newOffset === 0 ? items : [...prev, ...items])
      setHasMore(items.length === PAGE_SIZE)
      offsetRef.current = newOffset + items.length
      setOffset(newOffset + items.length)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  const fetchSuggestions = useCallback(async () => {
    if (suggestionsFetched) return
    setSuggestionsLoading(true)
    try {
      const { data } = await api.get(`/collections/${collection.id}/suggestions`)
      setSuggestions(data)
      setSuggestionsFetched(true)
    } catch {
      // silent — suggestions are best-effort
    } finally {
      setSuggestionsLoading(false)
    }
  }, [collection.id, suggestionsFetched])

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

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'suggestions') fetchSuggestions()
    if (tab === 'related') fetchRelated()
  }

  useEffect(() => {
    searchRef.current = search
    libraryRef.current = activeLibrary
    offsetRef.current = 0
    setOffset(0)
    setHasMore(true)
    const t = setTimeout(() => fetchPage(0, true), search ? 200 : 0)
    return () => clearTimeout(t)
  }, [search, activeLibrary, fetchPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore && !loading) {
          if (offsetRef.current > 0 && hasMore) {
            fetchPage(offsetRef.current, false)
          }
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, fetchPage])

  const toggle = (id) => {
    if (existingIds.has(id)) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setAdding(true)
    try {
      const { data } = await api.post(`/collections/${collection.id}/movies`, {
        movie_ids: [...selected],
      })
      onAdded(data)
      onClose()
    } finally {
      setAdding(false)
    }
  }

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
            <h2 className="text-lg font-semibold text-white">Add Movies</h2>
            <p className="text-sm text-slate-400 mt-0.5">to "{collection.name}"</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
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
          {relatedEnabled && (
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

        {/* Controls — search input (search tab only) + library pills (all tabs) */}
        {(activeTab === 'search' || libraries.length > 1) && (
          <div className="p-4 border-b space-y-2.5" style={{ borderColor: 'var(--border)' }}>
            {activeTab === 'search' && (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search movies…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500"
                  style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)' }}
                />
              </div>
            )}
            {libraries.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveLibrary('')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeLibrary === '' ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {libraries.map(lib => (
                  <button
                    key={lib}
                    onClick={() => setActiveLibrary(lib === activeLibrary ? '' : lib)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      activeLibrary === lib ? 'bg-violet-600 text-white' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lib}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Movie list */}
        <div className="overflow-y-auto flex-1 p-2">
          {activeTab === 'search' ? (
            loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : movies.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No movies found.</div>
            ) : (
              <div className="space-y-1">
                {movies.map(movie => (
                  <MovieRow
                    key={movie.id}
                    movie={movie}
                    isIn={existingIds.has(movie.id)}
                    isSel={selected.has(movie.id)}
                    onToggle={toggle}
                  />
                ))}
                <div ref={sentinelRef} className="py-2 flex items-center justify-center">
                  {loadingMore && (
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>
            )
          ) : (
            activeTab === 'suggestions' ? (
              suggestionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredSuggestions.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {suggestionsFetched
                    ? 'No suggestions found for this collection name.'
                    : 'Loading suggestions…'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSuggestions.map(({ movie, score, breakdown }) => (
                    <MovieRow
                      key={movie.id}
                      movie={movie}
                      isIn={existingIds.has(movie.id)}
                      isSel={selected.has(movie.id)}
                      onToggle={toggle}
                      score={score}
                      breakdown={breakdown}
                    />
                  ))}
                </div>
              )
            ) : (
              relatedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredRelated.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {relatedFetched
                    ? 'No related movies found in your library.'
                    : 'Loading related movies…'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredRelated.map(({ movie, score, breakdown }) => (
                    <MovieRow
                      key={movie.id}
                      movie={movie}
                      isIn={existingIds.has(movie.id)}
                      isSel={selected.has(movie.id)}
                      onToggle={toggle}
                      score={score}
                      breakdown={breakdown}
                    />
                  ))}
                </div>
              )
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm text-slate-400">
            {selected.size > 0 ? `${selected.size} selected` : 'Select movies to add'}
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
              disabled={selected.size === 0 || adding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
