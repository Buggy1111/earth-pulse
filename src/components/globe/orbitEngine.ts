/** The orbit engine: satellites + ISS as 3D models, SGP4-propagated every
 * frame off the React path, plus the clicked-orbit trails with direction
 * arrows and the per-frame solar-system animation hookup. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import type { IssState } from '../../lib/iss'
import type { MoonDef } from '../../lib/planets'
import { subsolarPoint } from '../../lib/sun'
import {
  globeAltitude,
  isIss,
  orbitTrail,
  propagateSats,
  type TrackedSat,
} from '../../lib/satellites'
import type { LayerState } from '../hud/types'
import { makeNameSprite } from '../spaceObjects'
import { detectWeakGpu, glIsSoftware } from '../perf'
import { cloneSatModel, preloadSatModels } from './spaceModels'
import { escapeHtml, tooltip, type OrbitObject, type Trail } from './helpers'
import { buildSatObject } from './satObject'
import { buildOrbitLines, configureTrailPaths, satColor } from './orbitRender'

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
  /** "Earth spins" view: rotate the camera to follow the Sun so the Sun parks
   * and the Earth appears to rotate (already gated for solar/follow/tour/moon). */
  earthSpinRef: { current: boolean }
  trailsRef: { current: Map<string, Trail> }
  issStateRef: { current: IssState | null }
  orbitObjectsRef: { current: Map<string, OrbitObject> }
  /** The Starlink swarm (10k InstancedMesh), ticked from this frame loop so it
   * shares the one warped clock. Null until the layer is first switched on. */
  starlinkRef: { current: { setVisible(v: boolean): void; update(now: Date): void } | null }
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
  // a stable colour per satellite (by catalogue order) — shared everywhere
  const colorById = new Map(sats.map((s, i) => [s.id, isIss(s.name) ? '#22d3ee' : satColor(i)]))
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
      color: colorById.get(p.id) ?? '#5eead4',
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
  let disposed = false
  // trails are rebuilt off the warped clock; throttle by real time (≥250 ms)
  // and rebuild sooner once the simulated clock has jumped (time-warp)
  let lastBuildReal = Date.now()
  let lastBuildSim = lastBuildReal
  const dir = new THREE.Vector3()
  const Y_UP = new THREE.Vector3(0, 1, 0) // hoisted: was re-allocated per trail/frame
  const pinWorld = new THREE.Vector3()
  const pinDelta = new THREE.Vector3()
  const prevPinWorld = new THREE.Vector3()
  let prevPinObj: THREE.Object3D | null = null
  let satsParked = false
  let lastSunAz = NaN // for the "Earth spins" camera follow (Sun's world azimuth)
  let prevAutoRotate = false // idle auto-rotate paused during Earth-spin, restored after
  // 🚀 interaction-aware resolution (weak GPUs only). A fill-rate-bound GPU
  // (integrated Intel, a phone) chokes on pixels long before geometry — but a
  // STILL view is cheap. So render at FULL resolution while you're just looking
  // (crisp), and drop to fewer pixels only while you drag / zoom / time-warp —
  // the heavy moments — then snap back to crisp ~0.45 s after it settles.
  // Powerful GPUs always render full res (the whole block is skipped).
  const renderer = globe.renderer()
  const MOVE_SCALE = 0.62 // pixel-ratio multiplier while the view is moving
  const needsScaling =
    detectWeakGpu() ||
    (() => {
      try {
        return glIsSoftware(renderer.getContext())
      } catch {
        return false
      }
    })()
  let interacting = false
  let sharpSince = 0
  let curScale = 1
  const renderCap = () => (deps.ecoRef.current ? 1 : Math.min(window.devicePixelRatio || 1, 2))
  const applyScale = (s: number) => {
    const want = renderCap() * s
    if (Math.abs(renderer.getPixelRatio() - want) > 0.01) renderer.setPixelRatio(want)
    curScale = s
  }
  const onInteractStart = () => {
    interacting = true
  }
  const onInteractEnd = () => {
    interacting = false
  }
  if (needsScaling) {
    globe.controls().addEventListener('start', onInteractStart)
    globe.controls().addEventListener('end', onInteractEnd)
  }
  const frame = () => {
    frameNo++
    // warped clock: everything physical follows it (sats speed up too)
    const t = deps.solarTimeRef.current
    const now = new Date(t.simMs + (Date.now() - t.realMs) * t.warp)

    // resolution (weak GPUs only): crisp while still, lighter only while moving.
    // Snap down the instant a drag/zoom/time-warp starts; ~0.45 s after it stops,
    // go back to full resolution so a still view is sharp to look at.
    if (needsScaling) {
      const moving = interacting || t.warp !== 1
      if (moving) {
        sharpSince = 0
        if (curScale !== MOVE_SCALE) applyScale(MOVE_SCALE)
      } else {
        const nowMs = performance.now()
        if (sharpSince === 0) sharpSince = nowMs
        else if (nowMs - sharpSince > 450 && curScale !== 1) applyScale(1)
      }
    }

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

    // 🛰 Starlink swarm: visible only in the Earth view with its layer on; the
    // worker-backed update() throttles itself, so calling it every frame is cheap.
    const starlink = deps.starlinkRef.current
    if (starlink) {
      starlink.setVisible(!deps.solarModeRef.current && show.starlink)
      starlink.update(now)
    }

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
      // 🌍 "Earth spins" mode: under time-warp, rotate the camera about the
      // polar axis to track the Sun's azimuth, so the Sun parks and the Earth
      // visibly rotates under it (physics untouched — just the viewpoint). At 1×
      // the spin is imperceptible, so we leave globe.gl's gentle idle auto-rotate
      // alone. Skipped while a body is pinned (the chase block owns the camera).
      const warp = deps.solarTimeRef.current.warp
      const ctrl = globe.controls() as unknown as { autoRotate: boolean; enableDamping: boolean }
      if (deps.earthSpinRef.current && warp !== 1 && !deps.pinTargetRef.current) {
        // our Sun-tracking IS the rotation — turn off BOTH the idle auto-rotate
        // and damping, which each otherwise nudge the camera every frame and make
        // the Sun drift off-screen. Both are restored in the else branch (damping
        // doubles as the "are we mid-spin" flag, so we capture autoRotate once).
        if (ctrl.enableDamping) {
          prevAutoRotate = ctrl.autoRotate
          ctrl.enableDamping = false
        }
        ctrl.autoRotate = false
        // track the Sun's WORLD azimuth (not its longitude — globe.gl maps lng to
        // azimuth with a sign flip) and rotate the camera by the same delta.
        const s = subsolarPoint(new Date(now.getTime() + deps.timeOffsetMsRef.current))
        const c = globe.getCoords(s.lat, s.lng, 0)
        const az = Math.atan2(c.x, c.z)
        if (Number.isFinite(lastSunAz)) {
          let d = az - lastSunAz
          if (d > Math.PI) d -= 2 * Math.PI
          else if (d < -Math.PI) d += 2 * Math.PI
          if (d !== 0) {
            const cam = globe.camera() as THREE.PerspectiveCamera
            const tgt = globe.controls().target
            cam.position.sub(tgt).applyAxisAngle(Y_UP, d).add(tgt)
          }
        }
        lastSunAz = az
      } else {
        if (!ctrl.enableDamping) {
          ctrl.enableDamping = true // restore smooth drag
          ctrl.autoRotate = prevAutoRotate // and the idle auto-rotate we paused
        }
        lastSunAz = NaN
      }
    }
    // bodies drift — keep the orbit pivot glued to whatever we're orbiting,
    // and CHASE it: the camera translates with the body, so a focused planet
    // stays framed even at full time-warp
    const pin = deps.pinTargetRef.current
    if (pin) {
      pin.getWorldPosition(pinWorld)
      // guard: a non-finite body position (extreme warp/precision) must never
      // reach the camera — one NaN there freezes the whole renderer
      if (Number.isFinite(pinWorld.x + pinWorld.y + pinWorld.z)) {
        if (prevPinObj === pin) {
          pinDelta.subVectors(pinWorld, prevPinWorld)
          ;(globe.camera() as THREE.PerspectiveCamera).position.add(pinDelta)
        }
        prevPinWorld.copy(pinWorld)
        prevPinObj = pin
        globe.controls().target.copy(pinWorld)
      }
    } else {
      prevPinObj = null
    }
    // keep the comet trails anchored to the flying satellites: rebuild from the
    // warped clock, throttled by real time but triggered early once the
    // simulated clock has jumped — so under time-warp the tail tracks the head
    // instead of being left behind, and at live speed it still refreshes for
    // the slow ground-track drift.
    if (!deps.solarModeRef.current) {
      const realMs = Date.now()
      const simMs = now.getTime()
      if (
        realMs - lastBuildReal >= 250 &&
        (Math.abs(simMs - lastBuildSim) >= 30_000 || realMs - lastBuildReal >= 30_000)
      ) {
        if (show.orbits) buildOrbitLines(globe, orbitGroup, objects, now)
        rebuildTrails(now)
        lastBuildReal = realMs
        lastBuildSim = simMs
      }
    }
    // the arrow marks the HEAD of the trail — the satellite's current position —
    // pointing the way it's travelling (earth view only; trails belong to sats)
    if (!deps.solarModeRef.current) {
      for (const trail of trails.values()) {
        const n = trail.vectors.length
        if (n < 2) continue
        const a = trail.vectors[n - 2]
        const b = trail.vectors[n - 1]
        trail.arrow.position.copy(b)
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
    .objectThreeObject((d) => buildSatObject(d, deps.ecoRef.current))
    .objectLabel((d) => {
      const o = d as OrbitObject
      if (o.kind === 'iss') {
        const v = deps.issStateRef.current?.velocityKmh
        const speed = v ? ` · ${Math.round(v).toLocaleString('en-US')} km/h` : ''
        return tooltip(`🛰 <b>ISS</b> · ${Math.round(o.altKm)} km${speed} · click to follow`)
      }
      return tooltip(`🛰 <b>${escapeHtml(o.name)}</b> · ${Math.round(o.altKm)} km · click to fly with it`)
    })
    .onObjectClick((d) => {
      const o = d as OrbitObject
      if (o.kind === 'iss') deps.onIssClick()
      else deps.onSatClick(o.id, o.name)
    })

  configureTrailPaths(globe)

  const orbitGroup = new THREE.Group()
  globe.scene().add(orbitGroup)

  // recompute each shown (clicked) trail's geometry from the warped clock, so a
  // selected orbit's tail follows its satellite too — even under time-warp
  const rebuildTrails = (at: Date) => {
    if (trails.size === 0) return
    for (const [id, tr] of trails) {
      const sat = satById.get(id)
      if (!sat) continue
      const track = orbitTrail(sat, at).map(
        (p) => [p.lat, p.lng, globeAltitude(p.altKm)] as [number, number, number],
      )
      if (track.length < 2) continue
      tr.paths[0].points = track
      tr.paths[1].points = track
      tr.vectors = track.map((p) => {
        const { x, y, z } = globe.getCoords(p[0], p[1], p[2])
        return new THREE.Vector3(x, y, z)
      })
    }
    globe.pathsData([...trails.values()].flatMap((t) => t.paths))
  }

  buildOrbitLines(globe, orbitGroup, objects, new Date())

  globe.objectsData(objects)
  raf = requestAnimationFrame(frame)

  // load the real NASA models in the background, then swap them in PLACE —
  // three-globe caches each datum's object and won't re-run the accessor, so we
  // keep the positioned root node and just replace its contents with the glb.
  void preloadSatModels(new Set(objects.map((o) => o.name))).then(() => {
    if (disposed) return
    for (const o of objects) {
      const model = cloneSatModel(o.name)
      const root = (o as WithMesh).__threeObjObject ?? (o as WithMesh).__threeObj
      if (!model || !root) continue
      root.clear() // drop the primitive placeholder + its label
      root.scale.setScalar(1)
      root.rotation.set(0, 0, 0)
      root.add(model) // scaled glb
      root.add(makeNameSprite(o.name, 3, true, o.color)) // label on unscaled root
    }
  })

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    if (needsScaling) {
      globe.controls().removeEventListener('start', onInteractStart)
      globe.controls().removeEventListener('end', onInteractEnd)
    }
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
