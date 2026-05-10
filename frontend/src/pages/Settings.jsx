import { useState, useEffect, useRef } from 'react'
import {
  Server, Key, User, CheckCircle2, XCircle, Loader, ChevronDown,
  ExternalLink, Trash2, Lock, Download, Upload, RefreshCw, Clock,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

function Section({ title, description, icon: Icon, danger, children }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${danger ? '#7f1d1d40' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${danger ? 'bg-red-600/15' : 'bg-violet-600/20'}`}>
          <Icon size={17} className={danger ? 'text-red-400' : 'text-violet-400'} />
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

function DangerRow({ label, description, buttonLabel, onClick, loading, loadingLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-sm text-slate-300 font-medium">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={loading}
        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {loading ? loadingLabel : buttonLabel}
      </button>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('sync')

  // ── Sync tab ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    jellyfin_url: '',
    jellyfin_api_key: '',
    jellyfin_user_id: '',
    tmdb_api_key: '',
    tmdb_related_enabled: false,
    mdblist_api_key: '',
    collection_refresh_interval: 'disabled',
  })
  const [refreshing, setRefreshing] = useState(false)
  const [original, setOriginal] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [jellyfinUsers, setJellyfinUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // ── System tab ────────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [changingPw, setChangingPw] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clearingJf, setClearingJf] = useState(false)
  const importInputRef = useRef(null)

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      setForm({
        jellyfin_url: data.jellyfin_url || '',
        jellyfin_api_key: '',
        jellyfin_user_id: data.jellyfin_user_id || '',
        tmdb_api_key: '',
        tmdb_related_enabled: data.tmdb_related_enabled || false,
        mdblist_api_key: '',
        collection_refresh_interval: data.collection_refresh_interval || 'disabled',
      })
      setOriginal(data)
    })
  }, [])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const setPw = (key, value) => setPwForm(prev => ({ ...prev, [key]: value }))

  // ── Sync handlers ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {}
      if (form.jellyfin_url !== original.jellyfin_url) payload.jellyfin_url = form.jellyfin_url
      if (form.jellyfin_api_key) payload.jellyfin_api_key = form.jellyfin_api_key
      if (form.jellyfin_user_id !== original.jellyfin_user_id) payload.jellyfin_user_id = form.jellyfin_user_id
      if (form.tmdb_api_key) payload.tmdb_api_key = form.tmdb_api_key
      if (form.mdblist_api_key) payload.mdblist_api_key = form.mdblist_api_key
      if (form.tmdb_related_enabled !== original.tmdb_related_enabled) payload.tmdb_related_enabled = form.tmdb_related_enabled
      if (form.collection_refresh_interval !== original.collection_refresh_interval) payload.collection_refresh_interval = form.collection_refresh_interval

      if (Object.keys(payload).length === 0) {
        toast('No changes to save.', { icon: 'ℹ️' })
        return
      }

      const { data } = await api.put('/settings', payload)
      setOriginal(data)
      setForm(prev => ({ ...prev, jellyfin_api_key: '', tmdb_api_key: '', mdblist_api_key: '' }))
      toast.success('Settings saved.')
      setTestResult(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
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

  const handleRefreshNow = async () => {
    setRefreshing(true)
    const tid = toast.loading('Refreshing managed collections…')
    try {
      const { data } = await api.post('/collections/refresh-managed')
      const parts = []
      if (data.refreshed) parts.push(`${data.refreshed} refreshed`)
      if (data.skipped) parts.push(`${data.skipped} skipped (missing API key)`)
      if (data.failed) parts.push(`${data.failed} failed`)
      toast.success(parts.join(', ') || 'Nothing to refresh.', { id: tid })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Refresh failed.', { id: tid })
    } finally {
      setRefreshing(false)
    }
  }

  // ── System handlers ───────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      toast.error('New passwords do not match.')
      return
    }
    if (pwForm.next.length < 6) {
      toast.error('New password must be at least 6 characters.')
      return
    }
    setChangingPw(true)
    try {
      await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      })
      toast.success('Password changed successfully.')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password.')
    } finally {
      setChangingPw(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await api.get('/settings/export', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'jellystacks-backup.zip'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded.')
    } catch {
      toast.error('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const handleImportFile = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!confirm(
      `Import backup "${file.name}"?\n\nThis will replace ALL current data — collections, settings, and your account. You will be logged out afterwards.`
    )) return

    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api.post('/settings/import', fd)
      toast.success('Import successful. Logging out…')
      setTimeout(() => {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }, 1500)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const handleClearJellyfinCollections = async () => {
    if (!confirm(
      'Remove all Jellyfin-imported collections from JellyStacks? This only affects the local database — nothing is deleted from Jellyfin. You can re-import them afterwards.'
    )) return
    setClearingJf(true)
    try {
      const { data } = await api.delete('/collections/jellyfin-native')
      toast.success(`Removed ${data.deleted} Jellyfin collection${data.deleted !== 1 ? 's' : ''}.`)
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Failed to clear collections.')
    } finally {
      setClearingJf(false)
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-violet-500 transition-all"
  const inputStyle = { background: '#0d0d14', border: '1px solid var(--border)' }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your Jellyfin server and system options.</p>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg max-w-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {['sync', 'account', 'backup', 'system'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Sync tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'sync' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
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
              label={`API Key${original.jellyfin_api_key_set ? ' (currently set — leave blank to keep)' : ''}`}
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

            {testResult && (
              <div className={`flex items-start gap-3 p-3 rounded-lg mb-4 ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-red-500/10 border border-red-500/20'
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

          <Section
            title="Scheduled Collection Refresh"
            description="Automatically update TMDB and MDBList collections from their source on a schedule."
            icon={Clock}
          >
            <Field
              label="Refresh frequency"
              hint="When enabled, all TMDB and MDBList collections are re-scanned at the chosen interval, adding newly available movies and shows from your library."
            >
              <select
                value={form.collection_refresh_interval}
                onChange={e => set('collection_refresh_interval', e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="disabled">Disabled</option>
                <option value="6h">Every 6 hours</option>
                <option value="12h">Every 12 hours</option>
                <option value="24h">Every 24 hours</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>

            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <p className="text-sm text-slate-300 font-medium">Run now</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immediately refresh all managed collections regardless of the schedule.
                </p>
              </div>
              <button
                onClick={handleRefreshNow}
                disabled={refreshing}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-slate-300 border hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ borderColor: 'var(--border)' }}
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing…' : 'Refresh Now'}
              </button>
            </div>
          </Section>

          </div>{/* end left column */}

          {/* Right column */}
          <div className="space-y-6">
          <Section
            title="TMDB Integration"
            description="Used to fetch artwork for your collections."
            icon={Key}
          >
            <Field
              label={`API Key${original.tmdb_api_key_set ? ' (currently set — leave blank to keep)' : ''}`}
              hint={
                <span>
                  Get a free API key at{' '}
                  <a
                    href="https://www.themoviedb.org/settings/api"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 hover:underline inline-flex items-center gap-0.5"
                  >
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

            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <p className="text-sm text-slate-300 font-medium">Related Movies</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Show a "Related" tab when adding movies — fetches TMDB recommendations based on what's already in the collection. Results are cached for 2 weeks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => set('tmdb_related_enabled', !form.tmdb_related_enabled)}
                disabled={!original.tmdb_api_key_set && !form.tmdb_api_key}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  form.tmdb_related_enabled ? 'bg-violet-600' : 'bg-slate-700'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                  form.tmdb_related_enabled ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </Section>

          <Section
            title="MDBList Integration"
            description="Used to import curated public lists as collections."
            icon={Key}
          >
            <Field
              label={`API Key${original.mdblist_api_key_set ? ' (currently set — leave blank to keep)' : ''}`}
              hint={
                <span>
                  Get a free API key at{' '}
                  <a
                    href="https://mdblist.com/preferences"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    mdblist.com/preferences <ExternalLink size={11} />
                  </a>
                </span>
              }
            >
              <input
                type="password"
                value={form.mdblist_api_key}
                onChange={e => set('mdblist_api_key', e.target.value)}
                placeholder={original.mdblist_api_key_set ? '••••••••••••••••' : 'Enter your MDBList API key'}
                className={inputClass}
                style={inputStyle}
                autoComplete="new-password"
              />
            </Field>
          </Section>
          </div>{/* end right column */}
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-600/20"
          >
            {saving && <Loader size={15} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ── Account tab ────────────────────────────────────────────────────── */}
      {activeTab === 'account' && (
        <div className="space-y-6 max-w-2xl">
          <Section title="Change Password" description="Update your login password." icon={Lock}>
            <Field label="Current password">
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPw('current', e.target.value)}
                placeholder="Current password"
                className={inputClass}
                style={inputStyle}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" hint="Must be at least 6 characters.">
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPw('next', e.target.value)}
                placeholder="New password"
                className={inputClass}
                style={inputStyle}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPw('confirm', e.target.value)}
                placeholder="Confirm new password"
                className={inputClass}
                style={inputStyle}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end mt-2">
              <button
                onClick={handleChangePassword}
                disabled={changingPw || !pwForm.current || !pwForm.next || !pwForm.confirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60 transition-all shadow-lg shadow-violet-600/20"
              >
                {changingPw && <Loader size={15} className="animate-spin" />}
                {changingPw ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </Section>
        </div>
      )}

      {/* ── Backup tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'backup' && (
        <div className="space-y-6 max-w-2xl">
          <Section
            title="Data Backup"
            description="Export or restore your JellyStacks data as a zip archive."
            icon={Download}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-slate-300 font-medium">Export backup</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Downloads a zip containing your full database — collections, settings, and account.
                  </p>
                </div>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {exporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                  {exporting ? 'Exporting…' : 'Download Backup'}
                </button>
              </div>

              <div className="border-t" style={{ borderColor: 'var(--border)' }} />

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-slate-300 font-medium">Import backup</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Restores from a previously exported zip. Replaces all current data — you will be logged out.
                  </p>
                </div>
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {importing ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                  {importing ? 'Importing…' : 'Restore Backup'}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── System tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'system' && (
        <div className="space-y-6 max-w-2xl">
          <Section title="Danger Zone" description="Destructive actions — use with care." icon={Trash2} danger>
            <DangerRow
              label="Clear Jellyfin collections"
              description="Removes all imported Jellyfin collections from JellyStacks. Nothing is deleted from Jellyfin — you can re-import afterwards."
              buttonLabel="Clear Jellyfin Collections"
              loadingLabel="Clearing…"
              onClick={handleClearJellyfinCollections}
              loading={clearingJf}
            />
          </Section>
        </div>
      )}
    </div>
  )
}
