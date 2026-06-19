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
import {
  makeGcomObject,
  makeHubbleObject,
  makeIssObject,
  makeNameSprite,
  makeSatelliteObject,
  makeSentinel1Object,
  makeSentinel2Object,
  makeSentinel3Object,
  makeTanDEMObject,
} from '../spaceObjects'
import { cloneSatModel, preloadSatModels } from './spaceModels'
import {
  ARROW_GEO,
  ARROW_MAT,
  escapeHtml,
  tooltip,
  type OrbitObject,
  type Trail,
  type TrailPath,
} from './helpers'

/** Every satellite gets its OWN colour, spread by the golden angle so no two
 * neighbours clash — used for its orbit line, its clicked trail and its name
 * tag. The ISS keeps its iconic cyan. */
export function satColor(i: number): string {
  return `hsl(${Math.round((i * 137.508) % 360)}, 78%, 63%)`
}

// the hand-built primitive for a satellite with no real glb model — shaped per
// spacecraft where we have a distinct silhouette, else the generic gold bus.
function primitiveFor(name: string, eco: boolean): THREE.Object3D {
  switch (name) {
    case 'Hubble':
      return makeHubbleObject()
    case 'Sentinel-1A':
      return makeSentinel1Object()
    case 'Sentinel-2A':
    case 'Sentinel-2B':
      return makeSentinel2Object()
    case 'Sentinel-3A':
      return makeSentinel3Object()
    case 'TanDEM-X':
      return makeTanDEMObject()
    case 'GCOM-W1':
      return makeGcomObject()
    default:
      return makeSatelliteObject(eco)
  }
}

// reused to turn any CSS colour into an rgba() stop for the trail gradients
const _col = new THREE.Color()
function rgba(css: string, a: number): string {
  _col.set(css)
  return `rgba(${Math.round(_col.r * 255)}, ${Math.round(_col.g * 255)}, ${Math.round(_col.b * 255)}, ${a})`
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
        // the Sun drift off-screen. Restored in the else branch for normal drag.
        ctrl.autoRotate = false
        ctrl.enableDamping = false
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
        if (!ctrl.enableDamping) ctrl.enableDamping = true // restore smooth drag
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
        if (show.orbits) buildOrbitLines(now)
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

  // each datum's 3D model: the real NASA glb once it's loaded, otherwise a
  // hand-built primitive placeholder (the models are the whole point now, so
  // they're used even in eco — they're tiny on screen anyway)
  const buildObj = (d: object): THREE.Object3D => {
    const o = d as OrbitObject
    const real = cloneSatModel(o.name)
    if (real) {
      // label goes on an UNSCALED outer group, not inside the model — each glb is
      // normalised by a different factor (TARGET_SIZE / its native size), so a
      // child label would inherit that and blow up (e.g. GOES). Sibling = consistent.
      const g = new THREE.Group()
      g.add(real)
      g.add(makeNameSprite(o.name, 3, true, o.color))
      return g
    }
    if (o.kind === 'iss') return makeIssObject() // carries its own label
    // primitives are internally scaled too → same outer-group trick so the label
    // stays a consistent on-screen size across all sats.
    const g = new THREE.Group()
    g.add(primitiveFor(o.name, deps.ecoRef.current))
    g.add(makeNameSprite(o.name, 2, true, o.color))
    return g
  }

  globe
    .objectLat((d) => (d as OrbitObject).lat)
    .objectLng((d) => (d as OrbitObject).lng)
    .objectAltitude((d) => globeAltitude((d as OrbitObject).altKm))
    .objectThreeObject(buildObj)
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

  // sci-fi neon trails: wide soft halo underneath, bright energy pulse on top
  globe
    .pathPoints((d) => (d as TrailPath).points)
    .pathPointLat((p) => (p as number[])[0])
    .pathPointLng((p) => (p as number[])[1])
    .pathPointAlt((p) => (p as number[])[2])
    // trailing comet look: transparent at the tail, bright at the head (the
    // satellite's current position) — points run oldest → now, tinted with the
    // satellite's own colour
    .pathColor((d: object) => {
      const t = d as TrailPath
      return t.kind === 'halo'
        ? [rgba(t.color, 0), rgba(t.color, 0.45)]
        : [rgba(t.color, 0), rgba(t.color, 0.95)]
    })
    .pathStroke((d) => ((d as TrailPath).kind === 'halo' ? 5 : 1.3))
    .pathDashLength((d) => ((d as TrailPath).kind === 'halo' ? 1 : 0.06))
    .pathDashGap((d) => ((d as TrailPath).kind === 'halo' ? 0 : 0.025))
    .pathDashAnimateTime((d) => ((d as TrailPath).kind === 'halo' ? 0 : 4_000))
    // rebuilt in place as the satellite flies (esp. under time-warp), so no
    // morph-tween between updates — the trail snaps cleanly to the new arc
    .pathTransitionDuration(0)

  // ——— orbit lines (NASA "Eyes on the Earth" look): a faint ground-track ring
  // per sat, colour-coded by altitude band, rebuilt every 30 s so it stays under
  // the moving model (the ground track drifts west as Earth turns beneath it)
  const orbitGroup = new THREE.Group()
  globe.scene().add(orbitGroup)
  const tint = new THREE.Color()
  const buildOrbitLines = (at: Date) => {
    for (const c of [...orbitGroup.children]) {
      orbitGroup.remove(c)
      ;(c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    }
    for (const o of objects) {
      if (!o.sat) continue
      // a comet-style TRAIL behind the body, not a full ring — the bright head
      // is where the satellite is right now, fading back along where it flew
      const track = orbitTrail(o.sat, at, 0.7, 64)
      if (track.length < 2) continue
      const pts = track.map((p) => {
        const { x, y, z } = globe.getCoords(p.lat, p.lng, globeAltitude(p.altKm))
        return new THREE.Vector3(x, y, z)
      })
      tint.set(o.color ?? '#5eead4')
      // per-vertex fade: black tail → full colour head. Additive blend means
      // black is invisible, so the tail dissolves into space.
      const n = pts.length
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const f = (i / (n - 1)) ** 1.6 // ease so the fade lingers near the head
        colors[i * 3] = tint.r * f
        colors[i * 3 + 1] = tint.g * f
        colors[i * 3 + 2] = tint.b * f
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts)
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      line.renderOrder = 1
      orbitGroup.add(line)
    }
  }

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

  buildOrbitLines(new Date())

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

/** Reconcile the shown orbit trails with the user's selected NORAD ids.
 * `now` is the (possibly time-warped) clock, so a freshly clicked orbit starts
 * lined up with where its satellite is right now. */
export function syncTrails(
  globe: GlobeInstance,
  trails: Map<string, Trail>,
  selectedIds: string[],
  sats: TrackedSat[],
  now: Date = new Date(),
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
    const idx = sats.findIndex((s) => s.id === id)
    const sat = idx >= 0 ? sats[idx] : undefined
    if (!sat) continue
    // same colour the satellite uses for its body & orbit line
    const color = isIss(sat.name) ? '#22d3ee' : satColor(idx)
    const track = orbitTrail(sat, now).map(
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
        { points: track, kind: 'halo', color },
        { points: track, kind: 'core', color },
      ],
      arrow,
      vectors,
      phase: trails.size * 0.37, // spread arrows so several orbits don't sync up
    })
  }
  globe.pathsData([...trails.values()].flatMap((t) => t.paths))
}
