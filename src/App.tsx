import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import {
  FollowIssButton,
  IssPanel,
  LoadingOverlay,
  QuakeDetail,
  QuakePanel,
  SettingsPanel,
  SoundToggle,
  SpaceWeatherPanel,
  TitleCard,
  WikiPanel,
  type LayerState,
  type OrbitEntry,
} from './components/Hud'
import { detectWeakGpu, loadEcoPreference, sampleFps, saveEcoPreference } from './components/perf'
import { useIss, useNow, useQuakes, useSpaceWeather, useTleSats, useWikiFeed } from './hooks'
import { playPing } from './lib/ping'
import type { Quake } from './lib/quakes'
import { isIss, nextPass } from './lib/satellites'
import { encodeView, parseView } from './lib/share'

const ecoPreference = loadEcoPreference()
// shared link? restore camera/orbits/layers from the URL hash
const initialView = parseView(window.location.hash)

export default function App() {
  const { quakes, newQuakes, flashes } = useQuakes()
  const iss = useIss()
  const sats = useTleSats()
  const weather = useSpaceWeather()
  const { edits, totalSeen } = useWikiFeed()
  const now = useNow()
  const [selected, setSelected] = useState<Quake | null>(null)
  const [ready, setReady] = useState(false)
  const [followIss, setFollowIss] = useState(false)
  const [soundOn, setSoundOn] = useState(false)

  // user customization: visible layers, chosen orbits, own location
  const [layers, setLayers] = useState<LayerState>(() => {
    const base: LayerState = {
      sats: true,
      iss: true,
      quakes: true,
      aurora: true,
      clouds: true,
      borders: true,
      detail: true,
    }
    for (const k of initialView?.layersOff ?? []) base[k as keyof LayerState] = false
    return base
  })
  const [orbits, setOrbits] = useState<OrbitEntry[]>([])
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locVersion, setLocVersion] = useState(0)
  const [focusSat, setFocusSat] = useState<{ id: string; v: number } | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; v: number } | null>(null)

  // performance: saved preference > weak-GPU heuristic; FPS watchdog can
  // still kick in after load if the machine turns out to struggle.
  // Lazy initializer — the GPU probe must run ONCE, not on every render.
  const [eco, setEco] = useState(() => ecoPreference ?? detectWeakGpu())
  const onToggleEco = useCallback(() => {
    setEco((e) => {
      saveEcoPreference(!e)
      return !e
    })
  }, [])

  const orbitIds = useMemo(() => orbits.map((o) => o.id), [orbits])
  const satList = useMemo(
    () => sats.filter((s) => !isIss(s.name)).map((s) => ({ id: s.id, name: s.name })),
    [sats],
  )

  // next ISS pass over the user's location, re-checked once a minute
  const minuteNow = Math.floor(now / 60_000)
  const issPass = useMemo(() => {
    if (!userLoc) return null
    const issSat = sats.find((s) => isIss(s.name))
    if (!issSat) return null
    return nextPass(issSat, userLoc, new Date(minuteNow * 60_000))
  }, [userLoc, sats, minuteNow])

  const onToggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((l) => {
      const next = { ...l, [key]: !l[key] }
      if (key === 'iss' && !next.iss) setFollowIss(false)
      return next
    })
  }, [])

  const onSatClick = useCallback((id: string, name: string) => {
    setOrbits((list) =>
      list.some((o) => o.id === id) ? list.filter((o) => o.id !== id) : [...list, { id, name }],
    )
  }, [])
  const onRemoveOrbit = useCallback(
    (id: string) => setOrbits((list) => list.filter((o) => o.id !== id)),
    [],
  )
  const onClearOrbits = useCallback(() => setOrbits([]), [])

  // search pick: show the orbit AND fly the camera to the satellite
  const onPickSat = useCallback((id: string, name: string) => {
    setOrbits((list) => (list.some((o) => o.id === id) ? list : [...list, { id, name }]))
    setFocusSat((f) => ({ id, v: (f?.v ?? 0) + 1 }))
  }, [])

  const onFocusQuake = useCallback((q: Quake) => {
    setSelected(q)
    setFlyTo((f) => ({ lat: q.lat, lng: q.lng, v: (f?.v ?? 0) + 1 }))
  }, [])

  // shared-link orbits: restore once the TLE catalog is in
  const orbitsRestored = useRef(false)
  useEffect(() => {
    if (orbitsRestored.current || sats.length === 0 || !initialView?.orbitIds.length) return
    orbitsRestored.current = true
    const names = new Map(sats.map((s) => [s.id, s.name]))
    setOrbits(
      initialView.orbitIds
        .filter((id) => names.has(id))
        .map((id) => ({ id, name: names.get(id)! })),
    )
  }, [sats])

  // keep the URL hash in sync — anyone can copy the address bar to share
  const povRef = useRef(initialView?.camera ?? null)
  const shareStateRef = useRef({ orbits, layers })
  const writeHash = useCallback(() => {
    const { orbits: o, layers: l } = shareStateRef.current
    const layersOff = (Object.keys(l) as (keyof LayerState)[]).filter((k) => !l[k])
    const hash = encodeView({
      camera: povRef.current ?? undefined,
      orbitIds: o.map((x) => x.id),
      layersOff,
    })
    history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname)
  }, [])
  useEffect(() => {
    shareStateRef.current = { orbits, layers }
    writeHash()
  }, [orbits, layers, writeHash])
  const onPovChange = useCallback(
    (pov: { lat: number; lng: number; altitude: number }) => {
      povRef.current = pov
      writeHash()
    },
    [writeHash],
  )

  const onLocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocVersion((v) => v + 1) // re-fly even to the same place
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }, [])

  // audible ping for just-detected quakes (opt-in via the 🔔 toggle)
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

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      // create/resume the context on the user gesture — autoplay policy
      if (!on) {
        audioRef.current ??= new AudioContext()
        void audioRef.current.resume()
      }
      return !on
    })
  }, [])

  // FPS watchdog: no saved preference + not already eco → sample a few
  // seconds after load and drop to eco automatically when it stutters
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

  const onReady = useCallback(() => setReady(true), [])
  const onFollowBroken = useCallback(() => setFollowIss(false), [])
  const onIssClick = useCallback(() => setFollowIss((f) => !f), [])

  return (
    <>
      <GlobeView
        quakes={quakes}
        flashes={flashes}
        iss={iss}
        sats={sats}
        kp={weather.kp?.kp ?? null}
        layers={layers}
        selectedOrbitIds={orbitIds}
        userLoc={userLoc}
        locVersion={locVersion}
        eco={eco}
        focusSat={focusSat}
        flyTo={flyTo}
        initialPov={initialView?.camera ?? null}
        onPovChange={onPovChange}
        followIss={followIss}
        onFollowBroken={onFollowBroken}
        onIssClick={onIssClick}
        onSatClick={onSatClick}
        onQuakeClick={setSelected}
        onReady={onReady}
      />
      {!ready && <LoadingOverlay />}

      {/* HUD overlay — pointer-events only on the panels, globe stays draggable */}
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col items-start gap-3">
            <TitleCard now={now} satCount={sats.length} />
            <SpaceWeatherPanel weather={weather} />
            <SettingsPanel
              layers={layers}
              onToggleLayer={onToggleLayer}
              orbits={orbits}
              onRemoveOrbit={onRemoveOrbit}
              onClearOrbits={onClearOrbits}
              satList={satList}
              onPickSat={onPickSat}
              eco={eco}
              onToggleEco={onToggleEco}
              userLoc={userLoc}
              locating={locating}
              onLocate={onLocate}
            />
          </div>
          <WikiPanel edits={edits} totalSeen={totalSeen} />
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <SoundToggle on={soundOn} onToggle={toggleSound} />
            <QuakePanel quakes={quakes} flashes={flashes} now={now} onFocusQuake={onFocusQuake} />
          </div>
          <div className="flex flex-col items-end gap-3">
            {selected && <QuakeDetail quake={selected} now={now} onClose={() => setSelected(null)} />}
            {layers.iss && <FollowIssButton active={followIss} onToggle={() => setFollowIss((f) => !f)} />}
            <IssPanel iss={iss} pass={issPass} now={now} />
          </div>
        </div>
      </div>

      <p className="pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-600">
        Earth Pulse · open source · no API keys · zoom imagery © Esri &amp; contributors · textures ©
        Solar System Scope (CC BY)
      </p>
    </>
  )
}
