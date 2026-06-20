/** The real naked-eye sky, baked from the HYG database (CC BY-SA 4.0) by
 * scripts/fetch-stars. Positions are J2000 EQUATORIAL unit directions. */

export interface StarCatalog {
  /** Flat [x, y, z, mag, ci, …] — unit direction, magnitude, B–V colour index. */
  data: number[]
  /** Named stars with a real distance (light-years) for labels. */
  named: { n: string; x: number; y: number; z: number; m: number; d: number }[]
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
