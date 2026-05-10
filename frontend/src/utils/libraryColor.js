const PALETTE = [
  { bg: 'rgba(139,92,246,0.22)',  text: '#c4b5fd' },  // violet
  { bg: 'rgba(59,130,246,0.22)',  text: '#93c5fd' },  // blue
  { bg: 'rgba(16,185,129,0.22)', text: '#6ee7b7' },  // emerald
  { bg: 'rgba(245,158,11,0.22)', text: '#fcd34d' },  // amber
  { bg: 'rgba(244,63,94,0.22)',  text: '#fda4af' },  // rose
  { bg: 'rgba(6,182,212,0.22)',  text: '#67e8f9' },  // cyan
  { bg: 'rgba(217,70,239,0.22)', text: '#f0abfc' },  // fuchsia
  { bg: 'rgba(99,102,241,0.22)', text: '#a5b4fc' },  // indigo
]

export function libraryColor(name) {
  if (!name) return PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
