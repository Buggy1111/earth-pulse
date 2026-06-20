// Bakes heliocentric-ecliptic trajectories for the deep-space probes from NASA
// JPL HORIZONS into public/probes/probes.json. The probes fly engineered paths
// with no closed-form solution, so — like the satellite TLEs — we ship a
// build-time snapshot and the app interpolates it for a live-ish position.
// Coordinates are in the SAME frame as lib/planets (heliocentric ecliptic AU),
// so probes drop straight into the solar-system scene next to the planets.
// Run: npm run fetch-probes
import { mkdir, writeFile } from 'node:fs/promises'

// HORIZONS spacecraft ids are negative. Chinese craft (Tianwen-2) aren't in
// HORIZONS, so they're omitted; anything that fails to resolve is skipped.
const PROBES = [
  { id: 'voyager1', name: 'Voyager 1', h: '-31' },
  { id: 'voyager2', name: 'Voyager 2', h: '-32' },
  { id: 'newhorizons', name: 'New Horizons', h: '-98' },
  { id: 'parker', name: 'Parker Solar Probe', h: '-96' },
  { id: 'solarorbiter', name: 'Solar Orbiter', h: '-144' },
  { id: 'bepicolombo', name: 'BepiColombo', h: '-121' },
  { id: 'juice', name: 'JUICE', h: '-28' },
  { id: 'europaclipper', name: 'Europa Clipper', h: '-159' },
  { id: 'psyche', name: 'Psyche', h: '-255' },
  { id: 'lucy', name: 'Lucy', h: '-49' },
  { id: 'hayabusa2', name: 'Hayabusa2', h: '-37' },
  { id: 'hera', name: 'Hera', h: '-658030' },
]

// Each spacecraft's HORIZONS trajectory is only valid over its published SPK
// span — decades for the Voyagers, a few months for an active mission like
// Parker. So we try windows widest-first and keep the first that resolves: the
// long-lived probes get a long trail, the short-coverage ones still appear.
const WINDOWS = [
  { start: '2025-06-01', stop: '2028-06-01', step: 3 }, // 3 yr (Voyagers, cruisers)
  { start: '2026-01-01', stop: '2027-07-01', step: 2 }, // 1.5 yr
  { start: '2026-03-15', stop: '2026-12-15', step: 1 }, // 9 mo
  { start: '2026-05-01', stop: '2026-08-15', step: 1 }, // 3.5 mo (narrow coverage)
]

function horizonsUrl(h, w) {
  const q = {
    format: 'text',
    COMMAND: `'${h}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'@sun'",
    REF_PLANE: "'ECLIPTIC'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'1'",
    START_TIME: `'${w.start}'`,
    STOP_TIME: `'${w.stop}'`,
    STEP_SIZE: `'${w.step} d'`,
  }
  const qs = Object.entries(q)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${qs}`
}

/** Pull the $$SOE…$$EOE block and parse { jd0, stepDays, flat xyz }. */
function parseVectors(text, stepDays) {
  const soe = text.indexOf('$$SOE')
  const eoe = text.indexOf('$$EOE')
  if (soe < 0 || eoe < 0) return null
  const lines = text.slice(soe + 5, eoe).trim().split('\n')
  let jd0 = null
  const pos = []
  for (let i = 0; i < lines.length; i++) {
    const jdMatch = lines[i].match(/^\s*([\d.]+)\s*=\s*A\.D\./)
    if (!jdMatch) continue
    const xyz = lines[i + 1]?.match(/X\s*=\s*(-?[\d.E+]+)\s+Y\s*=\s*(-?[\d.E+]+)\s+Z\s*=\s*(-?[\d.E+]+)/)
    if (!xyz) continue
    if (jd0 === null) jd0 = Number(jdMatch[1])
    pos.push(round(xyz[1]), round(xyz[2]), round(xyz[3]))
  }
  if (jd0 === null || pos.length < 30) return null
  return { jd0, stepDays, pos }
}

const round = (s) => Math.round(Number(s) * 1e6) / 1e6

// only keep a trajectory that actually covers "now" — some craft (e.g. JUICE)
// only have a future SPK arc in HORIZONS, which would freeze them at a stale
// spot. A window can "resolve" with real vectors that still miss today.
const NOW_JD = Date.now() / 86_400_000 + 2_440_587.5
function coversNow(parsed) {
  const end = parsed.jd0 + (parsed.pos.length / 3 - 1) * parsed.stepDays
  return NOW_JD >= parsed.jd0 - 10 && NOW_JD <= end + 10
}

const out = []
for (const p of PROBES) {
  let got = null
  for (const w of WINDOWS) {
    try {
      const resp = await fetch(horizonsUrl(p.h, w))
      if (!resp.ok) continue
      const parsed = parseVectors(await resp.text(), w.step)
      if (parsed && coversNow(parsed)) {
        got = parsed
        break
      }
    } catch {
      // network hiccup on this window — try the next one
    }
  }
  if (got) {
    out.push({ id: p.id, name: p.name, ...got })
    console.log(`✓ ${p.name.padEnd(20)} ${got.pos.length / 3} samples (${got.stepDays}d step)`)
  } else {
    console.warn(`✗ ${p.name.padEnd(20)} skipped (no HORIZONS coverage)`)
  }
}

if (out.length === 0) {
  console.error('No probes resolved — not writing.')
  process.exit(1)
}
await mkdir(new URL('../public/probes/', import.meta.url), { recursive: true })
await writeFile(new URL('../public/probes/probes.json', import.meta.url), JSON.stringify(out))
console.log(`\nSaved ${out.length} probe trajectories to public/probes/probes.json`)
