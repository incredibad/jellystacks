import Sidebar from './Sidebar'
import { useOperations } from '../contexts/OperationsContext'

function ProgressToast({ label, current, total }) {
  const pct = total > 0 ? (current / total) * 100 : 0
  return (
    <div
      className="flex flex-col gap-3 px-4 py-3 rounded-xl shadow-2xl w-72"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-xs text-slate-500 tabular-nums">{current} / {total}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const { progress } = useOperations()

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {progress && (
        <div className="fixed bottom-5 right-5 z-50">
          <ProgressToast
            label={progress.label}
            current={progress.current}
            total={progress.total}
          />
        </div>
      )}
    </div>
  )
}
