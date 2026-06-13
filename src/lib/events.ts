/** NASA EONET — the Earth Observatory Natural Event Tracker. Live wildfires,
 * severe storms, volcanic eruptions, icebergs and more, as geo-located events.
 * Free, no API key, CORS-enabled (same family as our USGS/NOAA feeds). */

export const EONET_URL =
  'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=200'

export interface EarthEvent {
  id: string
  title: string
  category: string
  lat: number
  lng: number
  /** Most recent geometry timestamp, ms. */
  date: number
  /** Magnitude (acres, kts…) if the source provides one. */
  magnitude?: number
  magnitudeUnit?: string
  link?: string
}

/** Icon, colour and friendly label per EONET category id. */
export const EVENT_META: Record<string, { icon: string; color: string; label: string }> = {
  wildfires: { icon: '🔥', color: '#fb7185', label: 'Wildfire' },
  severeStorms: { icon: '🌀', color: '#38bdf8', label: 'Storm' },
  volcanoes: { icon: '🌋', color: '#f97316', label: 'Volcano' },
  seaLakeIce: { icon: '🧊', color: '#a5f3fc', label: 'Sea & lake ice' },
  floods: { icon: '🌊', color: '#60a5fa', label: 'Flood' },
  drought: { icon: '🏜', color: '#fbbf24', label: 'Drought' },
  dustHaze: { icon: '🌫', color: '#d6c7a1', label: 'Dust & haze' },
  earthquakes: { icon: '🌐', color: '#f87171', label: 'Earthquake' },
  landslides: { icon: '⛰', color: '#a8a29e', label: 'Landslide' },
  manmade: { icon: '🏭', color: '#cbd5e1', label: 'Human event' },
  snow: { icon: '❄️', color: '#e0f2fe', label: 'Snow' },
  tempExtremes: { icon: '🌡', color: '#fca5a5', label: 'Temperature extreme' },
  waterColor: { icon: '🟢', color: '#4ade80', label: 'Water colour' },
}

export function eventMeta(category: string): { icon: string; color: string; label: string } {
  return EVENT_META[category] ?? { icon: '•', color: '#cbd5e1', label: category }
}

interface RawEonet {
  events?: {
    id: string
    title: string
    link?: string
    categories?: { id: string }[]
    geometry?: { date?: string; coordinates?: number[]; magnitudeValue?: number; magnitudeUnit?: string }[]
  }[]
}

/** Flatten the EONET response: one marker per event at its latest point. */
export function parseEvents(json: RawEonet): EarthEvent[] {
  const out: EarthEvent[] = []
  for (const e of json.events ?? []) {
    const geom = e.geometry ?? []
    // last geometry = most recent position; skip non-point (track) tails
    const pt = [...geom].reverse().find((g) => Array.isArray(g.coordinates) && g.coordinates.length >= 2)
    if (!pt || !pt.coordinates) continue
    const [lng, lat] = pt.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({
      id: e.id,
      title: e.title,
      category: e.categories?.[0]?.id ?? 'manmade',
      lat,
      lng,
      date: pt.date ? Date.parse(pt.date) : Date.now(),
      magnitude: pt.magnitudeValue,
      magnitudeUnit: pt.magnitudeUnit,
      link: e.link,
    })
  }
  // newest first
  return out.sort((a, b) => b.date - a.date)
}

/** Count events per category for the panel summary. */
export function eventCounts(events: EarthEvent[]): { category: string; count: number }[] {
  const map = new Map<string, number>()
  for (const e of events) map.set(e.category, (map.get(e.category) ?? 0) + 1)
  return [...map.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
}
