/** Global live ships via aisstream.io — a free WebSocket AIS feed with
 * worldwide coverage. Needs a free API key (sign up at aisstream.io) supplied
 * as VITE_AISSTREAM_KEY; without it the app falls back to the keyless
 * Fintraffic Baltic feed (see ships.ts).
 *
 * ⚠️ The key is baked into the browser bundle (this is a client-side
 * WebSocket), so use a FREE, disposable key — never a paid or secret one. */

import type { Ship } from './ships'

export const AISSTREAM_KEY = import.meta.env.VITE_AISSTREAM_KEY as string | undefined

const KT_TO_KMH = 1.852
const WORLD_BBOX = [
  [
    [-90, -180],
    [90, 180],
  ],
]

/** Open the global AIS stream, calling `onShip` for each position report.
 * Auto-reconnects. Returns a disposer. No-op (returns immediately) when no key
 * is configured. */
export function startAisStream(onShip: (s: Ship) => void): () => void {
  if (!AISSTREAM_KEY) return () => {}
  let ws: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (closed) return
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    ws.onopen = () => {
      // the subscription MUST arrive within 3 s or the socket is closed
      ws?.send(
        JSON.stringify({
          APIKey: AISSTREAM_KEY,
          BoundingBoxes: WORLD_BBOX,
          FilterMessageTypes: ['PositionReport'],
        }),
      )
    }
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as AisMessage
        if (m.MessageType !== 'PositionReport') return
        const pr = m.Message?.PositionReport
        if (!pr || !Number.isFinite(pr.Latitude) || !Number.isFinite(pr.Longitude)) return
        if (Math.abs(pr.Latitude) > 90 || Math.abs(pr.Longitude) > 180) return
        const sog = pr.Sog ?? 0
        const heading = pr.TrueHeading != null && pr.TrueHeading < 360 ? pr.TrueHeading : (pr.Cog ?? 0)
        onShip({
          mmsi: pr.UserID ?? m.Metadata?.MMSI ?? 0,
          lat: pr.Latitude,
          lng: pr.Longitude,
          speedKmh: sog * KT_TO_KMH,
          courseDeg: pr.Cog ?? 0,
          headingDeg: heading,
          moving: sog > 0.5,
        })
      } catch {
        // malformed frame — skip
      }
    }
    ws.onclose = () => {
      if (!closed) retry = setTimeout(connect, 5_000)
    }
    ws.onerror = () => ws?.close()
  }

  connect()
  return () => {
    closed = true
    clearTimeout(retry)
    ws?.close()
  }
}

interface AisMessage {
  MessageType?: string
  Metadata?: { MMSI?: number }
  Message?: {
    PositionReport?: {
      UserID?: number
      Latitude: number
      Longitude: number
      Cog?: number
      Sog?: number
      TrueHeading?: number
    }
  }
}
