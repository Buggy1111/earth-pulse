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
  /** Historic-mode only (lib/history): one line of context + preformatted size. */
  note?: string
  magnitudeLabel?: string
  /** Where the facts come from — defaults to NASA EONET in the card. */
  source?: string
  historic?: boolean
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
  impact: { icon: '☄️', color: '#fcd34d', label: 'Impact' },
  solarStorm: { icon: '☀️', color: '#fb923c', label: 'Solar storm' },
  nuclear: { icon: '☢️', color: '#a3e635', label: 'Nuclear' },
  space: { icon: '🚀', color: '#c4b5fd', label: 'Spaceflight' },
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
  for (const e of Array.isArray(json?.events) ? json.events : []) {
    if (!e || typeof e.id !== 'string' || !e.id || typeof e.title !== 'string') continue
    const geom = Array.isArray(e.geometry) ? e.geometry : []
    // Use the newest VALID point. A malformed final update must not hide an
    // otherwise usable event or allow invalid coordinates into the renderer.
    const pt = [...geom].reverse().find((g) => {
      if (!g || !Array.isArray(g.coordinates) || g.coordinates.length !== 2) return false
      const [lng, lat] = g.coordinates
      return Number.isFinite(lng) && Number.isFinite(lat) &&
        Math.abs(lng) <= 180 && Math.abs(lat) <= 90 &&
        typeof g.date === 'string' && Number.isFinite(Date.parse(g.date))
    })
    if (!pt || !pt.coordinates) continue
    const [lng, lat] = pt.coordinates
    const date = Date.parse(pt.date!)
    out.push({
      id: e.id,
      title: e.title,
      category: e.categories?.[0]?.id ?? 'manmade',
      lat,
      lng,
      date,
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
