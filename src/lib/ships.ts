/** Live ship positions from Fintraffic's digitraffic open AIS feed — free, no
 * API key, CORS-enabled. It covers the Baltic Sea and approaches (~18k vessels)
 * as GeoJSON, so it runs straight from the browser like the rest of the data.
 * Honest scope: this is Baltic traffic, not global (no free keyless global AIS
 * feed exists). */

const KT_TO_KMH = 1.852

export interface Ship {
  mmsi: number
  lat: number
  lng: number
  /** Speed over ground, km/h. */
  speedKmh: number
  /** Course over ground, degrees. */
  courseDeg: number
  headingDeg: number
  moving: boolean
}

interface RawShipFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: { mmsi?: number; sog?: number; cog?: number; heading?: number }
}

/** Fetch live ships, evenly downsampled to at most `max` to keep the globe
 * light on weak GPUs (the raw feed is ~18k vessels). */
export async function fetchShips(signal?: AbortSignal, max = 2500): Promise<Ship[]> {
  const res = await fetch('https://meri.digitraffic.fi/api/ais/v1/locations', { signal })
  if (!res.ok) throw new Error(`digitraffic ${res.status}`)
  const json = (await res.json()) as { features?: RawShipFeature[] }
  const feats = json.features ?? []
  const step = Math.max(1, Math.ceil(feats.length / max))
  const out: Ship[] = []
  for (let i = 0; i < feats.length; i += step) {
    const f = feats[i]
    const c = f.geometry?.coordinates
    const p = f.properties
    if (!c || c.length < 2 || !p || typeof p.mmsi !== 'number') continue
    const sog = p.sog ?? 0
    out.push({
      mmsi: p.mmsi,
      lng: c[0],
      lat: c[1],
      speedKmh: sog * KT_TO_KMH,
      courseDeg: p.cog ?? 0,
      // 511 is the AIS "heading unavailable" sentinel — fall back to course
      headingDeg: p.heading != null && p.heading < 360 ? p.heading : (p.cog ?? 0),
      moving: sog > 0.5,
    })
  }
  return out
}
