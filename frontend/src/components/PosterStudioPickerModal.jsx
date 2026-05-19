import { useState, useEffect } from 'react'
import { X, Loader, Layers } from 'lucide-react'
import Konva from 'konva'
import api from '../api/client'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function buildVignetteImage(props, cw, ch) {
  const size = props.size ?? 0.6
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')
  let grad
  if (props.direction === 'radial') {
    grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * size)
    grad.addColorStop(0, 'transparent')
    grad.addColorStop(1, props.color)
  } else if (props.direction === 'bottom') {
    grad = ctx.createLinearGradient(0, ch * (1 - size), 0, ch)
    grad.addColorStop(0, 'transparent')
    grad.addColorStop(1, props.color)
  } else {
    grad = ctx.createLinearGradient(0, 0, 0, ch * size)
    grad.addColorStop(0, props.color)
    grad.addColorStop(1, 'transparent')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, cw, ch)
  return loadImage(canvas.toDataURL())
}

async function renderCanvasToFile(canvasJson) {
  const { resolution, background, layers } = canvasJson
  const { width: cw, height: ch } = resolution

  // Load all async resources in parallel before touching Konva
  const bgImageP = background.imageDataUrl
    ? loadImage(background.imageDataUrl).catch(() => null)
    : Promise.resolve(null)

  const layerDataP = Promise.all(
    layers.filter(l => l.visible).map(async l => {
      if (l.type === 'image' && l.props.imageDataUrl) {
        return { ...l, _img: await loadImage(l.props.imageDataUrl).catch(() => null) }
      }
      if (l.type === 'vignette') {
        return { ...l, _img: await buildVignetteImage(l.props, cw, ch) }
      }
      if (l.type === 'text') {
        const p = l.props
        const fw = p.fontWeight ?? '400'
        const fontStyle = fw === '900' ? '900' : fw === '700' ? 'bold' : 'normal'
        try { await document.fonts.load(`${fontStyle} ${p.fontSize}px "${p.fontFamily}"`) } catch {}
        return l
      }
      return l
    })
  )

  const [bgImage, layerData] = await Promise.all([bgImageP, layerDataP])

  // Off-screen container
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width: cw, height: ch })
  const layer = new Konva.Layer()
  stage.add(layer)

  // Background
  if (!background.imageDataUrl) {
    layer.add(new Konva.Rect({ x: 0, y: 0, width: cw, height: ch, fill: background.color || '#000000', listening: false }))
  } else if (bgImage) {
    let x = 0, y = 0, w = cw, h = ch
    if (background.fit === 'fit') {
      const s = Math.min(cw / bgImage.width, ch / bgImage.height)
      w = bgImage.width * s; h = bgImage.height * s
      x = (cw - w) / 2; y = (ch - h) / 2
    } else {
      const s = Math.max(cw / bgImage.width, ch / bgImage.height)
      w = bgImage.width * s; h = bgImage.height * s
      x = (cw - w) / 2; y = (ch - h) / 2
    }
    layer.add(new Konva.Image({ image: bgImage, x, y, width: w, height: h, listening: false }))
  }
  if (background.overlayEnabled) {
    layer.add(new Konva.Rect({
      x: 0, y: 0, width: cw, height: ch,
      fill: background.overlayColor, opacity: background.overlayOpacity, listening: false,
    }))
  }

  // Layers in order
  for (const l of layerData) {
    if (l.type === 'text') {
      const p = l.props
      const fw = p.fontWeight ?? '400'
      const fontStyle = fw === '900' ? '900' : fw === '700' ? 'bold' : 'normal'
      layer.add(new Konva.Text({
        ...p,
        fontStyle,
        offsetX: p.align === 'center' ? cw / 2 : p.align === 'right' ? cw : 0,
        width: cw,
      }))
    } else if (l.type === 'line') {
      const p = l.props
      layer.add(new Konva.Line({
        x: p.x, y: p.y,
        points: [0, 0, p.length, 0],
        stroke: p.stroke, strokeWidth: p.strokeWidth, opacity: p.opacity,
      }))
    } else if ((l.type === 'vignette' || l.type === 'image') && l._img) {
      const p = l.props
      layer.add(new Konva.Image({
        image: l._img,
        x: l.type === 'vignette' ? 0 : p.x,
        y: l.type === 'vignette' ? 0 : p.y,
        width: l.type === 'vignette' ? cw : p.width,
        height: l.type === 'vignette' ? ch : p.height,
        opacity: p.opacity,
        listening: false,
      }))
    }
  }

  layer.batchDraw()
  const dataUrl = stage.toDataURL({ mimeType: 'image/jpeg', quality: 0.95 })
  stage.destroy()
  document.body.removeChild(container)

  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], 'poster.jpg', { type: 'image/jpeg' })
}

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
