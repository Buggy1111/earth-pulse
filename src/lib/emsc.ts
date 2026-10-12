/** EMSC SeismicPortal live earthquake stream (WebSocket).
 *
 * Events arrive within ~a minute of the actual shaking — well before they
 * show up in the USGS feed poll. Parsing + USGS de-duplication is pure and
 * tested; the socket lives in a hook.
 */

import type { Quake } from './quakes'
import { isSameEvent } from './quakeMatch.mjs'

export { isSameEvent }

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
    // Number(null) === 0: an event without a reported magnitude is not M0.
    if (p.mag == null || typeof p.mag !== 'number') return null
    const mag = p.mag
    const time = Date.parse(p.time ?? '')
    const [lng, lat] = coords
    if (!Number.isFinite(mag) || !Number.isFinite(time)) return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
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

/** USGS catalog + EMSC extras that USGS doesn't know about yet, newest first. */
export function mergeQuakes(usgs: Quake[], emsc: Quake[]): Quake[] {
  if (emsc.length === 0) return usgs
  const extras = emsc.filter((e) => !usgs.some((u) => isSameEvent(u, e)))
  return extras.length === 0 ? usgs : [...usgs, ...extras].sort((a, b) => b.time - a.time)
}
