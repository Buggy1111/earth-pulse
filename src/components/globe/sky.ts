/** The sky around the globe: shared Sun uniform + Sun glow sprite, the Moon
 * (textured, Apollo markers, phase-driven glow) and the applySky updater.
 * Everything follows the (possibly time-warped) simulated clock. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { APOLLO_SITES } from '../../lib/moon'
import { subLunarPoint } from '../../lib/moon'
import { subsolarPoint } from '../../lib/sun'
import { getGlowTexture, SUN_REFRESH_MS } from './helpers'
import { makeMoonMaterial } from './moonMaterial'
import { detectWeakGpu } from '../perf'

export interface Sky {
  sunUniform: { value: THREE.Vector3 }
  sunSprite: THREE.Sprite
  moonMesh: THREE.Mesh
  apolloMarkers: THREE.Object3D[]
  applySky: (date: Date) => void
  dispose: () => void
}

export function setupSky(globe: GlobeInstance, simNowMs: () => number): Sky {
  // infinite starfield: globe.gl's backgroundImageUrl is a FINITE 50k-unit
  // sky sphere — solar mode lets the camera 130k units out, where the sphere
  // ends and bare background color showed through. scene.background with an
  // equirect texture renders behind everything at any distance.
  // the real Milky Way (Solar System Scope, CC BY) as an equirect environment —
  // actual stars + the galactic band, far more alive than a flat starfield.
  // the 8K (8192px) source needs MAX_TEXTURE_SIZE ≥ 8192 — most mobile GPUs cap
  // at 4096, where uploading it fails silently and the whole scene goes black
  // (the "loads then nothing" mobile bug). Fall back to a 4K background unless
  // the GPU is comfortably large AND not a known weak/integrated/mobile chip.
  const maxTex = globe.renderer().capabilities.maxTextureSize
  // phones/tablets: even when the GPU reports a large max texture (e.g. iOS
  // Safari at 16384), the per-context memory budget is tight and an 8K bg on
  // top of the 8K Earth textures gets the context discarded — blank screen.
  const isHandheld =
    matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1024px)').matches
  const canDo8k = maxTex >= 8192 && !detectWeakGpu() && !isHandheld
  const starTex = new THREE.TextureLoader().load(
    canDo8k ? 'stars-milky-way.webp' : 'stars-milky-way-4k.webp',
  )
  starTex.mapping = THREE.EquirectangularReflectionMapping
  starTex.colorSpace = THREE.SRGBColorSpace
  // max anisotropy keeps the stars crisp at grazing angles instead of smearing
  starTex.anisotropy = globe.renderer().capabilities.getMaxAnisotropy()
  globe.scene().background = starTex

  const sunUniform = { value: new THREE.Vector3(1, 0, 0) }
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#fff3c2',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  // far enough that the Sun→Moon and Earth→Sun directions nearly coincide (so the
  // Moon's phase stays physically right) while the apparent size is unchanged —
  // scale grows with distance (160·6000/900). Was 900/160, which put the Sun so
  // close to the Moon that its lit limb pointed visibly off from the Sun sprite.
  sunSprite.scale.set(1067, 1067, 1)
  globe.scene().add(sunSprite)

  // textured, terminator-shaded Moon. It gets its OWN sun direction (not the
  // Earth's sunUniform), computed as the real Moon→Sun vector, so the bright limb
  // points at the Sun you actually see in the scene rather than at the Earth→Sun
  // direction (the two differ because the Moon orbits ~480 units off-centre).
  const moonSunUniform = { value: new THREE.Vector3(1, 0, 0) }
  const moonTex = new THREE.TextureLoader().load('moon-2k.jpg')
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5, 64, 48),
    makeMoonMaterial(moonTex, moonSunUniform),
  )

  // Apollo landing sites as small silver flags pinned to the lunar surface
  // (selenographic coords) — every place humans have stood beyond Earth. The
  // pole sits on the surface and points straight out; an invisible sphere makes
  // each flag comfortably clickable. userData.site lives on the group.
  const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6)
  const poleMat = new THREE.MeshBasicMaterial({ color: '#cfd6e0' })
  const flagGeo = new THREE.PlaneGeometry(0.36, 0.22)
  const flagMat = new THREE.MeshBasicMaterial({ color: '#f4c34a', side: THREE.DoubleSide })
  const pickGeo = new THREE.SphereGeometry(0.45, 8, 8)
  const pickMat = new THREE.MeshBasicMaterial() // never rendered (pick mesh hidden)
  const up = new THREE.Vector3(0, 1, 0)
  const apolloMarkers = APOLLO_SITES.map((site) => {
    const group = new THREE.Group()
    const phi = (90 - site.lat) * (Math.PI / 180)
    const theta = (site.lng + 90) * (Math.PI / 180)
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      -Math.sin(phi) * Math.sin(theta),
    ).normalize()
    group.position.copy(dir).multiplyScalar(5)
    group.quaternion.setFromUnitVectors(up, dir) // local +Y points outward

    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.y = 0.31 // base flush with the surface
    const flag = new THREE.Mesh(flagGeo, flagMat)
    flag.position.set(0.19, 0.5, 0) // hangs off the top of the pole
    const pick = new THREE.Mesh(pickGeo, pickMat)
    pick.position.y = 0.3
    pick.visible = false // invisible objects are still raycast — generous hit area

    group.add(pole, flag, pick)
    group.userData.site = site
    moonMesh.add(group)
    return group
  })

  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: '#dfe7f2',
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  moonGlow.scale.set(22, 22, 1)
  moonMesh.add(moonGlow)
  globe.scene().add(moonMesh)

  // faint ring tracing the Moon's path around Earth — like the satellites' orbit
  // lines, drawn in the same Earth-fixed view. Rebuilt only when the Moon's
  // declination drifts enough to matter (it changes slowly over the month).
  const MOON_ORBIT_PTS = 128
  const MOON_DIST = 480
  const moonOrbitGeo = new THREE.BufferGeometry()
  moonOrbitGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MOON_ORBIT_PTS * 3), 3),
  )
  const moonOrbit = new THREE.LineLoop(
    moonOrbitGeo,
    new THREE.LineBasicMaterial({
      color: '#aac4ea',
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  globe.scene().add(moonOrbit)
  let lastMoonDecl = NaN
  const moonOrbitTmp = new THREE.Vector3()
  const rebuildMoonOrbit = (declDeg: number) => {
    const pos = moonOrbitGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < MOON_ORBIT_PTS; i++) {
      const lng = -180 + (360 * i) / MOON_ORBIT_PTS
      const c = globe.getCoords(declDeg, lng, 0)
      moonOrbitTmp.set(c.x, c.y, c.z).normalize().multiplyScalar(MOON_DIST)
      pos.setXYZ(i, moonOrbitTmp.x, moonOrbitTmp.y, moonOrbitTmp.z)
    }
    pos.needsUpdate = true
  }

  // tidal lock: the Moon's near side (its flag-bearing face — the Apollo sites
  // sit around selenographic 0,0 which the marker layout places at local −Z)
  // always turns toward Earth, exactly as the real Moon does. The far side then
  // only ever comes into view when you orbit around the Moon.
  const MOON_NEAR_AXIS = new THREE.Vector3(0, 0, -1)
  const toEarth = new THREE.Vector3()
  const applySky = (now: Date) => {
    const sun = subsolarPoint(now)
    const { x, y, z } = globe.getCoords(sun.lat, sun.lng, 0)
    sunUniform.value.set(x, y, z).normalize()
    sunSprite.position.copy(sunUniform.value).multiplyScalar(6000)
    const moon = subLunarPoint(now)
    const mc = globe.getCoords(moon.lat, moon.lng, 0)
    moonMesh.position.set(mc.x, mc.y, mc.z).normalize().multiplyScalar(MOON_DIST)
    // the orbit ring follows the Moon's declination (skip the per-frame rebuild
    // unless it drifted — also catches the first NaN pass)
    if (!(Math.abs(moon.lat - lastMoonDecl) < 0.25)) {
      rebuildMoonOrbit(moon.lat)
      lastMoonDecl = moon.lat
    }
    // light the Moon from where the Sun actually is relative to it (Moon→Sun),
    // so the visible phase matches the Sun sprite's position in the scene
    moonSunUniform.value.copy(sunSprite.position).sub(moonMesh.position).normalize()
    toEarth.copy(moonMesh.position).normalize().negate()
    moonMesh.quaternion.setFromUnitVectors(MOON_NEAR_AXIS, toEarth)
    // brighter glow around fuller moon
    ;(moonGlow.material as THREE.SpriteMaterial).opacity = 0.25 + 0.5 * moon.illumination
  }
  applySky(new Date(simNowMs()))
  const sunTimer = setInterval(() => applySky(new Date(simNowMs())), SUN_REFRESH_MS)

  return {
    sunUniform,
    sunSprite,
    moonMesh,
    apolloMarkers,
    applySky,
    dispose: () => {
      clearInterval(sunTimer)
      starTex.dispose()
      globe.scene().remove(sunSprite)
      sunSprite.material.dispose()
      globe.scene().remove(moonMesh)
      moonMesh.geometry.dispose()
      ;(moonMesh.material as THREE.ShaderMaterial).dispose()
      globe.scene().remove(moonOrbit)
      moonOrbitGeo.dispose()
      ;(moonOrbit.material as THREE.Material).dispose()
      moonTex.dispose()
      moonGlow.material.dispose()
      poleGeo.dispose()
      poleMat.dispose()
      flagGeo.dispose()
      flagMat.dispose()
      pickGeo.dispose()
      pickMat.dispose()
    },
  }
}
