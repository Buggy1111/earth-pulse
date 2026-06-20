/** The real naked-eye sky, baked from the HYG database (CC BY-SA 4.0) by
 * scripts/fetch-stars. Positions are J2000 EQUATORIAL unit directions. */

export interface StarCatalog {
  /** Flat [x, y, z, mag, ci, …] — unit direction, magnitude, B–V colour index. */
  data: number[]
  /** Bright named stars: distance (ly) + spectral type, for labels + the card. */
  named: { n: string; x: number; y: number; z: number; m: number; d: number; s: string }[]
  /** Closest systems (faint ones too — Proxima, Barnard's). */
  nearest: { n: string; x: number; y: number; z: number; d: number; s: string }[]
  /** Constellation stick figures: each a flat [x,y,z,…] equatorial polyline. */
  lines: number[][]
  /** Constellation names at their label positions. */
  names: { n: string; x: number; y: number; z: number }[]
}

/** What a clicked star hands to the info card. */
export interface StarPick {
  name: string
  distLy: number
  spect: string
  mag: number
}

// B–V colour index → an approximate true star tint, lerped between known
// stellar colours (blue-white hot stars → white → yellow → orange-red cool).
const STOPS: [number, [number, number, number]][] = [
  [-0.4, [0.61, 0.69, 1.0]],
  [0.0, [0.79, 0.84, 1.0]],
  [0.4, [0.97, 0.97, 1.0]],
  [0.8, [1.0, 0.96, 0.92]],
  [1.2, [1.0, 0.82, 0.63]],
  [1.6, [1.0, 0.71, 0.47]],
  [2.0, [1.0, 0.61, 0.4]],
]

export function bvColor(bv: number): [number, number, number] {
  if (bv <= STOPS[0][0]) return STOPS[0][1]
  for (let i = 1; i < STOPS.length; i++) {
    if (bv <= STOPS[i][0]) {
      const [b0, c0] = STOPS[i - 1]
      const [b1, c1] = STOPS[i]
      const t = (bv - b0) / (b1 - b0)
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

/** Plain-language description of a spectral class (first letter O…M). */
export function spectralDesc(spect: string): string {
  switch (spect.trim()[0]?.toUpperCase()) {
    case 'O':
      return 'blue, blisteringly hot and massive'
    case 'B':
      return 'blue-white, hot and luminous'
    case 'A':
      return 'a white star'
    case 'F':
      return 'a yellow-white star'
    case 'G':
      return 'a yellow star, like our Sun'
    case 'K':
      return 'an orange star, cooler than the Sun'
    case 'M':
      return 'a cool red dwarf or red giant'
    default:
      return 'a star'
  }
}

/** A one-line claim to fame for the best-known stars. */
export const STAR_FACTS: Record<string, string> = {
  Sirius: 'the brightest star in the whole night sky',
  Canopus: 'the second-brightest star, a distant supergiant',
  Betelgeuse: 'a red supergiant that will one day explode as a supernova',
  Rigel: 'a blue supergiant tens of thousands of times brighter than the Sun',
  Polaris: 'the North Star — it sits almost exactly over the north pole',
  Vega: 'a brilliant blue star; it was the pole star ~12,000 years ago',
  'Proxima Centauri': 'the closest star to the Sun, with known planets',
  'Rigil Kentaurus': 'Alpha Centauri — the nearest bright star system',
  Toliman: 'part of Alpha Centauri, our nearest stellar neighbour',
  "Barnard's Star": 'the fastest-moving star across our sky',
  Aldebaran: 'the fiery red eye of Taurus the bull',
  Antares: 'the red heart of Scorpius — a colossal supergiant',
  Arcturus: 'an orange giant racing through the galaxy',
  Capella: 'actually four stars in two close pairs',
  Procyon: 'a close neighbour, only ~11 light-years away',
  Pollux: 'the nearest giant star, and it has a planet',
  Fomalhaut: 'a young star ringed by a dusty debris disk',
  Spica: 'a pair of hot blue stars whirling around each other',
  Deneb: 'one of the most luminous stars we can see, far across the galaxy',
  Altair: 'spins so fast it bulges visibly at its equator',
  Regulus: 'the heart of Leo the lion',
}
