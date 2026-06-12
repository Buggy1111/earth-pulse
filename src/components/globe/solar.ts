/** Solar System mode, season 2 — heliocentric and honest:
 *  - one UNIFORM scale (AU_SCENE per AU) → orbit geometry is true
 *  - children live in heliocentric-ecliptic coordinates inside one group;
 *    per frame we only move planets along their orbits and re-aim the group
 *    into the Earth-fixed scene frame (Earth always lands at the origin)
 *  - real relative body sizes (Sun ≫ Jupiter > Saturn > … > Pluto), exact
 *    instantaneous orbit ellipses, smooth at any time-warp. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import {
  AU_SCENE,
  EARTH_DISPLAY,
  earthHelio,
  helioEllipse,
  moonAngle,
  PLANET_MOONS,
  PLANETS,
  planetHelio,
  planetSpin,
  SUN_DISPLAY,
  subPlanetPoint,
} from '../../lib/planets'
import { makeNameSprite } from '../spaceObjects'
import { getGlowTexture } from './helpers'
import type { SolarAnimEntry } from './orbitEngine'

export interface SolarDeps {
  solarGroupRef: { current: THREE.Group | null }
  sunMeshRef: { current: THREE.Mesh | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
  /** Called from the orbit engine's rAF — drives ALL solar motion. */
  solarFrameRef: { current: (now: Date) => void }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  applySkyRef: { current: (date: Date) => void }
}

/** Concentric-ring UVs so the 1-D Saturn ring strip maps radially. */
function radialRingUVs(geo: THREE.RingGeometry, inner: number, outer: number): void {
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  uv.needsUpdate = true
}

/** Build the system once (lazy). All motion happens in the frame callback. */
export function ensureSolarSystem(globe: GlobeInstance, deps: SolarDeps): THREE.Group {
  if (deps.solarGroupRef.current) return deps.solarGroupRef.current

  const group = new THREE.Group()
  const loader = new THREE.TextureLoader()
  const loadTex = (mesh: THREE.Mesh, url: string) => {
    if (!url) return
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const m = mesh.material as THREE.MeshBasicMaterial
      m.map = tex
      m.color.set('#ffffff')
      m.needsUpdate = true
    })
  }

  // ☀️ the Sun at the heliocentric origin — by far the biggest body
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_DISPLAY, 48, 48),
    new THREE.MeshBasicMaterial({ color: '#ffd27a' }),
  )
  sun.userData.planetId = 'sun'
  loadTex(sun, 'planets/sun.jpg')
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#ffdf9e',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  sunGlow.scale.set(SUN_DISPLAY * 4.4, SUN_DISPLAY * 4.4, 1)
  sun.add(sunGlow)
  group.add(sun)
  deps.sunMeshRef.current = sun

  // 🌍 Earth's spot on its orbit: clickable proxy (the live mini-globe sits
  // exactly here in world space) + name tag
  const earthProxy = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_DISPLAY * 2.2, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false }),
  )
  earthProxy.userData.planetId = 'earth'
  earthProxy.add(makeNameSprite('Earth · you are here', EARTH_DISPLAY * 2.2, true))
  group.add(earthProxy)
  deps.planetMeshesRef.current.set('earth', earthProxy)

  // planets: real relative sizes, real tilts, rings, moons, fixed-size labels
  deps.solarAnimRef.current = []
  for (const p of PLANETS) {
    const system = new THREE.Group()
    system.userData.planetId = p.id
    const tilt = new THREE.Group()
    tilt.rotation.z = p.facts.tiltDeg * (Math.PI / 180)
    system.add(tilt)

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.displayRadius, 32, 32),
      new THREE.MeshBasicMaterial({ color: p.id === 'pluto' ? '#c9b29b' : '#9aa3ae' }),
    )
    loadTex(mesh, p.texture)
    tilt.add(mesh)
    system.add(makeNameSprite(p.name, p.displayRadius, true))

    // ring systems with proper radial texture mapping
    const addRing = (innerF: number, outerF: number, color: string, opacity: number, tex?: string) => {
      const inner = p.displayRadius * innerF
      const outer = p.displayRadius * outerF
      const geo = new THREE.RingGeometry(inner, outer, 96)
      radialRingUVs(geo, inner, outer)
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity }),
      )
      if (tex)
        loader.load(tex, (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          const m = ring.material as THREE.MeshBasicMaterial
          m.map = t
          m.color.set('#ffffff')
          m.needsUpdate = true
        })
      ring.rotation.x = Math.PI / 2 // equatorial; the tilt group does the rest
      tilt.add(ring)
    }
    if (p.id === 'saturn') addRing(1.24, 2.27, '#d8c9a3', 1, 'planets/saturn_ring.png')
    if (p.id === 'uranus') addRing(1.6, 1.95, '#9fb6c0', 0.25)
    if (p.id === 'neptune') addRing(1.45, 1.62, '#8898a8', 0.15)

    // major moons at real periods, sizes relative to their planet
    const moons = PLANET_MOONS[p.id] ?? []
    const aMax = moons.length ? Math.max(...moons.map((m) => m.aKkm)) : 1
    const animMoons: SolarAnimEntry['moons'] = []
    for (const m of moons) {
      const rMoon = Math.min(
        Math.max(p.displayRadius * (m.radiusKm / (p.diameterKm / 2)), 0.8),
        p.displayRadius * 0.5,
      )
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(rMoon, 12, 12),
        new THREE.MeshBasicMaterial({ color: m.color }),
      )
      moonMesh.add(makeNameSprite(m.name, rMoon * 1.4, true))
      const rScene = p.displayRadius * 1.9 + (m.aKkm / aMax) * p.displayRadius * 3.4
      tilt.add(moonMesh)
      animMoons.push({ mesh: moonMesh, def: m, rScene })
    }
    deps.solarAnimRef.current.push({ mesh, rotationH: p.facts.rotationH, moons: animMoons })

    group.add(system)
    deps.planetMeshesRef.current.set(p.id, system)
  }

  // 🛰 true orbit ellipses — exact instantaneous Kepler ellipses, static
  // geometry inside the heliocentric group (they never need per-frame work)
  const buildDate = new Date()
  for (const p of PLANETS) {
    const pts = helioEllipse(p.id, buildDate).map(
      ([x, y, z]) => new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE),
    )
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.3 }),
      ),
    )
  }
  // Earth's own orbit (1 AU circle-ish ellipse): reuse via a fake entry
  {
    const T = buildDate
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 180; i++) {
      // sample Earth's helio position across one year
      const t = new Date(T.getTime() + (i / 180) * 365.25 * 86_400_000)
      const [x, y, z] = earthHelio(t)
      pts.push(new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE))
    }
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.35 }),
      ),
    )
  }

  // ——— per-frame motion: group transform + body positions + spin + moons
  const v1 = new THREE.Vector3()
  const v2 = new THREE.Vector3()
  const v3 = new THREE.Vector3()
  const colY = new THREE.Vector3()
  const colZ = new THREE.Vector3()
  const rot = new THREE.Matrix4()
  const sceneDirOf = (raDeg: number, decDeg: number, out: THREE.Vector3, now: Date) => {
    const pt = subPlanetPoint({ raDeg, decDeg }, now)
    const c = globe.getCoords(pt.lat, pt.lng, 0)
    return out.set(c.x, c.y, c.z).normalize()
  }
  const frame = (now: Date) => {
    // ecliptic→equatorial→Earth-fixed-scene basis (scene spins with GMST)
    const eps = 23.439 * (Math.PI / 180)
    sceneDirOf(0, 0, v1, now) // equatorial x (vernal equinox)
    sceneDirOf(90, 0, v2, now) // equatorial y
    sceneDirOf(0, 90, v3, now) // equatorial z (north)
    colY.copy(v2).multiplyScalar(Math.cos(eps)).addScaledVector(v3, Math.sin(eps))
    colZ.copy(v2).multiplyScalar(-Math.sin(eps)).addScaledVector(v3, Math.cos(eps))
    rot.makeBasis(v1, colY, colZ)
    group.setRotationFromMatrix(rot)
    const eh = earthHelio(now)
    group.position
      .set(-eh[0] * AU_SCENE, -eh[1] * AU_SCENE, -eh[2] * AU_SCENE)
      .applyMatrix4(rot)
    earthProxy.position.set(eh[0] * AU_SCENE, eh[1] * AU_SCENE, eh[2] * AU_SCENE)

    const ms = now.getTime()
    for (const p of PLANETS) {
      const system = deps.planetMeshesRef.current.get(p.id)
      if (!system) continue
      const [x, y, z] = planetHelio(p.id, now)
      system.position.set(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE)
    }
    for (const entry of deps.solarAnimRef.current) {
      entry.mesh.rotation.y = planetSpin(entry.rotationH, ms)
      for (const m of entry.moons) {
        const a = moonAngle(m.def, ms)
        m.mesh.position.set(Math.cos(a) * m.rScene, 0, Math.sin(a) * m.rScene)
      }
    }
    deps.applySkyRef.current(now) // terminator/Moon follow the warped clock
  }
  deps.solarFrameRef.current = frame
  frame(new Date())

  globe.scene().add(group)
  deps.solarGroupRef.current = group
  return group
}

/** Aim the camera at the Sun overview or a chosen body; returns a restore fn. */
export function focusSolarBody(
  globe: GlobeInstance,
  deps: Pick<SolarDeps, 'planetMeshesRef' | 'sunMeshRef'>,
  pinTargetRef: { current: THREE.Object3D | null },
  focusPlanet: string | null,
): (() => void) | undefined {
  const controls = globe.controls()
  const cam = globe.camera() as THREE.PerspectiveCamera
  const prevMin = controls.minDistance
  const focusMesh =
    (focusPlanet && focusPlanet !== 'sun' ? deps.planetMeshesRef.current.get(focusPlanet) : null) ??
    deps.sunMeshRef.current
  if (!focusMesh) return undefined
  const radius =
    focusPlanet && focusPlanet !== 'sun'
      ? (PLANETS.find((p) => p.id === focusPlanet)?.displayRadius ?? 20)
      : SUN_DISPLAY
  pinTargetRef.current = focusMesh
  controls.minDistance = Math.max(radius * 2.2, 6)
  const world = focusMesh.getWorldPosition(new THREE.Vector3())
  controls.target.copy(world)
  if (focusPlanet) {
    const dir = cam.position.clone().sub(world).normalize()
    cam.position.copy(world).addScaledVector(dir, radius * 6)
  } else {
    // overview above the ecliptic: the inner system + Jupiter & Saturn framed
    cam.position.copy(world).add(new THREE.Vector3(0, 13_000, 21_000))
  }
  controls.update()
  return () => {
    controls.minDistance = prevMin
  }
}
