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
} from '../../lib/planets'
import { makeNameSprite } from '../spaceObjects'
import { getGlowTexture } from './helpers'
import { makeSunMaterial } from './sunMaterial'
import type { SolarAnimEntry } from './orbitEngine'

/** Bodies lit ONLY by the Sun live on this layer — globe.gl's own ambient +
 * directional lights (layer 0) must not wash out their terminators. The
 * camera and the pointer raycaster have to enable it too. */
export const SUNLIT_LAYER = 1

export interface SolarDeps {
  solarGroupRef: { current: THREE.Group | null }
  sunMeshRef: { current: THREE.Mesh | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  moonMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
  /** Called from the orbit engine's rAF — drives ALL solar motion. */
  solarFrameRef: { current: (now: Date) => void }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  applySkyRef: { current: (date: Date) => void }
  /** Mini-Earth/clouds shader sun — re-aimed at the big Sun in solar mode. */
  sunUniform: { value: THREE.Vector3 }
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
  // sun-lit bodies: the texture doubles as a faint emissive floor so the
  // night side reads as a dim disc instead of vanishing into space
  const loadTex = (mesh: THREE.Mesh, url: string, tint = '#ffffff') => {
    if (!url) return
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const m = mesh.material as THREE.MeshLambertMaterial
      m.map = tex
      m.emissiveMap = tex
      m.color.set(tint) // tint ≠ white casts grayscale maps (Titan's haze)
      m.emissive.set(tint)
      m.needsUpdate = true
    })
  }
  const litMaterial = (color: string) =>
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.07 })

  // ☀️ the Sun at the heliocentric origin — by far the biggest body.
  // Procedural granulation shader + a point light that does ALL the lighting.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_DISPLAY, 48, 48), makeSunMaterial())
  sun.userData.planetId = 'sun'
  const sunLight = new THREE.PointLight('#fff3da', 2.6, 0, 0)
  sunLight.layers.set(SUNLIT_LAYER)
  group.add(sunLight)
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
  sun.userData.displayRadius = SUN_DISPLAY
  group.add(sun)
  deps.sunMeshRef.current = sun

  // 🌍 Earth's spot on its orbit: clickable proxy (the live mini-globe sits
  // exactly here in world space) + name tag
  const earthProxy = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_DISPLAY * 2.2, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false }),
  )
  earthProxy.userData.planetId = 'earth'
  earthProxy.userData.displayRadius = EARTH_DISPLAY
  earthProxy.add(makeNameSprite('Earth · you are here', EARTH_DISPLAY * 2.2, true))
  group.add(earthProxy)
  deps.planetMeshesRef.current.set('earth', earthProxy)

  // planets: real relative sizes, real tilts, rings, moons, fixed-size labels
  deps.solarAnimRef.current = []
  // Group space is heliocentric-ECLIPTIC: orbits in XY, north = +Z. A
  // planet's equator/rings/moons therefore live in the tilt group's XY plane
  // and its pole is tilt-local +Z (the node direction is approximated).
  for (const p of PLANETS) {
    const system = new THREE.Group()
    system.userData.planetId = p.id
    const tilt = new THREE.Group()
    tilt.rotation.x = p.facts.tiltDeg * (Math.PI / 180)
    system.add(tilt)

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.displayRadius, 32, 32),
      litMaterial(p.id === 'pluto' ? '#c9b29b' : '#9aa3ae'),
    )
    mesh.layers.set(SUNLIT_LAYER)
    loadTex(mesh, p.texture)
    // sphere poles are ±Y — the carrier points them at tilt +Z (north) while
    // the mesh keeps spinning around its own Y in the frame loop
    const pole = new THREE.Group()
    pole.rotation.x = Math.PI / 2
    pole.add(mesh)
    tilt.add(pole)
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
      tilt.add(ring) // RingGeometry is XY-native = equatorial in tilt space
    }
    if (p.id === 'saturn') addRing(1.24, 2.27, '#d8c9a3', 1, 'planets/saturn_ring.png')
    if (p.id === 'uranus') addRing(1.6, 1.95, '#9fb6c0', 0.25)
    if (p.id === 'neptune') addRing(1.45, 1.62, '#8898a8', 0.15)

    // major moons: REAL distances (planet radii) and real relative sizes —
    // only a minimum radius keeps the small ones visible and clickable.
    // Labels + orbit rings (the "decor") show only while this system is
    // focused — from the overview, 20 moon labels would pile on the planets.
    const moons = PLANET_MOONS[p.id] ?? []
    const animMoons: SolarAnimEntry['moons'] = []
    const decor: THREE.Object3D[] = []
    for (const m of moons) {
      const rMoon = Math.max(p.displayRadius * (m.radiusKm / (p.diameterKm / 2)), 0.7)
      const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(rMoon, 24, 24), litMaterial(m.color))
      moonMesh.rotation.x = Math.PI / 2 // pole to tilt +Z, like the planet
      moonMesh.layers.set(SUNLIT_LAYER)
      moonMesh.userData.moonId = m.id
      moonMesh.userData.displayRadius = rMoon
      if (m.texture) loadTex(moonMesh, `planets/moons/${m.id}.webp`, m.tint)
      const label = makeNameSprite(m.name, rMoon * 1.4, true)
      moonMesh.add(label)
      decor.push(label)
      const rScene = p.displayRadius * ((m.aKkm * 1_000) / (p.diameterKm / 2))
      // a faint orbit ring makes each moon findable around its planet
      const ringPts = Array.from({ length: 97 }, (_, i) => {
        const a = (i / 96) * 2 * Math.PI
        return new THREE.Vector3(Math.cos(a) * rScene, Math.sin(a) * rScene, 0)
      })
      const orbitRing = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.22 }),
      )
      tilt.add(orbitRing)
      decor.push(orbitRing)
      tilt.add(moonMesh)
      // transit shadow discs (umbra + soft penumbra), parked invisible on the
      // system group — the frame loop projects them onto the planet sphere
      const shadowDisc = (r: number, opacity: number) => {
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(r, 24),
          new THREE.MeshBasicMaterial({
            color: '#000000',
            transparent: true,
            opacity,
            depthWrite: false,
          }),
        )
        disc.visible = false
        system.add(disc)
        return disc
      }
      animMoons.push({
        mesh: moonMesh,
        def: m,
        rScene,
        umbra: shadowDisc(rMoon * 0.9, 0.55),
        penumbra: shadowDisc(rMoon * 1.5, 0.18),
      })
      deps.moonMeshesRef.current.set(m.id, moonMesh)
    }
    decor.forEach((o) => (o.visible = false))
    system.userData.decor = decor
    system.userData.displayRadius = p.displayRadius
    deps.solarAnimRef.current.push({
      mesh,
      rotationH: p.facts.rotationH,
      system,
      planetRadius: p.displayRadius,
      moons: animMoons,
    })

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

  // ——— per-frame motion in an INERTIAL frame: the scene is Earth-fixed and
  // spins with GMST, but rotating the whole solar system with it would make
  // everything whirl under time-warp. Fixed mapping instead: ecliptic plane →
  // scene XZ, ecliptic north → +Y. Earth still lands exactly at the origin.
  group.rotation.x = -Math.PI / 2
  // scratch vectors for the per-frame shadow-transit solve
  const mv = new THREE.Vector3()
  const dv = new THREE.Vector3()
  const hv = new THREE.Vector3()
  const Z_AXIS = new THREE.Vector3(0, 0, 1)
  const frame = (now: Date) => {
    const eh = earthHelio(now)
    // group.position = Rx(-90°) · (−eh·AU):  (x,y,z) → (x, z, −y)
    group.position.set(-eh[0] * AU_SCENE, eh[2] * AU_SCENE, eh[1] * AU_SCENE)
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
        m.mesh.position.set(Math.cos(a) * m.rScene, Math.sin(a) * m.rScene, 0)
        // ☀️→moon ray vs the planet sphere — a hit means the moon's shadow
        // transits the disc (Galilean shadows are real observable events)
        m.mesh.getWorldPosition(mv)
        group.worldToLocal(mv) // heliocentric group space: the Sun is at 0
        const c = entry.system.position
        dv.copy(mv).normalize()
        const b = dv.dot(c)
        const det = b * b - (c.lengthSq() - entry.planetRadius ** 2)
        const t = det > 0 ? b - Math.sqrt(det) : 0
        const transit = det > 0 && t > mv.length()
        m.umbra.visible = m.penumbra.visible = transit
        if (transit) {
          hv.copy(dv).multiplyScalar(t).sub(c) // hit point, planet-centered
          m.penumbra.position.copy(hv).multiplyScalar(1.01)
          m.umbra.position.copy(hv).multiplyScalar(1.014)
          m.umbra.quaternion.setFromUnitVectors(Z_AXIS, hv.normalize())
          m.penumbra.quaternion.copy(m.umbra.quaternion)
        }
      }
    }
    // granulation crawls in real time — a surface boil, not orbital motion
    ;(sun.material as THREE.ShaderMaterial).uniforms.uTime.value = performance.now() / 1000
    deps.applySkyRef.current(now) // terminator/Moon follow the warped clock
    // mini-Earth + clouds: light from where the big Sun actually is, so the
    // lit side faces it (the earth-frame subsolar direction differs — frames)
    deps.sunUniform.value.copy(group.position).normalize()
  }
  deps.solarFrameRef.current = frame
  frame(new Date())

  globe.scene().add(group)
  deps.solarGroupRef.current = group
  return group
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Which planet a moon belongs to (moon ids are globally unique). */
export const MOON_PARENT: Record<string, string> = Object.fromEntries(
  Object.entries(PLANET_MOONS).flatMap(([pid, moons]) => moons.map((m) => [m.id, pid])),
)

/** Glide the camera to the Sun overview or a chosen body (planet OR moon);
 * returns a restore fn. The flight tracks the body's LIVE position each frame
 * (it keeps working at full time-warp) and hands the body to the pin/chase
 * system on arrival. A user drag mid-flight cancels the glide and pins where
 * we are. Moon labels + orbit rings show only for the focused system. */
export function focusSolarBody(
  globe: GlobeInstance,
  deps: Pick<SolarDeps, 'planetMeshesRef' | 'moonMeshesRef' | 'sunMeshRef'>,
  pinTargetRef: { current: THREE.Object3D | null },
  focusPlanet: string | null,
): (() => void) | undefined {
  const controls = globe.controls()
  const cam = globe.camera() as THREE.PerspectiveCamera
  const prevMin = controls.minDistance
  const focusMesh =
    (focusPlanet && focusPlanet !== 'sun'
      ? (deps.planetMeshesRef.current.get(focusPlanet) ??
        deps.moonMeshesRef.current.get(focusPlanet))
      : null) ?? deps.sunMeshRef.current
  if (!focusMesh) return undefined
  const radius = (focusMesh.userData.displayRadius as number | undefined) ?? 20
  controls.minDistance = Math.max(radius * 2.2, 2)

  // reveal this system's moon labels + orbit rings, hide everyone else's
  const focusedSystem = focusPlanet ? (MOON_PARENT[focusPlanet] ?? focusPlanet) : null
  for (const [pid, system] of deps.planetMeshesRef.current) {
    const decor = system.userData.decor as THREE.Object3D[] | undefined
    decor?.forEach((o) => (o.visible = pid === focusedSystem))
  }

  // the flight is camera-offset interpolation around the moving body: keep
  // the approach direction, shrink the distance — no path through the body
  const world = focusMesh.getWorldPosition(new THREE.Vector3())
  const startOffset = cam.position.clone().sub(world)
  const endOffset = focusPlanet
    ? startOffset.clone().normalize().multiplyScalar(radius * 6)
    : // overview above the ecliptic: inner system + Jupiter & Saturn framed
      new THREE.Vector3(0, 13_000, 21_000)
  pinTargetRef.current = null // the glide owns the camera until it lands
  const t0 = performance.now()
  const dur = 1_600
  const off = new THREE.Vector3()
  let raf = 0
  const land = () => {
    pinTargetRef.current = focusMesh
  }
  const fly = () => {
    const t = Math.min((performance.now() - t0) / dur, 1)
    focusMesh.getWorldPosition(world)
    off.lerpVectors(startOffset, endOffset, easeInOutCubic(t))
    cam.position.copy(world).add(off)
    controls.target.copy(world)
    controls.update()
    if (t < 1) raf = requestAnimationFrame(fly)
    else land()
  }
  raf = requestAnimationFrame(fly)
  const onDragStart = () => {
    cancelAnimationFrame(raf)
    land()
  }
  controls.addEventListener('start', onDragStart)
  return () => {
    cancelAnimationFrame(raf)
    controls.removeEventListener('start', onDragStart)
    controls.minDistance = prevMin
  }
}
