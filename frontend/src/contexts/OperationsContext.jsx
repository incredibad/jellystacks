import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import api from '../api/client'
import toast from 'react-hot-toast'

const OperationsContext = createContext(null)

const LS_KEY = 'jstacks_op'

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

export function OperationsProvider({ children }) {
  const [progress, setProgress] = useState(null)
  const runningRef = useRef(false)

  const _execute = useCallback(async (type, targets, onDone) => {
    if (runningRef.current || !targets.length) return
    runningRef.current = true

    const config = CONFIGS[type]
    setProgress({ label: config.label, current: 0, total: targets.length })

    const results = []
    for (let i = 0; i < targets.length; i++) {
      try {
        const { data } = await config.apiCall(targets[i])
        results.push({ ok: true, data })
      } catch {
        results.push({ ok: false })
      }
      setProgress({ label: config.label, current: i + 1, total: targets.length })
    }

    setProgress(null)
    runningRef.current = false
    localStorage.removeItem(LS_KEY)

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
      const { type, targetIds } = JSON.parse(saved)
      if (!CONFIGS[type] || !targetIds?.length) {
        localStorage.removeItem(LS_KEY)
        return
      }
      api.get('/collections').then(({ data: collections }) => {
        const targets = collections.filter(c => targetIds.includes(c.id))
        if (targets.length) {
          _execute(type, targets, null) // null → use resumeToast
        } else {
          localStorage.removeItem(LS_KEY)
        }
      }).catch(() => localStorage.removeItem(LS_KEY))
    } catch {
      localStorage.removeItem(LS_KEY)
    }
  }, [_execute])

  const runOperation = useCallback(({ type, targets, onDone }) => {
    if (runningRef.current || !targets.length) return
    localStorage.setItem(LS_KEY, JSON.stringify({
      type,
      targetIds: targets.map(t => t.id),
    }))
    _execute(type, targets, onDone)
  }, [_execute])

  return (
    <OperationsContext.Provider value={{ progress, runOperation, isRunning: !!progress }}>
      {children}
    </OperationsContext.Provider>
  )
}

export function useOperations() {
  return useContext(OperationsContext)
}
