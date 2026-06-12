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
  /** Earth–Moon distance in km (356–407 thousand). */
  distanceKm: number
  /** Sun–Moon elongation in radians — drives the terminator on renders. */
  elongationRad: number
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
    distanceKm: 385_001 - 20_905 * Math.cos(M),
    elongationRad: elongation,
  }
}

export interface MoonPhases {
  nextFullMs: number
  nextNewMs: number
}

/** Next full and new moon, found by scanning illumination hourly for 31 days. */
export function nextMoonPhases(from: Date): MoonPhases {
  let nextFullMs = 0
  let nextNewMs = 0
  let prev = subLunarPoint(from).illumination
  let rising = subLunarPoint(new Date(from.getTime() + 3_600_000)).illumination > prev
  for (let h = 1; h <= 31 * 24 && (!nextFullMs || !nextNewMs); h++) {
    const t = from.getTime() + h * 3_600_000
    const ill = subLunarPoint(new Date(t)).illumination
    if (rising && ill < prev && !nextFullMs) nextFullMs = t - 1_800_000 // peak passed
    if (!rising && ill > prev && !nextNewMs) nextNewMs = t - 1_800_000 // trough passed
    rising = ill >= prev
    prev = ill
  }
  return { nextFullMs, nextNewMs }
}

export interface ApolloSite {
  mission: string
  year: number
  crew: string
  /** Selenographic coordinates (lat N+, lng E+). */
  lat: number
  lng: number
}

/** The six crewed landings — every place humans have stood beyond Earth. */
export const APOLLO_SITES: ApolloSite[] = [
  { mission: 'Apollo 11', year: 1969, crew: 'Armstrong & Aldrin', lat: 0.674, lng: 23.473 },
  { mission: 'Apollo 12', year: 1969, crew: 'Conrad & Bean', lat: -3.012, lng: -23.422 },
  { mission: 'Apollo 14', year: 1971, crew: 'Shepard & Mitchell', lat: -3.645, lng: -17.471 },
  { mission: 'Apollo 15', year: 1971, crew: 'Scott & Irwin', lat: 26.132, lng: 3.634 },
  { mission: 'Apollo 16', year: 1972, crew: 'Young & Duke', lat: -8.973, lng: 15.5 },
  { mission: 'Apollo 17', year: 1972, crew: 'Cernan & Schmitt', lat: 20.191, lng: 30.772 },
]

export function moonPhaseLabel(m: MoonState): string {
  if (m.illumination < 0.04) return 'new moon'
  if (m.illumination > 0.96) return 'full moon'
  return `${m.waxing ? 'waxing' : 'waning'} ${Math.round(m.illumination * 100)} %`
}
