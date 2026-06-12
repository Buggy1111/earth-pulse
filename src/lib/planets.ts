/** Planetary positions from JPL's "Keplerian elements for approximate
 * positions" (valid 1800–2050, good to arcminutes — plenty for an orrery).
 * Pure math: heliocentric Kepler solve → geocentric equatorial RA/Dec.
 */

const RAD = Math.PI / 180

/** a(au), e, I(deg), L(deg), longPeri(deg), longNode(deg) + per-century rates. */
type Elements = [number, number, number, number, number, number]

interface PlanetDef {
  id: string
  name: string
  el: Elements
  rate: Elements
  /** Real equatorial diameter, km. */
  diameterKm: number
  /** Display radius in scene units (stylized, not to scale). */
  displayRadius: number
  texture: string
}

export const PLANETS: PlanetDef[] = [
  { id: 'mercury', name: 'Mercury', diameterKm: 4_879, displayRadius: 9, texture: 'planets/mercury.jpg',
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  { id: 'venus', name: 'Venus', diameterKm: 12_104, displayRadius: 15, texture: 'planets/venus_atmosphere.jpg',
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  { id: 'mars', name: 'Mars', diameterKm: 6_779, displayRadius: 12, texture: 'planets/mars.jpg',
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  { id: 'jupiter', name: 'Jupiter', diameterKm: 139_820, displayRadius: 42, texture: 'planets/jupiter.jpg',
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  { id: 'saturn', name: 'Saturn', diameterKm: 116_460, displayRadius: 36, texture: 'planets/saturn.jpg',
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  { id: 'uranus', name: 'Uranus', diameterKm: 50_724, displayRadius: 24, texture: 'planets/uranus.jpg',
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  { id: 'neptune', name: 'Neptune', diameterKm: 49_244, displayRadius: 23, texture: 'planets/neptune.jpg',
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
]

const EARTH: { el: Elements; rate: Elements } = {
  el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
  rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
}

function centuriesSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (86_400_000 * 36_525)
}

/** Heliocentric ecliptic position in AU. */
function helio(el: Elements, rate: Elements, T: number): [number, number, number] {
  const a = el[0] + rate[0] * T
  const e = el[1] + rate[1] * T
  const I = (el[2] + rate[2] * T) * RAD
  const L = el[3] + rate[3] * T
  const lp = el[4] + rate[4] * T
  const ln = el[5] + rate[5] * T
  const omega = (lp - ln) * RAD
  const node = ln * RAD
  let M = (((L - lp) % 360) + 540) % 360 - 180
  M *= RAD
  // Kepler: E - e sinE = M (Newton, converges in a few steps for e < 0.21)
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-8) break
  }
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const [cw, sw] = [Math.cos(omega), Math.sin(omega)]
  const [cn, sn] = [Math.cos(node), Math.sin(node)]
  const [ci, si] = [Math.cos(I), Math.sin(I)]
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

export interface PlanetPos {
  id: string
  name: string
  /** Geocentric equatorial — same convention as the Sun/Moon placement. */
  raDeg: number
  decDeg: number
  /** True distances in AU. */
  distEarthAu: number
  distSunAu: number
}

/** All planets, geocentric, for `date`. */
export function planetPositions(date: Date): PlanetPos[] {
  const T = centuriesSinceJ2000(date)
  const e = helio(EARTH.el, EARTH.rate, T)
  const eps = (23.439 - 0.0000004 * (T * 36_525)) * RAD
  return PLANETS.map((p) => {
    const h = helio(p.el, p.rate, T)
    const g: [number, number, number] = [h[0] - e[0], h[1] - e[1], h[2] - e[2]]
    // ecliptic -> equatorial
    const xe = g[0]
    const ye = g[1] * Math.cos(eps) - g[2] * Math.sin(eps)
    const ze = g[1] * Math.sin(eps) + g[2] * Math.cos(eps)
    const distEarthAu = Math.hypot(...g)
    return {
      id: p.id,
      name: p.name,
      raDeg: ((Math.atan2(ye, xe) / RAD) + 360) % 360,
      decDeg: Math.asin(ze / distEarthAu) / RAD,
      distEarthAu,
      distSunAu: Math.hypot(...h),
    }
  })
}

/** Sub-planet point on Earth (like subsolar/sublunar) for scene placement.
 * Works for anything with equatorial RA/Dec (incl. the ecliptic pole). */
export function subPlanetPoint(
  p: { raDeg: number; decDeg: number },
  date: Date,
): { lat: number; lng: number } {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000
  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  let lng = p.raDeg - gmst
  lng = ((lng % 360) + 540) % 360 - 180
  return { lat: p.decDeg, lng }
}

/** Compressed scene distance: 1 AU = 900 units (where the Sun already sits),
 * outer planets pulled in by a power law so Neptune still fits the camera. */
export function sceneDistance(au: number): number {
  return 900 * Math.pow(au, 0.55)
}