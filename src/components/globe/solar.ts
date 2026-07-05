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
  moonAngle,
  PLANET_MOONS,
  PLANETS,
  planetHelio,
  planetSpin,
  SUN_DISPLAY,
} from '../../lib/planets'
import { makeNameSprite } from '../spaceObjects'
import { ARROW_GEO, ARROW_MAT, getGlowTexture, SUNLIT_LAYER } from './helpers'
import { makeSunMaterial } from './sunMaterial'
import { makeCoronaMaterial, makeProminenceMaterial } from './coronaMaterial'
import { setOccluder } from './trailOcclusion'
import { makeTrailOrbit, updateSolarTrails, type SolarTrail } from './solarTrails'
import { createSolarTextureKit } from './solarTextures'
import { buildPlanets, orbitColor } from './solarPlanets'
import type { SolarAnimEntry } from './orbitEngine'

// SUNLIT_LAYER bydlí v helpers.ts; re-export drží stabilní veřejné API modulu
export { SUNLIT_LAYER } from './helpers'

export interface SolarDeps {
  solarGroupRef: { current: THREE.Group | null }
  sunMeshRef: { current: THREE.Mesh | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  moonMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
  /** Called from the orbit engine's rAF — drives ALL solar motion. */
  solarFrameRef: { current: (now: Date) => void }
  applySkyRef: { current: (date: Date) => void }
  /** Mini-Earth/clouds shader sun — re-aimed at the big Sun in solar mode. */
  sunUniform: { value: THREE.Vector3 }
}


/** Build the system once (lazy). All motion happens in the frame callback. */
export function ensureSolarSystem(globe: GlobeInstance, deps: SolarDeps): THREE.Group {
  if (deps.solarGroupRef.current) return deps.solarGroupRef.current

  const group = new THREE.Group()
  const solarTrails: SolarTrail[] = []
  const kit = createSolarTextureKit()
  const { loadTex, litMaterial } = kit

  // ☀️ the Sun at the heliocentric origin — by far the biggest body.
  // Procedural granulation shader + a point light that does ALL the lighting.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_DISPLAY, 64, 64), makeSunMaterial())
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
  // wider multiplier compensates the smaller ball (350→90) so the Sun keeps
  // its presence from the overview — the glow is additive, probes fly through
  sunGlow.scale.set(SUN_DISPLAY * 8, SUN_DISPLAY * 8, 1)
  ;(sunGlow.material as THREE.SpriteMaterial).opacity = 0.5 // živá koróna přebírá hlavní roli
  sun.add(sunGlow)

  // 🌞 living corona: billboarded ray/pulse shader (no textures); the plane
  // must cover the shader's discard boundary (8 photosphere radii)
  const coronaMat = makeCoronaMaterial(SUN_DISPLAY)
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(SUN_DISPLAY * 16, SUN_DISPLAY * 16),
    coronaMat,
  )
  corona.renderOrder = 1
  sun.add(corona)

  // 🔥 prominences: thin additive shell, flames only at the limb
  const prominenceMat = makeProminenceMaterial()
  const prominence = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_DISPLAY * 1.03, 64, 64),
    prominenceMat,
  )
  sun.add(prominence)

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
  const earthLabel = makeNameSprite('Earth · you are here', EARTH_DISPLAY * 2.2, true)
  earthLabel.userData.solarLayer = 'labels'
  earthProxy.add(earthLabel)
  group.add(earthProxy)
  deps.planetMeshesRef.current.set('earth', earthProxy)

  // 🌙 the Moon — Earth's own satellite, to scale on its real orbit. Earth is a
  // special invisible proxy (the live mini-globe sits exactly here), so the
  // PLANETS loop below never builds its moon — we add it by hand and follow the
  // proxy each frame. Real size/distance relative to Earth, like every moon.
  const earthMoonDef = PLANET_MOONS.earth?.[0]
  const earthMoonGroup = new THREE.Group()
  let earthMoonMesh: THREE.Mesh | null = null
   
  let earthMoonArrow: THREE.Mesh | null = null
  let earthMoonRScene = 0
  if (earthMoonDef) {
    const rMoon = Math.max(EARTH_DISPLAY * (earthMoonDef.radiusKm / (12_742 / 2)), 0.7)
    earthMoonRScene = EARTH_DISPLAY * ((earthMoonDef.aKkm * 1_000) / (12_742 / 2))
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(rMoon, 32, 32), litMaterial(earthMoonDef.color))
    mesh.rotation.x = Math.PI / 2
    mesh.layers.set(SUNLIT_LAYER)
    mesh.userData.moonId = earthMoonDef.id
    mesh.userData.displayRadius = rMoon
    loadTex(mesh, `planets/moons/${earthMoonDef.id}.webp`)
    const label = makeNameSprite(earthMoonDef.name, rMoon * 1.4, true)
    mesh.add(label)
    earthMoonGroup.add(mesh)
    earthMoonMesh = mesh
    // faint orbit ring (decor: shown only while Earth is the focused system)
    const ringPts = Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * 2 * Math.PI
      return new THREE.Vector3(Math.cos(a) * earthMoonRScene, Math.sin(a) * earthMoonRScene, 0)
    })
    const orbitRing = makeTrailOrbit(solarTrails, ringPts, orbitColor('earth'), 0.85, mesh)
    earthMoonGroup.add(orbitRing)
    earthMoonArrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
    earthMoonArrow.userData.baseScale = Math.max(0.8, rMoon * 0.7)
    earthMoonArrow.scale.setScalar(earthMoonArrow.userData.baseScale as number)
    earthMoonArrow.frustumCulled = false
    earthMoonGroup.add(earthMoonArrow)
    const decor = [label, orbitRing, earthMoonArrow]
    decor.forEach((o) => (o.visible = false))
    earthProxy.userData.decor = decor
    group.add(earthMoonGroup)
    deps.moonMeshesRef.current.set(earthMoonDef.id, mesh)
  }

  // world-space Sun position shared by every ring-shadow material — the frame
  // loop copies group.position in once, all rings see it (same Vector3)
  const sunWorldPos = new THREE.Vector3()
  // planets, rings, moons, storms, ellipses, direction cones → solarPlanets.ts;
  // the frame loop below animates through the returned handles
  const { bandMats, marsStormMat, mercuryTail, planetArrows } = buildPlanets(
    group, deps, kit, solarTrails, sunWorldPos, earthProxy,
  )

  // ——— per-frame motion in an INERTIAL frame: the scene is Earth-fixed and
  // spins with GMST, but rotating the whole solar system with it would make
  // everything whirl under time-warp. Fixed mapping instead: ecliptic plane →
  // scene XZ, ecliptic north → +Y. Earth still lands exactly at the origin.
  group.rotation.x = -Math.PI / 2
  // scratch vectors for the per-frame shadow-transit solve
  const mv = new THREE.Vector3()
  const dv = new THREE.Vector3()
  const hv = new THREE.Vector3()
  // scratch for the direction cones (hoisted — this runs per frame)
  const av = new THREE.Vector3()
  // scratch pro occluder world pozice
  const ov = new THREE.Vector3()
  const Y_UP = new THREE.Vector3(0, 1, 0)
  const DAY_MS = 86_400_000
  /** Aim `arrow` from `fromX/Y/Z` toward `toX/Y/Z`, parked `lead` units ahead. */
  const aimArrow = (
    arrow: THREE.Mesh,
    lead: number,
    fx: number, fy: number, fz: number,
    tx: number, ty: number, tz: number,
  ) => {
    av.set(tx - fx, ty - fy, tz - fz)
    if (av.lengthSq() < 1e-10) return
    av.normalize()
    arrow.position.set(fx, fy, fz).addScaledVector(av, lead)
    arrow.quaternion.setFromUnitVectors(Y_UP, av)
  }
  const Z_AXIS = new THREE.Vector3(0, 0, 1)
  // camera position in heliocentric group space — arrows fade by distance to
  // their body (close up a cone bigger than the moon reads as debris, not UI)
  const camLocal = new THREE.Vector3()
  const aw = new THREE.Vector3()
  const fadeArrow = (arrow: THREE.Mesh, bx: number, by: number, bz: number, r: number) => {
    const d = Math.hypot(camLocal.x - bx, camLocal.y - by, camLocal.z - bz)
    const f = Math.min(1, Math.max(0, (d - r * 9) / (r * 7)))
    // angular-size cap: a cone the camera flies close to must never fill the
    // screen — its height stays under ~3.5 % of the view at any distance
    arrow.getWorldPosition(aw)
    const cap = (aw.distanceTo(globe.camera().position) * 0.035) / 2.6
    arrow.scale.setScalar(Math.min(((arrow.userData.baseScale as number) ?? 1) * f, cap))
  }
  const frame = (now: Date) => {
    const eh = earthHelio(now)
    // group.position = Rx(-90°) · (−eh·AU):  (x,y,z) → (x, z, −y)
    group.position.set(-eh[0] * AU_SCENE, eh[2] * AU_SCENE, eh[1] * AU_SCENE)
    earthProxy.position.set(eh[0] * AU_SCENE, eh[1] * AU_SCENE, eh[2] * AU_SCENE)

    const ms = now.getTime()
    // slunce ve world space pro stínové shadery prstenců (sdílený Vector3)
    sunWorldPos.copy(group.position)
    camLocal.copy(globe.camera().position)
    group.worldToLocal(camLocal)
    // 🌙 Moon rides along with Earth and walks its orbit
    if (earthMoonMesh && earthMoonDef) {
      earthMoonGroup.position.copy(earthProxy.position)
      const a = moonAngle(earthMoonDef, ms)
      earthMoonMesh.position.set(Math.cos(a) * earthMoonRScene, Math.sin(a) * earthMoonRScene, 0)
      earthMoonMesh.rotation.y = a // vázaná rotace: k Zemi pořád stejnou tváří
      earthMoonMesh.getWorldPosition(ov)
      setOccluder(11, ov.x, ov.y, ov.z, earthMoonMesh.userData.displayRadius as number)
      group.worldToLocal(ov)
      if (earthMoonArrow) fadeArrow(earthMoonArrow, ov.x, ov.y, ov.z, earthMoonMesh.userData.displayRadius as number)
      if (earthMoonArrow) {
        const aN = moonAngle(earthMoonDef, ms + 3_600_000) // 1 h ahead — retrograde-safe
        aimArrow(
          earthMoonArrow,
          earthMoonRScene * 0.12 + 3,
          earthMoonMesh.position.x, earthMoonMesh.position.y, 0,
          Math.cos(aN) * earthMoonRScene, Math.sin(aN) * earthMoonRScene, 0,
        )
      }
    }
    for (const p of PLANETS) {
      const system = deps.planetMeshesRef.current.get(p.id)
      if (!system) continue
      const [x, y, z] = planetHelio(p.id, now)
      system.position.set(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE)
    }
    // ☄️ sodíkový ohon: mířit VŽDY od Slunce (sun = počátek group prostoru)
    if (mercuryTail) {
      const sys = mercuryTail.parent as THREE.Object3D
      av.copy(sys.position).normalize() // anti-sun směr v group prostoru
      mercuryTail.quaternion.setFromUnitVectors(Y_UP, av.multiplyScalar(-1))
    }

    // 🡒 planet/Earth direction cones — one day ahead along each orbit;
    // "here" reuses the positions already solved this frame (earthProxy /
    // system.position), so each arrow costs one Kepler solve, not two
    const tomorrow = new Date(ms + DAY_MS)
    for (const pa of planetArrows) {
      const here = pa.id === 'earth' ? earthProxy.position : deps.planetMeshesRef.current.get(pa.id)?.position
      if (!here) continue
      const next = pa.id === 'earth' ? earthHelio(tomorrow) : planetHelio(pa.id, tomorrow)
      aimArrow(
        pa.arrow,
        pa.lead,
        here.x, here.y, here.z,
        next[0] * AU_SCENE, next[1] * AU_SCENE, next[2] * AU_SCENE,
      )
      fadeArrow(pa.arrow, here.x, here.y, here.z, pa.lead / 2 + 6)
    }
    let moonOi = 12 // occluder slots: 0 Sun, 1 Earth, 2-10 planets, 11 Earth's Moon
    for (const entry of deps.solarAnimRef.current) {
      entry.mesh.rotation.y = planetSpin(entry.rotationH, ms)
      for (const m of entry.moons) {
        const a = moonAngle(m.def, ms)
        m.mesh.position.set(Math.cos(a) * m.rScene, Math.sin(a) * m.rScene, 0)
        m.mesh.rotation.y = a // vázaná rotace (jako reálné velké měsíce)
        if (m.arrow.visible) {
          const aN = moonAngle(m.def, ms + 3_600_000)
          aimArrow(
            m.arrow,
            m.rScene * 0.12 + 2,
            m.mesh.position.x, m.mesh.position.y, 0,
            Math.cos(aN) * m.rScene, Math.sin(aN) * m.rScene, 0,
          )
        }
        // ☀️→moon ray vs the planet sphere — a hit means the moon's shadow
        // transits the disc (Galilean shadows are real observable events)
        m.mesh.getWorldPosition(mv)
        // the moon is also a trail occluder: its own orbit ring must end at
        // its surface instead of slicing through the ball (slots 12+)
        setOccluder(moonOi, mv.x, mv.y, mv.z, m.mesh.userData.displayRadius as number)
        moonOi += 1
        group.worldToLocal(mv) // heliocentric group space: the Sun is at 0
        fadeArrow(m.arrow, mv.x, mv.y, mv.z, m.mesh.userData.displayRadius as number)
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
    // repaint the comet trails so each one fades back behind its moving body
    updateSolarTrails(solarTrails)
    // granulation, corona, prominences and gas-giant bands crawl in real
    // time — surface phenomena, they must not speed up with the warped clock
    const sunSeconds = performance.now() / 1000
    ;(sun.material as THREE.ShaderMaterial).uniforms.uTime.value = sunSeconds
    coronaMat.uniforms.uTime.value = sunSeconds
    prominenceMat.uniforms.uTime.value = sunSeconds
    for (const bm of bandMats) bm.uniforms.uTime.value = sunSeconds

    // ❄️ Mars: sezónní čepičky ze SIM času — Ls ~ lineární fáze 687denního
    // roku (kotva: severní jarní rovnodennost 12. 1. 2024); severní čepička
    // největší v severní zimě (Ls 270°), jižní v protifázi
    if (marsStormMat) {
      const marsDays = (ms / 86_400_000 - 19_734) / 686.98
      const ls = (marsDays - Math.floor(marsDays)) * 2 * Math.PI
      marsStormMat.uniforms.uCaps.value.x = 0.16 + 0.2 * (0.5 + 0.5 * Math.cos(ls - 4.712))
      marsStormMat.uniforms.uCaps.value.y = 0.16 + 0.2 * (0.5 + 0.5 * Math.cos(ls - 1.571))
    }

    // occluder koule pro trail shadery (ocásky nesmí procházet tělesy):
    // Slunce + Země + planety ve world souřadnicích
    setOccluder(0, group.position.x, group.position.y, group.position.z, SUN_DISPLAY)
    earthProxy.getWorldPosition(ov)
    setOccluder(1, ov.x, ov.y, ov.z, EARTH_DISPLAY * 2)
    let oi = 2
    for (const p of PLANETS) {
      const sys = deps.planetMeshesRef.current.get(p.id)
      if (!sys) continue
      sys.getWorldPosition(ov)
      setOccluder(oi, ov.x, ov.y, ov.z, p.displayRadius)
      oi += 1
    }
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
