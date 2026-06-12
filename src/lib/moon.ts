/** Sub-lunar point and lunar phase — low-precision Meeus-style ephemeris,
 * good to ~1° (plenty for placing a moon on the sky and a phase readout). */

const RAD = Math.PI / 180

export interface MoonState {
  /** Point on Earth where the Moon is directly overhead. */
  lat: number
  lng: number
  /** Illuminated fraction 0 (new) … 1 (full). */
  illumination: number
  waxing: boolean
}

export function subLunarPoint(date: Date): MoonState {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000

  // mean elements (degrees)
  const L = 218.316 + 13.176396 * d // mean longitude
  const M = (134.963 + 13.064993 * d) * RAD // mean anomaly
  const F = (93.272 + 13.22935 * d) * RAD // argument of latitude

  const lon = (L + 6.289 * Math.sin(M)) * RAD // ecliptic longitude
  const lat = 5.128 * Math.sin(F) * RAD // ecliptic latitude

  // ecliptic -> equatorial
  const eps = (23.439 - 0.0000004 * d) * RAD
  const ra = Math.atan2(
    Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps),
    Math.cos(lon),
  )
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon),
  )

  // sub-lunar longitude = RA - GMST
  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  let lng = ra / RAD - gmst
  lng = ((lng % 360) + 540) % 360 - 180

  // phase from elongation against the mean Sun
  const sunLon = (280.46 + 0.9856474 * d) * RAD
  const elongation = lon - sunLon
  const illumination = (1 - Math.cos(elongation)) / 2

  return {
    lat: dec / RAD,
    lng,
    illumination,
    waxing: Math.sin(elongation) > 0,
  }
}

export function moonPhaseLabel(m: MoonState): string {
  if (m.illumination < 0.04) return 'new moon'
  if (m.illumination > 0.96) return 'full moon'
  return `${m.waxing ? 'waxing' : 'waning'} ${Math.round(m.illumination * 100)} %`
}
