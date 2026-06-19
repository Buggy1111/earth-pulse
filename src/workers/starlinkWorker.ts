/** SGP4 for the whole Starlink constellation (10k+ sats) off the main thread.
 *
 * Propagating 10k satellites every frame would stall the UI, so this worker
 * owns it: parse the TLE snapshot once, then on each `tick` propagate all of
 * them and post back a packed Float32Array of [lat, lng, altKm, …]. A decayed
 * or erroring sat gets altKm = -1 so the main thread can hide that instance
 * while keeping every index stable. The buffer is transferred, not copied. */

/// <reference lib="webworker" />

import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js'
import { parseTle } from '../lib/satellites'

declare const self: DedicatedWorkerGlobalScope

type InMessage =
  | { type: 'init'; tle: string }
  | { type: 'tick'; timeMs: number }

let satrecs: SatRec[] = []

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data
  if (msg.type === 'init') {
    satrecs = []
    for (const s of parseTle(msg.tle)) {
      try {
        satrecs.push(twoline2satrec(s.line1, s.line2))
      } catch {
        // malformed element set — skip
      }
    }
    self.postMessage({ type: 'ready', count: satrecs.length })
    return
  }
  // tick: propagate everyone to the given instant
  const date = new Date(msg.timeMs)
  const gmst = gstime(date)
  const data = new Float32Array(satrecs.length * 3)
  for (let i = 0; i < satrecs.length; i++) {
    let lat = 0
    let lng = 0
    let alt = -1 // sentinel: hidden (decayed / non-finite)
    try {
      const pv = propagate(satrecs[i], date)
      if (pv && typeof pv.position !== 'boolean') {
        const geo = eciToGeodetic(pv.position, gmst)
        if (
          Number.isFinite(geo.height) &&
          geo.height > 80 &&
          Number.isFinite(geo.latitude) &&
          Number.isFinite(geo.longitude)
        ) {
          lat = degreesLat(geo.latitude)
          lng = degreesLong(geo.longitude)
          alt = geo.height
        }
      }
    } catch {
      // SGP4 blow-up — leave hidden
    }
    data[i * 3] = lat
    data[i * 3 + 1] = lng
    data[i * 3 + 2] = alt
  }
  self.postMessage({ type: 'positions', timeMs: msg.timeMs, data }, [data.buffer])
}
