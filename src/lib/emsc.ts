/** EMSC SeismicPortal live earthquake stream (WebSocket).
 *
 * Events arrive within ~a minute of the actual shaking — well before they
 * show up in the USGS feed poll. Parsing + USGS de-duplication is pure and
 * tested; the socket lives in a hook.
 */

import type { Quake } from './quakes'

export const EMSC_WS_URL = 'wss://www.seismicportal.eu/standing_order/websocket'

interface EmscMessage {
  action?: string
  data?: {
    geometry?: { coordinates?: number[] }
    properties?: {
      mag?: number
      time?: string
      depth?: number
      flynn_region?: string
      unid?: string
    }
  }
}

export function parseEmscEvent(json: string): Quake | null {
  try {
    const msg = JSON.parse(json) as EmscMessage
    if (msg.action !== 'create' && msg.action !== 'update') return null
    const p = msg.data?.properties
    const coords = msg.data?.geometry?.coordinates
    if (!p?.unid || !coords || coords.length < 2) return null
    const mag = Number(p.mag)
    const time = Date.parse(p.time ?? '')
    const [lng, lat] = coords
    if (!Number.isFinite(mag) || !Number.isFinite(time)) return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      id: `emsc:${p.unid}`,
      lat,
      lng,
      mag,
      depthKm: Math.abs(Number(p.depth ?? coords[2] ?? 0)) || 0,
      place: p.flynn_region || 'unknown region',
      time,
    }
  } catch {
    return null
  }
}

/** Same physical event reported by two agencies? Time + location + magnitude
 * all roughly agree (early magnitude estimates differ by up to ~1). */
export function isSameEvent(a: Quake, b: Quake): boolean {
  if (Math.abs(a.time - b.time) > 120_000) return false
  if (Math.abs(a.mag - b.mag) > 1.2) return false
  const dLat = a.lat - b.lat
  const dLng = (((a.lng - b.lng + 540) % 360) - 180) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLng) < 2
}

/** USGS catalog + EMSC extras that USGS doesn't know about yet, newest first. */
export function mergeQuakes(usgs: Quake[], emsc: Quake[]): Quake[] {
  if (emsc.length === 0) return usgs
  const extras = emsc.filter((e) => !usgs.some((u) => isSameEvent(u, e)))
  return extras.length === 0 ? usgs : [...usgs, ...extras].sort((a, b) => b.time - a.time)
}
