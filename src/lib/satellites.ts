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
  name: string
  satrec: SatRec
}

/** ISS has its own live-telemetry marker — skip its TLE twin. */
const ISS_NAME = /^ISS \(ZARYA\)/

export function toTrackedSats(sets: TleSet[]): TrackedSat[] {
  const out: TrackedSat[] = []
  for (const s of sets) {
    if (ISS_NAME.test(s.name)) continue
    try {
      out.push({ name: s.name, satrec: twoline2satrec(s.line1, s.line2) })
    } catch {
      // malformed element set — skip
    }
  }
  return out
}

export interface SatPos {
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

/** Ground/orbit track for one satellite: ±`spanMin`/2 minutes around `date`,
 * one point per `stepSec`. Powers the click-to-show orbit trail. */
export function orbitTrack(
  sat: TrackedSat,
  date: Date,
  spanMin = 94,
  stepSec = 60,
): TrackPoint[] {
  const out: TrackPoint[] = []
  const half = (spanMin * 60_000) / 2
  for (let ms = -half; ms <= half; ms += stepSec * 1000) {
    const t = new Date(date.getTime() + ms)
    try {
      const pv = propagate(sat.satrec, t)
      if (!pv || typeof pv.position === 'boolean') continue
      const geo = eciToGeodetic(pv.position, gstime(t))
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
  return out
}

export const EARTH_RADIUS_KM = 6371

/** globe.gl altitude is in units of globe radius. */
export function globeAltitude(altKm: number): number {
  return altKm / EARTH_RADIUS_KM
}
