/** Composition root for the 3D scene. Each feature lives in globe/* as a
 * plain setup function with an explicit context and a cleanup — this
 * component only owns React wiring (props → refs → effects). */

import type { GlobeInstance } from 'globe.gl'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { auroraOvals } from '../lib/aurora'
import { warpedSimMs } from '../lib/clock'
import type { IssState } from '../lib/iss'
import { globeAltitude } from '../lib/satellites'
import { enterMoonMode, followSatellite, startTour } from './globe/cameraModes'
import { applySolarLayers, HOME_VIEW, returnHome, type OrbitObject, type Trail } from './globe/helpers'
import { applyEventsLayer } from './globe/eventsLayer'
import { applyQuakeLayers, buildQuakeRings } from './globe/quakesLayer'
import { setupSky } from './globe/sky'
import { setupSurface } from './globe/surface'
import { startOrbitEngine, type SolarAnimEntry } from './globe/orbitEngine'
import { syncTrails } from './globe/orbitRender'
import { setupStarlinkLayer, type StarlinkLayer } from './globe/starlinkLayer'
import { focusSolarBody } from './globe/solarFocus'
import { enterSolarMode } from './globe/solarMode'
import { setupScene, swapGlobeTextures } from './globe/sceneSetup'
import { applyGibsImage } from './globe/gibsLayer'
import { detectWeakGpu, isMobileDevice } from './perf'
import type { GlobeViewProps } from './globe/globeView.types'

/** Texture resolution for the day/night globe stack, from the user's quality
 * pick plus the view-mode + device clamps:
 *  - strong desktop → exactly the picked tier (2K/4K/8K), in EVERY view — it
 *    keeps best quality even in solar (you can fly back to Earth there).
 *  - mobile, Earth view → the pick, capped to 4K (8K OOMs a phone).
 *  - mobile OR weak desktop GPU (Intel UHD…), solar/Moon view → 2K — the Earth
 *    is a distant dot there, so dropping it frees the memory the solar system
 *    needs (≈0.5 GB at 8K) instead of pinning it for an invisible dot.
 * Mobile is decided by the device, so 8K can never reach a phone. */
function pickTextureRes(
  quality: '2k' | '4k' | '8k',
  solarMode: boolean,
  moonMode: boolean,
): '2k' | '4k' | '8k' {
  if (isMobileDevice()) {
    if (solarMode || moonMode) return '2k'
    return quality === '2k' ? '2k' : '4k'
  }
  if ((solarMode || moonMode) && detectWeakGpu()) return '2k'
  return quality
}

export function GlobeView(props: GlobeViewProps) {
  const { quakes, flashes, iss, sats, kp, layers, selectedOrbitIds, userLoc, locVersion } = props
  const { eco, quality, focusSat, flyTo, simNow, tour, moonMode, solarMode, solarLayers, focusPlanet, solarTime } = props
  const { followIss, onQuakeClick } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)

  // latest props for non-React consumers (frame loop, event listeners)
  const cb = useRef({ ...props })
  const layersRef = useRef(layers)
  const quakesRef = useRef(quakes)
  const followRef = useRef(followIss)
  const tourRef = useRef(tour)
  const moonModeRef = useRef(moonMode)
  const solarModeRef = useRef(solarMode)
  const solarLayersRef = useRef<Record<string, boolean>>({ ...solarLayers })
  const solarTimeRef = useRef(solarTime)
  // timeline-replay offset (ms, ≤0) so the day/night terminator rewinds with
  // the 24 h earthquake replay — not just the quakes
  const timeOffsetMsRef = useRef(0)
  const ecoRef = useRef(eco)
  // "Earth spins" is active only in the plain Earth view — never while a body is
  // followed/toured or in moon/solar mode (those drive the camera themselves).
  const earthSpinRef = useRef(false)
  const issStateRef = useRef<IssState | null>(null)
  useEffect(() => {
    cb.current = { ...props }
    layersRef.current = layers
    quakesRef.current = quakes
    followRef.current = followIss
    tourRef.current = tour
    moonModeRef.current = moonMode
    solarModeRef.current = solarMode
    solarTimeRef.current = solarTime
    earthSpinRef.current = props.earthSpin && !followIss && !tour && !moonMode && !solarMode
    issStateRef.current = iss
  })
  const initialPovRef = useRef(props.initialPov)

  // Rewind the day/night terminator (and the Moon) together with the 24 h
  // earthquake replay: the orbit-engine frame loop re-aims the sun off this
  // offset every frame (see startOrbitEngine), so scrubbing/replay sweeps the
  // terminator smoothly instead of only filtering quakes.
  useEffect(() => {
    timeOffsetMsRef.current = simNow - Date.now()
  }, [simNow])

  // shared scene state owned outside React (see globe/* modules)
  const userInteractedRef = useRef(false)
  const trailsRef = useRef<Map<string, Trail>>(new Map())
  const orbitObjectsRef = useRef<Map<string, OrbitObject>>(new Map())
  const pinTargetRef = useRef<THREE.Object3D | null>(null)
  const starlinkRef = useRef<StarlinkLayer | null>(null)
  const solarGroupRef = useRef<THREE.Group | null>(null)
  const planetMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const moonMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const probeMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const starFocusRef = useRef<{ defocus: () => void } | null>(null)
  const sunMeshRef = useRef<THREE.Mesh | null>(null)
  const solarAnimRef = useRef<SolarAnimEntry[]>([])
  const solarFrameRef = useRef<(now: Date) => void>(() => {})
  const applySkyRef = useRef<(date: Date) => void>(() => {})
  const skyRef = useRef<ReturnType<typeof setupSky> | null>(null)
  const earthRootRef = useRef<THREE.Object3D | null>(null)
  const moonMeshRef = useRef<THREE.Mesh | null>(null)
  const surfaceRef = useRef<ReturnType<typeof setupSurface> | null>(null)
  const globeMaterialRef = useRef<THREE.ShaderMaterial | null>(null)
  // Texture tier. Phones/tablets get 4K: sharp, but ≈0.18 GB vs the 8K stack's
  // ≈0.7 GB that OOM-crashes an installed PWA on iOS. Desktop eco drops to 2K
  // (a fill-rate win for weak integrated GPUs), full desktop is 8K. This is
  // decided at the render layer so 8K can never reach mobile even via a stale
  // preference or the runtime swap (eco is also force-locked on mobile).
  const textureResRef = useRef<'2k' | '4k' | '8k'>(pickTextureRes(quality, solarMode, moonMode))
  const gibsActiveRef = useRef(false)
  const gibsMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)

  // one-time globe setup: scene, sky, surface, pointer plumbing
  useEffect(() => {
    if (!containerRef.current) return
    return setupScene(containerRef.current, {
      cb,
      globeRef,
      initialPovRef,
      userInteractedRef,
      ecoRef,
      solarTimeRef,
      timeOffsetMsRef,
      layersRef,
      textureResRef,
      gibsActiveRef,
      globeMaterialRef,
      skyRef,
      applySkyRef,
      moonMeshRef,
      surfaceRef,
      starlinkRef,
      planetMeshesRef,
      sunMeshRef,
      pinTargetRef,
      followRef,
      tourRef,
      moonModeRef,
      solarModeRef,
    })
  }, [])

  // layer visibility for meshes living outside React
  useEffect(() => {
    const s = surfaceRef.current
    if (s?.cloudsRef.current) s.cloudsRef.current.visible = layers.clouds
    if (s?.volcanoesRef.current) s.volcanoesRef.current.visible = layers.volcanoes
    // borders: black continent outlines over a data layer, faint blue-grey on
    // the live globe (the styling itself lives in surface, off the React path)
    s?.setDataMode(gibsActiveRef.current)
    s?.updateTileEngine()
    s?.updateLabels()
  }, [layers.clouds, layers.borders, layers.volcanoes, layers.detail, layers.labels])

  // eco/performance + view-mode: pixel ratio + texture resolution swap on the fly.
  // Re-runs when entering/leaving the solar or Moon view so the Earth drops to 2K
  // there (it's a distant dot) and restores its full tier on return.
  useEffect(() => {
    ecoRef.current = eco
    const globe = globeRef.current
    if (!globe) return
    // mobile stays at 1× DPR no matter the eco flag — a 2–3× framebuffer is the
    // other half of the memory blow-up (textures are capped via pickTextureRes)
    const lowDpr = eco || isMobileDevice()
    globe.renderer().setPixelRatio(lowDpr ? 1 : Math.min(window.devicePixelRatio, 2))
    const wanted = pickTextureRes(quality, solarMode, moonMode)
    const material = globeMaterialRef.current
    if (!material || textureResRef.current === wanted) return
    textureResRef.current = wanted
    swapGlobeTextures(material, wanted, () => textureResRef.current === wanted && !!globeRef.current)
  }, [eco, quality, solarMode, moonMode])

  // aurora ovals around the geomagnetic poles, scaled by the live Kp index
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || kp === null) return
    globe
      .polygonsData(layers.aurora ? auroraOvals(kp) : [])
      .polygonCapColor((d) => `rgba(74, 222, 128, ${(d as { opacity: number }).opacity})`)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(0,0,0,0)')
      .polygonAltitude(0.018)
      .polygonGeoJsonGeometry(
        ((d: { rings: [number, number][][] }) => ({
          type: 'Polygon' as const,
          coordinates: d.rings,
        })) as unknown as Parameters<GlobeInstance['polygonGeoJsonGeometry']>[0],
      )
  }, [kp, layers.aurora])

  // earthquakes layer (glow sprites + rings). The effect re-runs every simNow
  // tick to refresh the glow opacities, so the rings array must be memoised on
  // the data alone — fresh ring objects each second made three-globe tear down
  // and respawn every ripple (identity diff + 30 s removeDelay = zombie groups,
  // the main GPU-memory churn on phones).
  const quakeRings = useMemo(
    () => buildQuakeRings(quakes, flashes, layers.quakes),
    [quakes, flashes, layers.quakes],
  )
  useEffect(() => {
    const globe = globeRef.current
    if (globe) applyQuakeLayers(globe, quakes, quakeRings, layers.quakes, simNow, onQuakeClick)
  }, [quakes, quakeRings, onQuakeClick, layers.quakes, simNow])

  // NASA EONET natural-event pins
  useEffect(() => {
    const globe = globeRef.current
    if (globe) applyEventsLayer(globe, props.events, layers.events, props.onEventClick)
  }, [props.events, layers.events, props.onEventClick])

  // NASA GIBS data layer: paint one equirectangular WMS image straight onto the
  // globe material (reliable where globe.gl's tile cache won't refetch). Null
  // restores the live day/night globe.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    applyGibsImage(globe, props.gibsLayer, props.gibsDate, {
      globeRef,
      gibsActiveRef,
      surfaceRef,
      globeMaterialRef,
      gibsMaterialRef,
    })
  }, [props.gibsLayer, props.gibsDate])

  // orbit engine (satellites + ISS, frame loop) — rebuilt when the TLE set loads
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || sats.length === 0) return
    return startOrbitEngine(globe, sats, {
      layersRef,
      ecoRef,
      solarTimeRef,
      solarModeRef,
      solarGroupRef,
      solarFrameRef,
      applySkyRef,
      timeOffsetMsRef,
      pinTargetRef,
      earthSpinRef,
      trailsRef,
      issStateRef,
      orbitObjectsRef,
      starlinkRef,
      onIssClick: () => cb.current.onIssClick(),
      onSatClick: (id, name) => cb.current.onSatClick(id, name),
      isPaused: () => cb.current.paused === true,
    })
  }, [sats])

  // 🛰 Starlink swarm: lazily build the layer the first time it's switched on
  // (its 1.8 MB TLE snapshot shouldn't load unless asked for). Visibility and
  // per-frame ticking are then driven by the orbit engine via starlinkRef.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !layers.starlink || starlinkRef.current) return
    starlinkRef.current = setupStarlinkLayer(globe)
  }, [layers.starlink])

  // sync shown orbit trails with the user's list (settings panel or clicks)
  useEffect(() => {
    const globe = globeRef.current
    if (globe && sats.length > 0) {
      const now = new Date(warpedSimMs(solarTimeRef.current, Date.now()))
      syncTrails(globe, trailsRef.current, selectedOrbitIds, sats, now)
    }
  }, [selectedOrbitIds, sats])

  // user's own location: pulsing pin + camera flight on every locate click
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .htmlElementsData(userLoc ? [userLoc] : [])
      .htmlLat((d) => (d as { lat: number }).lat)
      .htmlLng((d) => (d as { lng: number }).lng)
      // sit the pin ON the surface (altitude 0): an elevated marker parallaxes
      // away from the real spot as you zoom in and tilt the view
      .htmlAltitude(0)
      .htmlElement(() => {
        // translateY(-100%) anchors the pin's tip on the point — the label and
        // pin stack ABOVE the location, pointing straight down at it. Built with
        // DOM methods (not innerHTML) so it stays XSS-safe if the label is ever
        // fed dynamic data.
        const el = document.createElement('div')
        el.style.cssText =
          'display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-100%)'
        const label = document.createElement('div')
        label.style.cssText = 'font:600 10px sans-serif;color:#bae6fd;text-shadow:0 0 6px #000'
        label.textContent = 'you are here'
        const pin = document.createElement('div')
        pin.style.cssText = 'font-size:20px;line-height:1;filter:drop-shadow(0 0 6px rgba(56,189,248,.9))'
        pin.textContent = '📍'
        el.append(label, pin)
        return el
      })
    if (userLoc) {
      globe.pointOfView({ lat: userLoc.lat, lng: userLoc.lng, altitude: 0.9 }, 1_600)
      globe.controls().autoRotate = false
      userInteractedRef.current = true
    }
  }, [userLoc, locVersion])

  // 🎬 cinematic tour: glide between live points of interest
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !tour) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    return startTour(globe, quakesRef, orbitObjectsRef)
  }, [tour])

  // 🪐 solar system mode: heliocentric season-2 scene; the orbit engine's
  // rAF drives all motion via solarFrameRef (smooth at any time-warp)
  useEffect(() => {
    const globe = globeRef.current
    const sky = skyRef.current
    if (!globe || !solarMode || !sky) return
    return enterSolarMode(globe, sky, {
      solarGroupRef,
      sunMeshRef,
      planetMeshesRef,
      moonMeshesRef,
      solarAnimRef,
      solarFrameRef,
      solarTimeRef,
      applySkyRef,
      earthRootRef,
      surfaceRef,
      pinTargetRef,
      userInteractedRef,
      probeMeshesRef,
      // a clicked probe focuses just like a clicked planet (fly in + orbit it)
      onProbePick: (id) => cb.current.onPlanetPick(id),
      onStarPick: (s) => cb.current.onStarPick(s),
      starFocusRef,
      solarLayersRef,
    })
  }, [solarMode])

  // 🎚 solar layer filter — tagged objects (orbit ellipses, planet labels, the
  // probes group, stars, constellations) flip visibility to match. Runs on
  // every toggle and on mode entry (the resident system keeps its tags);
  // async-built layers apply the ref themselves when they finish.
  useEffect(() => {
    solarLayersRef.current = { ...solarLayers }
    const globe = globeRef.current
    if (globe && solarMode) applySolarLayers(globe.scene(), { ...solarLayers })
  }, [solarLayers, solarMode])

  // closing the star card (pickedStar → null) flies back out of the close-up
  useEffect(() => void (!props.pickedStar && starFocusRef.current?.defocus()), [props.pickedStar])

  // camera focus within solar mode: Sun overview or a chosen planet
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !solarMode) return
    return focusSolarBody(globe, { planetMeshesRef, moonMeshesRef, sunMeshRef, probeMeshesRef }, pinTargetRef, focusPlanet)
  }, [solarMode, focusPlanet])

  // 🌙 moon mode: re-target the orbit controls from Earth to the Moon
  useEffect(() => {
    const globe = globeRef.current
    const moon = moonMeshRef.current
    if (!globe || !moon || !moonMode) return
    userInteractedRef.current = true
    return enterMoonMode(globe, moon, pinTargetRef)
  }, [moonMode])

  // search pick: fly the camera to the chosen satellite
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !focusSat) return
    const o = orbitObjectsRef.current.get(focusSat.id)
    if (!o) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    globe.pointOfView(
      { lat: o.lat, lng: o.lng, altitude: Math.max(0.7, globeAltitude(o.altKm) + 0.35) },
      1_400,
    )
  }, [focusSat])

  // 🛰 lock onto a clicked satellite: snap in, fly with it, orbit around it.
  // Clearing followSat (or switching sats) runs the cleanup → releases & glides out.
  const { followSat } = props
  const followingRef = useRef(false)
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    if (!followSat) {
      // genuine release (clicked the followed sat again) → glide home, but only
      // if we were actually following (never on first mount)
      if (followingRef.current) {
        followingRef.current = false
        returnHome(globe, 800)
      }
      return
    }
    const o = orbitObjectsRef.current.get(followSat.id) as
      | (OrbitObject & { __threeObjObject?: THREE.Object3D; __threeObj?: THREE.Object3D })
      | undefined
    const mesh = o?.__threeObjObject ?? o?.__threeObj
    if (!mesh) return
    userInteractedRef.current = true
    followingRef.current = true
    // switching straight to another sat just snaps to it (the old lock's cleanup
    // no longer flies home, so it can't fight this new lock)
    return followSatellite(globe, mesh, pinTargetRef)
  }, [followSat])

  // HUD quake click: fly the camera to the epicenter
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !flyTo) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    globe.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: 1.0 }, 1_400)
  }, [flyTo])

  // ⌖ reset view: glide back to the default Earth framing (skip the first run)
  const resetViewRef = useRef(props.resetView)
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || props.resetView === resetViewRef.current) return
    resetViewRef.current = props.resetView
    globe.controls().autoRotate = false
    globe.pointOfView(HOME_VIEW, 900)
  }, [props.resetView])

  // pause the globe's render loop while a fullscreen overlay (Sky AR) hides it —
  // no point burning GPU on an occluded scene, and it frees the main thread
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    if (props.paused) globe.pauseAnimation()
    else globe.resumeAnimation()
  }, [props.paused])

  // follow ISS: chase camera on every position update, pause auto-rotate meanwhile.
  // This re-runs on every ISS poll (iss changes every few seconds), so it must NOT
  // re-enable the idle auto-rotate outside the Earth view — otherwise an ISS update
  // flips it back on while you're in the solar/Moon view and the camera spins
  // endlessly (e.g. after orbiting a star and flying back to the sky).
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe.controls().autoRotate =
      !followIss && !userInteractedRef.current && !solarMode && !moonMode
    if (followIss && iss) {
      const altitude = Math.min(globe.pointOfView().altitude ?? 2.2, 1.6)
      globe.pointOfView({ lat: iss.lat, lng: iss.lng, altitude }, 2_700)
    }
  }, [followIss, iss, solarMode, moonMode])

  return <div ref={containerRef} className="fixed inset-0" />
}
