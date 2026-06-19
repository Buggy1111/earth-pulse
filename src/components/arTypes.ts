/** One thing drawn in the Sky AR overlay — a satellite, a Starlink, or a
 * celestial body (Moon / planet) — already projected to screen x/y. */
export interface Marker {
  id: string
  name: string
  x: number
  y: number
  elevationDeg: number
  rangeKm: number
  iss: boolean
  kind: 'named' | 'starlink' | 'body'
  /** Show a name tag (the few Starlinks nearest where you look). */
  label?: boolean
  /** Celestial bodies: dot colour + a ready-made distance string. */
  color?: string
  distanceLabel?: string
}
