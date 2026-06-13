// Builds public/tle/famous.txt — a hand-picked set of ~30 well-known satellites
// (the NASA "Eyes on the Earth" cast: stations, the great observatories and the
// Earth-observation fleet) keyed by stable NORAD catalog number. Celestrak's
// "active" group has them all in one request; we filter to the curated list and
// relabel with friendly names. Run: npm run fetch-famous
import { writeFile } from 'node:fs/promises'

// id = NORAD catalog number (stable), name = friendly label, cat = grouping
const FAMOUS = [
  { id: 25544, name: 'ISS', cat: 'station' },
  { id: 48274, name: 'Tiangong', cat: 'station' },
  { id: 20580, name: 'Hubble', cat: 'observatory' },
  { id: 33053, name: 'Fermi', cat: 'observatory' },
  { id: 25994, name: 'Terra', cat: 'earth' },
  { id: 27424, name: 'Aqua', cat: 'earth' },
  { id: 28376, name: 'Aura', cat: 'earth' },
  { id: 37849, name: 'Suomi NPP', cat: 'earth' },
  { id: 43013, name: 'NOAA-20', cat: 'weather' },
  { id: 54234, name: 'NOAA-21', cat: 'weather' },
  { id: 41866, name: 'GOES-16', cat: 'weather' },
  { id: 51850, name: 'GOES-18', cat: 'weather' },
  { id: 39084, name: 'Landsat 8', cat: 'earth' },
  { id: 49260, name: 'Landsat 9', cat: 'earth' },
  { id: 39634, name: 'Sentinel-1A', cat: 'earth' },
  { id: 40697, name: 'Sentinel-2A', cat: 'earth' },
  { id: 42063, name: 'Sentinel-2B', cat: 'earth' },
  { id: 41335, name: 'Sentinel-3A', cat: 'earth' },
  { id: 46984, name: 'Sentinel-6', cat: 'earth' },
  { id: 41240, name: 'Jason-3', cat: 'earth' },
  { id: 54754, name: 'SWOT', cat: 'earth' },
  { id: 43613, name: 'ICESat-2', cat: 'earth' },
  { id: 43476, name: 'GRACE-FO 1', cat: 'earth' },
  { id: 29108, name: 'CALIPSO', cat: 'earth' },
  { id: 40059, name: 'OCO-2', cat: 'earth' },
  { id: 27386, name: 'Envisat', cat: 'earth' },
  { id: 36605, name: 'TanDEM-X', cat: 'earth' },
  { id: 38337, name: 'GCOM-W1', cat: 'earth' },
]

const URL_ACTIVE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
const OUT = new URL('../public/tle/famous.txt', import.meta.url)

const resp = await fetch(URL_ACTIVE)
if (!resp.ok) {
  console.error(`Celestrak responded ${resp.status} ${resp.statusText}`)
  process.exit(1)
}
const lines = (await resp.text()).split('\n').map((l) => l.replace(/\r$/, ''))

// index every TLE by its NORAD number (digits 3–7 of line 1)
const byId = new Map()
for (let i = 0; i + 2 < lines.length; i++) {
  if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
    const id = Number(lines[i + 1].slice(2, 7))
    byId.set(id, [lines[i + 1], lines[i + 2]])
  }
}

const out = []
const missing = []
for (const sat of FAMOUS) {
  const tle = byId.get(sat.id)
  if (!tle) {
    missing.push(`${sat.name} (${sat.id})`)
    continue
  }
  // friendly NAME line, then the two element lines verbatim
  out.push(sat.name.padEnd(24), tle[0], tle[1])
}

if (out.length < 3 * 10) {
  console.error(`Only ${out.length / 3} sats matched — not overwriting`)
  process.exit(1)
}
await writeFile(OUT, out.join('\n') + '\n')
console.log(`Saved ${out.length / 3} famous TLE sets to public/tle/famous.txt`)
if (missing.length) console.warn(`Missing (decayed/renamed?): ${missing.join(', ')}`)
