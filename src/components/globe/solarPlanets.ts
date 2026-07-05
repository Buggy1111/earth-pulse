/** Planet builder for the solar system: real relative sizes, real tilts,
 * rings (+ Saturn spokes), living cloud bands, signature storms, auroras,
 * atmospheres, Mercury's sodium tail, and every major moon with its orbit
 * ring, direction cone and transit shadow discs. Also draws the exact
 * instantaneous Kepler ellipses + travel-direction cones for all planets.
 * Split out of solar.ts (ADR-001: moduly pod 400 řádků); all motion stays
 * in solar.ts's frame loop, which reads the handles returned from here. */

import * as THREE from 'three'
import {
  AU_SCENE,
  EARTH_DISPLAY,
  earthHelio,
  helioEllipse,
  PLANET_MOONS,
  PLANETS,
} from '../../lib/planets'
import { makeNameSprite } from '../spaceObjects'
import { ARROW_GEO, ARROW_MAT, SUNLIT_LAYER } from './helpers'
import { ATMOSPHERES, makeAtmosphereMaterial, makeBandsMaterial, makeIrregularMoonGeometry, makeRingShadowMaterial, makeSodiumTailMaterial, makeSpokesMaterial, BANDS } from './planetEffects'
import { AURORAS, STORMS, makeAuroraMaterial, makeStormsMaterial } from './planetStorms'
import { upgradeMoonMesh } from './moonModels'
import { makeTrailOrbit, type SolarTrail } from './solarTrails'
import type { SolarAnimEntry } from './orbitEngine'
import type { SolarTextureKit } from './solarTextures'
import { radialRingUVs } from './solarTextures'

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
export const orbitColor = (id: string): string => PLANET_ORBIT_COLOR[id] ?? '#94a3b8'

export interface PlanetBuildDeps {
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  moonMeshesRef: { current: Map<string, THREE.Object3D> }
  solarAnimRef: { current: SolarAnimEntry[] }
}

/** Mutable handles the frame loop feeds every animation frame. */
export interface PlanetBuildHandles {
  /** Všechny uTime-driven shader materiály (pásy, bouře, spokes, aurory, ohon). */
  bandMats: THREE.ShaderMaterial[]
  /** Marsův storms materiál zvlášť: frame loop mu krmí sezónní čepičky. */
  marsStormMat: THREE.ShaderMaterial | null
  /** Merkurův sodíkový ohon — frame loop ho míří od Slunce. */
  mercuryTail: THREE.Group | null
  /** Direction cones on the orbit ellipses (planets + Earth). */
  planetArrows: { id: string; arrow: THREE.Mesh; lead: number }[]
}

export function buildPlanets(
  group: THREE.Group,
  deps: PlanetBuildDeps,
  kit: SolarTextureKit,
  solarTrails: SolarTrail[],
  sunWorldPos: THREE.Vector3,
  earthProxy: THREE.Object3D,
): PlanetBuildHandles {
  const { loadTex, litMaterial, capTexture, loader } = kit
  deps.solarAnimRef.current = []
  const bandMats: THREE.ShaderMaterial[] = []
  let marsStormMat: THREE.ShaderMaterial | null = null
  let mercuryTail: THREE.Group | null = null
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
    if (p.id === 'saturn') {
      addRing(1.24, 2.27, '#d8c9a3', 1, 'planets/saturn_ring.png')
      // duchovité rotující "spokes" (Voyager) — overlay nad prstencem
      const spokesMat = makeSpokesMaterial()
      const spokesGeo = new THREE.RingGeometry(p.displayRadius * 1.24, p.displayRadius * 2.27, 128)
      radialRingUVs(spokesGeo, p.displayRadius * 1.24, p.displayRadius * 2.27)
      const spokes = new THREE.Mesh(spokesGeo, spokesMat)
      spokes.position.z = 0.3 // těsně nad prstencem, žádný z-fighting
      tilt.add(spokes)
      bandMats.push(spokesMat)
    }
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
      if (p.id === 'mars') marsStormMat = stormMat
    }

    // ☄️ Merkurův sodíkový ohon — vždy od Slunce (radiační tlak)
    if (p.id === 'mercury') {
      const tailLen = p.displayRadius * 14
      const tailGeo = new THREE.PlaneGeometry(p.displayRadius * 3.2, tailLen, 1, 24)
      tailGeo.translate(0, -tailLen / 2 - p.displayRadius, 0) // od těla planety ven
      const tailMat = makeSodiumTailMaterial()
      const tail = new THREE.Group()
      const plane1 = new THREE.Mesh(tailGeo, tailMat)
      const plane2 = new THREE.Mesh(tailGeo, tailMat)
      plane2.rotation.y = Math.PI / 2 // zkřížené roviny - viditelné z každého úhlu
      tail.add(plane1, plane2)
      system.add(tail)
      bandMats.push(tailMat)
      mercuryTail = tail
    }

    // 🌌 polární záře obřích planet (Hubble UV ovály) — na nerotující ose
    const aur = AURORAS[p.id]
    if (aur) {
      const auroraMat = makeAuroraMaterial(aur.color, aur.sizeRad)
      const auroraShell = new THREE.Mesh(
        new THREE.SphereGeometry(p.displayRadius * 1.02, 48, 48),
        auroraMat,
      )
      pole.add(auroraShell)
      bandMats.push(auroraMat)
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
      if (m.irregular) upgradeMoonMesh(moonMesh, m.id, rMoon)
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
      moonArrow.userData.baseScale = Math.max(0.8, rMoon * 0.7)
      moonArrow.scale.setScalar(moonArrow.userData.baseScale as number)
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
    arrow.userData.baseScale = Math.max(2, Math.min(10, r * 0.6))
    arrow.scale.setScalar(arrow.userData.baseScale as number)
    arrow.frustumCulled = false
    arrow.userData.solarLayer = 'orbits'
    group.add(arrow)
    planetArrows.push({ id, arrow, lead: r * 2 + 12 })
  }
  // Earth's own orbit (1 AU circle-ish ellipse): reuse via a fake entry
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 180; i++) {
      // sample Earth's helio position across one year
      const t = new Date(buildDate.getTime() + (i / 180) * 365.25 * 86_400_000)
      const [x, y, z] = earthHelio(t)
      pts.push(new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE))
    }
    const earthEllipse = makeTrailOrbit(solarTrails, pts, orbitColor('earth'), 0.6, earthProxy)
    earthEllipse.userData.solarLayer = 'orbits'
    group.add(earthEllipse)
  }

  return { bandMats, marsStormMat, mercuryTail, planetArrows }
}
