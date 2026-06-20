/** Camera modes that take over the controls: the cinematic tour playlist and
 * moon orbiting. Each returns its cleanup (restores the Earth view). */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import type { Quake } from '../../lib/quakes'
import { subsolarPoint } from '../../lib/sun'
import { followPixelRatio } from '../perf'
import { HOME_VIEW, type OrbitObject } from './helpers'

/** Glide between live points of interest every 8 s. */
export function startTour(
  globe: GlobeInstance,
  quakesRef: { current: Quake[] },
  orbitObjectsRef: { current: Map<string, OrbitObject> },
): () => void {
  let step = 0
  const next = () => {
    const stops: { lat: number; lng: number; altitude: number }[] = []
    const qs = quakesRef.current
    if (qs.length > 0) {
      const strongest = [...qs].sort((a, b) => b.mag - a.mag)[0]
      stops.push({ lat: strongest.lat, lng: strongest.lng, altitude: 0.8 })
    }
    const orbitObjs = [...orbitObjectsRef.current.values()]
    const issObj = orbitObjs.find((o) => o.kind === 'iss')
    if (issObj) stops.push({ lat: issObj.lat, lng: issObj.lng, altitude: 1.0 })
    stops.push({ lat: 78, lng: -70, altitude: 1.5 }) // northern aurora oval
    const sun = subsolarPoint(new Date())
    stops.push({ lat: 15, lng: ((sun.lng + 95 + 540) % 360) - 180, altitude: 1.3 }) // dusk line
    const satsOnly = orbitObjs.filter((o) => o.kind === 'sat')
    if (satsOnly.length > 0) {
      const pick = satsOnly[(step * 37) % satsOnly.length]
      stops.push({ lat: pick.lat, lng: pick.lng, altitude: 0.9 })
    }
    if (qs.length > 0) stops.push({ lat: qs[0].lat, lng: qs[0].lng, altitude: 0.9 })
    globe.pointOfView(stops[step % stops.length], 4_000)
    step++
  }
  next()
  const id = setInterval(next, 8_000)
  return () => clearInterval(id)
}

/** Lock onto a satellite: snap the camera up close, pin it so it flies along
 * with the satellite, and re-target the controls so dragging orbits AROUND it
 * (scroll zooms). Cleanup releases it and glides back to the Earth view. Mirrors
 * enterMoonMode for a small, fast-moving body. */
export function followSatellite(
  globe: GlobeInstance,
  target: THREE.Object3D,
  pinTargetRef: { current: THREE.Object3D | null },
): () => void {
  const controls = globe.controls()
  const prevMin = controls.minDistance
  const prevAuto = controls.autoRotate
  controls.autoRotate = false
  controls.minDistance = 6 // the sat models are ~5 units across
  // Close-up, a heavy GLB fills the viewport and the fragment load can crash a
  // mobile GPU (lost context → blank app). Drop the pixel ratio while locked on,
  // clamped so we never raise it above whatever's already set (e.g. eco's 1×).
  const renderer = globe.renderer()
  const prevRatio = renderer.getPixelRatio()
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  renderer.setPixelRatio(Math.min(prevRatio, followPixelRatio(dpr)))
  const cam = globe.camera() as THREE.PerspectiveCamera
  const p = new THREE.Vector3()
  target.getWorldPosition(p)
  const dir = p.clone().normalize() // Earth-centre → satellite
  // sit just beyond and above the satellite, looking back at it (Earth below)
  cam.position.copy(p).addScaledVector(dir, 14).add(new THREE.Vector3(0, 7, 0))
  pinTargetRef.current = target // the rAF chase keeps the camera flying with it
  controls.target.copy(p)
  controls.update()
  return () => {
    pinTargetRef.current = null
    controls.minDistance = prevMin
    controls.autoRotate = prevAuto
    renderer.setPixelRatio(prevRatio)
    controls.target.set(0, 0, 0)
    controls.update()
    globe.pointOfView(HOME_VIEW, 800)
  }
}

/** Re-target the orbit controls from Earth to the Moon — drag orbits the
 * Moon, Earth hangs in its sky. Cleanup restores the Earth view. */
export function enterMoonMode(
  globe: GlobeInstance,
  moon: THREE.Mesh,
  pinTargetRef: { current: THREE.Object3D | null },
): () => void {
  const controls = globe.controls()
  const prevMin = controls.minDistance
  controls.autoRotate = false
  controls.minDistance = 7 // moon radius is 5
  // camera between Earth and Moon, slightly offset, looking at the Moon
  const dir = moon.position.clone().normalize()
  const cam = globe.camera() as THREE.PerspectiveCamera
  cam.position.copy(moon.position).addScaledVector(dir, -22).add(new THREE.Vector3(0, 6, 0))
  pinTargetRef.current = moon
  controls.target.copy(moon.position)
  controls.update()
  return () => {
    pinTargetRef.current = null
    controls.minDistance = prevMin
    controls.target.set(0, 0, 0)
    controls.update()
    globe.pointOfView(HOME_VIEW, 0)
  }
}
