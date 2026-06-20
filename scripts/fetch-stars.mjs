// Bakes the real naked-eye sky from the HYG database (astronexus, CC BY-SA 4.0)
// into public/stars/stars.json: every star to magnitude 6.5 (~8.9k) as a unit
// direction in the J2000 EQUATORIAL frame (+X = vernal equinox, +Z = north
// celestial pole) plus its magnitude and B–V colour index, and a named subset
// with real distances for labels. Run: npm run fetch-stars
import { mkdir, writeFile } from 'node:fs/promises'

const CSV = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
const MAG_LIMIT = 6.5 // naked-eye limit
const PC_TO_LY = 3.261564

const resp = await fetch(CSV)
if (!resp.ok) {
  console.error(`HYG responded ${resp.status} ${resp.statusText}`)
  process.exit(1)
}
const text = await resp.text()
const lines = text.split('\n')
const unquote = (s) => s.replace(/^"|"$/g, '')
const head = lines[0].split(',').map(unquote)
const col = (name) => head.indexOf(name)
const cRa = col('ra')
const cDec = col('dec')
const cDist = col('dist')
const cMag = col('mag')
const cCi = col('ci')
const cProper = col('proper')
const cX = col('x')
const cY = col('y')
const cZ = col('z')
if ([cRa, cDec, cMag, cX, cY, cZ].some((i) => i < 0)) {
  console.error('Unexpected HYG header layout')
  process.exit(1)
}

const r5 = (n) => Math.round(n * 1e5) / 1e5
const r2 = (n) => Math.round(n * 100) / 100

const data = [] // flat [x, y, z, mag, ci, …] unit-vector directions (equatorial)
const named = [] // { n, x, y, z, m, d } for stars with a proper name
let count = 0
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split(',')
  if (f.length < head.length) continue
  const mag = Number(f[cMag])
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue
  let x = Number(f[cX])
  let y = Number(f[cY])
  let z = Number(f[cZ])
  const len = Math.hypot(x, y, z)
  if (!len) continue // Sol (id 0) sits at the origin — skip it
  x /= len
  y /= len
  z /= len
  const ci = Number(f[cCi])
  data.push(r5(x), r5(y), r5(z), r2(mag), Number.isFinite(ci) ? r2(ci) : 0)
  count++
  const proper = unquote(f[cProper] ?? '')
  if (proper) {
    const distPc = Number(f[cDist])
    named.push({
      n: proper,
      x: r5(x),
      y: r5(y),
      z: r5(z),
      m: r2(mag),
      d: Number.isFinite(distPc) && distPc < 99999 ? Math.round(distPc * PC_TO_LY) : 0,
    })
  }
}

if (count < 1000) {
  console.error(`Only ${count} stars parsed — not writing.`)
  process.exit(1)
}
await mkdir(new URL('../public/stars/', import.meta.url), { recursive: true })
await writeFile(new URL('../public/stars/stars.json', import.meta.url), JSON.stringify({ data, named }))
console.log(`Saved ${count} stars (${named.length} named) to public/stars/stars.json`)
