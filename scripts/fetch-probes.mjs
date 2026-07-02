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
  { id: 'parker', name: 'Parker Solar Probe', h: '-96', fine: true },
  { id: 'solarorbiter', name: 'Solar Orbiter', h: '-144', fine: true },
  { id: 'bepicolombo', name: 'BepiColombo', h: '-121', fine: true },
  { id: 'juice', name: 'JUICE', h: '-28' },
  { id: 'europaclipper', name: 'Europa Clipper', h: '-159' },
  { id: 'psyche', name: 'Psyche', h: '-255' },
  { id: 'lucy', name: 'Lucy', h: '-49' },
  { id: 'hayabusa2', name: 'Hayabusa2', h: '-37', fine: true },
  { id: 'hera', name: 'Hera', h: '-658030' },
]

// Each spacecraft's HORIZONS trajectory is only valid over its published SPK
// span — decades for the Voyagers, a few months for an active mission. So we
// try windows widest-first and keep the first that resolves AND covers today.
// Windows are RELATIVE to "now" so a scheduled re-bake always brackets the
// current moment (a short-coverage craft can't drift out the back).
function isoOffset(months) {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
const WINDOWS = [
  { start: isoOffset(-12), stop: isoOffset(24), step: 3 }, // −1 yr … +2 yr
  { start: isoOffset(-6), stop: isoOffset(12), step: 2 }, // −6 mo … +1 yr
  { start: isoOffset(-3), stop: isoOffset(6), step: 1 }, // −3 mo … +6 mo
  { start: isoOffset(-1), stop: isoOffset(3), step: 1 }, // −1 mo … +3 mo (narrow)
]

// Inner-system craft move FAST near perihelion (Parker peaks ~190 km/s) — a
// 3-day linear interpolation there cuts corners by millions of km. Probes
// flagged `fine` try a 12-hour grid first and only then the coarse windows.
const FINE_WINDOW = { start: isoOffset(-6), stop: isoOffset(12), step: 0.5 }

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
    // HORIZONS wants an integer step — sub-day grids go as hours
    STEP_SIZE: w.step < 1 ? `'${Math.round(w.step * 24)} h'` : `'${w.step} d'`,
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
  // HORIZONS numbers are scientific notation with SIGNED exponents. The old
  // class [\d.E+] had no '-' inside the number, so a near-ecliptic Z like
  // 3.4E-02 captured as "3.4E" → NaN → null in the JSON — Europa Clipper,
  // Psyche and Lucy shipped with EVERY Z coordinate null (rendered as 0,
  // silently coerced, pinned to the ecliptic plane).
  const NUM = '(-?[\\d.]+(?:E[+-]?\\d+)?)'
  const XYZ_RE = new RegExp(`X\\s*=\\s*${NUM}\\s+Y\\s*=\\s*${NUM}\\s+Z\\s*=\\s*${NUM}`)
  for (let i = 0; i < lines.length; i++) {
    const jdMatch = lines[i].match(/^\s*([\d.]+)\s*=\s*A\.D\./)
    if (!jdMatch) continue
    const xyz = lines[i + 1]?.match(XYZ_RE)
    if (!xyz) continue
    const [x, y, z] = [round(xyz[1]), round(xyz[2]), round(xyz[3])]
    // one bad sample would break index-based interpolation (samples must stay
    // evenly spaced) — reject the whole window and let the retry loop move on
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
    if (jd0 === null) jd0 = Number(jdMatch[1])
    pos.push(x, y, z)
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
  for (const w of p.fine ? [FINE_WINDOW, ...WINDOWS] : WINDOWS) {
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
