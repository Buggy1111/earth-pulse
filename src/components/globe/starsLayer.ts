/** The real night sky for the solar view: ~8.9k naked-eye stars (HYG catalogue)
 * at their true J2000 positions — coloured by spectral type, sized by magnitude,
 * the brightest named and the nearest systems (Proxima…) labelled with their
 * real distance, joined by the constellation stick figures and named. Click a
 * labelled star for what it is, how far, and its type.
 *
 * It's a camera-following SKYDOME: stars are infinitely far, so the whole group
 * re-centres on the camera every frame — always inside the far plane, never
 * clipping as you zoom out to the Voyagers — while one fixed rotation puts the
 * zodiac along the planets' plane (equatorial → ecliptic → scene). */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { bvColor, type StarCatalog, type StarPick } from '../../lib/stars'
import { makeNameSprite } from '../spaceObjects'
import { applySolarLayers, disposeMaterial, getGlowTexture } from './helpers'
import { setupStarFocus } from './starFocus'

const STARS_URL = 'stars/stars.json'
const R = 900_000 // skydome radius — fixed distance from the camera, inside far
const OBLIQUITY = (23.439 * Math.PI) / 180
const LABEL_MAG = 1.6 // label the ~brightest named stars
const NEAREST_LABELS = 18 // plus the closest N systems (Proxima, Barnard's…)

export interface StarsLayer {
  update(camera: THREE.Object3D): void
  /** Fly back out of a star close-up (the info card was closed). */
  defocus(): void
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

export function setupStars(
  globe: GlobeInstance,
  onStarPick: (s: StarPick | null) => void,
  pinTargetRef: { current: THREE.Object3D | null },
  solarLayersRef: { current: Record<string, boolean> },
): StarsLayer {
  let disposed = false
  // clicking a labelled star builds a procedural 3D sphere and flies to it
  const focus = setupStarFocus(globe, pinTargetRef)
  const aim = new THREE.Vector3()
  // equatorial → ecliptic → scene, one fixed rotation about the shared vernal-
  // equinox axis: −(90° + obliquity). The celestial pole lands 23.4° off the
  // ecliptic pole, exactly as it should.
  const dome = new THREE.Group()
  dome.rotation.x = -(Math.PI / 2 + OBLIQUITY)
  globe.scene().add(dome)
  const added: THREE.Object3D[] = []
  const pickTargets: THREE.Object3D[] = []
  // the star Points cloud, once built — its visibility is the "stars layer on?"
  // signal for picking (the pick spheres are ALWAYS invisible by design, so the
  // solar-layer applier can't drive them)
  let pointsObj: THREE.Points | null = null
  const pickGeo = new THREE.SphereGeometry(R * 0.02, 6, 6)
  const pickMat = new THREE.MeshBasicMaterial() // never rendered (hit area only)
  const raycaster = new THREE.Raycaster()
  let downX = 0
  let downY = 0
  const onDown = (e: PointerEvent) => {
    downX = e.clientX
    downY = e.clientY
  }
  const onClick = (e: MouseEvent) => {
    if (disposed || pickTargets.length === 0) return
    if (pointsObj && !pointsObj.visible) return // stars layer filtered off
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) return
    const rect = globe.renderer().domElement.getBoundingClientRect()
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      globe.camera() as THREE.PerspectiveCamera,
    )
    const hit = raycaster.intersectObjects(pickTargets, false)[0]
    if (!hit) return
    const star = hit.object.userData.star as StarPick
    // the pick mesh rides the camera-following dome, so its world bearing from
    // the camera is the star's true sky direction — glide the 3D star in there
    hit.object.getWorldPosition(aim).sub(globe.camera().position)
    focus.focus(star, aim)
    onStarPick(star)
  }
  // hovering a labelled star → pointer cursor, so people know it's clickable
  let hovering = false
  const onMove = (e: PointerEvent) => {
    if (disposed || pickTargets.length === 0) return
    if (pointsObj && !pointsObj.visible) return
    const rect = globe.renderer().domElement.getBoundingClientRect()
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      globe.camera() as THREE.PerspectiveCamera,
    )
    const over = raycaster.intersectObjects(pickTargets, false).length > 0
    if (over !== hovering) {
      hovering = over
      globe.renderer().domElement.style.cursor = over ? 'pointer' : ''
    }
  }
  globe.renderer().domElement.addEventListener('pointerdown', onDown)
  globe.renderer().domElement.addEventListener('pointermove', onMove)
  globe.renderer().domElement.addEventListener('click', onClick)

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
      points.userData.solarLayer = 'stars'
      pointsObj = points

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
      constellations.userData.solarLayer = 'constellations'
      dome.add(points, constellations)
      added.push(points, constellations)

      // — constellation names —
      for (const c of cat.names) {
        const lbl = makeNameSprite(c.n, 1, true, '#6f80ad')
        lbl.position.set(c.x * R, c.y * R, c.z * R)
        lbl.frustumCulled = false
        lbl.userData.solarLayer = 'constellations'
        dome.add(lbl)
        added.push(lbl)
      }

      // — labelled, clickable stars: brightest named + closest systems —
      const labeled = new Set<string>()
      const addStar = (
        s: { n: string; x: number; y: number; z: number; d: number; s: string; m?: number },
        color: string,
        dot: boolean,
      ) => {
        if (labeled.has(s.n)) return
        labeled.add(s.n)
        const at = new THREE.Vector3(s.x * R, s.y * R, s.z * R)
        const lbl = makeNameSprite(`${s.n} · ${s.d} ly`, 1, true, color)
        lbl.position.copy(at)
        lbl.frustumCulled = false
        lbl.userData.solarLayer = 'stars'
        dome.add(lbl)
        added.push(lbl)
        if (dot) {
          const m = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: getGlowTexture(), color, transparent: true, opacity: 0.85,
              blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
            }),
          )
          m.scale.set(0.013, 0.013, 1)
          m.position.copy(at)
          m.frustumCulled = false
          m.userData.solarLayer = 'stars'
          dome.add(m)
          added.push(m)
        }
        const pick = new THREE.Mesh(pickGeo, pickMat)
        pick.position.copy(at)
        pick.visible = false // raycast still hits it — a generous click target
        pick.frustumCulled = false
        pick.userData.star = { name: s.n, distLy: s.d, spect: s.s ?? '', mag: s.m ?? 0 } satisfies StarPick
        dome.add(pick)
        added.push(pick)
        pickTargets.push(pick)
      }
      for (const s of cat.named) if (s.m <= LABEL_MAG) addStar(s, '#dbe5f0', false)
      for (const s of [...cat.nearest].sort((a, b) => a.d - b.d).slice(0, NEAREST_LABELS)) {
        addStar(s, '#a6c8ff', true)
      }
      // the build is async — honour the solar layer filter that was active
      // when the user entered the mode (toggles afterwards re-apply globally)
      applySolarLayers(dome, solarLayersRef.current)
    })
    .catch(() => {
      // no catalogue → the existing Milky Way backdrop still shows
    })

  return {
    update(camera: THREE.Object3D) {
      dome.position.copy(camera.position) // ride with the camera: stars at infinity
      focus.update(performance.now() / 1000) // boil/spin/pulse the focused star
    },
    defocus() {
      focus.defocus()
    },
    dispose() {
      disposed = true
      focus.dispose()
      globe.renderer().domElement.removeEventListener('pointerdown', onDown)
      globe.renderer().domElement.removeEventListener('pointermove', onMove)
      globe.renderer().domElement.removeEventListener('click', onClick)
      globe.renderer().domElement.style.cursor = ''
      globe.scene().remove(dome)
      pickGeo.dispose()
      pickMat.dispose()
      for (const o of added) {
        const mesh = o as THREE.Points
        mesh.geometry?.dispose?.()
        disposeMaterial(mesh.material as THREE.Material | THREE.Material[] | undefined)
      }
      added.length = 0
      pickTargets.length = 0
    },
  }
}
