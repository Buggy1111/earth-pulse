/** App-level UI hooks: timeline replay, eco mode, time-warp anchor and
 * browser geolocation. Pure React state machines — no globe knowledge. */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectWeakGpu,
  isMobileDevice,
  loadEcoPreference,
  sampleFps,
  saveEcoPreference,
} from './components/perf'
import type { LayerState, OrbitEntry } from './components/hud/types'
import { playPing } from './lib/ping'
import type { Quake } from './lib/quakes'
import { encodeView, parseView } from './lib/share'

const ecoPreference = loadEcoPreference()

/** Eco/performance mode: saved preference > weak-GPU heuristic, plus an FPS
 * watchdog a few seconds after first paint.
 *
 * On a phone/tablet eco is FORCED ON and LOCKED — full quality (8K textures at
 * 2× DPR ≈ 0.5–0.7 GB of GPU memory) overruns an installed PWA's memory budget
 * on iOS and the app crash-reloads. Critically this OVERRIDES any saved
 * preference: a tap on the "fast mode" toggle used to persist eco=off, which
 * then OOM-crashed the device on every launch. The toggle is a no-op on mobile
 * (and the UI disables it). See isMobileDevice(). */
export function useEcoMode(ready: boolean) {
  // mobiles physically can't render full quality without OOM — lock eco on and
  // ignore the persisted preference (which a past tap may have poisoned to off)
  const ecoLocked = isMobileDevice()
  // lazy initializer — the GPU probe must run ONCE, not on every render
  const [eco, setEco] = useState(() => (ecoLocked ? true : (ecoPreference ?? detectWeakGpu())))
  const onToggleEco = useCallback(() => {
    if (ecoLocked) return // full mode OOM-crashes the GPU on phones — don't allow it
    setEco((e) => {
      saveEcoPreference(!e)
      return !e
    })
  }, [ecoLocked])
  const watchdogRan = useRef(false)
  useEffect(() => {
    if (!ready || watchdogRan.current || ecoPreference !== null || ecoLocked) return
    watchdogRan.current = true
    let cancelled = false
    void sampleFps(4_000).then((fps) => {
      if (!cancelled && fps < 36) setEco(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready, ecoLocked])
  return { eco, onToggleEco, ecoLocked }
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
  // 🪟 background freeze guard: while the tab/window is hidden, requestAnimationFrame
  // is paused but the warp clock keeps "accruing". On a high warp that means simMs
  // jumps thousands of × the hidden duration on return → SGP4/helio get a date far
  // in the future → NaN → the whole renderer locks up. So we FREEZE the simulated
  // moment on hide and re-anchor to "now" on show — the hidden gap is simply skipped.
  const onVisibilityChange = useCallback(() => {
    const real = Date.now()
    setSolarTime((prev) =>
      document.hidden
        ? { realMs: real, simMs: prev.simMs + (real - prev.realMs) * prev.warp, warp: prev.warp }
        : { ...prev, realMs: real },
    )
  }, [])
  return { solarTime, onWarp, onWarpReset, onVisibilityChange }
}

/** Reactive CSS media query — true while it matches. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** 📺 Idle kiosk/screensaver: goes active after `idleMs` without any
 * deliberate interaction; the next interaction flips it straight back off.
 * The caller decides what "active" does (clean view + cinematic loop). */
export function useIdleKiosk(idleMs: number) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  useEffect(() => {
    activeRef.current = active
  }, [active])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setActive(true), idleMs)
    }
    const onActivity = () => {
      if (activeRef.current) setActive(false)
      arm()
    }
    arm()
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    for (const e of events) window.addEventListener(e, onActivity, { passive: true })
    return () => {
      clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, onActivity)
    }
  }, [idleMs])
  return active
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

/** 🔔 Optional audio ping when a fresh quake (USGS diff or EMSC live) lands. */
export function useQuakePing(newQuakes: Quake[], emscFresh: Quake[]) {
  const [soundOn, setSoundOn] = useState(false)
  const soundOnRef = useRef(soundOn)
  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])
  const audioRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (newQuakes.length === 0 || !soundOnRef.current) return
    audioRef.current ??= new AudioContext()
    for (const q of newQuakes) playPing(audioRef.current, q.mag)
  }, [newQuakes])
  const pinged = useRef(new Set<string>())
  useEffect(() => {
    if (emscFresh.length === 0 || !soundOnRef.current) return
    audioRef.current ??= new AudioContext()
    for (const q of emscFresh) {
      if (pinged.current.has(q.id)) continue
      pinged.current.add(q.id)
      playPing(audioRef.current, q.mag)
    }
  }, [emscFresh])
  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      if (!on) {
        // create/resume the context on the user gesture — autoplay policy
        audioRef.current ??= new AudioContext()
        void audioRef.current.resume()
      }
      return !on
    })
  }, [])
  return { soundOn, toggleSound }
}

/** Keep the URL hash in sync with the view (shareable links) and restore the
 * orbits from an incoming link once the TLE catalog is loaded. */
export function useShareHash(opts: {
  orbits: OrbitEntry[]
  layers: LayerState
  setOrbits: (updater: (list: OrbitEntry[]) => OrbitEntry[]) => void
  sats: { id: string; name: string }[]
  initialView: ReturnType<typeof parseView>
}) {
  const { orbits, layers, setOrbits, sats, initialView } = opts
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || sats.length === 0 || !initialView?.orbitIds.length) return
    restored.current = true
    const names = new Map(sats.map((s) => [s.id, s.name]))
    setOrbits(() =>
      initialView.orbitIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
    )
  }, [sats, initialView, setOrbits])
  const povRef = useRef(initialView?.camera ?? null)
  const stateRef = useRef({ orbits, layers })
  const writeHash = useCallback(() => {
    const { orbits: o, layers: l } = stateRef.current
    const layersOff = (Object.keys(l) as (keyof LayerState)[]).filter((k) => !l[k])
    const hash = encodeView({ camera: povRef.current ?? undefined, orbitIds: o.map((x) => x.id), layersOff })
    history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname)
  }, [])
  useEffect(() => {
    stateRef.current = { orbits, layers }
    writeHash()
  }, [orbits, layers, writeHash])
  const onPovChange = useCallback(
    (pov: { lat: number; lng: number; altitude: number }) => {
      povRef.current = pov
      writeHash()
    },
    [writeHash],
  )
  return { onPovChange }
}

interface KioskActions {
  setSolarMode: (v: boolean) => void
  setMoonMode: (v: boolean) => void
  setFollowIss: (v: boolean) => void
  setTourOn: (v: boolean) => void
  setFocusPlanet: (v: string | null) => void
  onWarp: (factor: number) => void
  onWarpReset: () => void
  goEarth: () => void
}

/** 📺 While the kiosk is active, cycle a cinematic show every 30 s; on exit
 * hand a clean live Earth back. Actions are read through a ref so the loop
 * isn't torn down every render. */
export function useKioskShow(active: boolean, actions: KioskActions) {
  const ref = useRef(actions)
  useEffect(() => {
    ref.current = actions
  })
  useEffect(() => {
    if (!active) return
    let scene = 0
    const apply = () => {
      const a = ref.current
      const s = scene % 3
      if (s === 0) {
        a.setSolarMode(false)
        a.setMoonMode(false)
        a.setFollowIss(false)
        a.onWarpReset()
        a.setTourOn(true)
      } else if (s === 1) {
        a.setTourOn(false)
        a.setFollowIss(false)
        a.setMoonMode(false)
        a.setFocusPlanet(null)
        a.setSolarMode(true)
        a.onWarp(200_000)
      } else {
        a.setSolarMode(false)
        a.setMoonMode(false)
        a.setTourOn(false)
        a.onWarpReset()
        a.setFollowIss(true)
      }
      scene++
    }
    const kick = setTimeout(apply, 50) // first scene (async — not a sync setState)
    const id = setInterval(apply, 30_000)
    return () => {
      clearTimeout(kick)
      clearInterval(id)
      ref.current.goEarth()
    }
  }, [active])
}
