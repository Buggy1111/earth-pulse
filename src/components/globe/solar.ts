/** Solar System mode: Sun + 7 planets at real geocentric positions with
 * compressed distances, faithful tilts/rings/moons, and the 1 Hz position
 * updater that also drives the (possibly warped) sky clock. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import {
  PLANET_MOONS,
  PLANETS,
  planetPositions,
  sceneDistance,
  subPlanetPoint,
} from '../../lib/planets'
import { subsolarPoint } from '../../lib/sun'
import { makeNameSprite } from '../spaceObjects'
import type { SolarAnimEntry } from './orbitEngine'

export interface SolarDeps {
  solarGroupRef: { current: THREE.Group | null }
  sunMeshRef: { current: THREE.Mesh | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
  updateSolarRef: { current: () => void }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  applySkyRef: { current: (date: Date) => void }
}

/** Build the solar-system group once (lazy — textures stream on first entry). */
export function ensureSolarSystem(globe: GlobeInstance, deps: SolarDeps): THREE.Group {
  if (deps.solarGroupRef.current) return deps.solarGroupRef.current

  const group = new THREE.Group()
  const loader = new THREE.TextureLoader()
  const loadTex = (mesh: THREE.Mesh, url: string) =>
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const m = mesh.material as THREE.MeshBasicMaterial
      m.map = tex
      m.color.set('#ffffff')
      m.needsUpdate = true
    })

  // the Sun: textured ball inside the existing glow sprite
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(48, 32, 32),
    new THREE.MeshBasicMaterial({ color: '#ffd27a' }),
  )
  sun.userData.planetId = 'sun'
  loadTex(sun, 'planets/sun.jpg')
  group.add(sun)
  deps.sunMeshRef.current = sun

  deps.solarAnimRef.current = []
  for (const p of PLANETS) {
    // system group (positioned) → tilt group (real axial tilt) → spinning
    // planet + equatorial rings + revolving moons
    const system = new THREE.Group()
    system.userData.planetId = p.id
    const tilt = new THREE.Group()
    tilt.rotation.z = p.facts.tiltDeg * (Math.PI / 180)
    system.add(tilt)

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.displayRadius, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#9aa3ae' }),
    )
    loadTex(mesh, p.texture)
    tilt.add(mesh)
    system.add(makeNameSprite(p.name, p.displayRadius))

    // ring systems: Saturn's grand one, the faint ones of Uranus & Neptune
    const addRing = (inner: number, outer: number, color: string, opacity: number, tex?: string) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.displayRadius * inner, p.displayRadius * outer, 48),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity }),
      )
      if (tex)
        loader.load(tex, (t) => {
          const m = ring.material as THREE.MeshBasicMaterial
          m.map = t
          m.color.set('#ffffff')
          m.needsUpdate = true
        })
      ring.rotation.x = Math.PI / 2 // equatorial plane; the tilt group does the rest
      tilt.add(ring)
    }
    if (p.id === 'saturn') addRing(1.3, 2.2, '#d8c9a3', 0.85, 'planets/saturn_ring.png')
    if (p.id === 'uranus') addRing(1.55, 1.75, '#9fb6c0', 0.3)
    if (p.id === 'neptune') addRing(1.4, 1.55, '#8898a8', 0.18)

    // major moons at real periods (true revolution rates, scaled orbits)
    const moons = PLANET_MOONS[p.id] ?? []
    const aMax = moons.length ? Math.max(...moons.map((m) => m.aKkm)) : 1
    const animMoons: SolarAnimEntry['moons'] = []
    for (const m of moons) {
      const rMoon = Math.min(
        Math.max(p.displayRadius * (m.radiusKm / (p.diameterKm / 2)) * 4, 1.4),
        p.displayRadius * 0.38,
      )
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(rMoon, 12, 12),
        new THREE.MeshBasicMaterial({ color: m.color }),
      )
      moonMesh.add(makeNameSprite(m.name, rMoon * 1.4))
      const rScene = p.displayRadius * 1.8 + (m.aKkm / aMax) * p.displayRadius * 3.2
      tilt.add(moonMesh)
      animMoons.push({ mesh: moonMesh, def: m, rScene })
    }
    deps.solarAnimRef.current.push({ mesh, rotationH: p.facts.rotationH, moons: animMoons })

    group.add(system)
    deps.planetMeshesRef.current.set(p.id, system)
  }

  // orbit guide rings, rebuilt on every position update
  const orbitLines = new THREE.Group()
  group.add(orbitLines)

  const updateSolar = () => {
    const t = deps.solarTimeRef.current
    const now = new Date(t.simMs + (Date.now() - t.realMs) * t.warp)
    deps.applySkyRef.current(now) // keep Sun/Moon/terminator on the warped clock
    const positions = planetPositions(now)
    // sun sits where applySky already puts the glow (900 units ≈ 1 AU)
    const sunSub = subsolarPoint(now)
    const sc = globe.getCoords(sunSub.lat, sunSub.lng, 0)
    const sunPos = new THREE.Vector3(sc.x, sc.y, sc.z).normalize().multiplyScalar(900)
    sun.position.copy(sunPos)
    // ecliptic pole in scene coordinates (RA 270°, Dec +66.56°)
    const polePt = subPlanetPoint({ raDeg: 270, decDeg: 66.56 }, now)
    const pc = globe.getCoords(polePt.lat, polePt.lng, 0)
    const pole = new THREE.Vector3(pc.x, pc.y, pc.z).normalize()

    orbitLines.clear()
    for (const pos of positions) {
      const mesh = deps.planetMeshesRef.current.get(pos.id)
      if (!mesh) continue
      const pt = subPlanetPoint(pos, now)
      const c = globe.getCoords(pt.lat, pt.lng, 0)
      mesh.position.set(c.x, c.y, c.z).normalize().multiplyScalar(sceneDistance(pos.distEarthAu))
      // guide ring: circle around the Sun through the planet, in the ecliptic
      const radius = mesh.position.clone().sub(sunPos).length()
      const u = mesh.position.clone().sub(sunPos).normalize()
      const v = new THREE.Vector3().crossVectors(pole, u).normalize()
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2
        pts.push(
          sunPos
            .clone()
            .addScaledVector(u, Math.cos(a) * radius)
            .addScaledVector(v, Math.sin(a) * radius),
        )
      }
      orbitLines.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.25 }),
        ),
      )
    }
  }
  deps.updateSolarRef.current = updateSolar
  globe.scene().add(group)
  deps.solarGroupRef.current = group
  return group
}

/** Aim the camera at the Sun overview or a chosen planet; returns a restore fn. */
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
      : 48
  pinTargetRef.current = focusMesh
  controls.minDistance = radius * 1.6
  controls.target.copy(focusMesh.position)
  if (focusPlanet) {
    // close-up of the chosen body
    const dir = cam.position.clone().sub(focusMesh.position).normalize()
    cam.position.copy(focusMesh.position).addScaledVector(dir, radius * 4.5)
  } else {
    // overview: above the ecliptic, the whole system in frame
    cam.position.copy(focusMesh.position).add(new THREE.Vector3(0, 5_200, 7_800))
  }
  controls.update()
  return () => {
    controls.minDistance = prevMin
  }
}
