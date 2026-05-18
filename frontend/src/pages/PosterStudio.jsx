import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Loader, ImageOff } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function PosterStudio() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    api.get('/poster-projects')
      .then(({ data }) => setProjects(data))
      .catch(() => toast.error('Failed to load projects.'))
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    setCreating(true)
    try {
      const { data } = await api.post('/poster-projects', { name: 'Untitled Project' })
      navigate(`/poster-studio/${data.id}`)
    } catch {
      toast.error('Failed to create project.')
      setCreating(false)
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this poster project? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.delete(`/poster-projects/${id}`)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch {
      toast.error('Failed to delete project.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Poster Studio</h1>
          <p className="text-sm text-slate-400 mt-1">Design custom posters for your movies, shows and collections.</p>
        </div>
        <button
          onClick={handleNew}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-600/20"
        >
          {creating ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
          New Project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 mt-12 justify-center">
          <Loader size={16} className="animate-spin" />
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center">
            <ImageOff size={28} className="text-violet-400" />
          </div>
          <div>
            <p className="text-slate-300 font-medium">No projects yet</p>
            <p className="text-sm text-slate-500 mt-1">Create your first poster project to get started.</p>
          </div>
          <button
            onClick={handleNew}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all"
          >
            {creating ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
            New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => navigate(`/poster-studio/${project.id}`)}
              className="group relative cursor-pointer rounded-xl overflow-hidden transition-all hover:ring-2 hover:ring-violet-500"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              {/* Thumbnail — 2:3 aspect ratio */}
              <div className="relative w-full" style={{ paddingBottom: '150%' }}>
                {project.thumbnail ? (
                  <img
                    src={project.thumbnail}
                    alt={project.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    <ImageOff size={24} className="text-slate-700" />
                  </div>
                )}
                {/* Delete button */}
                <button
                  onClick={e => handleDelete(e, project.id)}
                  disabled={deletingId === project.id}
                  className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all bg-black/60 text-slate-400 hover:text-red-400"
                >
                  {deletingId === project.id
                    ? <Loader size={13} className="animate-spin" />
                    : <Trash2 size={13} />
                  }
                </button>
              </div>
              {/* Name + date */}
              <div className="p-3">
                <p className="text-sm font-medium text-slate-200 truncate">{project.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(project.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
