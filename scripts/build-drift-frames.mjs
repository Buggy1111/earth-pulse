// Builds the Drift-mode globe frames public/planets/paleo/*.webp from the raw
// sources in scripts/paleo-src/ — one consistent, clean look for every frame.
// Run: npm run build-drift   (after npm run fetch-paleo, or with the committed sources)
//
// What it does to each Scotese PALEOMAP frame (0…340 Ma, CC-BY-4.0):
//   1. upsamples to 2048×1024 and classifies every pixel as deep ocean, shallow
//      sea, land or "ink" (the black modern-coastline / border overlay);
//   2. paints the ink away (iterative inpaint from its neighbours) — the maps
//      no longer carry today's coastlines scribbled across Pangaea;
//   3. repaints the oceans with one bathymetric palette driven by distance to
//      the coast, so the old flat-blue frames and the detailed recent ones match.
// The projected future (today → +250 My Pangaea Proxima, CC-BY-SA 4.0) is an
// SDF morph of the land masks (as before), now given relief and climate-aware
// colours (green coasts → arid supercontinent interior) instead of flat fills.
// Writes a 2048 set (desktop) to paleo/ and a 1024 set (phones) to paleo/sd/.
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SRC = new URL('./paleo-src/', import.meta.url)
const OUT = new URL('../public/planets/paleo/', import.meta.url)
const OUT_SD = new URL('../public/planets/paleo/sd/', import.meta.url)
const W = 2048
const H = 1024
const N = W * H

const raw = async (input, w, h, opts) =>
  (await sharp(input, opts).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer()).valueOf()
const srcPath = (name) => fileURLToPath(new URL(name, SRC))
/** Source frame → ink removed at native 1024×512 → upsampled to 2048×1024. */
async function load(name) {
  const lo = Float32Array.from(await raw(srcPath(name), 1024, 512))
  removeInk(lo, 1024, 512)
  const buf = Buffer.from(Uint8ClampedArray.from(lo))
  return raw(buf, W, H, { raw: { width: 1024, height: 512, channels: 3 } })
}

// ── distance transform (Felzenszwalb) ────────────────────────────────────────
const INF = 1e12
const M = Math.max(W, H)
const f = new Float64Array(M), d = new Float64Array(M), v = new Int32Array(M), z = new Float64Array(M + 1)
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
/** Euclidean distance (px) from every pixel to the nearest pixel where seed[i]. */
function distanceTo(seed) {
  const dist = new Float64Array(N)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = seed[y * W + x] ? 0 : INF
    edt1d(H)
    for (let y = 0; y < H; y++) dist[y * W + x] = d[y]
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = dist[y * W + x]
    edt1d(W)
    for (let x = 0; x < W; x++) dist[y * W + x] = Math.sqrt(d[x])
  }
  return dist
}

// ── 3-D value noise on the sphere (no seam at the date line) ─────────────────
const hash = (x, y, z) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
const smooth = (t) => t * t * (3 - 2 * t)
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi)
  const l = (a, b, t) => a + (b - a) * t
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  )
}
function fbm(x, y, z, oct = 6) {
  let a = 0.5, s = 0, fq = 1
  for (let o = 0; o < oct; o++) { s += a * noise3(x * fq, y * fq, z * fq); fq *= 2.03; a *= 0.5 }
  return s
}
const sphere = new Float32Array(N * 3)
for (let y = 0; y < H; y++) {
  const lat = (0.5 - (y + 0.5) / H) * Math.PI
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 2 * Math.PI
    const i = (y * W + x) * 3
    sphere[i] = Math.cos(lat) * Math.cos(lon)
    sphere[i + 1] = Math.sin(lat)
    sphere[i + 2] = Math.cos(lat) * Math.sin(lon)
  }
}
// fine grain shared by every frame so ocean texture doesn't "boil" in playback
const grain = new Float32Array(N)
for (let i = 0; i < N; i++) grain[i] = fbm(sphere[i * 3] * 9 + 11, sphere[i * 3 + 1] * 9, sphere[i * 3 + 2] * 9, 4)

// ── palette ───────────────────────────────────────────────────────────────────
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (t) => Math.min(1, Math.max(0, t))
const SHALLOW_NEAR = [50, 138, 156] // epicontinental / shelf sea, at the shore
const SHALLOW_FAR = [30, 100, 136]
const SLOPE = [22, 78, 118] // just past the shelf edge
const DEEP = [10, 38, 74]
const ABYSS = [5, 20, 46]

const DEEP_C = 0, SHALLOW_C = 1, LAND_C = 2

/** Land / shallow sea / deep ocean, from a clean (ink-free) 2048 frame. */
function classify(rgb) {
  const cls = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
    if (b > r + 25 && b >= g - 6) cls[i] = r > 85 && g > 140 ? SHALLOW_C : DEEP_C
    else cls[i] = LAND_C
  }
  return cls
}

/** Remove the thin dark line overlay (modern coastlines, borders, graticule)
 * from a native 1024×512 source: a black top-hat (grey closing minus the image)
 * finds features thinner than the 5×5 window that are much darker than their
 * surroundings; those pixels are then filled from their neighbours, outside-in. */
function removeInk(rgb, w, h) {
  const n = w * h
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) lum[i] = 0.3 * rgb[i * 3] + 0.59 * rgb[i * 3 + 1] + 0.11 * rgb[i * 3 + 2]
  const morph = (src, op, r) => {
    const tmp = new Float32Array(n), out = new Float32Array(n)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = src[y * w + x]
        for (let k = -r; k <= r; k++) m = op(m, src[y * w + ((x + k + w) % w)])
        tmp[y * w + x] = m
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = tmp[y * w + x]
        for (let k = -r; k <= r; k++) m = op(m, tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x])
        out[y * w + x] = m
      }
    return out
  }
  const closed = morph(morph(lum, Math.max, 2), Math.min, 2)
  const ink = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const top = closed[i] - lum[i]
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
    const mx = Math.max(r, g, b), chroma = mx - Math.min(r, g, b)
    // greyish dark strokes, or anything far darker than its neighbourhood —
    // but not the coloured hillshade of the terrain itself
    if ((top > 18 && chroma < 26 && mx < 110) || top > 42) ink[i] = 1
  }
  // grow by one pixel to catch the anti-aliased fringe
  const grown = ink.slice()
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (ink[i]) continue
      if (ink[y * w + ((x + 1) % w)] || ink[y * w + ((x + w - 1) % w)] || (y > 0 && ink[i - w]) || (y < h - 1 && ink[i + w]))
        if (closed[i] - lum[i] > 8) grown[i] = 1
    }
  for (let pass = 0; pass < 30; pass++) {
    let left = 0
    const next = grown.slice()
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (!grown[i]) continue
        let sr = 0, sg = 0, sb = 0, c = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const j = yy * w + ((x + dx + w) % w)
            if (grown[j]) continue
            sr += rgb[j * 3]; sg += rgb[j * 3 + 1]; sb += rgb[j * 3 + 2]; c++
          }
        }
        if (!c) { left++; continue }
        rgb[i * 3] = sr / c; rgb[i * 3 + 1] = sg / c; rgb[i * 3 + 2] = sb / c
        next[i] = 0
      }
    grown.set(next)
    if (!left) break
  }
  return rgb
}

/** Repaint every water pixel with the shared bathymetric palette. */
function paintOcean(cls, rgb) {
  const toLand = distanceTo(cls.map((c) => (c === LAND_C ? 1 : 0)))
  const toShelf = distanceTo(cls.map((c) => (c !== DEEP_C ? 1 : 0)))
  const isWater = (c) => c !== LAND_C
  for (let i = 0; i < N; i++) {
    if (!isWater(cls[i])) continue
    const gr = (grain[i] - 0.5) * 0.18
    let c
    if (cls[i] === SHALLOW_C) c = mix(SHALLOW_NEAR, SHALLOW_FAR, clamp01(toLand[i] / 40 + gr))
    else {
      const t = toShelf[i] / W // 0 at the shelf edge → ~0.1 far out
      c = t < 0.012 ? mix(SLOPE, DEEP, t / 0.012) : mix(DEEP, ABYSS, clamp01((t - 0.012) / 0.07))
      c = mix(c, DEEP, clamp01(gr + 0.05))
    }
    // a soft surf line where water meets land
    const surf = clamp01(1 - toLand[i] / 2.5) * 0.18
    rgb[i * 3] = c[0] + (150 - c[0]) * surf
    rgb[i * 3 + 1] = c[1] + (205 - c[1]) * surf
    rgb[i * 3 + 2] = c[2] + (210 - c[2]) * surf
  }
  // soften the stair-stepped shelf edges inherited from the 1024 px sources:
  // a 7×7 box blur over water only (land never bleeds into the sea)
  const R = 3
  const src = rgb.slice()
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!isWater(cls[i])) continue
      let sr = 0, sg = 0, sb = 0, n = 0
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy))
        for (let dx = -R; dx <= R; dx++) {
          const j = yy * W + ((x + dx + W) % W)
          if (!isWater(cls[j])) continue
          sr += src[j * 3]; sg += src[j * 3 + 1]; sb += src[j * 3 + 2]; n++
        }
      }
      rgb[i * 3] = sr / n; rgb[i * 3 + 1] = sg / n; rgb[i * 3 + 2] = sb / n
    }
}

// ── synthetic land for the projected future ──────────────────────────────────
const COAST = [70, 112, 58], PLAIN = [112, 128, 72], STEPPE = [156, 140, 92], DESERT = [196, 160, 108]
const HIGHLAND = [124, 96, 70], ICE = [236, 240, 244]
function paintFutureLand(land, rgb) {
  const toSea = distanceTo(land.map((x) => (x ? 0 : 1)))
  const h = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue
    const s = sphere.subarray(i * 3, i * 3 + 3)
    const ridge = 1 - Math.abs(fbm(s[0] * 3.2 + 5, s[1] * 3.2, s[2] * 3.2, 5) * 2 - 1) // mountain belts
    h[i] = 0.45 * clamp01(toSea[i] / 60) + 0.35 * ridge ** 3 + 0.2 * fbm(s[0] * 14, s[1] * 14, s[2] * 14, 5)
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!land[i]) continue
      const lat = Math.abs(0.5 - (y + 0.5) / H) * 180
      const inland = clamp01((toSea[i] - 60) / 160) // supercontinent interiors dry out
      let c = mix(COAST, PLAIN, clamp01(toSea[i] / 70))
      c = mix(c, STEPPE, clamp01(inland * 1.6))
      c = mix(c, DESERT, clamp01((inland - 0.45) * 2.2) * clamp01(1 - Math.abs(lat - 25) / 30))
      c = mix(c, HIGHLAND, clamp01((h[i] - 0.55) * 3))
      if (lat > 68) c = mix(c, ICE, clamp01((lat - 68) / 8))
      // hillshade, light from the north-west
      const e = y * W + ((x + 1) % W), wv = y * W + ((x + W - 1) % W)
      const n = Math.max(0, y - 1) * W + x, s = Math.min(H - 1, y + 1) * W + x
      const shade = clamp01(0.82 + ((h[wv] - h[e]) + (h[n] - h[s])) * 6)
      rgb[i * 3] = c[0] * shade; rgb[i * 3 + 1] = c[1] * shade; rgb[i * 3 + 2] = c[2] * shade
    }
}

async function save(rgb, name) {
  const buf = Buffer.from(Uint8ClampedArray.from(rgb))
  const img = sharp(buf, { raw: { width: W, height: H, channels: 3 } })
  const hd = await img.clone().blur(0.7).webp({ quality: 80, effort: 5 }).toBuffer()
  const sd = await img.clone().resize(1024, 512, { kernel: 'lanczos3' }).webp({ quality: 82, effort: 5 }).toBuffer()
  await writeFile(new URL(name, OUT), hd)
  await writeFile(new URL(name, OUT_SD), sd)
  return hd.length + sd.length
}

// ── main ──────────────────────────────────────────────────────────────────────
await mkdir(OUT_SD, { recursive: true })
const only = process.argv[2] // optional: build a single frame, e.g. paleo-340
let bytes = 0
const past = (await readdir(SRC)).filter((n) => /^paleo-\d{3}\.webp$/.test(n)).sort()
let todayCls = null
for (const name of past) {
  if (only && !name.startsWith(only) && name !== 'paleo-000.webp') continue
  const img = await load(name)
  const rgb = Float32Array.from(img)
  const cls = classify(img)
  paintOcean(cls, rgb)
  if (name === 'paleo-000.webp') todayCls = cls
  if (!only || name.startsWith(only)) {
    bytes += await save(rgb, name)
    console.log('✓', name)
  }
}

// future: SDF morph of today's land mask into Pangaea Proxima
if (!only || only.startsWith('paleo-fut')) {
  const sdf = (land) => {
    const toLand = distanceTo(land)
    const toSea = distanceTo(land.map((x) => (x ? 0 : 1)))
    const s = new Float64Array(N)
    for (let i = 0; i < N; i++) s[i] = toSea[i] - toLand[i] // > 0 = land
    return s
  }
  const proxima = await raw(srcPath('paleo-fut250.webp'), W, H)
  const proximaLand = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const r = proxima[i * 3], g = proxima[i * 3 + 1], b = proxima[i * 3 + 2]
    proximaLand[i] = g > b + 4 && g > r ? 1 : 0 // green land; blue-grey sea + grey graticule = sea
  }
  // clean the graticule speckle out of the endpoint mask (open → close, 2 px)
  const sA = sdf(todayCls.map((c) => (c === LAND_C ? 1 : 0)))
  const sB0 = sdf(proximaLand)
  const sB = sB0.map((x) => x - 0.5)
  for (const k of [1, 2, 3, 4, 5]) {
    const t = k / 5
    const land = new Uint8Array(N)
    for (let i = 0; i < N; i++) land[i] = (1 - t) * sA[i] + t * sB[i] > 0 ? 1 : 0
    const rgb = new Float32Array(N * 3)
    const cls = land.map((x) => (x ? LAND_C : DEEP_C))
    // a narrow continental shelf around every coast
    const toLand = distanceTo(land)
    for (let i = 0; i < N; i++) if (!land[i] && toLand[i] < 14) cls[i] = SHALLOW_C
    paintFutureLand(land, rgb)
    paintOcean(cls, rgb)
    const name = `paleo-fut${String(k * 50).padStart(3, '0')}.webp`
    bytes += await save(rgb, name)
    console.log('✓', name)
  }
}
console.log(`Done — ${Math.round(bytes / 1024)} KB written (hd + sd).`)
