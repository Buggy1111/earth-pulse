import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import { ArLaunchButton } from './components/ArLaunchButton'
import { HwAccelHint } from './components/hud/HwAccelHint'
import { useProbes } from './useProbes'
import { ArSky, PangeaView } from './lazyViews'
import { Hud } from './components/hud/Hud'
import { LoadingOverlay, ShowHudButton } from './components/hud/controls'
import type { LayerState, OrbitEntry } from './components/hud/types'
import { useEvents } from './hooks'
import type { EarthEvent } from './lib/events'
import { warpedSimMs } from './lib/clock'
import { gibsImageDate, type GibsLayer } from './lib/gibs'
import {
  useQuality,
  useGeolocate,
  useIdleKiosk,
  useKioskShow,
  useMediaQuery,
  useShareHash,
  useSolarLayers,
  useTimeline,
} from './uiHooks'
import { useWorldView } from './useWorldView'
import { useLiveData } from './useLiveData'
import { moonPhaseLabel, subLunarPoint } from './lib/moon'
import type { Quake } from './lib/quakes'
import { isIss, nextPass, satsAbove, type IssPass } from './lib/satellites'
import { parseView } from './lib/share'

// shared link? restore camera/orbits/layers from the URL hash
const initialView = parseView(window.location.hash)

export default function App() {
  const { quakes, flashes, iss, sats, weather, edits, totalSeen, now, soundOn, toggleSound } =
    useLiveData()
  const probes = useProbes()
  const [selected, setSelected] = useState<Quake | null>(null)
  const [ready, setReady] = useState(false)
  // WebGL fell back to the CPU (hardware acceleration off) → show the GPU nudge
  const [softwareGpu, setSoftwareGpu] = useState(false)
  const onSoftwareRenderer = useCallback(() => setSoftwareGpu(true), [])
  const {
    followIss, setFollowIss, followSat, setFollowSat,
    tourOn, setTourOn, onTourToggle, onTourBroken,
    moonMode, setMoonMode, apolloSite, onMoonEnter, onMoonExit, onApolloPick,
    solarMode, setSolarMode, driftMode, focusPlanet, setFocusPlanet,
    mode, onSolarOverview, onSolarExit, onPlanetPick, pickedStar, onStarPick,
    solarTime, onWarp, onWarpReset, onVisibilityChange,
    goEarth, goMoon, goSolar, goDrift,
  } = useWorldView()

  // user customization: visible layers, chosen orbits, own location
  const [layers, setLayers] = useState<LayerState>(() => {
    const base: LayerState = {
      sats: true,
      orbits: true,
      iss: true,
      starlink: false, // 10k+ swarm — opt-in (lazily loads a 1.8 MB snapshot)
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
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; v: number } | null>(null)
  // 📡 sky AR overlay: point the phone at the sky to spot overhead satellites
  const [arMode, setArMode] = useState(false)
  const { quality, setQuality, eco, mobile } = useQuality(ready)
  // 🎚 solar-view layer filter (persisted) — the view got crowded: planets,
  // ellipses, 11 probes with trails, 8.9k stars, constellations
  const { solarLayers, toggleSolarLayer } = useSolarLayers()
  // 🌍 "Earth spins" (default) vs "Sun orbits" (the old behaviour). Persisted.
  // localStorage throws SecurityError with cookies blocked / sandboxed iframes —
  // and this runs on first render, so an unguarded call took the whole app down.
  const [earthSpin, setEarthSpin] = useState(() => {
    try {
      return localStorage.getItem('earth-pulse-spin') !== 'off'
    } catch {
      return true
    }
  })
  const onToggleEarthSpin = useCallback(() => {
    setEarthSpin((v) => {
      const next = !v
      try {
        localStorage.setItem('earth-pulse-spin', next ? 'on' : 'off')
      } catch {
        // not persistable — the in-memory toggle still works
      }
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

  // next ISS pass over the user's location, re-checked once a minute — but the
  // 24 h SGP4 sweep (~2 880 steps) only actually re-runs once the cached pass
  // has started/expired; a still-upcoming pass is reused (the sweep was a
  // 10–30 ms main-thread hiccup exactly once a minute on weak CPUs). Uses the
  // documented "adjust state while rendering" pattern, like the cards below.
  const minuteNow = Math.floor(now / 60_000)
  const [passCache, setPassCache] = useState<{
    pass: IssPass | null
    at: number
    loc: string
  } | null>(null)
  const locKey = userLoc ? `${userLoc.lat},${userLoc.lng}` : ''
  const passCacheValid =
    passCache !== null &&
    passCache.loc === locKey &&
    (passCache.pass !== null
      ? passCache.pass.startMs > minuteNow * 60_000 + 60_000
      : passCache.at === minuteNow)
  if (userLoc && sats.length > 0 && !passCacheValid) {
    const issSat = sats.find((s) => isIss(s.name))
    setPassCache({
      pass: issSat ? nextPass(issSat, userLoc, new Date(minuteNow * 60_000)) : null,
      at: minuteNow,
      loc: locKey,
    })
  }
  const issPass = userLoc && passCache?.loc === locKey ? (passCache?.pass ?? null) : null

  // satellites above the user's horizon, refreshed every 5 s
  const tick5 = Math.floor(now / 5_000)
  const overhead = useMemo(
    () => (userLoc && sats.length > 0 ? satsAbove(sats, userLoc, new Date(tick5 * 5_000)) : []),
    [userLoc, sats, tick5],
  )

  // moon phase for the HUD, recomputed per minute
  const moonState = useMemo(() => subLunarPoint(new Date(minuteNow * 60_000)), [minuteNow])
  const moonLabel = useMemo(() => moonPhaseLabel(moonState), [moonState])

  const solarSimNow = warpedSimMs(solarTime, now)

  // 👁 clean view: hide the whole HUD for an unobstructed globe (great for
  // screenshots, video, ambient/kiosk). Toggle with the dock button or H.
  const [hudHidden, setHudHidden] = useState(false)
  const onHideHud = useCallback(() => setHudHidden(true), [])
  // ⌖ recenter the camera on the default Earth view
  const [resetView, setResetView] = useState(0)
  const onResetView = useCallback(() => setResetView((v) => v + 1), [])

  // ≥1024px wide still mounts the globe through the Drift view (enough GPU memory
  // for two WebGL contexts); narrower unmounts it to avoid a mobile-GPU crash.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  // The always-on corner dashboards only fit on a genuinely roomy screen — every
  // laptop, tablet and phone gets the sci-fi slide-out drawers instead, so the
  // globe stays the hero and you pull up only what you need. (Earlier the corners
  // overlapped on short laptops; this keeps it clean on every screen.)
  const roomyHud = useMediaQuery('(min-width: 1280px) and (min-height: 900px)')
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
      const t = e.target
      // typing anywhere editable must never trigger view shortcuts
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      )
        return
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
  }, [setFollowIss])

  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const onSatClick = useCallback((id: string, name: string) => {
    // click a satellite → lock the camera onto it; click it again → release.
    // Its orbit line + mission card come along for the ride.
    setOrbits((list) => (list.some((o) => o.id === id) ? list : [...list, { id, name }]))
    setSelectedMission(name)
    setFollowIss(false) // the pin-follow and the ISS-follow are mutually exclusive
    setFollowSat((prev) => (prev?.id === id ? null : { id, name }))
  }, [setFollowIss, setFollowSat])
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
  const [selectedEvent, setSelectedEvent] = useState<EarthEvent | null>(null)
  const onEventClick = useCallback((e: EarthEvent) => {
    setSelectedEvent(e)
    setFlyTo((f) => ({ lat: e.lat, lng: e.lng, v: (f?.v ?? 0) + 1 }))
  }, [])

  // the quake / event / mission detail cards are Earth-view only — drop them the
  // moment we leave Earth so a card opened before hopping to the Moon, the solar
  // system or Drift doesn't pop back up on return. React's documented "adjust
  // state while rendering when a tracked value changes" pattern — no effect.
  const awayFromEarth = mode !== 'earth' || driftMode
  const [wasAwayFromEarth, setWasAwayFromEarth] = useState(awayFromEarth)
  if (awayFromEarth !== wasAwayFromEarth) {
    setWasAwayFromEarth(awayFromEarth)
    if (awayFromEarth) {
      setSelected(null)
      setSelectedEvent(null)
      setSelectedMission(null)
    }
  }

  // NASA GIBS data layer + playback date (days back from now)
  const [gibsLayer, setGibsLayer] = useState<GibsLayer | null>(null)
  const [gibsDaysBack, setGibsDaysBack] = useState(2)
  const gibsImageryDate = gibsImageDate(gibsLayer, now, gibsDaysBack)

  // shareable URL hash (camera/orbits/layers) + restore from an incoming link
  const { onPovChange } = useShareHash({ orbits, layers, setOrbits, sats, initialView })

  const onReady = useCallback(() => setReady(true), [])
  const onFollowBroken = useCallback(() => setFollowIss(false), [setFollowIss])
  const onIssClick = useCallback(() => {
    setFollowSat(null) // ISS-follow and satellite pin-follow are exclusive
    setFollowIss((f) => !f)
  }, [setFollowSat, setFollowIss])

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
        quality={quality}
        earthSpin={earthSpin}
        focusSat={focusSat}
          followSat={followSat}
        flyTo={flyTo}
        resetView={resetView}
        paused={arMode}
        simNow={simNow}
        tour={tourOn}
        onTourBroken={onTourBroken}
        moonMode={moonMode}
        onMoonEnter={onMoonEnter}
        onApolloPick={onApolloPick}
        solarMode={solarMode}
        solarLayers={solarLayers}
        focusPlanet={focusPlanet}
        onPlanetPick={onPlanetPick}
        onStarPick={onStarPick}
        pickedStar={pickedStar}
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
        onSoftwareRenderer={onSoftwareRenderer}
        />
      )}
      <LoadingOverlay done={ready} />

      {hudHidden && !kioskActive && <ShowHudButton onShow={() => setHudHidden(false)} />}

      {/* HUD — desktop corner dashboards, or two slide-out drawers on phones &
          tablets. Hidden entirely in clean view / kiosk. */}
      {!hudOff && (
        <Hud
          mode={driftMode ? 'drift' : mode}
          isDesktop={roomyHud}
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
          pickedStar={pickedStar}
          onStarPick={onStarPick}
          solarSimNow={solarSimNow}
          warp={solarTime.warp}
          onWarp={onWarp}
          onWarpReset={onWarpReset}
          onSolarOverview={onSolarOverview}
          onSolarExit={onSolarExit}
          onNavigateBody={onPlanetPick}
          solarLayers={solarLayers}
          onToggleSolarLayer={toggleSolarLayer}
          probes={probes}
          layers={layers}
          onToggleLayer={onToggleLayer}
          orbits={orbits}
          onRemoveOrbit={onRemoveOrbit}
          onClearOrbits={onClearOrbits}
          satList={satList}
          onPickSat={onPickSat}
          quality={quality}
          onSetQuality={setQuality}
          mobile={mobile}
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
          selectedEvent={selectedEvent}
          onCloseEvent={() => setSelectedEvent(null)}
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

      {driftMode && (
        <Suspense fallback={null}>
          <PangeaView onClose={goEarth} />
        </Suspense>
      )}

      {/* 📡 sky AR: launch button (mobile only, self-hides on unsupported) + overlay */}
      {!hudOff && !arMode && !driftMode && <ArLaunchButton onOpen={() => setArMode(true)} />}
      {arMode && (
        <Suspense fallback={null}>
          <ArSky sats={sats} userLoc={userLoc} probes={probes} onLocate={onLocate} onClose={() => setArMode(false)} />
        </Suspense>
      )}

      {/* hardware-acceleration nudge — only when WebGL is on the CPU */}
      {softwareGpu && !hudOff && <HwAccelHint />}
    </>
  )
}
