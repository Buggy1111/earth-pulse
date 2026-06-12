import { useEffect, useRef, useState } from 'react'
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

/** ISS position, refreshed every `intervalMs` (API asks for >= 1s between calls). */
export function useIss(intervalMs = 3_000): IssState | null {
  const [iss, setIss] = useState<IssState | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const resp = await fetch(ISS_URL)
        const data = await resp.json()
        if (!cancelled) setIss(parseIss(data))
      } catch {
        // keep last position
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])
  return iss
}

/** Live Wikipedia edits over SSE + a counter of everything seen this visit. */
export function useWikiFeed(max = 7): { edits: WikiEdit[]; totalSeen: number } {
  const [edits, setEdits] = useState<WikiEdit[]>([])
  const totalRef = useRef(0)
  const [totalSeen, setTotalSeen] = useState(0)
  useEffect(() => {
    const source = new EventSource(WIKI_STREAM_URL)
    source.onmessage = (event) => {
      const edit = parseWikiEvent(event.data as string)
      if (!edit) return
      totalRef.current += 1
      setTotalSeen(totalRef.current)
      setEdits((list) => pushEdit(list, edit, max))
    }
    return () => source.close()
  }, [max])
  return { edits, totalSeen }
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
