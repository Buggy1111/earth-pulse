/** Trail + orbit-line rendering for the orbit engine: the per-satellite colour,
 * the globe.gl neon-trail path config, the faint ground-track orbit lines and
 * the clicked-trail reconciliation. Pure rendering — no frame loop, no deps. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { occludeLineMaterial } from './trailOcclusion'
import { globeAltitude, isIss, orbitTrail, type TrackedSat } from '../../lib/satellites'
import {
  ARROW_GEO,
  ARROW_MAT,
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

// reused to turn any CSS colour into an rgba() stop for the trail gradients
const _col = new THREE.Color()
function rgba(css: string, a: number): string {
  _col.set(css)
  return `rgba(${Math.round(_col.r * 255)}, ${Math.round(_col.g * 255)}, ${Math.round(_col.b * 255)}, ${a})`
}

/** Sci-fi neon trails: wide soft halo underneath, bright energy pulse on top.
 * A trailing comet look — transparent at the tail, bright at the head (the
 * satellite's current position), tinted with each satellite's own colour. */
export function configureTrailPaths(globe: GlobeInstance): void {
  globe
    .pathPoints((d) => (d as TrailPath).points)
    .pathPointLat((p) => (p as number[])[0])
    .pathPointLng((p) => (p as number[])[1])
    .pathPointAlt((p) => (p as number[])[2])
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
}

const _tint = new THREE.Color()

/** Orbit lines (NASA "Eyes on the Earth" look): a faint ground-track ring per
 * sat, colour-coded by altitude band, rebuilt every 30 s so it stays under the
 * moving model (the ground track drifts west as Earth turns beneath it). */
export function buildOrbitLines(
  globe: GlobeInstance,
  orbitGroup: THREE.Group,
  objects: OrbitObject[],
  at: Date,
): void {
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
    _tint.set(o.color ?? '#5eead4')
    // per-vertex fade: black tail → full colour head. Additive blend means
    // black is invisible, so the tail dissolves into space.
    const n = pts.length
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) ** 1.6 // ease so the fade lingers near the head
      colors[i * 3] = _tint.r * f
      colors[i * 3 + 1] = _tint.g * f
      colors[i * 3 + 2] = _tint.b * f
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const line = new THREE.Line(
      geom,
      occludeLineMaterial(
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    )
    line.renderOrder = 1
    orbitGroup.add(line)
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
