/** USGS earthquake feed: parsing, scales, stats. Pure functions, no DOM. */

export interface Quake {
  id: string
  lat: number
  lng: number
  mag: number
  depthKm: number
  place: string
  time: number
}

interface UsgsFeature {
  id: string
  properties: { mag: number | null; place: string | null; time: number }
  geometry: { coordinates: [number, number, number] } | null
}

export interface UsgsFeed {
  features: UsgsFeature[]
}

export const USGS_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'

export function parseQuakes(feed: UsgsFeed): Quake[] {
  const out: Quake[] = []
  for (const f of feed.features ?? []) {
    if (!f.geometry || f.properties.mag === null) continue
    const [lng, lat, depth] = f.geometry.coordinates
    out.push({
      id: f.id,
      lat,
      lng,
      mag: f.properties.mag,
      depthKm: depth,
      place: f.properties.place ?? 'unknown location',
      time: f.properties.time,
    })
  }
  return out.sort((a, b) => b.time - a.time)
}

/** Color by magnitude: calm teal -> alarming red. */
export function magColor(mag: number): string {
  if (mag >= 6) return '#ef4444'
  if (mag >= 5) return '#f97316'
  if (mag >= 4) return '#fbbf24'
  if (mag >= 2.5) return '#a3e635'
  return '#2dd4bf'
}

/** Globe ring radius (degrees) by magnitude — quadratic so the big ones dominate. */
export function magRadius(mag: number): number {
  const m = Math.max(mag, 0)
  return Math.max(0.4, m * m * 0.18)
}

/** Quakes not yet in `seenIds` — the live "just happened" detection. */
export function diffNewQuakes(seenIds: ReadonlySet<string>, quakes: Quake[]): Quake[] {
  return quakes.filter((q) => !seenIds.has(q.id))
}

export interface QuakeStats {
  count: number
  strongest: Quake | null
  latest: Quake | null
}

export function quakeStats(quakes: Quake[]): QuakeStats {
  if (quakes.length === 0) return { count: 0, strongest: null, latest: null }
  let strongest = quakes[0]
  for (const q of quakes) if (q.mag > strongest.mag) strongest = q
  return { count: quakes.length, strongest, latest: quakes[0] }
}
