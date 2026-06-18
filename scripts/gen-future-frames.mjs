// Generates the projected-future drift frames public/planets/paleo/paleo-fut*.webp
// by morphing today's coastlines into the Pangaea Proxima supercontinent.
// Run: npm run gen-future   (needs paleo-000.webp + paleo-fut250.webp present)
//
// No freely-licensed *scientific* future map sequence exists (GPlates future
// models are CC-BY-NC, Scotese's future maps are copyright). So we interpolate
// the land/ocean shapes between two openly-licensed endpoints with a signed
// distance field (SDF) morph — a smooth, clearly-labelled projection:
//   - today  = paleo-000.webp (Scotese PALEOMAP, CC-BY-4.0)
//   - +250My = paleo-fut250.webp (Pangaea Proxima, Wikimedia, CC-BY-SA 4.0)
// The morph frames are therefore a derivative work → CC-BY-SA 4.0.
import sharp from 'sharp'

const W = 1024
const H = 512
const out = new URL('../public/planets/paleo/', import.meta.url)
const load = async (p) =>
  (await sharp(new URL(p, out)).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data

// land mask: ocean is blue-dominant, everything else is land
const mask = (d) => {
  const m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 3], g = d[i * 3 + 1], b = d[i * 3 + 2]
    m[i] = b > g && b > r - 10 && b > 60 && g < 150 ? 0 : 1
  }
  return m
}

const INF = 1e12
const N = Math.max(W, H)
const f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1)
function edt1d(n) {
  let k = 0
  v[0] = 0; z[0] = -INF; z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]] }
}
function edt2d(bin) {
  const dist = new Float64Array(W * H)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = bin[y * W + x] ? 0 : INF
    edt1d(H)
    for (let y = 0; y < H; y++) dist[y * W + x] = d[y]
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = dist[y * W + x]
    edt1d(W)
    for (let x = 0; x < W; x++) dist[y * W + x] = d[x]
  }
  return dist
}
function sdf(m) {
  const land = edt2d(m)
  const ocean = edt2d(m.map((x) => (x ? 0 : 1)))
  const s = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) s[i] = Math.sqrt(ocean[i]) - Math.sqrt(land[i]) // >0 = land
  return s
}

const sA = sdf(mask(await load('paleo-000.webp')))
const sB = sdf(mask(await load('paleo-fut250.webp')))
const LAND = [58, 92, 48], OCEAN = [74, 110, 135] // flat Scotese-ish palette

for (const t of [0.2, 0.4, 0.6, 0.8]) {
  const buf = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const c = (1 - t) * sA[i] + t * sB[i] > 0 ? LAND : OCEAN
    buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]
  }
  const name = `paleo-fut${String(Math.round(t * 250)).padStart(3, '0')}.webp`
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 84 }).toFile(new URL(name, out))
  console.log('✓', name)
}
console.log('Done — 4 morph frames (fut050…fut200). fut250 = Pangaea Proxima endpoint.')
