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

/** Warm energy ramp by magnitude: pale gold -> amber -> orange -> red. */
export function magColor(mag: number): string {
  if (mag >= 6) return '#ef4444'
  if (mag >= 5) return '#f97316'
  if (mag >= 4) return '#fb923c'
  if (mag >= 2.5) return '#fbbf24'
  return '#fde68a'
}

/** Globe ring radius (degrees) by magnitude — quadratic so the big ones dominate. */
export function magRadius(mag: number): number {
  const m = Math.max(mag, 0)
  return Math.max(0.4, m * m * 0.18)
}

/** Glow sprite size (globe units) — quadratic so big quakes visibly dominate. */
export function glowScale(mag: number): number {
  const m = Math.max(mag, 0)
  return 1.4 + m * m * 0.26
}

/** Glow opacity by event age: fresh quakes burn bright, day-old ones smolder. */
export function glowOpacity(time: number, now: number): number {
  const age = Math.min(Math.max((now - time) / 86_400_000, 0), 1)
  return 1 - age * 0.62
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
