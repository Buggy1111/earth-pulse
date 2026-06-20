/** Enter/exit the heliocentric solar-system view: build the system (lazy),
 * shrink the live Earth to its true relative size, widen the camera envelope to
 * reach Pluto, and restore everything on exit. Driven by GlobeView's solarMode
 * effect; the orbit engine's rAF drives the actual motion via solarFrameRef. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { EARTH_DISPLAY } from '../../lib/planets'
import { ensureSolarSystem } from './solar'
import { setupProbes } from './probesLayer'
import { setupStars } from './starsLayer'
import type { SolarAnimEntry } from './orbitEngine'
import type { setupSky } from './sky'
import type { setupSurface } from './surface'

type SkyHandle = ReturnType<typeof setupSky>

export interface SolarModeDeps {
  solarGroupRef: { current: THREE.Group | null }
  sunMeshRef: { current: THREE.Mesh | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  moonMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
  solarFrameRef: { current: (now: Date) => void }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  applySkyRef: { current: (date: Date) => void }
  earthRootRef: { current: THREE.Object3D | null }
  surfaceRef: { current: ReturnType<typeof setupSurface> | null }
  pinTargetRef: { current: THREE.Object3D | null }
  userInteractedRef: { current: boolean }
  probeMeshesRef: { current: Map<string, THREE.Object3D> }
  /** A probe was clicked in the 3D scene — routed to the same focus as planets. */
  onProbePick: (id: string) => void
}

/** Build/show the solar system and reshape the scene for it; returns the
 * restore fn that puts the live Earth view back. */
export function enterSolarMode(globe: GlobeInstance, sky: SkyHandle, deps: SolarModeDeps): () => void {
  const group = ensureSolarSystem(globe, {
    solarGroupRef: deps.solarGroupRef,
    sunMeshRef: deps.sunMeshRef,
    planetMeshesRef: deps.planetMeshesRef,
    moonMeshesRef: deps.moonMeshesRef,
    solarAnimRef: deps.solarAnimRef,
    solarFrameRef: deps.solarFrameRef,
    solarTimeRef: deps.solarTimeRef,
    applySkyRef: deps.applySkyRef,
    sunUniform: sky.sunUniform,
  })
  group.visible = true
  const t = deps.solarTimeRef.current
  deps.solarFrameRef.current(new Date(t.simMs + (Date.now() - t.realMs) * t.warp))

  // 🛰 deep-space probes: real HORIZONS trajectories as colour-coded comet
  // trails + craft, ticked from the (wrapped) solar frame so they share the
  // one warped clock. Their display distance is clamped to fit the envelope.
  const probes = setupProbes(globe, group, deps.probeMeshesRef, deps.onProbePick)
  // 🌟 the real naked-eye sky as a camera-following skydome (never clips)
  const stars = setupStars(globe)
  const baseFrame = deps.solarFrameRef.current
  deps.solarFrameRef.current = (now) => {
    baseFrame(now)
    probes.update(now)
    stars.update(globe.camera())
  }

  // Earth shrinks to its TRUE relative size (with satellites, clouds, all).
  // The three-globe root attaches to the scene after our setup ran, so we
  // resolve it here, lazily.
  if (!deps.earthRootRef.current) {
    for (const child of globe.scene().children) {
      let found = false
      child.traverse((o) => {
        if ((o as { __globeObjType?: string }).__globeObjType === 'globe') found = true
      })
      if (found) {
        deps.earthRootRef.current = child
        break
      }
    }
  }
  const k = EARTH_DISPLAY / 100
  const surf = deps.surfaceRef.current
  const shrink = [
    deps.earthRootRef.current,
    surf?.cloudsRef.current,
    surf?.bordersRef.current,
    surf?.volcanoesRef.current,
  ].filter((o): o is THREE.Object3D => !!o)
  shrink.forEach((o) => o.scale.setScalar(k))
  sky.sunSprite.visible = false // the solar Sun has its own glow
  sky.moonMesh.visible = false // would sit inside the mini-Earth

  // widen the camera envelope to the REAL edge of the system: the Voyagers sit
  // at ~170 AU (~375k scene units), far past Pluto's ~49 AU — you have to be
  // able to zoom all the way out to them. Raising near alongside far keeps the
  // depth buffer precise (far/near ratio stays smaller than the old 260k view).
  const cam = globe.camera() as THREE.PerspectiveCamera
  const controls = globe.controls()
  const prevFar = cam.far
  const prevNear = cam.near
  const prevMax = controls.maxDistance
  // far must clear the most distant body seen from the opposite side: zoom-out
  // 700k + Voyager 1's ~376k still under the 1.2M far plane, so nothing clips.
  cam.near = 2
  cam.far = 1_200_000
  cam.updateProjectionMatrix()
  controls.maxDistance = 700_000
  controls.autoRotate = false
  deps.userInteractedRef.current = true
  return () => {
    deps.solarFrameRef.current = baseFrame
    probes.dispose()
    stars.dispose()
    group.visible = false
    shrink.forEach((o) => o.scale.setScalar(1))
    sky.sunSprite.visible = true
    sky.moonMesh.visible = true
    // solar mode re-aimed the shared sun uniform at the big Sun — restore
    // the earth-frame terminator immediately (exit always returns to live)
    sky.applySky(new Date())
    cam.far = prevFar
    cam.near = prevNear
    cam.updateProjectionMatrix()
    controls.maxDistance = prevMax
    deps.pinTargetRef.current = null
    controls.target.set(0, 0, 0)
    controls.update()
    globe.pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)
  }
}
