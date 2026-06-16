/** Live aircraft from the airplanes.live community ADS-B feed — free, no API
 * key, CORS-enabled, so it runs straight from the browser like the rest of the
 * app's data. It's a point+radius query, so the layer shows the air traffic
 * around a centre (the viewer's own location, or a default over Europe). */

/** Max query radius airplanes.live allows, nautical miles (~460 km). */
export const AIRCRAFT_RADIUS_NM = 250

const KT_TO_KMH = 1.852
const FT_TO_KM = 0.0003048

export interface Aircraft {
  /** ICAO 24-bit hex — the stable id. */
  id: string
  lat: number
  lng: number
  altKm: number
  headingDeg: number
  speedKmh: number
  /** Flight/callsign, trimmed (may be empty). */
  callsign: string
  /** ICAO type code, e.g. "A320" (may be empty). */
  type: string
  onGround: boolean
}

interface RawAircraft {
  hex?: string
  lat?: number
  lon?: number
  alt_baro?: number | 'ground'
  alt_geom?: number
  gs?: number
  track?: number
  true_heading?: number
  flight?: string
  t?: string
}

/** Fetch the live aircraft within {@link AIRCRAFT_RADIUS_NM} of `center`. */
export async function fetchAircraft(
  center: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<Aircraft[]> {
  const url = `https://api.airplanes.live/v2/point/${center.lat.toFixed(3)}/${center.lng.toFixed(3)}/${AIRCRAFT_RADIUS_NM}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`airplanes.live ${res.status}`)
  const json = (await res.json()) as { ac?: RawAircraft[] }
  const out: Aircraft[] = []
  for (const a of json.ac ?? []) {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue
    const onGround = a.alt_baro === 'ground'
    const altFt = typeof a.alt_baro === 'number' ? a.alt_baro : (a.alt_geom ?? 0)
    out.push({
      id: a.hex ?? `${a.lat},${a.lon}`,
      lat: a.lat,
      lng: a.lon,
      altKm: Math.max(0, altFt * FT_TO_KM),
      headingDeg: a.track ?? a.true_heading ?? 0,
      speedKmh: (a.gs ?? 0) * KT_TO_KMH,
      callsign: (a.flight ?? '').trim(),
      type: a.t ?? '',
      onGround,
    })
  }
  return out
}
