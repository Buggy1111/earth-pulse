/** Label anchor points for country polygons. Pure math, no DOM. */

export interface LatLngPoint {
  lat: number
  lng: number
}

/** Average of a polygon ring's vertices ([lng, lat][]). Good enough for a
 * label anchor — exact area centroids aren't worth the bytes here. */
export function ringCentroid(ring: [number, number][]): LatLngPoint {
  let lat = 0
  let lng = 0
  // skip the closing point (same as the first)
  const n = ring.length > 1 ? ring.length - 1 : ring.length
  for (let i = 0; i < n; i++) {
    lng += ring[i][0]
    lat += ring[i][1]
  }
  return { lat: lat / n, lng: lng / n }
}

interface PolygonGeom {
  type: 'Polygon'
  coordinates: [number, number][][]
}
interface MultiPolygonGeom {
  type: 'MultiPolygon'
  coordinates: [number, number][][][]
}

/** Label point for a (Multi)Polygon: centroid of the largest outer ring —
 * so France labels mainland France, not the middle of the Atlantic. */
export function geometryLabelPoint(geom: PolygonGeom | MultiPolygonGeom): LatLngPoint {
  if (geom.type === 'Polygon') return ringCentroid(geom.coordinates[0])
  let largest = geom.coordinates[0][0]
  for (const poly of geom.coordinates) {
    if (poly[0].length > largest.length) largest = poly[0]
  }
  return ringCentroid(largest)
}
