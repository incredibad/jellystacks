import { createContext, useContext, useState, useCallback, useRef } from 'react'

const OperationsContext = createContext(null)

export function OperationsProvider({ children }) {
  const [progress, setProgress] = useState(null) // { label, current, total } | null
  const runningRef = useRef(false)

  // Run a bulk operation that persists through page navigation.
  // config: { label, targets, apiCall: (target) => Promise, onDone: (results) => void }
  const runOperation = useCallback(async ({ label, targets, apiCall, onDone }) => {
    if (runningRef.current || !targets.length) return
    runningRef.current = true
    setProgress({ label, current: 0, total: targets.length })

    const results = []
    for (let i = 0; i < targets.length; i++) {
      try {
        const { data } = await apiCall(targets[i])
        results.push({ ok: true, data })
      } catch {
        results.push({ ok: false })
      }
      setProgress({ label, current: i + 1, total: targets.length })
    }

    setProgress(null)
    runningRef.current = false
    onDone?.(results)
  }, [])

  return (
    <OperationsContext.Provider value={{ progress, runOperation, isRunning: !!progress }}>
      {children}
    </OperationsContext.Provider>
  )
}

export function useOperations() {
  return useContext(OperationsContext)
}
