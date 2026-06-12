import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import {
  AbovePanel,
  IssPanel,
  QuakeDetail,
  QuakePanel,
  SpaceWeatherPanel,
  TitleCard,
  WikiPanel,
} from './components/hud/panels'
import { EarthDock, LoadingOverlay, TimelinePanel } from './components/hud/controls'
import { SettingsPanel } from './components/hud/SettingsPanel'
import type { LayerState, OrbitEntry } from './components/hud/types'
import { MoonPanel } from './components/MoonPanel'
import { PlanetPanel } from './components/PlanetPanel'
import { useEmsc, useIss, useNow, useQuakes, useSpaceWeather, useTleSats, useWikiFeed } from './hooks'
import { useEcoMode, useGeolocate, useSolarTime, useTimeline } from './uiHooks'
import { mergeQuakes } from './lib/emsc'
import { moonPhaseLabel, subLunarPoint, type ApolloSite } from './lib/moon'
import { playPing } from './lib/ping'
import type { Quake } from './lib/quakes'
import { isIss, nextPass, satsAbove } from './lib/satellites'
import { encodeView, parseView } from './lib/share'

// shared link? restore camera/orbits/layers from the URL hash
const initialView = parseView(window.location.hash)

export default function App() {
  const { quakes: usgsQuakes, newQuakes, flashes: usgsFlashes } = useQuakes()
  const { quakes: emscQuakes, fresh: emscFresh } = useEmsc()
  const quakes = useMemo(() => mergeQuakes(usgsQuakes, emscQuakes), [usgsQuakes, emscQuakes])
  const flashes = useMemo(() => [...usgsFlashes, ...emscFresh], [usgsFlashes, emscFresh])
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
      labels: true,
      volcanoes: false,
      detail: true,
    }
    for (const k of initialView?.layersOff ?? []) base[k as keyof LayerState] = false
    return base
  })
  const [orbits, setOrbits] = useState<OrbitEntry[]>([])
  const { userLoc, locating, locVersion, onLocate } = useGeolocate()
  const [focusSat, setFocusSat] = useState<{ id: string; v: number } | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; v: number } | null>(null)
  const { eco, onToggleEco } = useEcoMode(ready)

  const orbitIds = useMemo(() => orbits.map((o) => o.id), [orbits])
  const satList = useMemo(
    () => sats.filter((s) => !isIss(s.name)).map((s) => ({ id: s.id, name: s.name })),
    [sats],
  )

  const { timeOffsetH, playing: timelinePlaying, onToggle: onTimelineToggle, onScrub: onTimelineScrub } = useTimeline()
  const simNow = now + timeOffsetH * 3_600_000
  const timelineActive = timeOffsetH < 0
  const displayQuakes = useMemo(
    () => (timelineActive ? quakes.filter((q) => q.time <= simNow) : quakes),
    [quakes, timelineActive, simNow],
  )

  // next ISS pass over the user's location, re-checked once a minute
  const minuteNow = Math.floor(now / 60_000)
  const issPass = useMemo(() => {
    if (!userLoc) return null
    const issSat = sats.find((s) => isIss(s.name))
    if (!issSat) return null
    return nextPass(issSat, userLoc, new Date(minuteNow * 60_000))
  }, [userLoc, sats, minuteNow])

  // satellites above the user's horizon, refreshed every 5 s
  const tick5 = Math.floor(now / 5_000)
  const overhead = useMemo(
    () => (userLoc && sats.length > 0 ? satsAbove(sats, userLoc, new Date(tick5 * 5_000)) : []),
    [userLoc, sats, tick5],
  )

  // moon phase for the HUD, recomputed per minute
  const moonState = useMemo(() => subLunarPoint(new Date(minuteNow * 60_000)), [minuteNow])
  const moonLabel = useMemo(() => moonPhaseLabel(moonState), [moonState])

  // 🎬 cinematic tour
  const [tourOn, setTourOn] = useState(false)
  const onTourToggle = useCallback(() => {
    setTourOn((t) => {
      if (!t) setFollowIss(false)
      return !t
    })
  }, [])
  const onTourBroken = useCallback(() => setTourOn(false), [])

  // 🌙 moon mode: click the Moon (or the HUD line) → orbit IT instead of Earth
  const [moonMode, setMoonMode] = useState(false)
  const [apolloSite, setApolloSite] = useState<ApolloSite | null>(null)
  // 🪐 solar system mode + ⏩ time-warp (simMs runs warp× faster than real)
  const [solarMode, setSolarMode] = useState(false)
  const [focusPlanet, setFocusPlanet] = useState<string | null>(null)
  const { solarTime, onWarp, onWarpReset } = useSolarTime()
  const solarSimNow = solarTime.simMs + (now - solarTime.realMs) * solarTime.warp
  const onMoonEnter = useCallback(() => {
    setMoonMode(true)
    setSolarMode(false)
    setFollowIss(false)
    setTourOn(false)
    setApolloSite(null)
  }, [])
  const onMoonExit = useCallback(() => {
    setMoonMode(false)
    setApolloSite(null)
  }, [])
  const onApolloPick = useCallback((site: ApolloSite | null) => setApolloSite(site), [])

  // which world the HUD lives in right now
  const mode: 'earth' | 'moon' | 'solar' = solarMode ? 'solar' : moonMode ? 'moon' : 'earth'
  const onSolarToggle = useCallback(() => {
    setSolarMode((s) => {
      if (!s) {
        setMoonMode(false)
        setFollowIss(false)
        setTourOn(false)
      }
      setFocusPlanet(null)
      return !s
    })
  }, [])
  const onSolarOverview = useCallback(() => setFocusPlanet(null), [])
  const onSolarExit = useCallback(() => {
    setSolarMode(false)
    setFocusPlanet(null)
    onWarpReset() // Earth always comes back live
  }, [onWarpReset])
  const onPlanetPick = useCallback(
    (id: string) => (id === 'earth' ? onSolarExit() : setFocusPlanet(id)),
    [onSolarExit],
  )

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
  // EMSC live events ping too (these are the truly "right now" ones)
  const pingedEmsc = useRef(new Set<string>())
  useEffect(() => {
    if (emscFresh.length === 0 || !soundOnRef.current) return
    audioRef.current ??= new AudioContext()
    for (const q of emscFresh) {
      if (pingedEmsc.current.has(q.id)) continue
      pingedEmsc.current.add(q.id)
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

  const onReady = useCallback(() => setReady(true), [])
  const onFollowBroken = useCallback(() => setFollowIss(false), [])
  const onIssClick = useCallback(() => setFollowIss((f) => !f), [])
  return (
    <>
      <GlobeView
        quakes={displayQuakes}
        flashes={timelineActive ? [] : flashes}
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
        simNow={simNow}
        tour={tourOn}
        onTourBroken={onTourBroken}
        moonMode={moonMode}
        onMoonEnter={onMoonEnter}
        onApolloPick={onApolloPick}
        solarMode={solarMode}
        focusPlanet={focusPlanet}
        onPlanetPick={onPlanetPick}
        solarTime={solarTime}
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

      {/* HUD overlay — mode-aware: Earth shows the live dashboards, Moon and
          Solar modes keep only what belongs to them. Pointer events live on
          the panels; the globe stays draggable. */}
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col items-start gap-3">
            <TitleCard
              now={now}
              satCount={sats.length}
              subtitle={
                solarMode
                  ? 'the solar system, live — click any body to orbit it'
                  : moonMode
                    ? 'orbiting the Moon — drag to orbit, scroll to zoom'
                    : undefined
              }
            />
            {mode === 'earth' && (
              <SpaceWeatherPanel weather={weather} moonLabel={moonLabel} onOpenMoon={onMoonEnter} />
            )}
            {mode === 'moon' && (
              <MoonPanel moon={moonState} picked={apolloSite} onBack={onMoonExit} />
            )}
            {mode === 'solar' && (
              <PlanetPanel
                focus={focusPlanet}
                now={solarSimNow}
                realNow={now}
                warp={solarTime.warp}
                onWarp={onWarp}
                onWarpReset={onWarpReset}
                onOverview={onSolarOverview}
                onNavigate={setFocusPlanet}
                onBack={onSolarExit}
              />
            )}
            {mode === 'earth' && (
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
            )}
            {mode === 'earth' && userLoc && <AbovePanel overhead={overhead} onPickSat={onPickSat} />}
          </div>
          {mode === 'earth' && <WikiPanel edits={edits} totalSeen={totalSeen} />}
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col items-start gap-3">
            {mode === 'earth' && (
              <>
                <TimelinePanel
                  offsetH={timeOffsetH}
                  playing={timelinePlaying}
                  onScrub={onTimelineScrub}
                  onTogglePlay={onTimelineToggle}
                />
                <QuakePanel
                  quakes={displayQuakes}
                  flashes={timelineActive ? [] : flashes}
                  now={simNow}
                  onFocusQuake={onFocusQuake}
                  soundOn={soundOn}
                  onToggleSound={toggleSound}
                />
              </>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            {mode === 'earth' && selected && (
              <QuakeDetail quake={selected} now={now} onClose={() => setSelected(null)} />
            )}
            {mode === 'earth' && (
              <EarthDock
                solarMode={solarMode}
                tourOn={tourOn}
                followIss={followIss}
                showFollow={layers.iss}
                onSolar={onSolarToggle}
                onTour={onTourToggle}
                onFollow={onIssClick}
              />
            )}
            {mode === 'earth' && <IssPanel iss={iss} pass={issPass} now={now} />}
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
