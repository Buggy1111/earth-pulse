/** The Moon and the naked-eye planets as look-angles from the observer, so the
 * Sky AR overlay can label "that bright dot is Jupiter" the same way it labels
 * satellites. The geocentric ephemerides already live in lib/moon + lib/planets;
 * here we just turn them into topocentric azimuth / elevation / range. */

import { EARTH_RADIUS_KM } from './satellites'
import { lookAngles, type LookAngles } from './arMath'
import { subLunarPoint } from './moon'
import { earthHelio, planetPositions } from './planets'
import { AU_KM, PROBE_INFO, probePosAu, type ProbeTraj } from './probes'

export interface SkyBody extends LookAngles {
  name: string
  /** Distinct dot colour for the overlay. */
  color: string
  /** Human distance, e.g. "384,000 km" (Moon) or "6.20 AU" (a planet). */
  distanceLabel: string
}

/** Greenwich mean sidereal time in degrees — the same low-precision model the
 * Moon and planet placement already use, so the sub-point longitudes line up. */
function gmstDeg(date: Date): number {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000
  return (280.46061837 + 360.98564736629 * d) % 360
}

const PLANET_COLOR: Record<string, string> = {
  mercury: '#c9b8a0',
  venus: '#f5e3a0',
  mars: '#f4724f',
  jupiter: '#e0b07a',
  saturn: '#f0dba0',
  uranus: '#9fe6dc',
  neptune: '#6f9bef',
  pluto: '#cdb7a6',
}

/** The Moon + planets currently above the observer's horizon, highest first.
 * A celestial body sits at its geocentric sub-point (lat = declination, lng =
 * RA − GMST) at its true distance, so the existing topocentric lookAngles() —
 * which already accounts for the observer's offset from Earth's centre — gives
 * the right azimuth/elevation (the Moon's ~1° parallax included). */
const RAD = Math.PI / 180

export function skyBodies(
  observer: { lat: number; lng: number },
  date: Date = new Date(),
  probes: ProbeTraj[] = [],
): SkyBody[] {
  const out: SkyBody[] = []

  const m = subLunarPoint(date)
  const moon = lookAngles(observer, { lat: m.lat, lng: m.lng, altKm: m.distanceKm - EARTH_RADIUS_KM })
  if (moon.elevationDeg > 0) {
    out.push({
      ...moon,
      name: 'Moon',
      color: '#e6e6ef',
      distanceLabel: `${Math.round(moon.rangeKm).toLocaleString('en-US')} km`,
    })
  }

  const gmst = gmstDeg(date)
  for (const p of planetPositions(date)) {
    let lng = p.raDeg - gmst
    lng = (((lng % 360) + 540) % 360) - 180
    const la = lookAngles(observer, { lat: p.decDeg, lng, altKm: p.distEarthAu * AU_KM - EARTH_RADIUS_KM })
    if (la.elevationDeg <= 0) continue
    out.push({
      ...la,
      name: p.name,
      color: PLANET_COLOR[p.id] ?? '#dcdcdc',
      distanceLabel: `${p.distEarthAu.toFixed(2)} AU`,
    })
  }

  // 🛰 deep-space probes — point your phone and find where Voyager really is.
  // Their geocentric direction comes from the baked heliocentric position minus
  // Earth's; the obliquity rotation takes ecliptic → equatorial like the planets.
  if (probes.length) {
    const eps = 23.439 * RAD
    const ce = Math.cos(eps)
    const se = Math.sin(eps)
    const [ex, ey, ez] = earthHelio(date)
    for (const t of probes) {
      const [px, py, pz] = probePosAu(t, date)
      const gx = px - ex
      const gy = py - ey
      const gz = pz - ez
      const dist = Math.hypot(gx, gy, gz)
      const ra = ((Math.atan2(gy * ce - gz * se, gx) / RAD) + 360) % 360
      const dec = Math.asin((gy * se + gz * ce) / dist) / RAD
      let lng = ra - gmst
      lng = (((lng % 360) + 540) % 360) - 180
      const la = lookAngles(observer, { lat: dec, lng, altKm: dist * AU_KM - EARTH_RADIUS_KM })
      if (la.elevationDeg <= 0) continue
      const info = PROBE_INFO[t.id]
      out.push({
        ...la,
        name: info?.name ?? t.id,
        color: info?.color ?? '#cbd5e1',
        distanceLabel: `${dist.toFixed(2)} AU`,
      })
    }
  }

  out.sort((a, b) => b.elevationDeg - a.elevationDeg)
  return out
}
