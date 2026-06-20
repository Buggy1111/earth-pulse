/** The real night sky for the solar view: ~8.9k naked-eye stars (HYG catalogue)
 * at their true J2000 positions — coloured by spectral type, sized by magnitude,
 * the brightest named and the nearest systems (Proxima…) labelled with their
 * real distance, joined by the constellation stick figures.
 *
 * It's a camera-following SKYDOME: stars are infinitely far, so the whole group
 * re-centres on the camera every frame. That keeps them at a fixed distance
 * (always inside the far plane, never clipping as you zoom out to the Voyagers)
 * while a single fixed rotation (equatorial → ecliptic → scene) puts the zodiac
 * along the planets' plane — astronomically correct, not decorative. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { bvColor, type StarCatalog } from '../../lib/stars'
import { makeNameSprite } from '../spaceObjects'
import { getGlowTexture } from './helpers'

const STARS_URL = 'stars/stars.json'
const R = 900_000 // skydome radius — fixed distance from the camera, inside far
const OBLIQUITY = (23.439 * Math.PI) / 180
const LABEL_MAG = 1.6 // label the ~brightest named stars
const NEAREST_LABELS = 18 // plus the closest N systems (Proxima, Barnard's…)

export interface StarsLayer {
  /** Re-centre the dome on the camera (called from the solar frame). */
  update(camera: THREE.Object3D): void
  dispose(): void
}

const STAR_VERT = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size;
  }`
const STAR_FRAG = `
  varying vec3 vColor;
  void main() {
    float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vColor, a);
  }`

export function setupStars(globe: GlobeInstance): StarsLayer {
  let disposed = false
  // equatorial → ecliptic → scene, in one fixed rotation about X (the shared
  // vernal-equinox axis): −(90° + obliquity). Verified: the celestial pole lands
  // 23.4° off the ecliptic pole, exactly as it should.
  const dome = new THREE.Group()
  dome.rotation.x = -(Math.PI / 2 + OBLIQUITY)
  globe.scene().add(dome)
  const added: THREE.Object3D[] = []

  void fetch(STARS_URL)
    .then((r) => (r.ok ? (r.json() as Promise<StarCatalog>) : Promise.reject(new Error('no stars'))))
    .then((cat) => {
      if (disposed) return
      // — the star field —
      const n = cat.data.length / 5
      const pos = new Float32Array(n * 3)
      const col = new Float32Array(n * 3)
      const siz = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const o = i * 5
        pos[i * 3] = cat.data[o] * R
        pos[i * 3 + 1] = cat.data[o + 1] * R
        pos[i * 3 + 2] = cat.data[o + 2] * R
        const mag = cat.data[o + 3]
        const [cr, cg, cb] = bvColor(cat.data[o + 4])
        const bright = THREE.MathUtils.clamp((6.5 - mag) / 6.5, 0.16, 1)
        col[i * 3] = cr * bright
        col[i * 3 + 1] = cg * bright
        col[i * 3 + 2] = cb * bright
        siz[i] = THREE.MathUtils.clamp((6.5 - mag) * 0.55 + 1.2, 1.2, 6)
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geom.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geom.setAttribute('size', new THREE.BufferAttribute(siz, 1))
      const points = new THREE.Points(
        geom,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: STAR_VERT,
          fragmentShader: STAR_FRAG,
        }),
      )
      points.frustumCulled = false
      points.renderOrder = -2

      // — constellation stick figures —
      const segPts: number[] = []
      for (const poly of cat.lines) {
        for (let i = 0; i + 5 < poly.length; i += 3) {
          segPts.push(
            poly[i] * R, poly[i + 1] * R, poly[i + 2] * R,
            poly[i + 3] * R, poly[i + 4] * R, poly[i + 5] * R,
          )
        }
      }
      const lineGeom = new THREE.BufferGeometry()
      lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segPts), 3))
      const constellations = new THREE.LineSegments(
        lineGeom,
        new THREE.LineBasicMaterial({ color: '#39507e', transparent: true, opacity: 0.4, depthWrite: false }),
      )
      constellations.frustumCulled = false
      constellations.renderOrder = -2

      dome.add(points, constellations)
      added.push(points, constellations)

      // — labels: the brightest named stars, then the closest systems —
      const labeled = new Set<string>()
      const label = (name: string, x: number, y: number, z: number, color: string, dot: boolean) => {
        if (labeled.has(name)) return
        labeled.add(name)
        if (dot) {
          const m = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: getGlowTexture(), color, transparent: true, opacity: 0.85,
              blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
            }),
          )
          m.scale.set(0.013, 0.013, 1)
          m.position.set(x * R, y * R, z * R)
          m.frustumCulled = false
          dome.add(m)
          added.push(m)
        }
        const lbl = makeNameSprite(name, 1, true, color)
        lbl.position.set(x * R, y * R, z * R)
        lbl.frustumCulled = false
        dome.add(lbl)
        added.push(lbl)
      }
      for (const s of cat.named) {
        if (s.m <= LABEL_MAG) label(`${s.n} · ${s.d} ly`, s.x, s.y, s.z, '#dbe5f0', false)
      }
      for (const s of [...cat.nearest].sort((a, b) => a.d - b.d).slice(0, NEAREST_LABELS)) {
        label(`${s.n} · ${s.d} ly`, s.x, s.y, s.z, '#a6c8ff', true)
      }
    })
    .catch(() => {
      // no catalogue → the existing Milky Way backdrop still shows
    })

  return {
    update(camera: THREE.Object3D) {
      dome.position.copy(camera.position) // ride with the camera: stars at infinity
    },
    dispose() {
      disposed = true
      globe.scene().remove(dome)
      for (const o of added) {
        const mesh = o as THREE.Points
        mesh.geometry?.dispose?.()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else (mat as THREE.Material | undefined)?.dispose?.()
      }
      added.length = 0
    },
  }
}
