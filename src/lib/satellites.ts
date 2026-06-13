/** Celestrak TLE parsing + local SGP4 propagation via satellite.js.
 *
 * The app ships a build-time TLE snapshot (public/tle/visual.txt, ~160
 * brightest satellites) and propagates positions locally — truly live motion
 * with zero runtime API calls. TLEs stay accurate for days.
 */

import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js'

export const TLE_LOCAL_URL = 'tle/famous.txt'

export interface TleSet {
  name: string
  line1: string
  line2: string
}

/** Parse classic 3-line TLE text (name + two element lines per satellite). */
export function parseTle(text: string): TleSet[] {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0)
  const out: TleSet[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, line1, line2] = [lines[i], lines[i + 1], lines[i + 2]]
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue
    out.push({ name: name.trim(), line1, line2 })
  }
  return out
}

export interface TrackedSat {
  /** NORAD catalog number — the ONLY unique key (names repeat: 8× "SL-8 R/B"…). */
  id: string
  name: string
  satrec: SatRec
}

/** The ISS rides in the TLE set too — its visual position comes from SGP4
 * (smooth, every frame) while live API telemetry feeds the HUD. */
export const ISS_NAME = 'ISS (ZARYA)'

export function isIss(name: string): boolean {
  // the curated set relabels it "ISS"; the raw Celestrak name is "ISS (ZARYA)"
  return name === 'ISS' || name.startsWith(ISS_NAME)
}

export function toTrackedSats(sets: TleSet[]): TrackedSat[] {
  const out: TrackedSat[] = []
  for (const s of sets) {
    try {
      const satrec = twoline2satrec(s.line1, s.line2)
      out.push({ id: String(satrec.satnum), name: s.name, satrec })
    } catch {
      // malformed element set — skip
    }
  }
  return out
}

export interface SatPos {
  id: string
  name: string
  lat: number
  lng: number
  altKm: number
}

/** Propagate all satellites to `date`. Decayed/erroring ones are dropped. */
export function propagateSats(sats: TrackedSat[], date: Date): SatPos[] {
  const gmst = gstime(date)
  const out: SatPos[] = []
  for (const s of sats) {
    try {
      const pv = propagate(s.satrec, date)
      if (!pv || typeof pv.position === 'boolean') continue
      const geo = eciToGeodetic(pv.position, gmst)
      if (!Number.isFinite(geo.height) || geo.height < 80) continue
      out.push({
        id: s.id,
        name: s.name,
        lat: degreesLat(geo.latitude),
        lng: degreesLong(geo.longitude),
        altKm: geo.height,
      })
    } catch {
      // SGP4 blow-up (decayed orbit) — drop the satellite
    }
  }
  return out
}

export interface TrackPoint {
  lat: number
  lng: number
  altKm: number
}

/** Orbital period in minutes straight from the element set (mean motion). */
export function orbitalPeriodMin(sat: TrackedSat): number {
  return (2 * Math.PI) / sat.satrec.no
}

/** The satellite's current orbit as a CLOSED ring.
 *
 * Samples exactly one orbital period but converts every ECI sample with the
 * single gmst of `date` — Earth's rotation is frozen, so the result is the
 * actual orbital plane as it is right now, and the ring meets itself. (A
 * ground track would spiral ~23° west per revolution and never close.) */
export function orbitTrack(sat: TrackedSat, date: Date, points = 128): TrackPoint[] {
  const gmst = gstime(date)
  const periodMs = orbitalPeriodMin(sat) * 60_000
  const out: TrackPoint[] = []
  for (let i = 0; i < points; i++) {
    const t = new Date(date.getTime() + (i / points) * periodMs)
    try {
      const pv = propagate(sat.satrec, t)
      if (!pv || typeof pv.position === 'boolean') continue
      const geo = eciToGeodetic(pv.position, gmst)
      if (!Number.isFinite(geo.height)) continue
      out.push({
        lat: degreesLat(geo.latitude),
        lng: degreesLong(geo.longitude),
        altKm: geo.height,
      })
    } catch {
      // skip points the propagator can't produce
    }
  }
  // guarantee closure (J2 drift over one revolution is < 0.3°, invisible)
  if (out.length > 1) out.push({ ...out[0] })
  return out
}

export const EARTH_RADIUS_KM = 6371

/** globe.gl altitude is in units of globe radius. */
export function globeAltitude(altKm: number): number {
  return altKm / EARTH_RADIUS_KM
}

const RAD = Math.PI / 180

function toEcef(lat: number, lng: number, altKm: number): [number, number, number] {
  const r = EARTH_RADIUS_KM + altKm
  const cl = Math.cos(lat * RAD)
  return [r * cl * Math.cos(lng * RAD), r * cl * Math.sin(lng * RAD), r * Math.sin(lat * RAD)]
}

/** Elevation of a satellite above an observer's horizon, in degrees.
 * Spherical Earth — plenty for pass prediction. */
export function elevationDeg(
  observer: { lat: number; lng: number },
  sat: { lat: number; lng: number; altKm: number },
): number {
  const o = toEcef(observer.lat, observer.lng, 0)
  const s = toEcef(sat.lat, sat.lng, sat.altKm)
  const range = [s[0] - o[0], s[1] - o[1], s[2] - o[2]]
  const rangeLen = Math.hypot(...range)
  const oLen = Math.hypot(...o)
  const dot = (range[0] * o[0] + range[1] * o[1] + range[2] * o[2]) / (rangeLen * oLen)
  return Math.asin(Math.min(Math.max(dot, -1), 1)) / RAD
}

export interface OverheadSat {
  id: string
  name: string
  elevationDeg: number
  altKm: number
}

/** Satellites currently above the observer's horizon, highest first —
 * "step outside and this is what's over your head". */
export function satsAbove(
  sats: TrackedSat[],
  observer: { lat: number; lng: number },
  date: Date,
  minElevation = 10,
): OverheadSat[] {
  const out: OverheadSat[] = []
  for (const p of propagateSats(sats, date)) {
    const el = elevationDeg(observer, p)
    if (el >= minElevation) {
      out.push({ id: p.id, name: p.name, elevationDeg: el, altKm: p.altKm })
    }
  }
  return out.sort((a, b) => b.elevationDeg - a.elevationDeg)
}

export interface IssPass {
  /** When the pass starts (sat climbs above `minElevation`), epoch ms. */
  startMs: number
  maxElevationDeg: number
}

/** First time `sat` rises above `minElevation`° over `observer` within the
 * next `lookaheadMin` minutes — "the ISS flies over you in …". */
export function nextPass(
  sat: TrackedSat,
  observer: { lat: number; lng: number },
  from: Date,
  lookaheadMin = 1_440,
  stepS = 30,
  minElevation = 10,
): IssPass | null {
  let start: number | null = null
  let maxEl = -90
  for (let s = 0; s <= lookaheadMin * 60; s += stepS) {
    const t = new Date(from.getTime() + s * 1000)
    const pos = propagateSats([sat], t)[0]
    if (!pos) continue
    const el = elevationDeg(observer, pos)
    if (el >= minElevation) {
      start ??= t.getTime()
      if (el > maxEl) maxEl = el
    } else if (start !== null) {
      return { startMs: start, maxElevationDeg: maxEl }
    }
  }
  return start !== null ? { startMs: start, maxElevationDeg: maxEl } : null
}
