import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Stage, Layer, Image as KonvaImage, Text, Line, Rect, Transformer } from 'react-konva'
import {
  ArrowLeft, Trash2, Loader, Save, Eye, EyeOff, ChevronUp, ChevronDown,
  Type, Minus, Image, Layers, Download, Upload, Search, Copy, Sparkles,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { renderCanvasToDataUrl } from '../utils/posterRender'

const FONTS = [
  'Abril Fatface', 'Anton', 'Bangers', 'Barlow Condensed', 'Bebas Neue',
  'Big Shoulders Display', 'Black Ops One', 'Cinzel', 'Cormorant Garamond',
  'Creepster', 'Graduate', 'IM Fell English', 'Josefin Sans', 'Lato',
  'Libre Baskerville', 'Montserrat', 'Nosifer', 'Oswald', 'Passion One',
  'Permanent Marker', 'Pirata One', 'Playfair Display', 'Questrial', 'Raleway',
  'Rubik Dirt', 'Russo One', 'Rye', 'Staatliches', 'Teko', 'Ultra',
]

const RESOLUTIONS = [
  { label: 'Jellyfin Default', width: 800, height: 1200 },
  { label: 'High Quality', width: 1200, height: 1800 },
]

const DEFAULT_CANVAS = {
  resolution: RESOLUTIONS[0],
  background: { type: 'color', color: '#0a0a0f', imageDataUrl: null, fit: 'fill', overlayEnabled: false, overlayColor: '#000000', overlayOpacity: 0.5 },
  layers: [],
}

let _layerIdCounter = 1
const newId = () => `layer_${Date.now()}_${_layerIdCounter++}`

function makeTextLayer() {
  return {
    id: newId(), type: 'text', visible: true,
    props: { text: 'TITLE', x: 400, y: 600, fontFamily: 'Bebas Neue', fontSize: 90, fontWeight: '400', fill: '#ffffff', align: 'center', letterSpacing: 4, lineHeight: 1.2, shadowEnabled: false, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 0.8, opacity: 1 },
  }
}

function makeLineLayer(canvasW) {
  return {
    id: newId(), type: 'line', visible: true,
    props: { x: Math.round(canvasW * 0.1), y: 700, length: Math.round(canvasW * 0.8), stroke: '#ffffff', strokeWidth: 1, opacity: 1 },
  }
}

function makeImageLayer() {
  return {
    id: newId(), type: 'image', visible: true,
    props: { x: 200, y: 400, width: 400, height: 400, imageDataUrl: null, opacity: 1 },
  }
}

function makeVignetteLayer() {
  return {
    id: newId(), type: 'vignette', visible: true,
    props: { direction: 'bottom', color: '#000000', opacity: 0.75, size: 0.6 },
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PropRow({ label, children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function NumericInput({ value, onChange, min, max, step, className, setter }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ''))
  }, [value])

  const commit = (raw) => {
    const n = parseFloat(raw)
    if (raw === '' || isNaN(n)) {
      setDraft(String(value ?? ''))
    } else {
      if (setter) setter(n); else onChange(n)
    }
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      className={className}
      onFocus={() => { focused.current = true }}
      onChange={e => {
        setDraft(e.target.value)
        const n = parseFloat(e.target.value)
        if (e.target.value !== '' && !isNaN(n)) {
          if (setter) setter(n); else onChange(n)
        }
      }}
      onBlur={() => { focused.current = false; commit(draft) }}
    />
  )
}

const inputCls = "w-full px-2 py-1.5 rounded-md text-xs text-slate-200 bg-[#0d0d14] border border-[var(--border)] outline-none focus:ring-1 focus:ring-violet-500"
const numCls = "w-full px-2 py-1.5 rounded-md text-xs text-slate-200 bg-[#0d0d14] border border-[var(--border)] outline-none focus:ring-1 focus:ring-violet-500 tabular-nums"

function ColorSwatch({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-[var(--border)] bg-transparent p-0.5" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

function FontPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const containerRef = useRef(null)
  const listRef = useRef(null)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!open) return
    const handle = e => { if (!containerRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Scroll focused item into view whenever it changes or dropdown opens
  useEffect(() => {
    if (!open) return
    itemRefs.current[focusedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [open, focusedIdx])

  const openDropdown = () => {
    const idx = FONTS.indexOf(value)
    setFocusedIdx(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  const handleSelect = async (font) => {
    setOpen(false)
    try { await document.fonts.load(`bold 1em "${font}"`) } catch {}
    onChange(font)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, FONTS.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSelect(FONTS[focusedIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        onKeyDown={handleKeyDown}
        className={`${inputCls} flex items-center justify-between gap-2 cursor-pointer`}
        style={{ fontFamily: value }}
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={12} className="flex-shrink-0 text-slate-500 transition-transform" style={{ transform: open ? 'rotate(180deg)' : '' }} />
      </button>
      {open && (
        <div ref={listRef} className="absolute top-full left-0 right-0 z-[100] mt-1 rounded-md border border-[var(--border)] shadow-xl overflow-y-auto" style={{ background: '#0d0d14', maxHeight: 240 }}>
          {FONTS.map((f, i) => (
            <button
              key={f}
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              onClick={() => handleSelect(f)}
              onMouseEnter={() => setFocusedIdx(i)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                i === focusedIdx ? 'text-violet-300 bg-violet-500/15' : 'text-slate-300 hover:bg-white/5'
              }`}
              style={{ fontFamily: f }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TextProps({ layer, onChange }) {
  const p = layer.props
  return (
    <>
      <PropRow label="Text">
        <textarea value={p.text} onChange={e => onChange('text', e.target.value)}
          rows={2} className={inputCls + ' resize-none'} />
      </PropRow>
      <PropRow label="Font">
        <FontPicker value={p.fontFamily} onChange={v => onChange('fontFamily', v)} />
      </PropRow>
      <PropRow label="Weight">
        <select value={p.fontWeight ?? '400'} onChange={e => onChange('fontWeight', e.target.value)} className={inputCls}>
          <option value="400">Regular</option>
          <option value="700">Bold</option>
          <option value="900">Heavy</option>
        </select>
      </PropRow>
      <PropRow label="Size">
        <NumericInput value={p.fontSize} min={8} max={400} onChange={v => onChange('fontSize', v)} className={numCls} />
      </PropRow>
      <PropRow label="Colour">
        <ColorSwatch value={p.fill} onChange={v => onChange('fill', v)} />
      </PropRow>
      <PropRow label="Align">
        <div className="flex gap-1">
          {['left', 'center', 'right'].map(a => (
            <button key={a} onClick={() => onChange('align', a)}
              className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${p.align === a ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white bg-[#0d0d14] border border-[var(--border)]'}`}>
              {a}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Spacing">
        <NumericInput value={p.letterSpacing} min={-20} max={100} onChange={v => onChange('letterSpacing', v)} className={numCls} />
      </PropRow>
      <PropRow label="Line height">
        <NumericInput value={p.lineHeight ?? 1.2} min={0.5} max={5} step={0.1} onChange={v => onChange('lineHeight', v)} className={numCls} />
      </PropRow>
      <PropRow label="Opacity">
        <input type="range" min={0} max={1} step={0.01} value={p.opacity}
          onChange={e => onChange('opacity', +e.target.value)} className="w-full accent-violet-500" />
      </PropRow>
      <PropRow label="X / Y">
        <div className="flex gap-1">
          <NumericInput value={Math.round(p.x)} onChange={v => onChange('x', v)} className={numCls} />
          <NumericInput value={Math.round(p.y)} onChange={v => onChange('y', v)} className={numCls} />
        </div>
      </PropRow>
      <div className="mt-3 mb-1">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={p.shadowEnabled} onChange={e => onChange('shadowEnabled', e.target.checked)} className="accent-violet-500" />
          Drop shadow
        </label>
      </div>
      {p.shadowEnabled && (
        <>
          <PropRow label="Shadow colour">
            <ColorSwatch value={p.shadowColor} onChange={v => onChange('shadowColor', v)} />
          </PropRow>
          <PropRow label="Blur">
            <NumericInput value={p.shadowBlur} min={0} max={100} onChange={v => onChange('shadowBlur', v)} className={numCls} />
          </PropRow>
          <PropRow label="Offset X/Y">
            <div className="flex gap-1">
              <NumericInput value={p.shadowOffsetX} onChange={v => onChange('shadowOffsetX', v)} className={numCls} />
              <NumericInput value={p.shadowOffsetY} onChange={v => onChange('shadowOffsetY', v)} className={numCls} />
            </div>
          </PropRow>
          <PropRow label="Shadow opacity">
            <input type="range" min={0} max={1} step={0.01} value={p.shadowOpacity}
              onChange={e => onChange('shadowOpacity', +e.target.value)} className="w-full accent-violet-500" />
          </PropRow>
        </>
      )}
    </>
  )
}

function LineProps({ layer, onChange }) {
  const p = layer.props
  return (
    <>
      <PropRow label="Colour">
        <ColorSwatch value={p.stroke} onChange={v => onChange('stroke', v)} />
      </PropRow>
      <PropRow label="Thickness">
        <NumericInput value={p.strokeWidth} min={1} max={50} onChange={v => onChange('strokeWidth', v)} className={numCls} />
      </PropRow>
      <PropRow label="Length">
        <NumericInput value={p.length} min={1} onChange={v => onChange('length', v)} className={numCls} />
      </PropRow>
      <PropRow label="Opacity">
        <input type="range" min={0} max={1} step={0.01} value={p.opacity}
          onChange={e => onChange('opacity', +e.target.value)} className="w-full accent-violet-500" />
      </PropRow>
      <PropRow label="X / Y">
        <div className="flex gap-1">
          <NumericInput value={Math.round(p.x)} onChange={v => onChange('x', v)} className={numCls} />
          <NumericInput value={Math.round(p.y)} onChange={v => onChange('y', v)} className={numCls} />
        </div>
      </PropRow>
    </>
  )
}

function VignetteProps({ layer, onChange }) {
  const p = layer.props
  return (
    <>
      <PropRow label="Direction">
        <div className="flex gap-1 flex-wrap">
          {['bottom', 'top', 'radial'].map(d => (
            <button key={d} onClick={() => onChange('direction', d)}
              className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${p.direction === d ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white bg-[#0d0d14] border border-[var(--border)]'}`}>
              {d}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Colour">
        <ColorSwatch value={p.color} onChange={v => onChange('color', v)} />
      </PropRow>
      <PropRow label="Size">
        <input type="range" min={0.1} max={1} step={0.05} value={p.size ?? 0.6}
          onChange={e => onChange('size', +e.target.value)} className="w-full accent-violet-500" />
      </PropRow>
      <PropRow label="Strength">
        <input type="range" min={0} max={1} step={0.01} value={p.opacity}
          onChange={e => onChange('opacity', +e.target.value)} className="w-full accent-violet-500" />
      </PropRow>
    </>
  )
}

function ImageLayerProps({ layer, onChange, onBulk }) {
  const p = layer.props
  const fileRef = useRef(null)

  const handleFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target.result
      const img = new window.Image()
      img.onload = () => {
        const maxSize = 600
        let w = img.naturalWidth
        let h = img.naturalHeight
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        onBulk({ imageDataUrl: dataUrl, width: w, height: h })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <PropRow label="Image">
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-slate-300 bg-[#0d0d14] border border-[var(--border)] hover:border-violet-500 transition-colors">
          <Upload size={12} /> Upload image
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={handleFile} />
      </PropRow>
      <PropRow label="W / H">
        <div className="flex gap-1">
          <NumericInput value={p.width} min={1} onChange={v => onChange('width', v)} className={numCls} />
          <NumericInput value={p.height} min={1} onChange={v => onChange('height', v)} className={numCls} />
        </div>
      </PropRow>
      <PropRow label="X / Y">
        <div className="flex gap-1">
          <NumericInput value={Math.round(p.x)} onChange={v => onChange('x', v)} className={numCls} />
          <NumericInput value={Math.round(p.y)} onChange={v => onChange('y', v)} className={numCls} />
        </div>
      </PropRow>
      <PropRow label="Opacity">
        <input type="range" min={0} max={1} step={0.01} value={p.opacity}
          onChange={e => onChange('opacity', +e.target.value)} className="w-full accent-violet-500" />
      </PropRow>
    </>
  )
}

// ── Apply modal ─────────────────────────────────────────────────────────────

function ApplyModal({ onClose, onApply }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const [movies, shows, collections] = await Promise.all([
          api.get('/movies', { params: { q: query, limit: 5 } }),
          api.get('/shows', { params: { q: query, limit: 5 } }),
          api.get('/collections', { params: { q: query, limit: 5 } }),
        ])
        setResults([
          ...movies.data.map(m => ({ type: 'movie', id: m.id, label: `${m.title}${m.year ? ` (${m.year})` : ''}` })),
          ...shows.data.map(s => ({ type: 'show', id: s.id, label: `${s.title}${s.year ? ` (${s.year})` : ''}` })),
          ...collections.data.map(c => ({ type: 'collection', id: c.id, label: c.name })),
        ])
      } catch {}
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const typeLabel = { movie: 'Movie', show: 'Show', collection: 'Collection' }
  const typeCls = { movie: 'bg-blue-500/15 text-blue-400', show: 'bg-emerald-500/15 text-emerald-400', collection: 'bg-violet-500/15 text-violet-400' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-semibold text-white mb-4">Apply poster to…</h2>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3" style={{ background: '#0d0d14', border: '1px solid var(--border)' }}>
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search movies, shows, collections…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          {searching && <Loader size={13} className="animate-spin text-slate-500" />}
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onClick={() => onApply(r)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-300 hover:bg-white/5 transition-colors">
              <span className="flex-1 truncate">{r.label}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${typeCls[r.type]}`}>
                {typeLabel[r.type]}
              </span>
            </button>
          ))}
          {query.length >= 2 && !searching && results.length === 0 && (
            <p className="text-sm text-slate-500 px-3 py-2">No results found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Vignette canvas helper ───────────────────────────────────────────────────

function useVignetteImage(layer, cw, ch) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    const p = layer.props
    const size = p.size ?? 0.6
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')
    let grad
    if (p.direction === 'radial') {
      grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * size)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(1, p.color)
    } else if (p.direction === 'bottom') {
      grad = ctx.createLinearGradient(0, ch * (1 - size), 0, ch)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(1, p.color)
    } else {
      grad = ctx.createLinearGradient(0, 0, 0, ch * size)
      grad.addColorStop(0, p.color)
      grad.addColorStop(1, 'transparent')
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, cw, ch)
    const image = new window.Image()
    image.src = canvas.toDataURL()
    image.onload = () => setImg(image)
  }, [layer.props.direction, layer.props.color, layer.props.size, cw, ch])
  return img
}

function VignetteKonva({ layer, cw, ch }) {
  const img = useVignetteImage(layer, cw, ch)
  if (!img) return null
  return (
    <KonvaImage
      id={layer.id}
      image={img}
      x={0} y={0} width={cw} height={ch}
      opacity={layer.props.opacity}
      listening={false}
    />
  )
}

function useLoadedImage(dataUrl) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!dataUrl) { setImg(null); return }
    const image = new window.Image()
    image.src = dataUrl
    image.onload = () => setImg(image)
  }, [dataUrl])
  return img
}

function BgKonvaImage({ dataUrl, fit, cw, ch }) {
  const img = useLoadedImage(dataUrl)
  if (!img) return null
  let x = 0, y = 0, w = cw, h = ch
  if (fit === 'fit') {
    const s = Math.min(cw / img.width, ch / img.height)
    w = img.width * s; h = img.height * s
    x = (cw - w) / 2; y = (ch - h) / 2
  } else {
    const s = Math.max(cw / img.width, ch / img.height)
    w = img.width * s; h = img.height * s
    x = (cw - w) / 2; y = (ch - h) / 2
  }
  return <KonvaImage image={img} x={x} y={y} width={w} height={h} listening={false} />
}

function ImageLayerKonva({ layer, onSelect, onDragMove, onDragEnd, onTransformEnd }) {
  const img = useLoadedImage(layer.props.imageDataUrl)
  if (!img || !layer.props.imageDataUrl) return null
  return (
    <KonvaImage
      id={layer.id}
      image={img}
      x={layer.props.x}
      y={layer.props.y}
      width={layer.props.width}
      height={layer.props.height}
      opacity={layer.props.opacity}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  )
}

// ── Main editor ─────────────────────────────────────────────────────────────

export default function PosterEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const stageRef = useRef(null)
  const transformerRef = useRef(null)
  const bgFileRef = useRef(null)
  const saveTimerRef = useRef(null)

  const [project, setProject] = useState(null)
  const [canvas, setCanvas] = useState(DEFAULT_CANVAS)
  const [selectedId, setSelectedId] = useState(null)
  const [rightTab, setRightTab] = useState('background')
  const [snapLines, setSnapLines] = useState({ v: null, h: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [customRes, setCustomRes] = useState({ width: 800, height: 1200 })
  const [resMode, setResMode] = useState('Jellyfin Default')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiHistory, setAiHistory] = useState([])

  const PREVIEW_HEIGHT = 560
  const cw = canvas.resolution.width
  const ch = canvas.resolution.height
  const scale = PREVIEW_HEIGHT / ch

  // Auto-switch right panel tab on selection change
  useEffect(() => {
    setRightTab(selectedId ? 'layer' : 'background')
  }, [selectedId])

  // Attach Transformer to selected node
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr || !stageRef.current) return
    const selLayer = canvas.layers.find(l => l.id === selectedId)
    if (!selectedId || !selLayer || selLayer.type === 'vignette') {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }
    const node = stageRef.current.findOne('#' + selectedId)
    if (!node) return
    tr.nodes([node])
    tr.getLayer()?.batchDraw()
  }, [selectedId, canvas.layers])

  // Re-apply offsetX/width on text nodes after any canvas change.
  // React Konva skips props that haven't changed, so a background update can leave
  // stale node state if the Konva node was ever in an intermediate default state.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const konvaLayer = stage.getLayers()[0]
    if (!konvaLayer) return
    for (const l of canvas.layers) {
      if (l.type !== 'text') continue
      const node = konvaLayer.findOne(`#${l.id}`)
      if (!node) continue
      node.offsetX(l.props.align === 'center' ? cw / 2 : l.props.align === 'right' ? cw : 0)
      node.width(cw)
    }
    konvaLayer.batchDraw()
  }, [canvas, cw])

  // Load project — wait for all fonts used in the project before rendering canvas
  useEffect(() => {
    api.get(`/poster-projects/${id}`)
      .then(async ({ data }) => {
        setProject(data)
        if (data.canvas_json) {
          try {
            const parsed = JSON.parse(data.canvas_json)
            const fonts = [...new Set(
              (parsed.layers || [])
                .filter(l => l.type === 'text' && l.props?.fontFamily)
                .map(l => l.props.fontFamily)
            )]
            await Promise.all(fonts.map(f =>
              document.fonts.load(`bold 1em "${f}"`).catch(() => {})
            ))
            setCanvas(parsed)
          } catch {}
        }
      })
      .catch(() => { toast.error('Failed to load project.'); navigate('/poster-studio') })
      .finally(() => setLoading(false))
  }, [id])

  const doSave = async (canvasState, name, showToast = true) => {
    setSaving(true)
    try {
      const { width: canvasCw } = canvasState.resolution
      const thumbDataUrl = await renderCanvasToDataUrl(canvasState, {
        mimeType: 'image/jpeg',
        quality: 0.8,
        pixelRatio: 200 / canvasCw,
      })
      await api.put(`/poster-projects/${id}`, {
        canvas_json: JSON.stringify(canvasState),
        thumbnail: thumbDataUrl,
        name,
      })
      if (showToast) toast.success('Saved.')
    } catch {
      if (showToast) toast.error('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const scheduleSave = useCallback((canvasState, name) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(canvasState, name, false), 2000)
  }, [])

  const updateCanvas = updater => {
    setCanvas(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      scheduleSave(next, project?.name ?? 'Untitled Project')
      return next
    })
  }

  const addLayer = layer => updateCanvas(prev => ({ ...prev, layers: [...prev.layers, layer] }))

  // Supports both updateLayer(id, 'key', value) and updateLayer(id, { key: value })
  const updateLayer = (layerId, keyOrObject, value) => {
    updateCanvas(prev => ({
      ...prev,
      layers: prev.layers.map(l => {
        if (l.id !== layerId) return l
        const patch = typeof keyOrObject === 'string' ? { [keyOrObject]: value } : keyOrObject
        return { ...l, props: { ...l.props, ...patch } }
      }),
    }))
  }

  const deleteLayer = layerId => {
    setSelectedId(s => s === layerId ? null : s)
    updateCanvas(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== layerId) }))
  }

  const moveLayer = (layerId, dir) => {
    updateCanvas(prev => {
      const layers = [...prev.layers]
      const idx = layers.findIndex(l => l.id === layerId)
      if (idx < 0) return prev
      const target = idx + dir
      if (target < 0 || target >= layers.length) return prev
      ;[layers[idx], layers[target]] = [layers[target], layers[idx]]
      return { ...prev, layers }
    })
  }

  const toggleVisible = layerId => {
    updateCanvas(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l),
    }))
  }

  const duplicateLayer = layerId => {
    updateCanvas(prev => {
      const idx = prev.layers.findIndex(l => l.id === layerId)
      if (idx < 0) return prev
      const src = prev.layers[idx]
      const copy = {
        ...src,
        id: newId(),
        props: { ...src.props, x: (src.props.x ?? 0) + 20, y: (src.props.y ?? 0) + 20 },
      }
      const layers = [...prev.layers]
      layers.splice(idx + 1, 0, copy)
      return { ...prev, layers }
    })
  }

  // Snap drag handler — snaps element edges and centre to canvas guides
  const handleDragMove = useCallback((e) => {
    const node = e.target
    const threshold = 8 / scale
    const pos = node.position()
    const box = node.getClientRect({ relativeTo: node.getLayer() })
    let newX = pos.x, newY = pos.y
    let snapV = null, snapH = null

    for (const [elemX, guideX] of [
      [box.x, 0],
      [box.x + box.width / 2, cw / 2],
      [box.x + box.width, cw],
    ]) {
      if (Math.abs(elemX - guideX) < threshold) {
        newX = pos.x + (guideX - elemX)
        snapV = guideX
        break
      }
    }
    for (const [elemY, guideY] of [
      [box.y, 0],
      [box.y + box.height / 2, ch / 2],
      [box.y + box.height, ch],
    ]) {
      if (Math.abs(elemY - guideY) < threshold) {
        newY = pos.y + (guideY - elemY)
        snapH = guideY
        break
      }
    }

    node.position({ x: newX, y: newY })
    setSnapLines({ v: snapV, h: snapH })
  }, [scale, cw, ch])

  const handleBgFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => updateCanvas(prev => ({ ...prev, background: { ...prev.background, type: 'image', imageDataUrl: ev.target.result } }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const applyResolution = (mode) => {
    setResMode(mode)
    if (mode === 'Custom') {
      updateCanvas(prev => ({ ...prev, resolution: { width: customRes.width, height: customRes.height } }))
    } else {
      const res = RESOLUTIONS.find(r => r.label === mode) || RESOLUTIONS[0]
      updateCanvas(prev => ({ ...prev, resolution: res }))
    }
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiGenerating) return
    setAiGenerating(true)
    const tid = toast.loading('Generating image…')
    try {
      // Always request 1024x1024 — the native square resolution Pollinations/FLUX
      // generates without stretching. BgKonvaImage fill-crops it to the canvas ratio.
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${Date.now()}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('bad response')
      const blob = await response.blob()
      await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = ev => {
          const dataUrl = ev.target.result
          updateCanvas(prev => ({
            ...prev,
            background: { ...prev.background, type: 'image', imageDataUrl: dataUrl },
          }))
          setAiHistory(prev => [{ prompt: aiPrompt.trim(), dataUrl }, ...prev].slice(0, 5))
          resolve()
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      toast.success('Generated!', { id: tid })
    } catch {
      toast.error('Generation failed.', { id: tid })
    } finally {
      setAiGenerating(false)
    }
  }

  const handleExport = () => {
    if (!stageRef.current) return
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1 / scale, mimeType: 'image/jpeg', quality: 0.95 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${project?.name || 'poster'}.jpg`
    a.click()
  }

  const handleApply = async (target) => {
    setApplyOpen(false)
    setApplying(true)
    const tid = toast.loading(`Applying to ${target.label}…`)
    try {
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1 / scale, mimeType: 'image/jpeg', quality: 0.95 })
      const blob = await (await fetch(dataUrl)).blob()
      const fd = new FormData()
      fd.append('file', blob, 'poster.jpg')
      const endpoint = target.type === 'movie'
        ? `/movies/${target.id}/artwork/upload`
        : target.type === 'show'
          ? `/shows/${target.id}/artwork/upload`
          : `/collections/${target.id}/artwork/upload`
      await api.post(endpoint, fd)
      toast.success(`Applied to ${target.label}.`, { id: tid })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Apply failed.', { id: tid })
    } finally {
      setApplying(false)
    }
  }

  const selectedLayer = canvas.layers.find(l => l.id === selectedId)
  const layerTypeIcon = { text: <Type size={13} />, line: <Minus size={13} />, vignette: <Layers size={13} />, image: <Image size={13} /> }
  const layerTypeLabel = { text: 'Text', line: 'Line', vignette: 'Vignette', image: 'Image' }
  const isImageSelected = selectedLayer?.type === 'image'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full mt-32">
        <Loader size={20} className="animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <button onClick={() => navigate('/poster-studio')} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <input
          type="text"
          value={project?.name ?? ''}
          onChange={e => setProject(prev => ({ ...prev, name: e.target.value }))}
          onBlur={e => doSave(canvas, e.target.value, false)}
          className="flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder-slate-500"
          placeholder="Project name"
        />
        <div className="flex items-center gap-2 ml-auto">
          {saving && <span className="text-xs text-slate-500 flex items-center gap-1"><Loader size={11} className="animate-spin" /> Saving…</span>}
          <button onClick={() => doSave(canvas, project?.name, true)} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-[var(--border)] hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors">
            <Save size={13} /> Save
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-[var(--border)] hover:text-white hover:bg-white/5 transition-colors">
            <Download size={13} /> Export
          </button>
          <button onClick={() => setApplyOpen(true)} disabled={applying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">
            <Upload size={13} /> Apply to…
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel — layers */}
        <div className="w-56 flex-shrink-0 flex flex-col border-r overflow-y-auto" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="px-3 pt-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Add Layer</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: 'Text',    icon: <Type size={12} />,   fn: () => addLayer(makeTextLayer()) },
                { label: 'Line',    icon: <Minus size={12} />,  fn: () => addLayer(makeLineLayer(cw)) },
                { label: 'Vignette', icon: <Layers size={12} />, fn: () => addLayer(makeVignetteLayer()) },
                { label: 'Image',   icon: <Image size={12} />,  fn: () => addLayer(makeImageLayer()) },
              ].map(({ label, icon, fn }) => (
                <button key={label} onClick={fn}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-[var(--border)] transition-colors">
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 px-2 py-2 space-y-0.5">
            {canvas.layers.length === 0 && (
              <p className="text-xs text-slate-600 px-1 pt-2">No layers yet.</p>
            )}
            {[...canvas.layers].reverse().map((layer) => (
              <div
                key={layer.id}
                onClick={() => setSelectedId(layer.id === selectedId ? null : layer.id)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors group ${
                  selectedId === layer.id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span className="flex-shrink-0 opacity-60">{layerTypeIcon[layer.type]}</span>
                <span className="flex-1 truncate">{layer.type === 'text' ? (layer.props.text || 'Text') : layerTypeLabel[layer.type]}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); moveLayer(layer.id, -1) }} className="p-0.5 hover:text-white"><ChevronDown size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); moveLayer(layer.id, 1) }} className="p-0.5 hover:text-white"><ChevronUp size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); duplicateLayer(layer.id) }} className="p-0.5 hover:text-white"><Copy size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); toggleVisible(layer.id) }} className="p-0.5 hover:text-white">
                    {layer.visible ? <Eye size={11} /> : <EyeOff size={11} className="opacity-40" />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }} className="p-0.5 hover:text-red-400"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas preview */}
        <div
          className="flex-1 flex items-center justify-center overflow-auto p-10"
          style={{ background: '#111118' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null) }}
        >
          <div style={{ width: Math.round(cw * scale), height: Math.round(ch * scale), flexShrink: 0, position: 'relative' }}>
            {/* Canvas edge outline */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.7), 0 24px 80px rgba(0,0,0,0.5)' }} />
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: cw, height: ch }}>
              <Stage
                ref={stageRef}
                width={cw}
                height={ch}
                onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null) }}
              >
                <Layer>
                  {/* Background */}
                  {(canvas.background.type === 'color' || !canvas.background.imageDataUrl) && (
                    <Rect x={0} y={0} width={cw} height={ch} fill={canvas.background.color} listening={false} />
                  )}
                  {canvas.background.imageDataUrl && (
                    <BgKonvaImage dataUrl={canvas.background.imageDataUrl} fit={canvas.background.fit} cw={cw} ch={ch} />
                  )}
                  {canvas.background.overlayEnabled && (
                    <Rect x={0} y={0} width={cw} height={ch} fill={canvas.background.overlayColor} opacity={canvas.background.overlayOpacity} listening={false} />
                  )}

                  {/* Layers */}
                  {canvas.layers.filter(l => l.visible).map(layer => {
                    if (layer.type === 'text') {
                      const fw = layer.props.fontWeight ?? '400'
                      return (
                        <Text
                          key={layer.id}
                          id={layer.id}
                          {...layer.props}
                          fontStyle={fw === '900' ? '900' : fw === '700' ? 'bold' : 'normal'}
                          offsetX={layer.props.align === 'center' ? cw / 2 : layer.props.align === 'right' ? cw : 0}
                          width={cw}
                          draggable
                          onClick={() => setSelectedId(layer.id)}
                          onTap={() => setSelectedId(layer.id)}
                          onDragMove={handleDragMove}
                          onDragEnd={e => {
                            setSnapLines({ v: null, h: null })
                            updateLayer(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
                          }}
                        />
                      )
                    }
                    if (layer.type === 'line') {
                      return (
                        <Line
                          key={layer.id}
                          id={layer.id}
                          x={layer.props.x}
                          y={layer.props.y}
                          points={[0, 0, layer.props.length, 0]}
                          stroke={layer.props.stroke}
                          strokeWidth={layer.props.strokeWidth}
                          opacity={layer.props.opacity}
                          hitStrokeWidth={Math.max(20, layer.props.strokeWidth)}
                          draggable
                          onClick={() => setSelectedId(layer.id)}
                          onTap={() => setSelectedId(layer.id)}
                          onDragMove={handleDragMove}
                          onDragEnd={e => {
                            setSnapLines({ v: null, h: null })
                            updateLayer(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
                          }}
                        />
                      )
                    }
                    if (layer.type === 'vignette') {
                      return <VignetteKonva key={layer.id} layer={layer} cw={cw} ch={ch} />
                    }
                    if (layer.type === 'image') {
                      return (
                        <ImageLayerKonva
                          key={layer.id}
                          layer={layer}
                          onSelect={() => setSelectedId(layer.id)}
                          onDragMove={handleDragMove}
                          onDragEnd={e => {
                            setSnapLines({ v: null, h: null })
                            updateLayer(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
                          }}
                          onTransformEnd={e => {
                            const node = e.target
                            const sx = node.scaleX()
                            const sy = node.scaleY()
                            node.scaleX(1)
                            node.scaleY(1)
                            updateLayer(layer.id, {
                              x: Math.round(node.x()),
                              y: Math.round(node.y()),
                              width: Math.round(node.width() * sx),
                              height: Math.round(node.height() * sy),
                            })
                          }}
                        />
                      )
                    }
                    return null
                  })}

                  {/* Snap guide lines */}
                  {snapLines.v !== null && (
                    <Line points={[snapLines.v, 0, snapLines.v, ch]} stroke="#7c3aed"
                      strokeWidth={1 / scale} dash={[4 / scale, 4 / scale]} listening={false} />
                  )}
                  {snapLines.h !== null && (
                    <Line points={[0, snapLines.h, cw, snapLines.h]} stroke="#7c3aed"
                      strokeWidth={1 / scale} dash={[4 / scale, 4 / scale]} listening={false} />
                  )}

                  {/* Selection transformer */}
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled={false}
                    resizeEnabled={isImageSelected}
                    keepRatio={false}
                    borderStroke="#7c3aed"
                    borderStrokeWidth={1 / scale}
                    anchorFill="#7c3aed"
                    anchorStroke="#5b21b6"
                    anchorSize={8 / scale}
                    anchorCornerRadius={2 / scale}
                  />
                </Layer>
              </Stage>
            </div>
          </div>
        </div>

        {/* Right panel — tabbed */}
        <div className="w-64 flex-shrink-0 flex flex-col border-l" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>

          {/* Tab bar */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setRightTab('background')}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${rightTab === 'background' ? 'text-violet-400 border-violet-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
              Background
            </button>
            {selectedLayer && (
              <button
                onClick={() => setRightTab('layer')}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${rightTab === 'layer' ? 'text-violet-400 border-violet-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
              >
                Layer
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* Background tab */}
            {rightTab === 'background' && (
              <>
                <div className="px-3 pt-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Background</p>
                  <div className="flex gap-1 mb-3">
                    {['color', 'image'].map(t => (
                      <button key={t} onClick={() => updateCanvas(prev => ({ ...prev, background: { ...prev.background, type: t } }))}
                        className={`flex-1 py-1 rounded-md text-xs capitalize transition-colors ${canvas.background.type === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white bg-[#0d0d14] border border-[var(--border)]'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {canvas.background.type === 'color' ? (
                    <PropRow label="Colour">
                      <ColorSwatch value={canvas.background.color}
                        onChange={v => updateCanvas(prev => ({ ...prev, background: { ...prev.background, color: v } }))} />
                    </PropRow>
                  ) : (
                    <>
                      <button onClick={() => bgFileRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-2 rounded-md text-xs text-slate-300 bg-[#0d0d14] border border-[var(--border)] hover:border-violet-500 transition-colors">
                        <Upload size={12} /> Upload image
                      </button>
                      <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFile} />
                      <PropRow label="Or URL">
                        <input type="text" placeholder="https://…" className={inputCls}
                          onBlur={e => e.target.value && updateCanvas(prev => ({ ...prev, background: { ...prev.background, type: 'image', imageDataUrl: e.target.value } }))} />
                      </PropRow>
                      <PropRow label="Fit">
                        <div className="flex gap-1">
                          {['fill', 'fit'].map(f => (
                            <button key={f} onClick={() => updateCanvas(prev => ({ ...prev, background: { ...prev.background, fit: f } }))}
                              className={`flex-1 py-1 rounded-md text-xs capitalize transition-colors ${canvas.background.fit === f ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white bg-[#0d0d14] border border-[var(--border)]'}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </PropRow>
                    </>
                  )}
                  {/* AI Generate */}
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <Sparkles size={10} /> AI Generate
                    </p>
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Describe the background image…"
                      rows={3}
                      className={inputCls + ' resize-none mb-2'}
                    />
                    <button
                      onClick={handleAiGenerate}
                      disabled={aiGenerating || !aiPrompt.trim()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors"
                    >
                      {aiGenerating
                        ? <><Loader size={12} className="animate-spin" /> Generating…</>
                        : <><Sparkles size={12} /> Generate</>
                      }
                    </button>
                    <a
                      href="https://pollinations.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-[10px] text-slate-600 hover:text-slate-400 transition-colors mt-1"
                    >
                      Powered by Pollinations.ai
                    </a>
                    {aiHistory.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-slate-600 mb-1.5">Recent</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {aiHistory.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => updateCanvas(prev => ({
                                ...prev,
                                background: { ...prev.background, type: 'image', imageDataUrl: item.dataUrl },
                              }))}
                              title={item.prompt}
                              className="relative rounded overflow-hidden flex-shrink-0 ring-1 ring-white/10 hover:ring-violet-400 transition-all"
                              style={{ width: 40, height: 60 }}
                            >
                              <img src={item.dataUrl} alt={item.prompt} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none mt-3">
                    <input type="checkbox" checked={canvas.background.overlayEnabled}
                      onChange={e => updateCanvas(prev => ({ ...prev, background: { ...prev.background, overlayEnabled: e.target.checked } }))}
                      className="accent-violet-500" />
                    Colour overlay
                  </label>
                  {canvas.background.overlayEnabled && (
                    <div className="mt-2 space-y-2">
                      <PropRow label="Colour">
                        <ColorSwatch value={canvas.background.overlayColor}
                          onChange={v => updateCanvas(prev => ({ ...prev, background: { ...prev.background, overlayColor: v } }))} />
                      </PropRow>
                      <PropRow label="Opacity">
                        <input type="range" min={0} max={1} step={0.01} value={canvas.background.overlayOpacity}
                          onChange={e => updateCanvas(prev => ({ ...prev, background: { ...prev.background, overlayOpacity: +e.target.value } }))}
                          className="w-full accent-violet-500" />
                      </PropRow>
                    </div>
                  )}
                </div>

                {/* Resolution */}
                <div className="px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Resolution</p>
                  <div className="space-y-1 mb-2">
                    {[...RESOLUTIONS.map(r => r.label), 'Custom'].map(mode => (
                      <label key={mode} className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                        <input type="radio" name="res" checked={resMode === mode} onChange={() => applyResolution(mode)} className="accent-violet-500" />
                        {mode}{RESOLUTIONS.find(r => r.label === mode) ? ` — ${RESOLUTIONS.find(r => r.label === mode).width}×${RESOLUTIONS.find(r => r.label === mode).height}` : ''}
                      </label>
                    ))}
                  </div>
                  {resMode === 'Custom' && (
                    <div className="flex gap-1 mt-2">
                      <NumericInput value={customRes.width} min={100} setter={v => setCustomRes(p => ({ ...p, width: v }))} className={numCls} />
                      <NumericInput value={customRes.height} min={100} setter={v => setCustomRes(p => ({ ...p, height: v }))} className={numCls} />
                      <button onClick={() => applyResolution('Custom')}
                        className="px-2 py-1.5 rounded-md text-xs text-white bg-violet-600 hover:bg-violet-500 transition-colors flex-shrink-0">
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Layer tab */}
            {rightTab === 'layer' && selectedLayer && (
              <div className="px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  {layerTypeLabel[selectedLayer.type]}
                </p>
                {selectedLayer.type === 'text' && (
                  <TextProps layer={selectedLayer} onChange={(k, v) => updateLayer(selectedLayer.id, k, v)} />
                )}
                {selectedLayer.type === 'line' && (
                  <LineProps layer={selectedLayer} onChange={(k, v) => updateLayer(selectedLayer.id, k, v)} />
                )}
                {selectedLayer.type === 'vignette' && (
                  <VignetteProps layer={selectedLayer} onChange={(k, v) => updateLayer(selectedLayer.id, k, v)} />
                )}
                {selectedLayer.type === 'image' && (
                  <ImageLayerProps
                    layer={selectedLayer}
                    onChange={(k, v) => updateLayer(selectedLayer.id, k, v)}
                    onBulk={obj => updateLayer(selectedLayer.id, obj)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {applyOpen && (
        <ApplyModal onClose={() => setApplyOpen(false)} onApply={handleApply} />
      )}
    </div>
  )
}
