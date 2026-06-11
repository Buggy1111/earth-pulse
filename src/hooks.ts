import { useEffect, useRef, useState } from 'react'
import { parseIss, ISS_URL, type IssState } from './lib/iss'
import { parseQuakes, USGS_FEED_URL, type Quake, type UsgsFeed } from './lib/quakes'
import { parseWikiEvent, pushEdit, WIKI_STREAM_URL, type WikiEdit } from './lib/wiki'

/** USGS quakes, refreshed every `intervalMs`. Strict-mode safe. */
export function useQuakes(intervalMs = 60_000): Quake[] {
  const [quakes, setQuakes] = useState<Quake[]>([])
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const resp = await fetch(USGS_FEED_URL)
        const feed = (await resp.json()) as UsgsFeed
        if (!cancelled) setQuakes(parseQuakes(feed))
      } catch {
        // network hiccup — keep showing the last data
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])
  return quakes
}

/** ISS position, refreshed every `intervalMs` (API asks for >= 1s between calls). */
export function useIss(intervalMs = 5_000): IssState | null {
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
