import { useEffect, useRef, useState } from 'react'
import { EMSC_WS_URL, parseEmscEvent } from './lib/emsc'
import { EONET_URL, parseEvents, type EarthEvent } from './lib/events'
import { parseIss, ISS_URL, type IssState } from './lib/iss'
import { diffNewQuakes, parseQuakes, USGS_FEED_URL, type Quake, type UsgsFeed } from './lib/quakes'
import { parseTle, toTrackedSats, TLE_LOCAL_URL, type TrackedSat } from './lib/satellites'
import {
  KP_URL,
  parseKp,
  parseSolarWind,
  SOLAR_WIND_URL,
  type KpReading,
  type SolarWindReading,
} from './lib/spaceWeather'
import { parseWikiEvent, pushEdit, WIKI_STREAM_URL, type WikiEdit } from './lib/wiki'

export interface QuakeFeed {
  quakes: Quake[]
  /** Quakes first seen on a later refresh than the initial load — "just happened". */
  newQuakes: Quake[]
  /** New quakes still within their flash window — bright rings on the globe. */
  flashes: Quake[]
}

/** USGS quakes, refreshed every `intervalMs`, with new-quake detection.
 * Flash entries expire after `flashMs`. Strict-mode safe. */
export function useQuakes(intervalMs = 60_000, flashMs = 15_000): QuakeFeed {
  const [quakes, setQuakes] = useState<Quake[]>([])
  const [newQuakes, setNewQuakes] = useState<Quake[]>([])
  const [flashes, setFlashes] = useState<Quake[]>([])
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const flashTimers = new Set<ReturnType<typeof setTimeout>>()
    const seenIds = new Set<string>()
    const byId = new Map<string, Quake>()
    let primed = false
    const tick = async () => {
      try {
        const resp = await fetch(USGS_FEED_URL)
        const data = (await resp.json()) as UsgsFeed
        // keep object identity for unchanged events so the globe reuses their
        // sprites; rebuild the map so events aging out of the 24h window drop
        const keep = new Map<string, Quake>()
        const parsed = parseQuakes(data).map((q) => {
          const old = byId.get(q.id)
          const stable = old && old.mag === q.mag && old.time === q.time ? old : q
          keep.set(q.id, stable)
          return stable
        })
        byId.clear()
        for (const [k, v] of keep) byId.set(k, v)
        // first load just primes the id set — don't flag 24h of history as "new"
        const fresh = primed ? diffNewQuakes(seenIds, parsed) : []
        primed = true
        for (const q of parsed) seenIds.add(q.id)
        if (cancelled) return
        setQuakes(parsed)
        if (fresh.length > 0) {
          setNewQuakes(fresh)
          setFlashes((list) => [...list, ...fresh])
          const freshIds = new Set(fresh.map((q) => q.id))
          const expiry = setTimeout(() => {
            flashTimers.delete(expiry)
            if (!cancelled) setFlashes((list) => list.filter((q) => !freshIds.has(q.id)))
          }, flashMs)
          flashTimers.add(expiry)
        }
      } catch {
        // network hiccup — keep showing the last data
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      for (const t of flashTimers) clearTimeout(t)
    }
  }, [intervalMs, flashMs])
  return { quakes, newQuakes, flashes }
}

/** EMSC SeismicPortal WebSocket — quakes within ~a minute of the shaking,
 * minutes before they reach the USGS feed. Auto-reconnects; `fresh` holds
 * events younger than ~20 s (they drive the flash ring + ping). */
export function useEmsc(maxAgeMs = 3_600_000): { quakes: Quake[]; fresh: Quake[] } {
  const [quakes, setQuakes] = useState<Quake[]>([])
  const [fresh, setFresh] = useState<Quake[]>([])
  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let lastMsg = Date.now()
    let attempts = 0
    const freshTimers = new Set<ReturnType<typeof setTimeout>>()
    const connect = () => {
      if (cancelled) return
      try {
        lastMsg = Date.now()
        ws = new WebSocket(EMSC_WS_URL)
      } catch {
        return // no WebSocket support — USGS poll still covers us
      }
      ws.onmessage = (event) => {
        lastMsg = Date.now()
        attempts = 0 // live data flowing → next reconnect starts fast again
        const q = parseEmscEvent(String(event.data))
        if (!q || cancelled) return
        const cutoff = Date.now() - maxAgeMs
        setQuakes((list) => [q, ...list.filter((x) => x.id !== q.id && x.time > cutoff)])
        setFresh((list) => [...list.filter((x) => x.id !== q.id), q])
        const t = setTimeout(() => {
          freshTimers.delete(t)
          if (!cancelled) setFresh((list) => list.filter((x) => x.id !== q.id))
        }, 20_000)
        freshTimers.add(t)
      }
      ws.onclose = () => {
        // exponential backoff to 2 min — a dead seismicportal isn't redialed
        // every 8 s forever (USGS poll covers quakes meanwhile)
        attempts++
        if (!cancelled) reconnect = setTimeout(connect, Math.min(8_000 * 2 ** (attempts - 1), 120_000))
      }
    }
    connect()
    // heartbeat watchdog: the worldwide feed delivers events every few minutes;
    // total silence means a half-open socket (network switch, laptop sleep) that
    // will never fire onclose — force the close so the reconnect path kicks in
    const staleClose = () => {
      if (ws && Date.now() - lastMsg > 10 * 60_000) ws.close()
    }
    const onVisible = () => document.hidden || staleClose()
    document.addEventListener('visibilitychange', onVisible)
    const prune = setInterval(() => {
      setQuakes((list) => list.filter((x) => x.time > Date.now() - maxAgeMs))
      staleClose()
    }, 60_000)
    return () => {
      cancelled = true
      clearTimeout(reconnect)
      clearInterval(prune)
      document.removeEventListener('visibilitychange', onVisible)
      for (const t of freshTimers) clearTimeout(t)
      ws?.close()
    }
  }, [maxAgeMs])
  return { quakes, fresh }
}

/** Parsed TLE element sets, loaded once. Propagation itself runs inside
 * GlobeView's 1 Hz engine — React only sees this single load. */
export function useTleSats(): TrackedSat[] {
  const [sats, setSats] = useState<TrackedSat[]>([])
  useEffect(() => {
    let cancelled = false
    void fetch(TLE_LOCAL_URL)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setSats(toTrackedSats(parseTle(text)))
      })
      .catch(() => {
        // no TLE snapshot — globe simply shows no satellites
      })
    return () => {
      cancelled = true
    }
  }, [])
  return sats
}

/** NASA EONET natural events (wildfires, storms, volcanoes…), refreshed slowly. */
export function useEvents(intervalMs = 600_000): EarthEvent[] {
  const [events, setEvents] = useState<EarthEvent[]>([])
  useEffect(() => {
    let cancelled = false
    const load = () =>
      void fetch(EONET_URL)
        .then((r) => r.json())
        .then((json) => {
          if (!cancelled) setEvents(parseEvents(json))
        })
        .catch(() => {
          // EONET unreachable — the events layer just stays empty
        })
    load()
    const id = setInterval(load, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])
  return events
}

export interface SpaceWeather {
  kp: KpReading | null
  wind: SolarWindReading | null
}

/** NOAA SWPC space weather (Kp + solar wind), refreshed every `intervalMs`. */
export function useSpaceWeather(intervalMs = 60_000): SpaceWeather {
  const [state, setState] = useState<SpaceWeather>({ kp: null, wind: null })
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const [kp, wind] = await Promise.all([
        fetch(KP_URL).then((r) => r.json()).then(parseKp).catch(() => null),
        fetch(SOLAR_WIND_URL).then((r) => r.json()).then(parseSolarWind).catch(() => null),
      ])
      if (!cancelled) {
        // keep the last good reading if one endpoint hiccups
        setState((prev) => ({ kp: kp ?? prev.kp, wind: wind ?? prev.wind }))
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])
  return state
}

/** ISS position, refreshed every `intervalMs` (API asks for >= 1s between calls).
 * Consecutive failures back the poll off up to 60 s — a dead endpoint isn't
 * hammered every 3 s for the whole visit; one success snaps the cadence back. */
export function useIss(intervalMs = 3_000): IssState | null {
  const [iss, setIss] = useState<IssState | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const tick = async () => {
      if (!document.hidden) {
        // hidden tab: skip the fetch (and its setState) but keep the timer
        // ticking so the feed resumes the moment the tab is visible again
        try {
          const resp = await fetch(ISS_URL)
          const data = await resp.json()
          failures = 0
          if (!cancelled) setIss(parseIss(data))
        } catch {
          failures++ // keep last position
        }
      }
      const delay = Math.min(intervalMs * 2 ** failures, 60_000)
      if (!cancelled) timer = setTimeout(tick, delay)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])
  return iss
}

/** Live Wikipedia edits over SSE + a counter of everything seen this visit.
 * The raw stream delivers ~5–20 edits/s and every one used to setState twice —
 * a re-render storm through the whole App tree that ate straight into the WebGL
 * frame budget on weak GPUs. Edits are buffered in refs and flushed at most
 * once a second instead, and the stream disconnects entirely while the tab is
 * hidden (it's a "live now" feed — there's nothing to catch up on). */
export function useWikiFeed(max = 7): { edits: WikiEdit[]; totalSeen: number } {
  const [state, setState] = useState<{ edits: WikiEdit[]; totalSeen: number }>({
    edits: [],
    totalSeen: 0,
  })
  const totalRef = useRef(0)
  useEffect(() => {
    let source: EventSource | null = null
    let pending: WikiEdit[] = []
    let flushTimer: ReturnType<typeof setInterval> | undefined

    const flush = () => {
      if (!pending.length) return
      const batch = pending
      pending = []
      setState((s) => ({
        edits: batch.reduce((list, e) => pushEdit(list, e, max), s.edits),
        totalSeen: totalRef.current,
      }))
    }
    const connect = () => {
      if (source) return
      source = new EventSource(WIKI_STREAM_URL)
      source.onmessage = (event) => {
        const edit = parseWikiEvent(event.data as string)
        if (!edit) return
        totalRef.current += 1
        pending.push(edit)
      }
      flushTimer = setInterval(flush, 1_000)
    }
    const disconnect = () => {
      source?.close()
      source = null
      if (flushTimer) clearInterval(flushTimer)
      flushTimer = undefined
      pending = []
    }
    const onVisibility = () => (document.hidden ? disconnect() : connect())
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) connect()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      disconnect()
    }
  }, [max])
  return state
}

/** Current time, ticking every second (for clocks / "ago" labels). */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
