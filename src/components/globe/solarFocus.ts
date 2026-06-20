/** Camera focus flight for solar mode: glide to the Sun overview or a chosen
 * body (planet OR moon) tracking its live position, then hand it to the
 * pin/chase system. Split out of solar.ts to keep the builder under 400 lines. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { PLANET_MOONS } from '../../lib/planets'
import type { SolarDeps } from './solar'

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Which planet a moon belongs to (moon ids are globally unique). */
export const MOON_PARENT: Record<string, string> = Object.fromEntries(
  Object.entries(PLANET_MOONS).flatMap(([pid, moons]) => moons.map((m) => [m.id, pid])),
)

/** Glide the camera to the Sun overview or a chosen body (planet OR moon);
 * returns a restore fn. The flight tracks the body's LIVE position each frame
 * (it keeps working at full time-warp) and hands the body to the pin/chase
 * system on arrival. A user drag mid-flight cancels the glide and pins where
 * we are. Moon labels + orbit rings show only for the focused system. */
export function focusSolarBody(
  globe: GlobeInstance,
  deps: Pick<SolarDeps, 'planetMeshesRef' | 'moonMeshesRef' | 'sunMeshRef'> & {
    probeMeshesRef: { current: Map<string, THREE.Object3D> }
  },
  pinTargetRef: { current: THREE.Object3D | null },
  focusPlanet: string | null,
): (() => void) | undefined {
  const controls = globe.controls()
  const cam = globe.camera() as THREE.PerspectiveCamera
  const prevMin = controls.minDistance
  const focusMesh =
    (focusPlanet && focusPlanet !== 'sun'
      ? (deps.planetMeshesRef.current.get(focusPlanet) ??
        deps.moonMeshesRef.current.get(focusPlanet) ??
        deps.probeMeshesRef.current.get(focusPlanet))
      : null) ?? deps.sunMeshRef.current
  if (!focusMesh) return undefined
  const radius = (focusMesh.userData.displayRadius as number | undefined) ?? 20
  controls.minDistance = Math.max(radius * 2.2, 2)

  // reveal this system's moon labels + orbit rings, hide everyone else's
  const focusedSystem = focusPlanet ? (MOON_PARENT[focusPlanet] ?? focusPlanet) : null
  for (const [pid, system] of deps.planetMeshesRef.current) {
    const decor = system.userData.decor as THREE.Object3D[] | undefined
    decor?.forEach((o) => (o.visible = pid === focusedSystem))
  }

  // the flight is camera-offset interpolation around the moving body: keep
  // the approach direction, shrink the distance — no path through the body
  const world = focusMesh.getWorldPosition(new THREE.Vector3())
  const startOffset = cam.position.clone().sub(world)
  // if the camera sits almost on the body, normalize() would be NaN — fall back
  // to a sensible approach direction (this froze the view when focusing Earth,
  // which sits at the scene origin)
  if (startOffset.lengthSq() < 1e-4) startOffset.set(0, radius * 3, radius * 6)
  const endOffset = focusPlanet
    ? startOffset.clone().normalize().multiplyScalar(radius * 6)
    : // overview above the ecliptic: inner system + Jupiter & Saturn framed
      new THREE.Vector3(0, 13_000, 21_000)
  pinTargetRef.current = null // the glide owns the camera until it lands
  const t0 = performance.now()
  const dur = 1_600
  const off = new THREE.Vector3()
  let raf = 0
  const land = () => {
    pinTargetRef.current = focusMesh
  }
  const fly = () => {
    const t = Math.min((performance.now() - t0) / dur, 1)
    focusMesh.getWorldPosition(world)
    off.lerpVectors(startOffset, endOffset, easeInOutCubic(t))
    cam.position.copy(world).add(off)
    controls.target.copy(world)
    controls.update()
    if (t < 1) raf = requestAnimationFrame(fly)
    else land()
  }
  raf = requestAnimationFrame(fly)
  const onDragStart = () => {
    cancelAnimationFrame(raf)
    land()
  }
  controls.addEventListener('start', onDragStart)
  return () => {
    cancelAnimationFrame(raf)
    controls.removeEventListener('start', onDragStart)
    controls.minDistance = prevMin
  }
}
