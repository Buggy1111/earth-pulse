/** App-level UI hooks: timeline replay, eco mode, time-warp anchor and
 * browser geolocation. Pure React state machines — no globe knowledge. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { detectWeakGpu, loadEcoPreference, sampleFps, saveEcoPreference } from './components/perf'

const ecoPreference = loadEcoPreference()

/** Eco/performance mode: saved preference > weak-GPU heuristic, plus an FPS
 * watchdog a few seconds after first paint. */
export function useEcoMode(ready: boolean) {
  // lazy initializer — the GPU probe must run ONCE, not on every render
  const [eco, setEco] = useState(() => ecoPreference ?? detectWeakGpu())
  const onToggleEco = useCallback(() => {
    setEco((e) => {
      saveEcoPreference(!e)
      return !e
    })
  }, [])
  const watchdogRan = useRef(false)
  useEffect(() => {
    if (!ready || watchdogRan.current || ecoPreference !== null) return
    watchdogRan.current = true
    let cancelled = false
    void sampleFps(4_000).then((fps) => {
      if (!cancelled && fps < 36) setEco(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])
  return { eco, onToggleEco }
}

/** 24h earthquake timeline: offsetH −24…0, 0 = live; play replays the day. */
export function useTimeline() {
  const [timeOffsetH, setTimeOffsetH] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTimeOffsetH((o) => {
        const next = o + 0.25
        if (next >= 0) {
          setPlaying(false)
          return 0
        }
        return next
      })
    }, 120)
    return () => clearInterval(id)
  }, [playing])
  const onToggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) setTimeOffsetH((o) => (o >= 0 ? -24 : o)) // replay from the start
      return !p
    })
  }, [])
  const onScrub = useCallback((h: number) => {
    setPlaying(false)
    setTimeOffsetH(h)
  }, [])
  return { timeOffsetH, playing, onToggle, onScrub }
}

/** ⏩ time-warp anchor: simMs advances `warp`× faster than real time. */
export function useSolarTime() {
  const [solarTime, setSolarTime] = useState(() => {
    const t = Date.now()
    return { realMs: t, simMs: t, warp: 1 }
  })
  const onWarp = useCallback((warp: number) => {
    // keep the simulated moment continuous; ×1 = pause at that moment
    setSolarTime((prev) => {
      const real = Date.now()
      return { realMs: real, simMs: prev.simMs + (real - prev.realMs) * prev.warp, warp }
    })
  }, [])
  const onWarpReset = useCallback(() => {
    const t = Date.now()
    setSolarTime({ realMs: t, simMs: t, warp: 1 })
  }, [])
  return { solarTime, onWarp, onWarpReset }
}

/** Browser geolocation with a version counter (re-fly to the same spot). */
export function useGeolocate() {
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locVersion, setLocVersion] = useState(0)
  const onLocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocVersion((v) => v + 1)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }, [])
  return { userLoc, locating, locVersion, onLocate }
}
