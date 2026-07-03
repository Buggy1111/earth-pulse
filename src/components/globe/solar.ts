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
import { isMobileDevice } from '../perf'
import { ARROW_GEO, ARROW_MAT, getGlowTexture } from './helpers'
import { makeSunMaterial } from './sunMaterial'
import { makeCoronaMaterial, makeProminenceMaterial } from './coronaMaterial'
import { ATMOSPHERES, BANDS, STORMS, makeAtmosphereMaterial, makeBandsMaterial, makeIrregularMoonGeometry, makeRingShadowMaterial, makeStormsMaterial } from './planetEffects'
import { setOccluder } from './trailOcclusion'
import { makeTrailOrbit, updateSolarTrails, type SolarTrail } from './solarTrails'
import type { SolarAnimEntry } from './orbitEngine'

/** Bodies lit ONLY by the Sun live on this layer — globe.gl's own ambient +
 * directional lights (layer 0) must not wash out their terminators. The
 * camera and the pointer raycaster have to enable it too. */
export const SUNLIT_LAYER = 1

// each planet's orbit (and its moons') glows in the planet's own hue — Mars red,
// Neptune blue, Saturn pale gold… so the whole system reads as colour-coded
const PLANET_ORBIT_COLOR: Record<string, string> = {
  mercury: '#c4a484',
  venus: '#f5d76e',
  earth: '#38bdf8',
  mars: '#f4724f',
  jupiter: '#e0a96d',
  saturn: '#f5e0a3',
  uranus: '#7fe0d4',
  neptune: '#5b8def',
  pluto: '#caa98c',
}
const orbitColor = (id: string) => PLANET_ORBIT_COLOR[id] ?? '#94a3b8'

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
  const solarTrails: SolarTrail[] = []
  const loader = new THREE.TextureLoader()
  // On phones the full-res planet/moon textures are ~137 MB of VRAM — a big part
  // of what OOM-reloads the page on entering solar mode. Halve them to 1024-wide:
  // a planet is a small disc on a phone, so it reads identically at 4× less memory.
  const TEX_CAP = isMobileDevice() ? 1024 : Infinity
  const capTexture = (tex: THREE.Texture): THREE.Texture => {
    const img = tex.image as { width?: number; height?: number } | undefined
    if (!img?.width || img.width <= TEX_CAP) return tex
    const w = TEX_CAP
    const h = Math.max(1, Math.round((img.height! / img.width) * w))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return tex
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h)
    const capped = new THREE.CanvasTexture(canvas)
    capped.colorSpace = tex.colorSpace
    tex.dispose() // free the full-res upload we just downscaled
    return capped
  }
  // sun-lit bodies: the texture doubles as a faint emissive floor so the
  // night side reads as a dim disc instead of vanishing into space
  const loadTex = (mesh: THREE.Mesh, url: string, tint = '#ffffff') => {
    if (!url) return
    loader.load(url, (raw) => {
      raw.colorSpace = THREE.SRGBColorSpace
      const tex = capTexture(raw)
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
    earthMoonArrow.scale.setScalar(Math.max(0.8, rMoon * 0.7))
    earthMoonArrow.frustumCulled = false
    earthMoonGroup.add(earthMoonArrow)
    const decor = [label, orbitRing, earthMoonArrow]
    decor.forEach((o) => (o.visible = false))
    earthProxy.userData.decor = decor
    group.add(earthMoonGroup)
    deps.moonMeshesRef.current.set(earthMoonDef.id, mesh)
  }

  // planets: real relative sizes, real tilts, rings, moons, fixed-size labels
  deps.solarAnimRef.current = []
  // world-space Sun position shared by every ring-shadow material — the frame
  // loop copies group.position in once, all rings see it (same Vector3)
  const sunWorldPos = new THREE.Vector3()
  // živé proudění oblačných pásů plynných obrů — uTime plní frame loop
  const bandMats: THREE.ShaderMaterial[] = []
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
      new THREE.SphereGeometry(p.displayRadius, 48, 48),
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
    const planetLabel = makeNameSprite(p.name, p.displayRadius, true)
    planetLabel.userData.solarLayer = 'labels'
    system.add(planetLabel)

    // ring systems with proper radial texture mapping
    const addRing = (innerF: number, outerF: number, color: string, opacity: number, tex?: string) => {
      const inner = p.displayRadius * innerF
      const outer = p.displayRadius * outerF
      const geo = new THREE.RingGeometry(inner, outer, 128)
      radialRingUVs(geo, inner, outer)
      // shader se stínem planety: prstenec za planetou (vůči Slunci) tmavne
      const mat = makeRingShadowMaterial(sunWorldPos, p.displayRadius, color, opacity)
      const ring = new THREE.Mesh(geo, mat)
      if (tex)
        loader.load(tex, (raw) => {
          const t = capTexture(raw)
          t.colorSpace = THREE.SRGBColorSpace
          mat.uniforms.uMap.value = t
          mat.uniforms.uHasMap.value = 1
        })
      tilt.add(ring) // RingGeometry is XY-native = equatorial in tilt space
    }
    if (p.id === 'saturn') addRing(1.24, 2.27, '#d8c9a3', 1, 'planets/saturn_ring.png')
    if (p.id === 'uranus') addRing(1.6, 1.95, '#9fb6c0', 0.25)
    if (p.id === 'neptune') addRing(1.45, 1.62, '#8898a8', 0.15)

    // živé pásy plynných obrů: turbulentní proudění jako tenký overlay —
    // dítě rotujícího meshe, takže spinuje s texturou a šum uvnitř pásů teče
    const bands = BANDS[p.id]
    if (bands) {
      const bandMat = makeBandsMaterial(sunWorldPos, bands.color, bands.freq, bands.strength)
      const bandShell = new THREE.Mesh(
        new THREE.SphereGeometry(p.displayRadius * 1.004, 48, 48),
        bandMat,
      )
      mesh.add(bandShell)
      bandMats.push(bandMat)
    }

    // 🌀 podpisové počasí planety (GRS, šestiúhelník, cirry, prachové bouře) —
    // dítě rotujícího meshe, takže Rudá skvrna drží na své pozici v textuře
    const storms = STORMS[p.id]
    if (storms) {
      const stormMat = makeStormsMaterial(sunWorldPos, storms)
      const stormShell = new THREE.Mesh(
        new THREE.SphereGeometry(p.displayRadius * 1.006, 48, 48),
        stormMat,
      )
      mesh.add(stormShell)
      bandMats.push(stormMat) // stejný uTime driver jako pásy
    }

    // atmosférický fresnel: barevný srpek objímající limb (BackSide slupka)
    const atmo = ATMOSPHERES[p.id]
    if (atmo) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(p.displayRadius * 1.05, 32, 32),
        makeAtmosphereMaterial(atmo.color, atmo.power, atmo.intensity),
      )
      tilt.add(shell)
    }

    // major moons: REAL distances (planet radii) and real relative sizes —
    // only a minimum radius keeps the small ones visible and clickable.
    // Labels + orbit rings (the "decor") show only while this system is
    // focused — from the overview, 20 moon labels would pile on the planets.
    const moons = PLANET_MOONS[p.id] ?? []
    const animMoons: SolarAnimEntry['moons'] = []
    const decor: THREE.Object3D[] = []
    for (const m of moons) {
      // nepravidelné brambory dostávají větší minimum - tvar musí být čitelný
      const rMoon = Math.max(p.displayRadius * (m.radiusKm / (p.diameterKm / 2)), m.irregular ? 1.1 : 0.7)
      const moonGeo = m.irregular
        ? makeIrregularMoonGeometry(rMoon, m.id.length * 7 + m.id.charCodeAt(0))
        : new THREE.SphereGeometry(rMoon, 32, 32)
      const moonMesh = new THREE.Mesh(moonGeo, litMaterial(m.color))
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
      const orbitRing = makeTrailOrbit(solarTrails, ringPts, orbitColor(p.id), 0.85, moonMesh)
      tilt.add(orbitRing)
      decor.push(orbitRing)
      tilt.add(moonMesh)
      // direction cone along the moon's orbit — decor, like its label and ring
      const moonArrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
      moonArrow.scale.setScalar(Math.max(0.8, rMoon * 0.7))
      moonArrow.frustumCulled = false
      tilt.add(moonArrow)
      decor.push(moonArrow)
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
        arrow: moonArrow,
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

  // 🛰 true orbit ellipses — exact instantaneous Kepler ellipses, drawn as
  // comet trails behind each planet (head = where the planet is right now)
  const buildDate = new Date()
  for (const p of PLANETS) {
    const system = deps.planetMeshesRef.current.get(p.id)
    if (!system) continue
    const pts = helioEllipse(p.id, buildDate).map(
      ([x, y, z]) => new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE),
    )
    const ellipse = makeTrailOrbit(solarTrails, pts, orbitColor(p.id), 0.6, system)
    ellipse.userData.solarLayer = 'orbits' // moon decor rings stay focus-gated, untagged
    group.add(ellipse)
  }
  // 🡒 direction cones: every planet (and Earth) leads with the same arrow the
  // Earth-view satellites carry — which way is it travelling along the ellipse?
  // Tagged 'orbits' so the layer filter hides them together with the ellipses.
  const planetArrows: { id: string; arrow: THREE.Mesh; lead: number }[] = []
  for (const id of [...PLANETS.map((p) => p.id), 'earth']) {
    const r = id === 'earth' ? EARTH_DISPLAY : (PLANETS.find((p) => p.id === id)?.displayRadius ?? 5)
    const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
    arrow.scale.setScalar(Math.max(2, Math.min(10, r * 0.6)))
    arrow.frustumCulled = false
    arrow.userData.solarLayer = 'orbits'
    group.add(arrow)
    planetArrows.push({ id, arrow, lead: r * 2 + 12 })
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
    const earthEllipse = makeTrailOrbit(solarTrails, pts, orbitColor('earth'), 0.6, earthProxy)
    earthEllipse.userData.solarLayer = 'orbits'
    group.add(earthEllipse)
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
  const frame = (now: Date) => {
    const eh = earthHelio(now)
    // group.position = Rx(-90°) · (−eh·AU):  (x,y,z) → (x, z, −y)
    group.position.set(-eh[0] * AU_SCENE, eh[2] * AU_SCENE, eh[1] * AU_SCENE)
    earthProxy.position.set(eh[0] * AU_SCENE, eh[1] * AU_SCENE, eh[2] * AU_SCENE)

    const ms = now.getTime()
    // slunce ve world space pro stínové shadery prstenců (sdílený Vector3)
    sunWorldPos.copy(group.position)
    // 🌙 Moon rides along with Earth and walks its orbit
    if (earthMoonMesh && earthMoonDef) {
      earthMoonGroup.position.copy(earthProxy.position)
      const a = moonAngle(earthMoonDef, ms)
      earthMoonMesh.position.set(Math.cos(a) * earthMoonRScene, Math.sin(a) * earthMoonRScene, 0)
      earthMoonMesh.rotation.y = a // vázaná rotace: k Zemi pořád stejnou tváří
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
    // 🡒 planet/Earth direction cones — one day ahead along each orbit
    for (const pa of planetArrows) {
      const here = pa.id === 'earth' ? earthHelio(now) : planetHelio(pa.id, now)
      const next = pa.id === 'earth' ? earthHelio(new Date(ms + DAY_MS)) : planetHelio(pa.id, new Date(ms + DAY_MS))
      aimArrow(
        pa.arrow,
        pa.lead,
        here[0] * AU_SCENE, here[1] * AU_SCENE, here[2] * AU_SCENE,
        next[0] * AU_SCENE, next[1] * AU_SCENE, next[2] * AU_SCENE,
      )
    }
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
    // repaint the comet trails so each one fades back behind its moving body
    updateSolarTrails(solarTrails)
    // granulation, corona, prominences and gas-giant bands crawl in real
    // time — surface phenomena, they must not speed up with the warped clock
    const sunSeconds = performance.now() / 1000
    ;(sun.material as THREE.ShaderMaterial).uniforms.uTime.value = sunSeconds
    coronaMat.uniforms.uTime.value = sunSeconds
    prominenceMat.uniforms.uTime.value = sunSeconds
    for (const bm of bandMats) bm.uniforms.uTime.value = sunSeconds

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
