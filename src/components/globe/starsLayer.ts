/** The real night sky for the solar view: ~8.9k naked-eye stars (HYG catalogue)
 * at their true J2000 positions, coloured by spectral type and sized by
 * magnitude, with the brightest few labelled with their real distance. Lives in
 * a celestial group rotated equatorial → ecliptic, so it sits correctly under
 * the solar group's ecliptic → scene mapping — the zodiac really does lie along
 * the planets' plane. The far backdrop you see when you zoom out to the edge. */

import * as THREE from 'three'
import { bvColor, type StarCatalog } from '../../lib/stars'
import { makeNameSprite } from '../spaceObjects'

const STARS_URL = 'stars/stars.json'
const STAR_RADIUS = 880_000 // inside the camera far plane, beyond the probes
const OBLIQUITY = (23.439 * Math.PI) / 180 // equatorial → ecliptic tilt
const LABEL_MAG = 1.6 // label only the ~brightest named stars

export interface StarsLayer {
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
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(vColor, a);
  }`

export function setupStars(solarGroup: THREE.Group): StarsLayer {
  let disposed = false
  // equatorial → ecliptic; the solar group then carries ecliptic → scene
  const celestial = new THREE.Group()
  celestial.rotation.x = -OBLIQUITY
  solarGroup.add(celestial)
  const added: THREE.Object3D[] = [celestial]

  void fetch(STARS_URL)
    .then((r) => (r.ok ? (r.json() as Promise<StarCatalog>) : Promise.reject(new Error('no stars'))))
    .then((cat) => {
      if (disposed) return
      const n = cat.data.length / 5
      const pos = new Float32Array(n * 3)
      const col = new Float32Array(n * 3)
      const siz = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const o = i * 5
        pos[i * 3] = cat.data[o] * STAR_RADIUS
        pos[i * 3 + 1] = cat.data[o + 1] * STAR_RADIUS
        pos[i * 3 + 2] = cat.data[o + 2] * STAR_RADIUS
        const mag = cat.data[o + 3]
        const [r, g, b] = bvColor(cat.data[o + 4])
        // brighter star ⇒ brighter + bigger dot (mag −1.5 brightest … 6.5 faint)
        const bright = THREE.MathUtils.clamp((6.5 - mag) / 6.5, 0.16, 1)
        col[i * 3] = r * bright
        col[i * 3 + 1] = g * bright
        col[i * 3 + 2] = b * bright
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
      points.renderOrder = -1 // behind the planets and probes
      celestial.add(points)
      added.push(points)

      for (const s of cat.named) {
        if (s.m > LABEL_MAG) continue
        const label = makeNameSprite(s.d ? `${s.n} · ${s.d} ly` : s.n, 1, true, '#cdd6f4')
        label.position.set(s.x * STAR_RADIUS, s.y * STAR_RADIUS, s.z * STAR_RADIUS)
        celestial.add(label)
        added.push(label)
      }
    })
    .catch(() => {
      // no catalogue → the existing Milky Way backdrop still shows
    })

  return {
    dispose() {
      disposed = true
      for (const o of added) {
        o.parent?.remove(o)
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
