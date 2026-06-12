/** Auroral ovals driven by the live planetary Kp index.
 *
 * Simple empirical model: rings around the geomagnetic poles whose equatorward
 * reach, width and brightness all grow with Kp — calm means faint polar halos,
 * a storm pushes bright ovals toward the mid-latitudes (as it does in reality).
 */

import { sphericalCircle, type LatLng } from './sun'

// IGRF-13 geomagnetic poles, ~2025 epoch
export const GEOMAGNETIC_NORTH: LatLng = { lat: 80.8, lng: -72.7 }
export const GEOMAGNETIC_SOUTH: LatLng = { lat: -80.7, lng: 107.4 }

export interface AuroraOval {
  /** GeoJSON polygon rings: [outer, inner hole] in [lng, lat][]. */
  rings: [number, number][][]
  opacity: number
  pole: 'north' | 'south'
}

/** Equatorward colatitude of the oval (degrees from the geomagnetic pole). */
export function auroraColatitude(kp: number): number {
  const k = Math.min(Math.max(kp, 0), 9)
  return 18 + 2.1 * k
}

/** Radial width of the oval in degrees. */
export function auroraWidth(kp: number): number {
  const k = Math.min(Math.max(kp, 0), 9)
  return 4 + 0.9 * k
}

export function auroraOpacity(kp: number): number {
  const k = Math.min(Math.max(kp, 0), 9)
  return 0.16 + (k / 9) * 0.5
}

/** Both ovals as annulus polygons (outer ring + reversed inner hole). */
export function auroraOvals(kp: number, steps = 96): AuroraOval[] {
  const colat = auroraColatitude(kp)
  const width = auroraWidth(kp)
  const opacity = auroraOpacity(kp)
  const oval = (pole: LatLng, name: 'north' | 'south'): AuroraOval => {
    const outer = sphericalCircle(pole, colat, steps)
    const inner = sphericalCircle(pole, Math.max(colat - width, 1), steps).reverse()
    return { rings: [outer, inner], opacity, pole: name }
  }
  return [oval(GEOMAGNETIC_NORTH, 'north'), oval(GEOMAGNETIC_SOUTH, 'south')]
}
