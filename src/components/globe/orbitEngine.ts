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
import { makeIssObject, makeNameSprite, makeSatelliteObject } from '../spaceObjects'
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

// NASA "Eyes"-style mission palette — each orbit is coloured by what the
// satellite does, not just its altitude. Falls back to LEO teal for anything
// outside the curated cast.
const SAT_ORBIT_COLOR: Record<string, string> = {
  ISS: '#22d3ee', // stations — cyan
  Tiangong: '#22d3ee',
  Hubble: '#c084fc', // great observatories — violet
  Fermi: '#c084fc',
  'NOAA-20': '#fb923c', // weather — orange
  'NOAA-21': '#fb923c',
  'GOES-16': '#fb923c',
  'GOES-18': '#fb923c',
  'Jason-3': '#38bdf8', // ocean / altimetry — sky blue
  SWOT: '#38bdf8',
  'Sentinel-3A': '#38bdf8',
  'Sentinel-6': '#38bdf8',
  'GRACE-FO 1': '#38bdf8',
  'Landsat 8': '#4ade80', // land imaging — green
  'Landsat 9': '#4ade80',
  'Sentinel-1A': '#4ade80',
  'Sentinel-2A': '#4ade80',
  'Sentinel-2B': '#4ade80',
  Terra: '#4ade80',
  'TanDEM-X': '#4ade80',
  Aqua: '#fbbf24', // atmosphere / climate — gold
  Aura: '#fbbf24',
  'Suomi NPP': '#fbbf24',
  'ICESat-2': '#fbbf24',
  'OCO-2': '#fbbf24',
  'GCOM-W1': '#fbbf24',
}

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
  /** Re-aims the day/night terminator + Moon each frame in the Earth view. */
  applySkyRef: { current: (date: Date) => void }
  /** 24 h-replay offset (ms, ≤0) folded into the sky clock so the terminator
   * rewinds with the earthquake timeline. */
  timeOffsetMsRef: { current: number }
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
  const Y_UP = new THREE.Vector3(0, 1, 0) // hoisted: was re-allocated per trail/frame
  const pinWorld = new THREE.Vector3()
  const pinDelta = new THREE.Vector3()
  const prevPinWorld = new THREE.Vector3()
  let prevPinObj: THREE.Object3D | null = null
  let satsParked = false
  const frame = () => {
    frameNo++
    // warped clock: everything physical follows it (sats speed up too)
    const t = deps.solarTimeRef.current
    const now = new Date(t.simMs + (Date.now() - t.realMs) * t.warp)
    const show = deps.layersRef.current
    orbitGroup.visible = !deps.solarModeRef.current && show.orbits

    // Satellite SGP4 is by far the heaviest part of the frame (148 bodies).
    // Skip it entirely in solar mode (sats aren't the view there) and when
    // neither the sat nor ISS layer is shown, and run it at half rate in eco —
    // sats crawl across the globe, so 30 Hz looks identical to 60. The cheap
    // body + sky motion below still runs every frame, so orbits stay smooth.
    const ecoHalf = deps.ecoRef.current && frameNo % 2 === 1
    if (!deps.solarModeRef.current && (show.sats || show.iss) && !ecoHalf) {
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
    } else if (deps.solarModeRef.current && !satsParked) {
      // park the satellite swarm out of sight while in solar mode (it lives in
      // the Earth view) — once on entry, not every frame
      for (const o of byId.values()) {
        const mesh = (o as WithMesh).__threeObjObject ?? (o as WithMesh).__threeObj
        if (mesh) mesh.visible = false
      }
      satsParked = true
    }
    if (!deps.solarModeRef.current) satsParked = false

    // Body motion + sky are cheap, so they run EVERY frame — planets, moons and
    // the terminator glide smoothly instead of stepping at the eco half-rate.
    // MUST run before the chase block — pinning to a body's stale (previous
    // frame) position makes the whole view tremble at high time-warp.
    if (deps.solarModeRef.current && deps.solarGroupRef.current?.visible) {
      deps.solarFrameRef.current(now)
    } else {
      // Earth view: re-aim the terminator + Moon every frame off the warped
      // clock plus the 24 h-replay offset, so live drifts smoothly and a
      // scrub/replay sweeps the day/night around the globe with the quakes.
      deps.applySkyRef.current(new Date(now.getTime() + deps.timeOffsetMsRef.current))
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
    // arrows ride their orbit rings (earth view only; trails belong to sats)
    if (!deps.solarModeRef.current) {
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
        trail.arrow.quaternion.setFromUnitVectors(Y_UP, dir)
      }
    }
    raf = requestAnimationFrame(frame)
  }

  globe
    .objectLat((d) => (d as OrbitObject).lat)
    .objectLng((d) => (d as OrbitObject).lng)
    .objectAltitude((d) => globeAltitude((d as OrbitObject).altKm))
    .objectThreeObject((d) => {
      const o = d as OrbitObject
      if (o.kind === 'iss') return makeIssObject()
      // a curated cast of ~26, so every sat keeps its detailed model + a name tag
      const model = makeSatelliteObject()
      model.add(makeNameSprite(o.name, 2, true))
      return model
    })
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

  // ——— orbit lines (NASA "Eyes on the Earth" look): a faint ground-track ring
  // per sat, colour-coded by altitude band, rebuilt every 30 s so it stays under
  // the moving model (the ground track drifts west as Earth turns beneath it)
  const orbitGroup = new THREE.Group()
  globe.scene().add(orbitGroup)
  const buildOrbitLines = () => {
    for (const c of [...orbitGroup.children]) {
      orbitGroup.remove(c)
      ;(c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    }
    const at = new Date()
    for (const o of objects) {
      if (!o.sat) continue
      const track = orbitTrack(o.sat, at, 96)
      if (track.length < 2) continue
      const pts = track.map((p) => {
        const { x, y, z } = globe.getCoords(p.lat, p.lng, globeAltitude(p.altKm))
        return new THREE.Vector3(x, y, z)
      })
      const color = SAT_ORBIT_COLOR[o.name] ?? (o.altKm > 20_000 ? '#fbbf24' : '#5eead4')
      // additive blend = the lines softly glow where they cross, dark space only
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      line.renderOrder = 1
      orbitGroup.add(line)
    }
  }
  buildOrbitLines()
  const orbitTimer = setInterval(buildOrbitLines, 30_000)

  globe.objectsData(objects)
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    clearInterval(orbitTimer)
    for (const c of orbitGroup.children) {
      ;(c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    }
    globe.scene().remove(orbitGroup)
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
