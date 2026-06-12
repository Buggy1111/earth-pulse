/** Subsolar point and the night-side polygon for the day/night terminator.
 *
 * Approximation good to a fraction of a degree (NOAA-style): solar declination
 * from orbital elements, longitude from UTC time + equation of time. Plenty for
 * a visual terminator.
 */

const RAD = Math.PI / 180

export interface LatLng {
  lat: number
  lng: number
}

/** Point on Earth where the Sun is directly overhead at `date`. */
export function subsolarPoint(date: Date): LatLng {
  const ms = date.getTime()
  // days since J2000.0
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 86_400_000
  const meanLng = (280.46 + 0.9856474 * d) % 360
  const meanAnom = ((357.528 + 0.9856003 * d) % 360) * RAD
  const eclipticLng =
    (meanLng + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * RAD
  const obliquity = (23.439 - 0.0000004 * d) * RAD
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLng)) / RAD

  // equation of time (minutes), NOAA approximation
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLng), Math.cos(eclipticLng)) / RAD
  const eqTimeMin = 4 * (((meanLng - rightAscension + 540) % 360) - 180)

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  // solar noon longitude, shifted by equation of time
  let lng = -15 * (utcHours - 12 + eqTimeMin / 60)
  lng = ((lng + 540) % 360) - 180
  return { lat: declination, lng }
}

/** Circle of `radiusDeg` great-circle degrees around `center`, as a GeoJSON
 * ring ([lng, lat][], closed). Shared by the night hemisphere and aurora ovals. */
export function sphericalCircle(
  center: LatLng,
  radiusDeg: number,
  steps = 96,
): [number, number][] {
  const ring: [number, number][] = []
  const latC = center.lat * RAD
  const lngC = center.lng * RAD
  const r = radiusDeg * RAD
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const lat = Math.asin(
      Math.sin(latC) * Math.cos(r) + Math.cos(latC) * Math.sin(r) * Math.cos(bearing),
    )
    const lng =
      lngC +
      Math.atan2(
        Math.sin(bearing) * Math.sin(r) * Math.cos(latC),
        Math.cos(r) - Math.sin(latC) * Math.sin(lat),
      )
    ring.push([(((lng / RAD + 540) % 360) - 180), lat / RAD])
  }
  return ring
}

/** Polygon (GeoJSON ring, [lng, lat][]) covering the night hemisphere. */
export function nightPolygon(date: Date, steps = 96): [number, number][] {
  const sun = subsolarPoint(date)
  // antisolar point = center of the night hemisphere
  const center = { lat: -sun.lat, lng: ((sun.lng + 360) % 360) - 180 }
  return sphericalCircle(center, 90, steps)
}
