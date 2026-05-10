import { NavLink, useNavigate } from 'react-router-dom'
import { Film, Tv, Layers, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import api from '../api/client'
import pkg from '../../package.json'

const NAV_ITEMS = [
  { to: '/movies',      icon: Film,   label: 'Movies',      countKey: 'movies' },
  { to: '/shows',       icon: Tv,     label: 'Shows',       countKey: 'shows' },
  { to: '/collections', icon: Layers, label: 'Collections', countKey: 'collections' },
  { to: '/settings',    icon: Settings, label: 'Settings',  countKey: null },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState({})

  useEffect(() => {
    Promise.all([
      api.get('/movies/count'),
      api.get('/shows/count'),
      api.get('/collections/count'),
    ]).then(([movies, shows, collections]) => {
      setCounts({
        movies: movies.data.count,
        shows: shows.data.count,
        collections: collections.data.count,
      })
    }).catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <img src="/logo.png" alt="JellyStacks" className="h-9 w-auto flex-shrink-0" />
        <span
          className="text-xl font-bold uppercase tracking-wide select-none"
          style={{
            fontFamily: "'Oswald', sans-serif",
            background: 'linear-gradient(to right, #9333ea, #14b8a6, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          JellyStacks
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label, countKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-violet-600/20 text-violet-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {countKey && counts[countKey] != null && (
              <span className="text-xs tabular-nums text-slate-500">
                {counts[countKey].toLocaleString()}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm text-slate-300 truncate">{user?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <LogOut size={16} />
          Sign out
        </button>
        <p className="text-xs text-slate-700 px-3 pt-2">v{pkg.version}</p>
      </div>
    </aside>
  )
}
