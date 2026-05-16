import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import api from '../api/client'
import toast from 'react-hot-toast'

const OperationsContext = createContext(null)

const LS_KEY = 'jstacks_op'
const SYNC_RESULT_KEY = 'jstacks_sync_result'

const CONFIGS = {
  'detect-tmdb': {
    label: 'Detecting TMDB collections…',
    filter: c => c.movie_count > 0,
    apiCall: t => api.post(`/collections/${t.id}/detect-tmdb`),
    resumeToast: (results) => {
      const linked = results.filter(r => r.ok && r.data?.tmdb_collection_id).length
      const custom = results.filter(r => r.ok && !r.data?.tmdb_collection_id).length
      const skipped = results.filter(r => !r.ok).length
      const parts = []
      if (linked) parts.push(`${linked} TMDB`)
      if (custom) parts.push(`${custom} Custom`)
      if (skipped) parts.push(`${skipped} skipped`)
      toast.success(parts.join(', '))
    },
  },
  'verify': {
    label: 'Verifying Jellyfin status…',
    filter: c => c.jellyfin_collection_id,
    apiCall: t => api.post(`/collections/${t.id}/verify`),
    resumeToast: (results) => toast.success(`Verified ${results.length} collections.`),
  },
  'push-all': {
    label: 'Pushing to Jellyfin…',
    filter: c => c.movie_count > 0,
    apiCall: t => api.post(`/collections/${t.id}/push`),
    resumeToast: (results) => {
      const succeeded = results.filter(r => r.ok).length
      const failed = results.filter(r => !r.ok).length
      let msg = `${succeeded} pushed`
      if (failed) msg += `, ${failed} failed`
      toast.success(msg)
    },
  },
}

function SyncBar({ label, fetched, total }) {
  const indeterminate = total === 0
  const pct = indeterminate ? 0 : Math.min(100, Math.round((fetched / total) * 100))
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</span>
        {indeterminate ? (
          <span style={{ fontSize: '11px', color: '#4b5563' }}>—</span>
        ) : (
          <span style={{ fontSize: '11px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            {fetched.toLocaleString()} / {total.toLocaleString()}
          </span>
        )}
      </div>
      <div style={{ height: '3px', borderRadius: '2px', background: '#2d2d44', overflow: 'hidden' }}>
        <div
          className={indeterminate ? 'animate-pulse' : ''}
          style={{
            height: '100%',
            width: indeterminate ? '35%' : `${pct}%`,
            background: 'linear-gradient(to right, #7c3aed, #0891b2)',
            borderRadius: '2px',
            transition: indeterminate ? 'none' : 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  )
}

function SyncProgressToast({ t, movies, shows }) {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #2d2d44',
        padding: '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        width: '280px',
        opacity: t.visible ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Syncing libraries…</p>
      <SyncBar label="Movies" fetched={movies.fetched} total={movies.total} />
      <SyncBar label="Shows" fetched={shows.fetched} total={shows.total} />
    </div>
  )
}

function SyncDoneToast({ t, summary, skippedCleanup, onRetry }) {
  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #2d2d44',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        maxWidth: '320px',
        opacity: t.visible ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }}
    >
      <span style={{ color: '#10b981', lineHeight: 1, paddingTop: '2px', flexShrink: 0 }}>✓</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Sync complete</p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{summary}</p>
        {skippedCleanup && (
          <>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#f59e0b' }}>
              ⚠ Cleanup skipped — Jellyfin returned fewer items than its reported total.
              Deletions from Jellyfin won't be reflected until the next successful sync.
            </p>
            <button
              onClick={onRetry}
              style={{
                marginTop: '8px', background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px',
                color: '#f59e0b', fontSize: '11px', fontWeight: 600,
                padding: '3px 10px', cursor: 'pointer',
              }}
            >
              Sync again
            </button>
          </>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(t.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#64748b', padding: '0 0 0 8px', lineHeight: 1,
          fontSize: '14px', flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

function showSyncComplete(summary, skippedCleanup, onRetry) {
  toast.custom(
    (t) => <SyncDoneToast t={t} summary={summary} skippedCleanup={skippedCleanup} onRetry={onRetry} />,
    { id: 'sync', duration: Infinity }
  )
}

function showSyncProgress(movies, shows) {
  toast.custom(
    (t) => <SyncProgressToast t={t} movies={movies} shows={shows} />,
    { id: 'sync', duration: Infinity }
  )
}

export function OperationsProvider({ children }) {
  const [progress, setProgress] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState(null)
  const [lastOpAt, setLastOpAt] = useState(null)
  const runningRef = useRef(false)
  const syncLibrariesRef = useRef(null)

  const _execute = useCallback(async (type, targets, startAt, onDone, onEach) => {
    if (runningRef.current || !targets.length) return
    runningRef.current = true

    const config = CONFIGS[type]
    setProgress({ label: config.label, current: startAt, total: targets.length })

    const results = []
    for (let i = startAt; i < targets.length; i++) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        type,
        targetIds: targets.map(t => t.id),
        current: i,
      }))
      let result
      try {
        const { data } = await config.apiCall(targets[i])
        result = { ok: true, data }
      } catch {
        result = { ok: false }
      }
      results.push(result)
      onEach?.(targets[i], result)
      setProgress({ label: config.label, current: i + 1, total: targets.length })
    }

    setProgress(null)
    runningRef.current = false
    localStorage.removeItem(LS_KEY)
    setLastOpAt(Date.now())

    if (onDone) {
      onDone(results)
    } else {
      config.resumeToast(results)
    }
  }, [])

  // Resume an in-progress operation after a page refresh
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (!saved) return
    try {
      const { type, targetIds, current } = JSON.parse(saved)
      if (!CONFIGS[type] || !targetIds?.length) {
        localStorage.removeItem(LS_KEY)
        return
      }
      api.get('/collections').then(({ data: collections }) => {
        const targets = targetIds
          .map(id => collections.find(c => c.id === id))
          .filter(Boolean)
        if (targets.length) {
          _execute(type, targets, current ?? 0, null)
        } else {
          localStorage.removeItem(LS_KEY)
        }
      }).catch(() => localStorage.removeItem(LS_KEY))
    } catch {
      localStorage.removeItem(LS_KEY)
    }
  }, [_execute])

  const runOperation = useCallback(({ type, targets, onDone, onEach }) => {
    if (runningRef.current || !targets.length) return
    _execute(type, targets, 0, onDone, onEach)
  }, [_execute])

  const syncLibraries = useCallback(async () => {
    if (syncing) return
    setSyncing(true)

    // Show the initial progress toast (both bars indeterminate until first poll lands)
    const EMPTY = { fetched: 0, total: 0 }
    showSyncProgress(EMPTY, EMPTY)

    // Poll both progress endpoints and update bars independently
    let moviesProg = EMPTY
    let showsProg = EMPTY
    const pollInterval = setInterval(async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          api.get('/movies/sync/progress').catch(() => ({ data: null })),
          api.get('/shows/sync/progress').catch(() => ({ data: null })),
        ])
        if (mRes.data) moviesProg = mRes.data
        if (sRes.data) showsProg = sRes.data
        showSyncProgress(moviesProg, showsProg)
      } catch {}
    }, 250)

    let moviesData = null
    let showsData = null

    try {
      const [moviesResult, showsResult] = await Promise.allSettled([
        api.post('/movies/sync', null, { timeout: 0 }).then(res => { moviesData = res.data; return res }),
        api.post('/shows/sync', null, { timeout: 0 }).then(res => { showsData = res.data; return res }),
      ])

      clearInterval(pollInterval)

      if (moviesResult.status === 'rejected') throw moviesResult.reason
      if (showsResult.status === 'rejected') throw showsResult.reason

      const movies = moviesData.synced
      const shows = showsData.synced
      const deletedMovies = moviesData.deleted ?? 0
      const deletedShows = showsData.deleted ?? 0
      const skippedCleanup = !!(moviesData.skipped_cleanup || showsData.skipped_cleanup)

      const parts = [`${movies} movies`, `${shows} shows`]
      if (deletedMovies + deletedShows > 0) parts.push(`${deletedMovies + deletedShows} removed`)
      const summary = parts.join(', ')

      localStorage.setItem(SYNC_RESULT_KEY, JSON.stringify({ summary, skippedCleanup }))
      showSyncComplete(summary, skippedCleanup, () => {
        toast.dismiss('sync')
        syncLibrariesRef.current?.()
      })
      setLastSynced(Date.now())
    } catch (err) {
      clearInterval(pollInterval)
      toast.error(err.response?.data?.detail || 'Sync failed. Check Settings.', { id: 'sync' })
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  // Keep ref current so retry callbacks always call the latest version
  useEffect(() => { syncLibrariesRef.current = syncLibraries }, [syncLibraries])

  // On mount, show any sync result stored before a page refresh
  useEffect(() => {
    const stored = localStorage.getItem(SYNC_RESULT_KEY)
    if (!stored) return
    localStorage.removeItem(SYNC_RESULT_KEY)
    try {
      const { summary, skippedCleanup } = JSON.parse(stored)
      if (summary) showSyncComplete(summary, skippedCleanup, () => {
        toast.dismiss('sync')
        syncLibrariesRef.current?.()
      })
    } catch {}
  }, [])

  const notifyCollectionsChanged = useCallback(() => setLastOpAt(Date.now()), [])

  return (
    <OperationsContext.Provider value={{ progress, runOperation, isRunning: !!progress, syncing, syncLibraries, lastSynced, lastOpAt, notifyCollectionsChanged }}>
      {children}
    </OperationsContext.Provider>
  )
}

export function useOperations() {
  return useContext(OperationsContext)
}
