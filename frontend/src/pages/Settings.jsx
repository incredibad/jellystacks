import { useState, useEffect } from 'react'
import { Server, Key, User, CheckCircle2, XCircle, Loader, ChevronDown, ExternalLink, Trash2 } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

function Section({ title, description, icon: Icon, children }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-violet-600/20 flex items-center justify-center">
          <Icon size={17} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

export default function Settings() {
  const [form, setForm] = useState({
    jellyfin_url: '',
    jellyfin_api_key: '',
    jellyfin_user_id: '',
    tmdb_api_key: '',
  })
  const [original, setOriginal] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearingJf, setClearingJf] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [jellyfinUsers, setJellyfinUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      const vals = {
        jellyfin_url: data.jellyfin_url || '',
        jellyfin_api_key: '',
        jellyfin_user_id: data.jellyfin_user_id || '',
        tmdb_api_key: '',
      }
      setForm(vals)
      setOriginal(data)
    })
  }, [])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {}
      if (form.jellyfin_url !== original.jellyfin_url) payload.jellyfin_url = form.jellyfin_url
      if (form.jellyfin_api_key) payload.jellyfin_api_key = form.jellyfin_api_key
      if (form.jellyfin_user_id !== original.jellyfin_user_id) payload.jellyfin_user_id = form.jellyfin_user_id
      if (form.tmdb_api_key) payload.tmdb_api_key = form.tmdb_api_key

      if (Object.keys(payload).length === 0) {
        toast('No changes to save.', { icon: 'ℹ️' })
        return
      }

      const { data } = await api.put('/settings', payload)
      setOriginal(data)
      setForm(prev => ({ ...prev, jellyfin_api_key: '', tmdb_api_key: '' }))
      toast.success('Settings saved.')
      setTestResult(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    // Save first if there are pending changes
    if (form.jellyfin_url || form.jellyfin_api_key) {
      await handleSave()
    }
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post('/settings/test-jellyfin')
      setTestResult(data)
    } catch {
      setTestResult({ success: false, message: 'Request failed.' })
    } finally {
      setTesting(false)
    }
  }

  const fetchJellyfinUsers = async () => {
    setLoadingUsers(true)
    try {
      await handleSave()
      const { data } = await api.get('/settings/jellyfin-users')
      setJellyfinUsers(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to fetch Jellyfin users.')
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleClearJellyfinCollections = async () => {
    if (!confirm('Remove all Jellyfin-imported collections from JellyStacks? This only affects the local database — nothing is deleted from Jellyfin. You can re-import them afterwards.')) return
    setClearingJf(true)
    try {
      const { data } = await api.delete('/collections/jellyfin-native')
      toast.success(`Removed ${data.deleted} Jellyfin collection${data.deleted !== 1 ? 's' : ''}.`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to clear collections.')
    } finally {
      setClearingJf(false)
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500 transition-all"
  const inputStyle = { background: '#0d0d14', border: '1px solid var(--border)' }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your Jellyfin server and API integrations.</p>
      </div>

      <div className="space-y-6">
        {/* Jellyfin */}
        <Section title="Jellyfin Server" description="Connect to your Jellyfin media server." icon={Server}>
          <Field label="Server URL" hint="Include the protocol, e.g. http://192.168.1.10:8096">
            <input
              type="url"
              value={form.jellyfin_url}
              onChange={e => set('jellyfin_url', e.target.value)}
              placeholder="http://your-jellyfin-host:8096"
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field
            label={`API Key ${original.jellyfin_api_key_set ? '(currently set — leave blank to keep)' : ''}`}
            hint="Generate in Jellyfin → Dashboard → API Keys"
          >
            <input
              type="password"
              value={form.jellyfin_api_key}
              onChange={e => set('jellyfin_api_key', e.target.value)}
              placeholder={original.jellyfin_api_key_set ? '••••••••••••••••' : 'Enter your Jellyfin API key'}
              className={inputClass}
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>

          <Field label="User ID" hint="Used to fetch your movie library. Leave blank to use system-wide items.">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.jellyfin_user_id}
                onChange={e => set('jellyfin_user_id', e.target.value)}
                placeholder="Paste User ID or pick from list →"
                className={inputClass}
                style={inputStyle}
              />
              <button
                onClick={fetchJellyfinUsers}
                disabled={loadingUsers}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all border"
                style={{ borderColor: 'var(--border)' }}
                title="Fetch users from Jellyfin"
              >
                {loadingUsers ? <Loader size={13} className="animate-spin" /> : <ChevronDown size={13} />}
                Pick
              </button>
            </div>
            {jellyfinUsers.length > 0 && (
              <div
                className="mt-2 rounded-lg overflow-hidden text-sm"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-hover)' }}
              >
                {jellyfinUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { set('jellyfin_user_id', u.id); setJellyfinUsers([]) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors border-b last:border-0"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <User size={13} className="text-slate-500" />
                    <span className="text-slate-300">{u.name}</span>
                    <span className="text-slate-600 text-xs ml-auto font-mono truncate max-w-32">{u.id}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-3 p-3 rounded-lg mb-4 ${
              testResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
            }`}>
              {testResult.success
                ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                : <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              }
              <div>
                <p className={`text-sm font-medium ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                  {testResult.message}
                </p>
                {testResult.server_name && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {testResult.server_name} · v{testResult.version}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-all border"
            style={{ borderColor: 'var(--border)' }}
          >
            {testing ? <Loader size={14} className="animate-spin" /> : <Server size={14} />}
            Test Connection
          </button>
        </Section>

        {/* TMDB */}
        <Section
          title="TMDB Integration"
          description="Used to fetch artwork for your collections."
          icon={Key}
        >
          <Field
            label={`API Key ${original.tmdb_api_key_set ? '(currently set — leave blank to keep)' : ''}`}
            hint={
              <span>
                Get a free API key at{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline inline-flex items-center gap-0.5">
                  themoviedb.org <ExternalLink size={11} />
                </a>
              </span>
            }
          >
            <input
              type="password"
              value={form.tmdb_api_key}
              onChange={e => set('tmdb_api_key', e.target.value)}
              placeholder={original.tmdb_api_key_set ? '••••••••••••••••' : 'Enter your TMDB API key (v3 auth)'}
              className={inputClass}
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>
        </Section>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-600/20"
          >
            {saving ? <Loader size={15} className="animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

        {/* Danger zone */}
        <div
          className="rounded-xl p-6"
          style={{ background: 'var(--surface)', border: '1px solid #7f1d1d40' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-red-600/15 flex items-center justify-center">
              <Trash2 size={17} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Danger Zone</h2>
              <p className="text-xs text-slate-500 mt-0.5">Destructive actions — use with care.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-slate-300 font-medium">Clear Jellyfin collections</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Removes all imported Jellyfin collections from JellyStacks. Nothing is deleted from Jellyfin — you can re-import afterwards.
              </p>
            </div>
            <button
              onClick={handleClearJellyfinCollections}
              disabled={clearingJf}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {clearingJf ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {clearingJf ? 'Clearing…' : 'Clear Jellyfin Collections'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
