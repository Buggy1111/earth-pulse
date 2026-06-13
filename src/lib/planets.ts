/** Planetary positions from JPL's "Keplerian elements for approximate
 * positions" (valid 1800–2050, good to arcminutes — plenty for an orrery).
 * Pure math: heliocentric Kepler solve → geocentric equatorial RA/Dec.
 */

const RAD = Math.PI / 180

/** a(au), e, I(deg), L(deg), longPeri(deg), longNode(deg) + per-century rates. */
type Elements = [number, number, number, number, number, number]

export interface PlanetFacts {
  /** Sidereal rotation period in hours (negative = retrograde spin). */
  rotationH: number
  /** Orbital period, Earth days. */
  yearDays: number
  /** Axial tilt, degrees. */
  tiltDeg: number
  /** Mean / characteristic temperature, °C. */
  tempC: number
  moonCount: number
  atmosphere: string
  fact: string
}

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
  facts: PlanetFacts
}

export const PLANETS: PlanetDef[] = [
  { id: 'mercury', name: 'Mercury', diameterKm: 4_879, displayRadius: 3.1, texture: 'planets/mercury.jpg',
    facts: { rotationH: 1407.6, yearDays: 88, tiltDeg: 0.03, tempC: 167, moonCount: 0, atmosphere: 'practically none (exosphere)', fact: 'a single solar day lasts 176 Earth days — longer than its year' },
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  { id: 'venus', name: 'Venus', diameterKm: 12_104, displayRadius: 7.6, texture: 'planets/venus_atmosphere.jpg',
    facts: { rotationH: -5832.5, yearDays: 224.7, tiltDeg: 177.4, tempC: 464, moonCount: 0, atmosphere: 'dense CO₂, sulfuric-acid clouds', fact: 'spins backwards, hotter than Mercury — runaway greenhouse' },
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  { id: 'mars', name: 'Mars', diameterKm: 6_779, displayRadius: 4.3, texture: 'planets/mars.jpg',
    facts: { rotationH: 24.6, yearDays: 687, tiltDeg: 25.2, tempC: -63, moonCount: 2, atmosphere: 'thin CO₂', fact: 'Olympus Mons is the tallest volcano in the solar system (~22 km)' },
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  { id: 'jupiter', name: 'Jupiter', diameterKm: 139_820, displayRadius: 88, texture: 'planets/jupiter.jpg',
    facts: { rotationH: 9.9, yearDays: 4333, tiltDeg: 3.1, tempC: -108, moonCount: 95, atmosphere: 'hydrogen + helium', fact: 'the Great Red Spot is a storm wider than Earth, raging for centuries' },
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  { id: 'saturn', name: 'Saturn', diameterKm: 116_460, displayRadius: 75, texture: 'planets/saturn.jpg',
    facts: { rotationH: 10.7, yearDays: 10759, tiltDeg: 26.7, tempC: -139, moonCount: 146, atmosphere: 'hydrogen + helium', fact: 'less dense than water — it would float in a big enough bathtub' },
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  { id: 'uranus', name: 'Uranus', diameterKm: 50_724, displayRadius: 32, texture: 'planets/uranus.jpg',
    facts: { rotationH: -17.2, yearDays: 30687, tiltDeg: 97.8, tempC: -197, moonCount: 28, atmosphere: 'hydrogen, helium, methane (the cyan tint)', fact: 'rolls on its side — seasons last 21 years each' },
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  { id: 'neptune', name: 'Neptune', diameterKm: 49_244, displayRadius: 31, texture: 'planets/neptune.jpg',
    facts: { rotationH: 16.1, yearDays: 60190, tiltDeg: 28.3, tempC: -201, moonCount: 16, atmosphere: 'hydrogen, helium, methane', fact: 'fastest winds in the solar system — up to 2,100 km/h' },
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
  { id: 'pluto', name: 'Pluto', diameterKm: 2_377, displayRadius: 1.6, texture: 'planets/pluto.webp',
    facts: { rotationH: -153.3, yearDays: 90_560, tiltDeg: 122.5, tempC: -229, moonCount: 5, atmosphere: 'thin nitrogen (when near the Sun)', fact: 'demoted to dwarf planet in 2006 — New Horizons revealed a heart-shaped glacier' },
    el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482] },
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

/** Season 2 scene scale: heliocentric, UNIFORM — 1 AU in scene units.
 * No per-planet compression, so orbit geometry stays true. */
export const AU_SCENE = 2_200
/** Earth's display radius in solar mode (the globe shrinks to this). */
export const EARTH_DISPLAY = 8
export const SUN_DISPLAY = 350

/** Heliocentric ecliptic position of Earth in AU. */
export function earthHelio(date: Date): [number, number, number] {
  return helio(EARTH.el, EARTH.rate, centuriesSinceJ2000(date))
}

/** Heliocentric ecliptic position of one planet in AU. */
export function planetHelio(id: string, date: Date): [number, number, number] {
  const p = PLANETS.find((x) => x.id === id)
  if (!p) return [0, 0, 0]
  return helio(p.el, p.rate, centuriesSinceJ2000(date))
}

/** The full orbit ellipse of a planet in heliocentric ecliptic AU —
 * sampled by eccentric anomaly, so it is the exact instantaneous ellipse. */
export function helioEllipse(id: string, date: Date, samples = 180): [number, number, number][] {
  const p = PLANETS.find((x) => x.id === id)
  if (!p) return []
  const T = centuriesSinceJ2000(date)
  const a = p.el[0] + p.rate[0] * T
  const e = p.el[1] + p.rate[1] * T
  const I = (p.el[2] + p.rate[2] * T) * RAD
  const lp = p.el[4] + p.rate[4] * T
  const ln = p.el[5] + p.rate[5] * T
  const omega = (lp - ln) * RAD
  const node = ln * RAD
  const [cw, sw] = [Math.cos(omega), Math.sin(omega)]
  const [cn, sn] = [Math.cos(node), Math.sin(node)]
  const [ci, si] = [Math.cos(I), Math.sin(I)]
  const out: [number, number, number][] = []
  for (let i = 0; i <= samples; i++) {
    const E = (i / samples) * 2 * Math.PI
    const xp = a * (Math.cos(E) - e)
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
    out.push([
      (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      sw * si * xp + cw * si * yp,
    ])
  }
  return out
}

export interface MoonDef {
  /** Slug — also the texture filename, planets/moons/<id>.webp. */
  id: string
  name: string
  /** Semi-major axis, thousands of km. */
  aKkm: number
  /** Who found it and when — for the detail card. */
  discoveredBy?: string
  /** Orbital period, Earth days (sidereal). */
  periodD: number
  /** Real mean radius, km. */
  radiusKm: number
  retrograde?: boolean
  color: string
  /** A global map snapshot exists (NASA/USGS, see scripts/fetch-moons.mjs). */
  texture?: boolean
  /** Color cast for grayscale maps (e.g. Titan's orange haze). */
  tint?: string
  fact?: string
}

/** The major moons — real orbits, periods, sizes and distances. */
export const PLANET_MOONS: Record<string, MoonDef[]> = {
  earth: [
    { id: 'moon', name: 'Moon', aKkm: 384.4, periodD: 27.322, radiusKm: 1737, color: '#b9b4ac', texture: true, fact: 'the only world beyond Earth humans have walked on' },
  ],
  mars: [
    { id: 'phobos', name: 'Phobos', aKkm: 9.4, discoveredBy: 'Asaph Hall, 1877', periodD: 0.319, radiusKm: 11, color: '#8a8378', fact: 'orbits Mars 3× a day, slowly spiraling in' },
    { id: 'deimos', name: 'Deimos', aKkm: 23.5, discoveredBy: 'Asaph Hall, 1877', periodD: 1.263, radiusKm: 6, color: '#9a938a', fact: 'so small its gravity could not hold a running human' },
  ],
  jupiter: [
    { id: 'io', name: 'Io', aKkm: 421.8, discoveredBy: 'Galileo Galilei, 1610', periodD: 1.769, radiusKm: 1822, color: '#d8c45a', texture: true, fact: 'the most volcanic body in the solar system' },
    { id: 'europa', name: 'Europa', aKkm: 671.1, discoveredBy: 'Galileo Galilei, 1610', periodD: 3.551, radiusKm: 1561, color: '#d9d2c2', texture: true, fact: 'an ocean of liquid water under the ice' },
    { id: 'ganymede', name: 'Ganymede', aKkm: 1070.4, discoveredBy: 'Galileo Galilei, 1610', periodD: 7.155, radiusKm: 2634, color: '#a89a85', texture: true, fact: 'the largest moon anywhere — bigger than Mercury' },
    { id: 'callisto', name: 'Callisto', aKkm: 1882.7, discoveredBy: 'Galileo Galilei, 1610', periodD: 16.689, radiusKm: 2410, color: '#7a7164', texture: true, fact: 'the most cratered surface known' },
  ],
  saturn: [
    { id: 'mimas', name: 'Mimas', aKkm: 185.5, discoveredBy: 'William Herschel, 1789', periodD: 0.942, radiusKm: 198, color: '#c6c2bb', texture: true, fact: 'one huge crater — yes, it does look like the Death Star' },
    { id: 'enceladus', name: 'Enceladus', aKkm: 238, discoveredBy: 'William Herschel, 1789', periodD: 1.37, radiusKm: 252, color: '#eef2f6', texture: true, fact: 'water geysers erupt from its south pole' },
    { id: 'tethys', name: 'Tethys', aKkm: 294.7, discoveredBy: 'Giovanni Cassini, 1684', periodD: 1.888, radiusKm: 531, color: '#d4d2cc', texture: true, fact: 'almost pure water ice, a canyon 3/4 of the way around it' },
    { id: 'dione', name: 'Dione', aKkm: 377.4, discoveredBy: 'Giovanni Cassini, 1684', periodD: 2.737, radiusKm: 561, color: '#c9c5bd', texture: true, fact: 'bright ice-cliff streaks across its trailing side' },
    { id: 'rhea', name: 'Rhea', aKkm: 527.1, discoveredBy: 'Giovanni Cassini, 1672', periodD: 4.518, radiusKm: 764, color: '#beb7ac', texture: true },
    { id: 'titan', name: 'Titan', aKkm: 1221.9, discoveredBy: 'Christiaan Huygens, 1655', periodD: 15.945, radiusKm: 2575, color: '#cfa14f', texture: true, tint: '#d8a557', fact: 'thick orange atmosphere, methane rain and lakes' },
    { id: 'iapetus', name: 'Iapetus', aKkm: 3560.8, discoveredBy: 'Giovanni Cassini, 1671', periodD: 79.32, radiusKm: 735, color: '#b3a89a', texture: true, fact: 'two-toned: one side coal-black, the other bright ice' },
  ],
  uranus: [
    { id: 'miranda', name: 'Miranda', aKkm: 129.9, discoveredBy: 'Gerard Kuiper, 1948', periodD: 1.413, radiusKm: 236, color: '#aab4bd', texture: true, fact: 'a patchwork world with 20 km ice cliffs' },
    { id: 'ariel', name: 'Ariel', aKkm: 190.9, discoveredBy: 'William Lassell, 1851', periodD: 2.52, radiusKm: 579, color: '#b6bdc4', texture: true, fact: 'the brightest Uranian moon — young icy plains' },
    { id: 'umbriel', name: 'Umbriel', aKkm: 266, discoveredBy: 'William Lassell, 1851', periodD: 4.144, radiusKm: 585, color: '#7e848c', texture: true, fact: 'the darkest one, with a single bright crater ring' },
    { id: 'titania', name: 'Titania', aKkm: 435.9, discoveredBy: 'William Herschel, 1787', periodD: 8.706, radiusKm: 788, color: '#9aa3ad', texture: true },
    { id: 'oberon', name: 'Oberon', aKkm: 583.5, discoveredBy: 'William Herschel, 1787', periodD: 13.46, radiusKm: 761, color: '#8f8a84', texture: true },
  ],
  neptune: [
    { id: 'triton', name: 'Triton', aKkm: 354.8, discoveredBy: 'William Lassell, 1846', periodD: 5.877, radiusKm: 1353, retrograde: true, color: '#d9cfc6', texture: true, fact: 'orbits BACKWARDS — a captured Kuiper-belt world with nitrogen geysers' },
  ],
  pluto: [
    { id: 'charon', name: 'Charon', aKkm: 19.6, discoveredBy: 'James Christy, 1978', periodD: 6.387, radiusKm: 606, color: '#a9a29c', texture: true, fact: 'half Pluto\'s size — they orbit a point between them, a true double world' },
  ],
}

/** Orbital angle (radians) of a moon at time `ms` — real period, per-moon
 * phase offset so systems don't start aligned. Retrograde moons run negative. */
export function moonAngle(moon: MoonDef, ms: number): number {
  let phase = 0
  for (let i = 0; i < moon.name.length; i++) phase += moon.name.charCodeAt(i)
  const turns = ms / 86_400_000 / moon.periodD
  return (moon.retrograde ? -1 : 1) * turns * 2 * Math.PI + phase
}

/** Sidereal spin angle (radians) of a planet at time `ms`. */
export function planetSpin(rotationH: number, ms: number): number {
  return (ms / 3_600_000 / rotationH) * 2 * Math.PI
}