/** The orbit engine: satellites + ISS as 3D models, SGP4-propagated every
 * frame off the React path, plus the clicked-orbit trails with direction
 * arrows and the per-frame solar-system animation hookup. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import type { IssState } from '../../lib/iss'
import type { MoonDef } from '../../lib/planets'
import {
  globeAltitude,
  isIss,
  orbitTrack,
  propagateSats,
  type TrackedSat,
} from '../../lib/satellites'
import type { LayerState } from '../hud/types'
import { makeIssObject, makeSatelliteObject } from '../spaceObjects'
import {
  ARROW_GEO,
  ARROW_LOOP_MS,
  ARROW_MAT,
  escapeHtml,
  tooltip,
  type OrbitObject,
  type Trail,
  type TrailPath,
} from './helpers'

export interface SolarAnimEntry {
  mesh: THREE.Mesh
  rotationH: number
  /** The planet's system group + display radius — the moon-shadow transits
   * are solved against this sphere every frame (see solar.ts). */
  system: THREE.Group
  planetRadius: number
  moons: {
    mesh: THREE.Mesh
    def: MoonDef
    rScene: number
    /** Shadow discs cast onto the planet during a transit. */
    umbra: THREE.Mesh
    penumbra: THREE.Mesh
  }[]
}

export interface OrbitEngineDeps {
  layersRef: { current: LayerState }
  ecoRef: { current: boolean }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  solarModeRef: { current: boolean }
  solarGroupRef: { current: THREE.Group | null }
  solarFrameRef: { current: (now: Date) => void }
  pinTargetRef: { current: THREE.Object3D | null }
  trailsRef: { current: Map<string, Trail> }
  issStateRef: { current: IssState | null }
  orbitObjectsRef: { current: Map<string, OrbitObject> }
  onIssClick: () => void
  onSatClick: (id: string, name: string) => void
}

/** Configure the objects/paths layers and start the per-frame loop.
 * Returns the cleanup. */
export function startOrbitEngine(
  globe: GlobeInstance,
  sats: TrackedSat[],
  deps: OrbitEngineDeps,
): () => void {
  const trails = deps.trailsRef.current
  const satById = new Map(sats.map((s) => [s.id, s]))
  const byId = new Map<string, OrbitObject>()
  const objects: OrbitObject[] = []
  for (const p of propagateSats(sats, new Date())) {
    const sat = satById.get(p.id)
    if (!sat) continue
    const o: OrbitObject = {
      kind: isIss(p.name) ? 'iss' : 'sat',
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      altKm: p.altKm,
      sat,
    }
    byId.set(p.id, o)
    objects.push(o)
  }
  deps.orbitObjectsRef.current = byId

  // three-globe hangs each datum's Object3D off the datum itself
  // (key __threeObjObject for the objects layer; older versions __threeObj)
  type WithMesh = { __threeObjObject?: THREE.Object3D; __threeObj?: THREE.Object3D }
  let raf = 0
  let frameNo = 0
  const dir = new THREE.Vector3()
  const pinWorld = new THREE.Vector3()
  const pinDelta = new THREE.Vector3()
  const prevPinWorld = new THREE.Vector3()
  let prevPinObj: THREE.Object3D | null = null
  const frame = () => {
    // eco mode: propagate at half the frame rate — still fluid, half the CPU
    if (deps.ecoRef.current && ++frameNo % 2 === 1) {
      raf = requestAnimationFrame(frame)
      return
    }
    // warped clock: everything physical follows it (sats speed up too)
    const t = deps.solarTimeRef.current
    const now = new Date(t.simMs + (Date.now() - t.realMs) * t.warp)
    const show = deps.layersRef.current
    for (const p of propagateSats(sats, now)) {
      const o = byId.get(p.id)
      if (!o) continue
      o.lat = p.lat
      o.lng = p.lng
      o.altKm = p.altKm
      const mesh = (o as WithMesh).__threeObjObject ?? (o as WithMesh).__threeObj
      if (mesh) {
        mesh.visible = o.kind === 'iss' ? show.iss : show.sats
        Object.assign(mesh.position, globe.getCoords(p.lat, p.lng, globeAltitude(p.altKm)))
      }
    }
    // solar mode: one frame call drives planets, moons, spin and the sky.
    // MUST run before the chase block — pinning to a body's stale (previous
    // frame) position makes the whole view tremble at high time-warp.
    if (deps.solarModeRef.current && deps.solarGroupRef.current?.visible) {
      deps.solarFrameRef.current(now)
    }
    // bodies drift — keep the orbit pivot glued to whatever we're orbiting,
    // and CHASE it: the camera translates with the body, so a focused planet
    // stays framed even at full time-warp
    const pin = deps.pinTargetRef.current
    if (pin) {
      pin.getWorldPosition(pinWorld)
      if (prevPinObj === pin) {
        pinDelta.subVectors(pinWorld, prevPinWorld)
        ;(globe.camera() as THREE.PerspectiveCamera).position.add(pinDelta)
      }
      prevPinWorld.copy(pinWorld)
      prevPinObj = pin
      globe.controls().target.copy(pinWorld)
    } else {
      prevPinObj = null
    }
    // arrows ride their orbit rings in the direction of flight
    const cycle = now.getTime() / ARROW_LOOP_MS
    for (const trail of trails.values()) {
      const n = trail.vectors.length
      if (n < 2) continue
      const u = ((cycle + trail.phase) % 1) * (n - 1)
      const i = Math.floor(u)
      const a = trail.vectors[i]
      const b = trail.vectors[Math.min(i + 1, n - 1)]
      trail.arrow.position.lerpVectors(a, b, u - i)
      dir.subVectors(b, a).normalize()
      trail.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    }
    raf = requestAnimationFrame(frame)
  }

  globe
    .objectLat((d) => (d as OrbitObject).lat)
    .objectLng((d) => (d as OrbitObject).lng)
    .objectAltitude((d) => globeAltitude((d as OrbitObject).altKm))
    .objectThreeObject((d) =>
      (d as OrbitObject).kind === 'iss' ? makeIssObject() : makeSatelliteObject(),
    )
    .objectLabel((d) => {
      const o = d as OrbitObject
      if (o.kind === 'iss') {
        const v = deps.issStateRef.current?.velocityKmh
        const speed = v ? ` · ${Math.round(v).toLocaleString('en-US')} km/h` : ''
        return tooltip(`🛰 <b>ISS</b> · ${Math.round(o.altKm)} km${speed} · click to follow`)
      }
      return tooltip(`🛰 <b>${escapeHtml(o.name)}</b> · ${Math.round(o.altKm)} km · click for orbit`)
    })
    .onObjectClick((d) => {
      const o = d as OrbitObject
      if (o.kind === 'iss') deps.onIssClick()
      else deps.onSatClick(o.id, o.name)
    })

  // sci-fi neon trails: wide soft halo underneath, bright energy pulse on top
  globe
    .pathPoints((d) => (d as TrailPath).points)
    .pathPointLat((p) => (p as number[])[0])
    .pathPointLng((p) => (p as number[])[1])
    .pathPointAlt((p) => (p as number[])[2])
    .pathColor((d: object) =>
      (d as TrailPath).kind === 'halo'
        ? ['rgba(56, 189, 248, 0.05)', 'rgba(56, 189, 248, 0.4)', 'rgba(56, 189, 248, 0.05)']
        : ['rgba(240, 253, 255, 0.95)', 'rgba(125, 211, 252, 0.9)', 'rgba(240, 253, 255, 0.95)'],
    )
    .pathStroke((d) => ((d as TrailPath).kind === 'halo' ? 5 : 1.3))
    .pathDashLength((d) => ((d as TrailPath).kind === 'halo' ? 1 : 0.06))
    .pathDashGap((d) => ((d as TrailPath).kind === 'halo' ? 0 : 0.025))
    .pathDashAnimateTime((d) => ((d as TrailPath).kind === 'halo' ? 0 : 4_000))
    .pathTransitionDuration(600)

  globe.objectsData(objects)
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    for (const t of trails.values()) globe.scene().remove(t.arrow)
    trails.clear()
    globe.pathsData([])
  }
}

/** Reconcile the shown orbit trails with the user's selected NORAD ids. */
export function syncTrails(
  globe: GlobeInstance,
  trails: Map<string, Trail>,
  selectedIds: string[],
  sats: TrackedSat[],
): void {
  const want = new Set(selectedIds)
  for (const id of [...trails.keys()]) {
    if (!want.has(id)) {
      const t = trails.get(id)!
      globe.scene().remove(t.arrow)
      trails.delete(id)
    }
  }
  for (const id of want) {
    if (trails.has(id)) continue
    const sat = sats.find((s) => s.id === id)
    if (!sat) continue
    const track = orbitTrack(sat, new Date()).map(
      (p) => [p.lat, p.lng, globeAltitude(p.altKm)] as [number, number, number],
    )
    const vectors = track.map((p) => {
      const { x, y, z } = globe.getCoords(p[0], p[1], p[2])
      return new THREE.Vector3(x, y, z)
    })
    const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
    globe.scene().add(arrow)
    trails.set(id, {
      paths: [
        { points: track, kind: 'halo' },
        { points: track, kind: 'core' },
      ],
      arrow,
      vectors,
      phase: trails.size * 0.37, // spread arrows so several orbits don't sync up
    })
  }
  globe.pathsData([...trails.values()].flatMap((t) => t.paths))
}
