import Konva from 'konva'

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
  canvas.width = cw
  canvas.height = ch
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

// Render canvas_json to a data URL. pixelRatio controls output size.
export async function renderCanvasToDataUrl(canvasJson, { mimeType = 'image/jpeg', quality = 0.95, pixelRatio = 1 } = {}) {
  const { resolution, background, layers } = canvasJson
  const { width: cw, height: ch } = resolution

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

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width: cw, height: ch })
  const konvaLayer = new Konva.Layer()
  stage.add(konvaLayer)

  // Background
  if (!background.imageDataUrl) {
    konvaLayer.add(new Konva.Rect({ x: 0, y: 0, width: cw, height: ch, fill: background.color || '#000000', listening: false }))
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
    konvaLayer.add(new Konva.Image({ image: bgImage, x, y, width: w, height: h, listening: false }))
  }
  if (background.overlayEnabled) {
    konvaLayer.add(new Konva.Rect({
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
      konvaLayer.add(new Konva.Text({
        ...p,
        fontStyle,
        offsetX: p.align === 'center' ? cw / 2 : p.align === 'right' ? cw : 0,
        width: cw,
      }))
    } else if (l.type === 'line') {
      const p = l.props
      konvaLayer.add(new Konva.Line({
        x: p.x, y: p.y,
        points: [0, 0, p.length, 0],
        stroke: p.stroke, strokeWidth: p.strokeWidth, opacity: p.opacity,
      }))
    } else if ((l.type === 'vignette' || l.type === 'image') && l._img) {
      const p = l.props
      konvaLayer.add(new Konva.Image({
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

  konvaLayer.batchDraw()
  const dataUrl = stage.toDataURL({ mimeType, quality, pixelRatio })
  stage.destroy()
  document.body.removeChild(container)

  return dataUrl
}

// Render canvas_json to a File at full resolution (for applying as artwork).
export async function renderCanvasToFile(canvasJson) {
  const dataUrl = await renderCanvasToDataUrl(canvasJson, { mimeType: 'image/jpeg', quality: 0.95 })
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], 'poster.jpg', { type: 'image/jpeg' })
}
