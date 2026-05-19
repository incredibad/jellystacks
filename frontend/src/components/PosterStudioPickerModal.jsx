import { useState, useEffect } from 'react'
import { X, Loader, Layers } from 'lucide-react'
import api from '../api/client'
import { renderCanvasToFile } from '../utils/posterRender'

export default function PosterStudioPickerModal({ onClose, onApply }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    api.get('/poster-projects')
      .then(({ data }) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleConfirm = async () => {
    if (!selected) return
    setApplying(true)
    try {
      const { data: detail } = await api.get(`/poster-projects/${selected.id}`)
      const canvasJson = JSON.parse(detail.canvas_json)
      const file = await renderCanvasToFile(canvasJson)
      await onApply(file)
      onClose()
    } catch {
      // onApply handles error toasts; renderCanvasToFile failures fall through
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl flex flex-col max-h-[80vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers size={17} className="text-violet-400" />
            Choose from Poster Studio
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader size={20} className="animate-spin text-violet-400" />
            </div>
          )}
          {!loading && projects.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Layers size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No Poster Studio projects yet.</p>
            </div>
          )}
          {!loading && projects.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`relative rounded-lg overflow-hidden aspect-[2/3] transition-all ${
                    selected?.id === p.id ? 'ring-2 ring-violet-500' : 'hover:ring-1 hover:ring-violet-400/50'
                  }`}
                  style={{ background: '#0d0d14' }}
                >
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Layers size={24} className="text-slate-600" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80">
                    <p className="text-xs text-white truncate">{p.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || applying}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {applying ? (
              <span className="flex items-center gap-1.5"><Loader size={13} className="animate-spin" /> Rendering…</span>
            ) : 'Use This Design'}
          </button>
        </div>
      </div>
    </div>
  )
}
