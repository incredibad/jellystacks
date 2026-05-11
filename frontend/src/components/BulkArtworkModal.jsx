import { useState, useRef, useCallback, useMemo } from 'react'
import { X, Upload, CheckCircle2, AlertCircle, Search, Loader, Copy, ChevronUp, ChevronDown } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{pct}%</span>
}

function SearchDropdown({ value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  const handleChange = (e) => {
    const q = e.target.value
    onChange(q)
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const [movies, shows, cols] = await Promise.all([
          api.get('/movies', { params: { q, limit: 5 } }),
          api.get('/shows', { params: { q, limit: 5 } }),
          api.get('/collections'),
        ])
        const ql = q.toLowerCase()
        const matchedCols = cols.data
          .filter(c => c.name.toLowerCase().includes(ql))
          .slice(0, 5)
          .map(c => ({ id: c.id, type: 'collection', title: c.name, year: null }))
        const r = [
          ...movies.data.map(m => ({ id: m.id, type: 'movie', title: m.title, year: m.year })),
          ...shows.data.map(s => ({ id: s.id, type: 'show', title: s.title, year: s.year })),
          ...matchedCols,
        ]
        setResults(r)
        setOpen(r.length > 0)
      } catch {}
      setLoading(false)
    }, 300)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search…"
          className="w-full pl-6 pr-2 py-1 rounded text-xs text-slate-200 placeholder-slate-500 outline-none"
          style={{ background: '#0d0d14', border: '1px solid var(--border)' }}
        />
        {loading && <Loader size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 w-64 rounded-lg shadow-xl mt-1 py-1 max-h-48 overflow-y-auto"
            style={{ background: '#1e1e30', border: '1px solid var(--border)' }}
          >
            {results.map(r => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => { onSelect(r); setOpen(false); onChange(r.title) }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                <span className="text-slate-500 mr-1.5">{r.type === 'movie' ? '🎬' : r.type === 'show' ? '📺' : '🗂️'}</span>
                {r.title}
                {r.year && <span className="text-slate-500 ml-1">({r.year})</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function BulkArtworkModal({ onClose }) {
  const fileInputRef = useRef(null)
  const [stage, setStage] = useState('upload') // 'upload' | 'review' | 'applying'
  const [dragging, setDragging] = useState(false)
  const [matching, setMatching] = useState(false)
  const [matches, setMatches] = useState([])
  const [searchValues, setSearchValues] = useState({})
  const [overrides, setOverrides] = useState({})
  const [excluded, setExcluded] = useState(new Set())
  const [results, setResults] = useState(null)
  const [sort, setSort] = useState({ col: null, dir: 'asc' })

  const processFiles = useCallback(async (fileList) => {
    if (!fileList.length) return
    setMatching(true)

    // Split into ~50 MB batches to stay under Cloudflare's 100 MB request limit
    const BATCH_BYTES = 50 * 1024 * 1024
    const batches = []
    let current = [], currentSize = 0
    for (const f of fileList) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        // ZIPs go alone — backend extracts them server-side
        if (f.size > 90 * 1024 * 1024) {
          toast.error(`${f.name} is too large to upload via your domain (>90 MB). Extract it and drop the images directly instead.`)
          continue
        }
        batches.push([f])
      } else {
        if (currentSize + f.size > BATCH_BYTES && current.length) {
          batches.push(current)
          current = []; currentSize = 0
        }
        current.push(f)
        currentSize += f.size
      }
    }
    if (current.length) batches.push(current)

    if (!batches.length) { setMatching(false); return }

    try {
      const allMatches = []
      for (const batch of batches) {
        const form = new FormData()
        for (const f of batch) form.append('files', f)
        const { data } = await api.post('/artwork/bulk/match', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 0,
        })
        allMatches.push(...data.matches)
      }
      setMatches(allMatches)
      setSearchValues(Object.fromEntries(allMatches.map(m => [m.tmp_name, m.match_title || ''])))
      setStage('review')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process files.')
    } finally {
      setMatching(false)
    }
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileInput = (e) => {
    processFiles(Array.from(e.target.files))
  }

  const handleOverride = (tmpName, item) => {
    setOverrides(prev => ({ ...prev, [tmpName]: item }))
  }

  const handleApply = async () => {
    const items = matches
      .filter(m => !excluded.has(m.tmp_name))
      .map(m => {
        const override = overrides[m.tmp_name]
        return {
          batch_id: m.batch_id,
          tmp_name: m.tmp_name,
          match_type: override?.type ?? m.match_type,
          match_id: override?.id ?? m.match_id,
        }
      })
      .filter(item => item.match_type && item.match_id)

    if (!items.length) { toast('Nothing to apply.', { icon: 'ℹ️' }); return }

    setStage('applying')
    try {
      const { data } = await api.post('/artwork/bulk/apply', { items })
      setResults(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Apply failed.')
      setStage('review')
    }
  }

  const pendingCount = matches.filter(m => !excluded.has(m.tmp_name) && (overrides[m.tmp_name] || m.match_id)).length

  const allSelected = matches.length > 0 && matches.every(m => !excluded.has(m.tmp_name))
  const someSelected = matches.some(m => !excluded.has(m.tmp_name))

  const toggleSelectAll = () => {
    if (allSelected) {
      setExcluded(new Set(matches.map(m => m.tmp_name)))
    } else {
      setExcluded(new Set())
    }
  }

  const cycleSort = (col) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )
  }

  const sortedMatches = useMemo(() => {
    if (!sort.col) return matches
    return [...matches].sort((a, b) => {
      let av, bv
      if (sort.col === 'filename') {
        av = a.filename.toLowerCase()
        bv = b.filename.toLowerCase()
      } else {
        av = overrides[a.tmp_name] ? 1 : (a.confidence ?? 0)
        bv = overrides[b.tmp_name] ? 1 : (b.confidence ?? 0)
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [matches, sort, overrides])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={stage !== 'applying' ? onClose : undefined} />
      <div
        className="relative w-full max-w-3xl rounded-2xl flex flex-col max-h-[88vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Upload size={17} className="text-violet-400" />
            Bulk Artwork Upload
          </h2>
          {stage !== 'applying' && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Upload stage */}
        {stage === 'upload' && (
          <div className="p-6 flex flex-col items-center justify-center flex-1 min-h-64">
            {matching ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-400">Matching files…</p>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center py-16 transition-colors ${
                  dragging ? 'border-violet-500 bg-violet-500/5' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <Upload size={36} className="text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-300">Drop images or a ZIP file here</p>
                <p className="text-xs text-slate-500 mt-1">or click to browse</p>
                <p className="text-xs text-slate-600 mt-3">JPG, PNG, WebP, ZIP supported</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.zip"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            )}
          </div>
        )}

        {/* Review stage */}
        {stage === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider" style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                        onChange={toggleSelectAll}
                        className="accent-violet-500"
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium w-16">Upload</th>
                    <th className="px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => cycleSort('filename')}>
                      <span className="flex items-center gap-1">
                        Filename
                        {sort.col === 'filename'
                          ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                          : <ChevronUp size={11} className="opacity-20" />}
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium w-16">Current</th>
                    <th className="px-4 py-2.5 text-left font-medium">Matched To</th>
                    <th className="px-4 py-2.5 text-left font-medium w-20 cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => cycleSort('confidence')}>
                      <span className="flex items-center gap-1">
                        Match
                        {sort.col === 'confidence'
                          ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                          : <ChevronUp size={11} className="opacity-20" />}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMatches.map((m, i) => {
                    const isExcluded = excluded.has(m.tmp_name)
                    const override = overrides[m.tmp_name]
                    const hasMatch = override || m.match_id
                    const currentType = override?.type ?? m.match_type
                    const currentId = override?.id ?? m.match_id
                    const posterUrl = currentType && currentId
                      ? currentType === 'collection'
                        ? `/api/collections/${currentId}/poster`
                        : `/api/${currentType === 'movie' ? 'movies' : 'shows'}/${currentId}/poster`
                      : null
                    return (
                      <tr
                        key={m.tmp_name}
                        className={`transition-colors ${isExcluded ? 'opacity-40' : ''}`}
                        style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={!isExcluded}
                            onChange={() => setExcluded(prev => {
                              const next = new Set(prev)
                              next.has(m.tmp_name) ? next.delete(m.tmp_name) : next.add(m.tmp_name)
                              return next
                            })}
                            className="accent-violet-500"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <img
                            src={`/api/artwork/bulk/preview/${m.batch_id}/${m.tmp_name}`}
                            alt=""
                            className="w-10 h-14 object-cover rounded"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-slate-300 text-xs break-all">{m.filename}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {posterUrl
                            ? <img src={posterUrl} alt="" className="w-10 h-14 object-cover rounded opacity-60" />
                            : <div className="w-10 h-14 rounded bg-slate-800 flex items-center justify-center text-slate-600 text-xs">—</div>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <SearchDropdown
                            value={searchValues[m.tmp_name] ?? ''}
                            onChange={(v) => setSearchValues(prev => ({ ...prev, [m.tmp_name]: v }))}
                            onSelect={(item) => handleOverride(m.tmp_name, item)}
                          />
                          {!hasMatch && !isExcluded && (
                            <p className="text-xs text-amber-500 mt-1">No match — search or exclude</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {hasMatch
                              ? <ConfidenceBadge value={override ? 1 : m.confidence} />
                              : <AlertCircle size={14} className="text-amber-500" />
                            }
                            {!override && m.versions?.length > 1 && (
                              <div className="relative group">
                                <Copy size={12} className="text-slate-500 cursor-default" />
                                <div className="absolute bottom-full right-0 mb-2 z-30 hidden group-hover:block w-48 rounded-lg shadow-xl p-2.5" style={{ background: '#1e1e30', border: '1px solid var(--border)' }}>
                                  <p className="text-xs font-medium text-slate-300 mb-1.5">{m.versions.length} versions — all will update:</p>
                                  {m.versions.map(v => (
                                    <p key={v.id} className="text-xs text-slate-400 truncate">{v.library_name}</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <span className="text-sm text-slate-400">{pendingCount} of {matches.length} will be applied</span>
                <p className="text-xs text-slate-600 mt-0.5">If multiple versions exist (e.g. 1080p &amp; 4K), all will be updated.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
                <button
                  onClick={handleApply}
                  disabled={pendingCount === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply {pendingCount} Artwork{pendingCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Applying stage */}
        {stage === 'applying' && !results && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Applying artwork…</p>
          </div>
        )}

        {/* Results stage */}
        {results && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 text-center">
            <CheckCircle2 size={40} className="text-emerald-400" />
            <div>
              <p className="text-lg font-semibold text-white">{results.applied} artwork{results.applied !== 1 ? 's' : ''} applied</p>
              {results.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-amber-400">{results.errors.length} failed:</p>
                  <ul className="mt-1 space-y-0.5">
                    {results.errors.map((e, i) => (
                      <li key={i} className="text-xs text-amber-300/70">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
