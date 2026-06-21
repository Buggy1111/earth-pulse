/** Shareable view state in the URL hash — send someone a link and they get
 * your exact camera, lit-up orbits and layer setup.
 *
 * Format (all parts optional):
 *   #c=49.83,18.28,1.20&o=25544.20580&off=quakes.aurora
 *   c   = camera lat,lng,altitude
 *   o   = NORAD ids of shown orbits, dot-separated
 *   off = layer keys that are switched OFF (default is everything on)
 */

export interface ViewState {
  camera?: { lat: number; lng: number; altitude: number }
  orbitIds: string[]
  layersOff: string[]
}

// allow-list of toggleable layer keys (mirrors LayerState) — a shared link can
// only ever switch these OFF; anything else in the URL is ignored
const LAYER_KEYS = new Set([
  'sats', 'orbits', 'iss', 'starlink', 'quakes', 'events',
  'aurora', 'clouds', 'borders', 'labels', 'volcanoes', 'detail',
])

export function encodeView(view: ViewState): string {
  const parts: string[] = []
  if (view.camera) {
    const { lat, lng, altitude } = view.camera
    parts.push(`c=${lat.toFixed(2)},${lng.toFixed(2)},${altitude.toFixed(2)}`)
  }
  if (view.orbitIds.length > 0) parts.push(`o=${view.orbitIds.join('.')}`)
  if (view.layersOff.length > 0) parts.push(`off=${view.layersOff.join('.')}`)
  return parts.join('&')
}

export function parseView(hash: string): ViewState | null {
  const clean = hash.replace(/^#/, '')
  if (!clean) return null
  const params = new Map<string, string>()
  for (const part of clean.split('&')) {
    const eq = part.indexOf('=')
    if (eq > 0) params.set(part.slice(0, eq), part.slice(eq + 1))
  }
  const view: ViewState = { orbitIds: [], layersOff: [] }
  let any = false

  const c = params.get('c')
  if (c) {
    const [lat, lng, altitude] = c.split(',').map(Number)
    if (
      Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      Number.isFinite(lng) && Math.abs(lng) <= 180 &&
      Number.isFinite(altitude) && altitude > 0.005 && altitude < 20
    ) {
      view.camera = { lat, lng, altitude }
      any = true
    }
  }
  const o = params.get('o')
  if (o) {
    view.orbitIds = o.split('.').filter((id) => /^\d{1,6}$/.test(id)).slice(0, 30)
    any = any || view.orbitIds.length > 0
  }
  const off = params.get('off')
  if (off) {
    view.layersOff = off.split('.').filter((k) => LAYER_KEYS.has(k))
    any = any || view.layersOff.length > 0
  }
  return any ? view : null
}
