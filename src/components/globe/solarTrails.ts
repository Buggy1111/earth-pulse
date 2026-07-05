/** Comet-style orbit trails for the solar system: the full ring geometry stays,
 * but the vertex colours are repainted every frame so the bright head sits on
 * the body and fades back along the path it came from. The body and its orbit
 * always share a parent, so we compare LOCAL positions — no matrix work in the
 * hot path. */

import * as THREE from 'three'
import { occludeLineMaterial } from './trailOcclusion'

export interface SolarTrail {
  line: THREE.Line
  pts: THREE.Vector3[]
  colors: THREE.Float32BufferAttribute
  base: THREE.Color
  n: number
  body: THREE.Object3D
  span: number
  prevHead: number
  lastDir: number
}

export function makeTrailOrbit(
  trails: SolarTrail[],
  pts: THREE.Vector3[],
  colorHex: string,
  opacity: number,
  body: THREE.Object3D,
): THREE.Line {
  const n = pts.length
  const colors = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)
  const geom = new THREE.BufferGeometry().setFromPoints(pts)
  geom.setAttribute('color', colors)
  const line = new THREE.Line(
    geom,
    occludeLineMaterial(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  )
  line.renderOrder = 1
  trails.push({
    line,
    pts,
    colors,
    base: new THREE.Color(colorHex),
    n,
    body,
    // ~110° komety za tělesem — stejný živý "ocásek" jako mají satelity
    // a Měsíc na Earth view, žádný statický pruh přes 3/4 orbity
    span: Math.max(2, Math.floor(n * 0.3)),
    prevHead: -1,
    lastDir: 1,
  })
  return line
}

export function updateSolarTrails(trails: SolarTrail[]): void {
  for (const tr of trails) {
    if (!tr.line.visible) continue
    const bp = tr.body.position // same parent as the orbit → local space matches
    let h = 0
    let best = Infinity
    for (let i = 0; i < tr.n; i++) {
      const d = tr.pts[i].distanceToSquared(bp)
      if (d < best) {
        best = d
        h = i
      }
    }
    // head didn't move a whole vertex → the paint is already right; skip the
    // repaint AND the per-frame GPU re-upload of the colour attribute
    if (h === tr.prevHead) continue
    // motion direction from the head's step — auto-handles retrograde moons
    let dir = tr.lastDir
    if (tr.prevHead >= 0) {
      let delta = h - tr.prevHead
      if (delta > tr.n / 2) delta -= tr.n
      else if (delta < -tr.n / 2) delta += tr.n
      if (delta !== 0) dir = Math.sign(delta)
    }
    tr.lastDir = dir
    tr.prevHead = h
    const c = tr.colors.array as Float32Array
    c.fill(0)
    for (let k = 0; k <= tr.span; k++) {
      const idx = (((h - dir * k) % tr.n) + tr.n) % tr.n
      const f = (1 - k / tr.span) ** 1.2 // bright head, lingering fade to black
      c[idx * 3] = tr.base.r * f
      c[idx * 3 + 1] = tr.base.g * f
      c[idx * 3 + 2] = tr.base.b * f
    }
    tr.colors.needsUpdate = true
  }
}
