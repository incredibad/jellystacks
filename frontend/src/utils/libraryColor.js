const PALETTE = [
  { bg: 'rgba(109,40,217,0.85)',  text: '#fff' },  // violet
  { bg: 'rgba(29,78,216,0.85)',   text: '#fff' },  // blue
  { bg: 'rgba(4,120,87,0.85)',    text: '#fff' },  // emerald
  { bg: 'rgba(180,83,9,0.85)',    text: '#fff' },  // amber
  { bg: 'rgba(190,18,60,0.85)',   text: '#fff' },  // rose
  { bg: 'rgba(14,116,144,0.85)',  text: '#fff' },  // cyan
  { bg: 'rgba(162,28,175,0.85)',  text: '#fff' },  // fuchsia
  { bg: 'rgba(67,56,202,0.85)',   text: '#fff' },  // indigo
]

export function libraryColor(name) {
  if (!name) return PALETTE[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
