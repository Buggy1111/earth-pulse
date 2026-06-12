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

export const TLE_LOCAL_URL = 'tle/visual.txt'

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
  return name.startsWith(ISS_NAME)
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
