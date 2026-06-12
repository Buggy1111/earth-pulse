/** Composition root for the 3D scene. Each feature lives in globe/* as a
 * plain setup function with an explicit context and a cleanup — this
 * component only owns React wiring (props → refs → effects). */

import Globe, { type GlobeInstance } from 'globe.gl'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { auroraOvals } from '../lib/aurora'
import type { IssState } from '../lib/iss'
import type { Quake } from '../lib/quakes'
import type { ApolloSite } from '../lib/moon'
import { EARTH_DISPLAY } from '../lib/planets'
import { globeAltitude, type TrackedSat } from '../lib/satellites'
import type { LayerState } from './hud/types'
import { enterMoonMode, startTour } from './globe/cameraModes'
import { type OrbitObject, type Trail } from './globe/helpers'
import { applyQuakeLayers } from './globe/quakesLayer'
import { setupPointer } from './globe/pointer'
import { setupSky } from './globe/sky'
import { setupSurface } from './globe/surface'
import { startOrbitEngine, syncTrails, type SolarAnimEntry } from './globe/orbitEngine'
import { ensureSolarSystem, focusSolarBody } from './globe/solar'

interface Props {
  quakes: Quake[]
  /** Quakes that just appeared in the feed — rendered as bright flash rings. */
  flashes: Quake[]
  iss: IssState | null
  /** Parsed TLE sets; propagation runs inside the orbit engine, off React. */
  sats: TrackedSat[]
  /** Live Kp index for the aurora ovals (null until the first NOAA reading). */
  kp: number | null
  layers: LayerState
  /** NORAD ids whose orbits are drawn (managed by the parent via onSatClick). */
  selectedOrbitIds: string[]
  userLoc: { lat: number; lng: number } | null
  /** Bumped on every locate click so we re-fly even to an unchanged position. */
  locVersion: number
  /** Eco/performance mode: 4K textures, 1× pixel ratio, 30 Hz propagation. */
  eco: boolean
  /** Camera restored from a shared link — overrides the default opening view. */
  initialPov: { lat: number; lng: number; altitude: number } | null
  onPovChange: (pov: { lat: number; lng: number; altitude: number }) => void
  /** Satellite picked in the search box — fly the camera to it. */
  focusSat: { id: string; v: number } | null
  /** Quake picked in the HUD — fly the camera there. */
  flyTo: { lat: number; lng: number; v: number } | null
  /** Reference "now" for quake age/glow — the timeline slider rewinds it. */
  simNow: number
  tour: boolean
  onTourBroken: () => void
  moonMode: boolean
  onMoonEnter: () => void
  onApolloPick: (site: ApolloSite | null) => void
  solarMode: boolean
  /** Which planet the camera orbits in solar mode (null = Sun overview). */
  focusPlanet: string | null
  onPlanetPick: (id: string) => void
  /** Simulated-time anchor: simMs advances `warp`× faster than real time. */
  solarTime: { realMs: number; simMs: number; warp: number }
  followIss: boolean
  onFollowBroken: () => void
  onIssClick: () => void
  onSatClick: (id: string, name: string) => void
  onQuakeClick: (quake: Quake) => void
  onReady: () => void
}

export function GlobeView(props: Props) {
  const { quakes, flashes, iss, sats, kp, layers, selectedOrbitIds, userLoc, locVersion } = props
  const { eco, focusSat, flyTo, simNow, tour, moonMode, solarMode, focusPlanet, solarTime } = props
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
  const solarTimeRef = useRef(solarTime)
  const ecoRef = useRef(eco)
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
    issStateRef.current = iss
  })
  const initialPovRef = useRef(props.initialPov)

  // shared scene state owned outside React (see globe/* modules)
  const userInteractedRef = useRef(false)
  const trailsRef = useRef<Map<string, Trail>>(new Map())
  const orbitObjectsRef = useRef<Map<string, OrbitObject>>(new Map())
  const pinTargetRef = useRef<THREE.Object3D | null>(null)
  const solarGroupRef = useRef<THREE.Group | null>(null)
  const planetMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const sunMeshRef = useRef<THREE.Mesh | null>(null)
  const solarAnimRef = useRef<SolarAnimEntry[]>([])
  const solarFrameRef = useRef<(now: Date) => void>(() => {})
  const applySkyRef = useRef<(date: Date) => void>(() => {})
  const skyRef = useRef<ReturnType<typeof setupSky> | null>(null)
  const earthRootRef = useRef<THREE.Object3D | null>(null)
  const moonMeshRef = useRef<THREE.Mesh | null>(null)
  const surfaceRef = useRef<ReturnType<typeof setupSurface> | null>(null)
  const globeMaterialRef = useRef<THREE.ShaderMaterial | null>(null)
  const textureResRef = useRef<'4k' | '8k'>(eco ? '4k' : '8k')

  // one-time globe setup: scene, sky, surface, pointer plumbing
  useEffect(() => {
    if (!containerRef.current) return
    const fromLink = initialPovRef.current
    const globe = new Globe(containerRef.current)
      .backgroundImageUrl('night-sky.png')
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.18)
      .pointOfView(fromLink ?? { lat: 25, lng: 15, altitude: 2.2 }, 0)

    // a shared link IS the view — don't auto-rotate away from it
    userInteractedRef.current = !!fromLink
    globe.controls().autoRotate = !fromLink
    globe.controls().autoRotateSpeed = 0.45
    globe.renderer().setPixelRatio(ecoRef.current ? 1 : Math.min(window.devicePixelRatio, 2))

    const simNowMs = () => {
      const t = solarTimeRef.current
      return t.simMs + (Date.now() - t.realMs) * t.warp
    }
    const sky = setupSky(globe, simNowMs)
    skyRef.current = sky
    applySkyRef.current = sky.applySky
    moonMeshRef.current = sky.moonMesh


    const surface = setupSurface(globe, {
      sunUniform: sky.sunUniform,
      layersRef,
      textureRes: textureResRef.current,
      isAlive: () => globeRef.current !== null,
      onReady: () => cb.current.onReady(),
      onMaterial: (m) => (globeMaterialRef.current = m),
    })
    surfaceRef.current = surface

    const disposePointer = setupPointer(globe, {
      moonMesh: sky.moonMesh,
      apolloMarkers: sky.apolloMarkers,
      planetMeshesRef,
      sunMeshRef,
      pinTargetRef,
      userInteractedRef,
      followRef,
      tourRef,
      moonModeRef,
      solarModeRef,
      onFollowBroken: () => cb.current.onFollowBroken(),
      onTourBroken: () => cb.current.onTourBroken(),
      onMoonEnter: () => cb.current.onMoonEnter(),
      onApolloPick: (s) => cb.current.onApolloPick(s),
      onPlanetPick: (id) => cb.current.onPlanetPick(id),
      onPovChange: (p) => cb.current.onPovChange(p),
    })

    const onResize = () => globe.width(window.innerWidth).height(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)

    globeRef.current = globe
    // e2e hook: headless tests steer the camera through this handle
    ;(window as unknown as Record<string, unknown>).__earthPulseGlobe = globe
    return () => {
      globeRef.current = null
      disposePointer()
      surface.dispose()
      sky.dispose()
      moonMeshRef.current = null
      window.removeEventListener('resize', onResize)
      globe._destructor()
    }
  }, [])

  // layer visibility for meshes living outside React
  useEffect(() => {
    const s = surfaceRef.current
    if (s?.cloudsRef.current) s.cloudsRef.current.visible = layers.clouds
    if (s?.bordersRef.current) s.bordersRef.current.visible = layers.borders
    if (s?.volcanoesRef.current) s.volcanoesRef.current.visible = layers.volcanoes
    s?.updateTileEngine()
    s?.updateLabels()
  }, [layers.clouds, layers.borders, layers.volcanoes, layers.detail, layers.labels])

  // eco/performance mode: pixel ratio + texture resolution swap on the fly
  useEffect(() => {
    ecoRef.current = eco
    const globe = globeRef.current
    if (!globe) return
    globe.renderer().setPixelRatio(eco ? 1 : Math.min(window.devicePixelRatio, 2))
    const wanted: '4k' | '8k' = eco ? '4k' : '8k'
    const material = globeMaterialRef.current
    if (!material || textureResRef.current === wanted) return
    textureResRef.current = wanted
    const loader = new THREE.TextureLoader()
    void Promise.all([
      loader.loadAsync(`earth-day-${wanted}.jpg`),
      loader.loadAsync(`earth-night-${wanted}.jpg`),
    ]).then(([day, night]) => {
      if (textureResRef.current !== wanted || !globeRef.current) return
      day.colorSpace = THREE.SRGBColorSpace
      night.colorSpace = THREE.SRGBColorSpace
      for (const [key, tex] of [['dayTexture', day], ['nightTexture', night]] as const) {
        const old = material.uniforms[key].value as THREE.Texture
        material.uniforms[key].value = tex
        old.dispose()
      }
    })
  }, [eco])

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

  // earthquakes layer (glow sprites + rings)
  useEffect(() => {
    const globe = globeRef.current
    if (globe) applyQuakeLayers(globe, quakes, flashes, layers.quakes, simNow, onQuakeClick)
  }, [quakes, flashes, onQuakeClick, layers.quakes, simNow])

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
      pinTargetRef,
      trailsRef,
      issStateRef,
      orbitObjectsRef,
      onIssClick: () => cb.current.onIssClick(),
      onSatClick: (id, name) => cb.current.onSatClick(id, name),
    })
  }, [sats])

  // sync shown orbit trails with the user's list (settings panel or clicks)
  useEffect(() => {
    const globe = globeRef.current
    if (globe && sats.length > 0) syncTrails(globe, trailsRef.current, selectedOrbitIds, sats)
  }, [selectedOrbitIds, sats])

  // user's own location: pulsing pin + camera flight on every locate click
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .htmlElementsData(userLoc ? [userLoc] : [])
      .htmlLat((d) => (d as { lat: number }).lat)
      .htmlLng((d) => (d as { lng: number }).lng)
      .htmlAltitude(0.012)
      .htmlElement(() => {
        const el = document.createElement('div')
        el.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-4px)">' +
          '<div style="font-size:20px;filter:drop-shadow(0 0 6px rgba(56,189,248,.9))">📍</div>' +
          '<div style="font:600 10px sans-serif;color:#bae6fd;text-shadow:0 0 6px #000">you are here</div></div>'
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
    if (!globe || !solarMode) return
    const group = ensureSolarSystem(globe, {
      solarGroupRef,
      sunMeshRef,
      planetMeshesRef,
      solarAnimRef,
      solarFrameRef,
      solarTimeRef,
      applySkyRef,
    })
    group.visible = true
    const t = solarTimeRef.current
    solarFrameRef.current(new Date(t.simMs + (Date.now() - t.realMs) * t.warp))

    // Earth shrinks to its TRUE relative size (with satellites, clouds, all).
    // The three-globe root attaches to the scene after our setup ran, so we
    // resolve it here, lazily.
    if (!earthRootRef.current) {
      for (const child of globe.scene().children) {
        let found = false
        child.traverse((o) => {
          if ((o as { __globeObjType?: string }).__globeObjType === 'globe') found = true
        })
        if (found) {
          earthRootRef.current = child
          break
        }
      }
    }
    const k = EARTH_DISPLAY / 100
    const surf = surfaceRef.current
    const shrink = [
      earthRootRef.current,
      surf?.cloudsRef.current,
      surf?.bordersRef.current,
      surf?.volcanoesRef.current,
    ].filter((o): o is THREE.Object3D => !!o)
    shrink.forEach((o) => o.scale.setScalar(k))
    const sky = skyRef.current
    if (sky) {
      sky.sunSprite.visible = false // the solar Sun has its own glow
      sky.moonMesh.visible = false // would sit inside the mini-Earth
    }

    // widen the camera envelope: Pluto orbits ~39 AU out
    const cam = globe.camera() as THREE.PerspectiveCamera
    const controls = globe.controls()
    const prevFar = cam.far
    const prevMax = controls.maxDistance
    cam.far = 220_000
    cam.updateProjectionMatrix()
    controls.maxDistance = 130_000
    controls.autoRotate = false
    userInteractedRef.current = true
    return () => {
      group.visible = false
      shrink.forEach((o) => o.scale.setScalar(1))
      if (sky) {
        sky.sunSprite.visible = true
        sky.moonMesh.visible = true
      }
      cam.far = prevFar
      cam.updateProjectionMatrix()
      controls.maxDistance = prevMax
      pinTargetRef.current = null
      controls.target.set(0, 0, 0)
      controls.update()
      globe.pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)
    }
  }, [solarMode])

  // camera focus within solar mode: Sun overview or a chosen planet
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !solarMode) return
    return focusSolarBody(globe, { planetMeshesRef, sunMeshRef }, pinTargetRef, focusPlanet)
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

  // HUD quake click: fly the camera to the epicenter
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !flyTo) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    globe.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: 1.0 }, 1_400)
  }, [flyTo])

  // follow ISS: chase camera on every position update, pause auto-rotate meanwhile
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe.controls().autoRotate = !followIss && !userInteractedRef.current
    if (followIss && iss) {
      const altitude = Math.min(globe.pointOfView().altitude ?? 2.2, 1.6)
      globe.pointOfView({ lat: iss.lat, lng: iss.lng, altitude }, 2_700)
    }
  }, [followIss, iss])

  return <div ref={containerRef} className="fixed inset-0" />
}
