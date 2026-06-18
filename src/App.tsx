import { useCallback, useEffect, useMemo, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import { Hud } from './components/hud/Hud'
import { LoadingOverlay, ShowHudButton } from './components/hud/controls'
import type { LayerState, OrbitEntry } from './components/hud/types'
import {
  useEmsc,
  useEvents,
  useIss,
  useNow,
  useQuakes,
  useSpaceWeather,
  useTleSats,
  useWikiFeed,
} from './hooks'
import type { EarthEvent } from './lib/events'
import { gibsImageDate, type GibsLayer } from './lib/gibs'
import {
  useEcoMode,
  useGeolocate,
  useIdleKiosk,
  useKioskShow,
  useMediaQuery,
  useQuakePing,
  useShareHash,
  useSolarTime,
  useTimeline,
} from './uiHooks'
import { mergeQuakes } from './lib/emsc'
import { moonPhaseLabel, subLunarPoint, type ApolloSite } from './lib/moon'
import type { Quake } from './lib/quakes'
import { isIss, nextPass, satsAbove } from './lib/satellites'
import { parseView } from './lib/share'
import { PangeaView } from './components/PangeaView'

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
  const { soundOn, toggleSound } = useQuakePing(newQuakes, emscFresh)

  // user customization: visible layers, chosen orbits, own location
  const [layers, setLayers] = useState<LayerState>(() => {
    const base: LayerState = {
      sats: true,
      orbits: true,
      iss: true,
      quakes: true,
      events: true,
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
  // 🛰 satellite the camera is locked onto (flies with it, orbit around it)
  const [followSat, setFollowSat] = useState<{ id: string; name: string } | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; v: number } | null>(null)
  const { eco, onToggleEco } = useEcoMode(ready)
  // 🌍 "Earth spins" (default) vs "Sun orbits" (the old behaviour). Persisted.
  const [earthSpin, setEarthSpin] = useState(
    () => localStorage.getItem('earth-pulse-spin') !== 'off',
  )
  const onToggleEarthSpin = useCallback(() => {
    setEarthSpin((v) => {
      const next = !v
      localStorage.setItem('earth-pulse-spin', next ? 'on' : 'off')
      return next
    })
  }, [])
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
  // 🌍 continental-drift mode: a full-screen Pangaea→today globe (own scene)
  const [driftMode, setDriftMode] = useState(false)
  const [focusPlanet, setFocusPlanet] = useState<string | null>(null)
  const { solarTime, onWarp, onWarpReset, onVisibilityChange } = useSolarTime()
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

  // unified world navigation — jump straight to any world from any world, so
  // you're never stranded needing to back out through Earth first.
  const goEarth = useCallback(() => {
    setSolarMode(false)
    setDriftMode(false)
    setFocusPlanet(null)
    onWarpReset()
    setMoonMode(false)
    setApolloSite(null)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
  }, [onWarpReset])
  const goDrift = useCallback(() => {
    setDriftMode(true)
    setSolarMode(false)
    setMoonMode(false)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
  }, [])
  const goMoon = useCallback(() => {
    onMoonEnter()
    onWarpReset()
    setFocusPlanet(null)
    setDriftMode(false)
    setFollowSat(null)
  }, [onMoonEnter, onWarpReset])
  const goSolar = useCallback(() => {
    setSolarMode(true)
    setMoonMode(false)
    setApolloSite(null)
    setFocusPlanet(null)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
    setDriftMode(false)
  }, [])

  // 👁 clean view: hide the whole HUD for an unobstructed globe (great for
  // screenshots, video, ambient/kiosk). Toggle with the dock button or H.
  const [hudHidden, setHudHidden] = useState(false)
  const onHideHud = useCallback(() => setHudHidden(true), [])
  // ⌖ recenter the camera on the default Earth view
  const [resetView, setResetView] = useState(0)
  const onResetView = useCallback(() => setResetView((v) => v + 1), [])

  // phones & tablets get slide-out drawers so the globe stays clear; desktop
  // keeps the corner dashboards
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null)
  const toggleLeft = useCallback(() => setDrawer((d) => (d === 'left' ? null : 'left')), [])
  const toggleRight = useCallback(() => setDrawer((d) => (d === 'right' ? null : 'right')), [])

  // 📺 kiosk/screensaver: opt-in (off by default — first-time visitors land on a
  // plain live Earth, not an auto-playing tour). When the user switches it on,
  // ~75 s idle hides the HUD and runs a looping cinematic show (Earth tour →
  // solar system → follow ISS); any interaction hands control straight back.
  const [kioskEnabled, setKioskEnabled] = useState(false)
  const onToggleKiosk = useCallback(() => setKioskEnabled((k) => !k), [])
  const idleActive = useIdleKiosk(75_000)
  const kioskActive = kioskEnabled && idleActive
  // the HUD is hidden either manually (clean view) or while the kiosk runs
  const hudOff = hudHidden || kioskActive
  useKioskShow(kioskActive, {
    setSolarMode,
    setMoonMode,
    setFollowIss,
    setTourOn,
    setFocusPlanet,
    onWarp,
    onWarpReset,
    goEarth,
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'h' || e.key === 'H') setHudHidden((h) => !h)
      else if (e.key === 'Escape') {
        if (hudHidden) setHudHidden(false)
        else goEarth()
      } else if (e.key === '1') goEarth()
      else if (e.key === '2') goMoon()
      else if (e.key === '3') goSolar()
      else if (e.key === '4') goDrift()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hudHidden, goEarth, goMoon, goSolar, goDrift])

  // re-anchor the warp clock when the window returns from the background, so a
  // minimized/backgrounded tab never comes back to a frozen scene (see hook).
  useEffect(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [onVisibilityChange])

  const onToggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((l) => {
      const next = { ...l, [key]: !l[key] }
      if (key === 'iss' && !next.iss) setFollowIss(false)
      return next
    })
  }, [])

  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const onSatClick = useCallback((id: string, name: string) => {
    // click a satellite → lock the camera onto it; click it again → release.
    // Its orbit line + mission card come along for the ride.
    setOrbits((list) => (list.some((o) => o.id === id) ? list : [...list, { id, name }]))
    setSelectedMission(name)
    setFollowIss(false) // the pin-follow and the ISS-follow are mutually exclusive
    setFollowSat((prev) => (prev?.id === id ? null : { id, name }))
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
    setSelectedMission(name)
  }, [])

  const onFocusQuake = useCallback((q: Quake) => {
    setSelected(q)
    setFlyTo((f) => ({ lat: q.lat, lng: q.lng, v: (f?.v ?? 0) + 1 }))
  }, [])

  const events = useEvents()
  const onEventClick = useCallback((e: EarthEvent) => {
    setFlyTo((f) => ({ lat: e.lat, lng: e.lng, v: (f?.v ?? 0) + 1 }))
  }, [])

  // NASA GIBS data layer + playback date (days back from now)
  const [gibsLayer, setGibsLayer] = useState<GibsLayer | null>(null)
  const [gibsDaysBack, setGibsDaysBack] = useState(2)
  const gibsImageryDate = gibsImageDate(gibsLayer, now, gibsDaysBack)

  // shareable URL hash (camera/orbits/layers) + restore from an incoming link
  const { onPovChange } = useShareHash({ orbits, layers, setOrbits, sats, initialView })

  const onReady = useCallback(() => setReady(true), [])
  const onFollowBroken = useCallback(() => setFollowIss(false), [])
  const onIssClick = useCallback(() => {
    setFollowSat(null) // ISS-follow and satellite pin-follow are exclusive
    setFollowIss((f) => !f)
  }, [])

  return (
    <>
      {/* On phones/tablets the Drift view runs its OWN WebGL context — keeping the
          main globe's context alive too exhausts mobile GPU memory and crashes the
          tab. So unmount the main globe while drifting on small screens (desktop
          has the memory to keep both). It re-inits on exit. */}
      {(isDesktop || !driftMode) && (
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
        earthSpin={earthSpin}
        focusSat={focusSat}
          followSat={followSat}
        flyTo={flyTo}
        resetView={resetView}
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
        events={events}
        onEventClick={onEventClick}
        gibsLayer={gibsLayer}
        gibsDate={gibsImageryDate}
        onReady={onReady}
        />
      )}
      <LoadingOverlay done={ready} />

      {hudHidden && !kioskActive && <ShowHudButton onShow={() => setHudHidden(false)} />}

      {/* HUD — desktop corner dashboards, or two slide-out drawers on phones &
          tablets. Hidden entirely in clean view / kiosk. */}
      {!hudOff && (
        <Hud
          mode={driftMode ? 'drift' : mode}
          isDesktop={isDesktop}
          drawer={drawer}
          onToggleLeft={toggleLeft}
          onToggleRight={toggleRight}
          onEarth={goEarth}
          onMoon={goMoon}
          onSolar={goSolar}
          onDrift={goDrift}
          now={now}
          satCount={sats.length}
          solarMode={solarMode}
          moonMode={moonMode}
          weather={weather}
          moonLabel={moonLabel}
          onMoonEnter={onMoonEnter}
          moonState={moonState}
          apolloSite={apolloSite}
          onMoonExit={onMoonExit}
          focusPlanet={focusPlanet}
          solarSimNow={solarSimNow}
          warp={solarTime.warp}
          onWarp={onWarp}
          onWarpReset={onWarpReset}
          onSolarOverview={onSolarOverview}
          onSolarExit={onSolarExit}
          onNavigateBody={onPlanetPick}
          layers={layers}
          onToggleLayer={onToggleLayer}
          orbits={orbits}
          onRemoveOrbit={onRemoveOrbit}
          onClearOrbits={onClearOrbits}
          satList={satList}
          onPickSat={onPickSat}
          eco={eco}
          onToggleEco={onToggleEco}
          earthSpin={earthSpin}
          onToggleEarthSpin={onToggleEarthSpin}
          kioskEnabled={kioskEnabled}
          onToggleKiosk={onToggleKiosk}
          userLoc={userLoc}
          locating={locating}
          onLocate={onLocate}
          overhead={overhead}
          timeOffsetH={timeOffsetH}
          timelinePlaying={timelinePlaying}
          onTimelineScrub={onTimelineScrub}
          onTimelineToggle={onTimelineToggle}
          displayQuakes={displayQuakes}
          flashes={timelineActive ? [] : flashes}
          simNow={simNow}
          onFocusQuake={onFocusQuake}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          selected={selected}
          onCloseQuake={() => setSelected(null)}
          events={events}
          onEventClick={onEventClick}
          gibsLayer={gibsLayer}
          onSelectGibs={setGibsLayer}
          gibsDaysBack={gibsDaysBack}
          onScrubGibs={setGibsDaysBack}
          gibsDate={gibsImageryDate}
          edits={edits}
          totalSeen={totalSeen}
          selectedMission={selectedMission}
          onCloseMission={() => setSelectedMission(null)}
          tourOn={tourOn}
          followIss={followIss}
          onTour={onTourToggle}
          onFollow={onIssClick}
          onResetView={onResetView}
          onHideHud={onHideHud}
          iss={iss}
          issPass={issPass}
        />
      )}

      {driftMode && <PangeaView onClose={goEarth} />}
    </>
  )
}
