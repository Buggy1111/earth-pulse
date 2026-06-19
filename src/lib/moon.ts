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

export interface LunarSite {
  mission: string
  operator: string
  year: number
  /** Selenographic coordinates (lat N+, lng E+, Mean-Earth frame). */
  lat: number
  lng: number
  /** Near side faces Earth; far-side sites sit on the hidden hemisphere. */
  side: 'near' | 'far'
  /** One-line significance. */
  note: string
  /** Present only for the six crewed Apollo landings. */
  crew?: string
}
/** Back-compat alias — the picked-site type flowed through as ApolloSite. */
export type ApolloSite = LunarSite

/** Every place we've reached on the Moon: the six crewed Apollo landings plus
 * the milestone robotic landers — including the two Chinese far-side firsts,
 * which sit on the hemisphere that never faces Earth. Coordinates cross-checked
 * against LRO/LROC; longitude east-positive. */
export const LUNAR_SITES: LunarSite[] = [
  // 🇺🇸 crewed — every place humans have stood beyond Earth (all near side)
  { mission: 'Apollo 11', operator: 'NASA', year: 1969, lat: 0.6742, lng: 23.4731, side: 'near', crew: 'Armstrong & Aldrin', note: 'first crewed Moon landing' },
  { mission: 'Apollo 12', operator: 'NASA', year: 1969, lat: -3.0124, lng: -23.4216, side: 'near', crew: 'Conrad & Bean', note: 'pinpoint landing beside Surveyor 3' },
  { mission: 'Apollo 14', operator: 'NASA', year: 1971, lat: -3.6459, lng: -17.4719, side: 'near', crew: 'Shepard & Mitchell', note: 'Fra Mauro highlands' },
  { mission: 'Apollo 15', operator: 'NASA', year: 1971, lat: 26.1322, lng: 3.6339, side: 'near', crew: 'Scott & Irwin', note: 'first lunar rover' },
  { mission: 'Apollo 16', operator: 'NASA', year: 1972, lat: -8.973, lng: 15.5002, side: 'near', crew: 'Young & Duke', note: 'Descartes highlands' },
  { mission: 'Apollo 17', operator: 'NASA', year: 1972, lat: 20.1911, lng: 30.7723, side: 'near', crew: 'Cernan & Schmitt', note: 'last crewed landing (so far)' },
  // 🇨🇳 China — the far-side firsts
  { mission: "Chang'e 4", operator: 'CNSA', year: 2019, lat: -45.4446, lng: 177.5991, side: 'far', note: 'first-ever soft landing on the far side — Von Kármán crater' },
  { mission: "Chang'e 6", operator: 'CNSA', year: 2024, lat: -41.6385, lng: -153.9852, side: 'far', note: 'first far-side sample return (2024)' },
  { mission: "Chang'e 3", operator: 'CNSA', year: 2013, lat: 44.1214, lng: -19.5116, side: 'near', note: "China's first soft landing (Yutu rover)" },
  { mission: "Chang'e 5", operator: 'CNSA', year: 2020, lat: 43.0617, lng: -51.9161, side: 'near', note: "China's first sample return" },
  // 🇮🇳 India — the south-polar pioneer
  { mission: 'Chandrayaan-3', operator: 'ISRO', year: 2023, lat: -69.3741, lng: 32.32, side: 'near', note: "India's first landing — near the south pole (2023)" },
  // ☭ Soviet robotic firsts
  { mission: 'Luna 9', operator: 'USSR', year: 1966, lat: 7.08, lng: -64.37, side: 'near', note: 'first-ever soft landing on the Moon' },
  { mission: 'Luna 16', operator: 'USSR', year: 1970, lat: -0.68, lng: 56.3, side: 'near', note: 'first robotic sample return' },
  { mission: 'Lunokhod 1', operator: 'USSR', year: 1970, lat: 38.24, lng: -35.0, side: 'near', note: 'first roving vehicle on another world' },
  // 🇺🇸 robotic
  { mission: 'Surveyor 3', operator: 'NASA', year: 1967, lat: -3.0163, lng: -23.418, side: 'near', note: 'later visited on foot by Apollo 12' },
  // 🚀 the new commercial wave
  { mission: 'Blue Ghost 1', operator: 'Firefly', year: 2025, lat: 18.562, lng: 61.81, side: 'near', note: 'first fully successful commercial landing (2025)' },
  { mission: 'IM-1 Odysseus', operator: 'Intuitive Machines', year: 2024, lat: -80.13, lng: 1.44, side: 'near', note: 'first commercial soft landing (2024)' },
]

/** The six crewed landings — kept as a named subset for the phase tests and any
 * "humans have stood here" copy. */
export const APOLLO_SITES: LunarSite[] = LUNAR_SITES.filter((s) => s.crew)

export function moonPhaseLabel(m: MoonState): string {
  if (m.illumination < 0.04) return 'new moon'
  if (m.illumination > 0.96) return 'full moon'
  return `${m.waxing ? 'waxing' : 'waning'} ${Math.round(m.illumination * 100)} %`
}
