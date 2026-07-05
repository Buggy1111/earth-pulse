/** The sky around the globe: shared Sun uniform + Sun glow sprite, the Moon
 * (textured, Apollo markers, phase-driven glow) and the applySky updater.
 * Everything follows the (possibly time-warped) simulated clock. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { occludeLineMaterial } from './trailOcclusion'
import { LUNAR_SITES } from '../../lib/moon'
import { subLunarPoint } from '../../lib/moon'
import { subsolarPoint } from '../../lib/sun'
import { getGlowTexture, SUN_REFRESH_MS, disposeMaterial } from './helpers'
import { makeMoonMaterial } from './moonMaterial'
import { makeNameSprite } from '../spaceObjects'
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

  // Landing sites as small flags pinned to the lunar surface (selenographic
  // coords) — every place we've reached: the crewed Apollo sites plus milestone
  // robotic landers, the Chinese far-side firsts among them (they sit on the
  // hidden hemisphere). The pole sits on the surface and points straight out; an
  // invisible sphere makes each flag clickable. userData.site lives on the group.
  // Flag colour is the operator's, so the map reads as a flags-of-the-Moon.
  const OPERATOR_FLAG: Record<string, string> = {
    NASA: '#f4c34a', // gold
    CNSA: '#e0524d', // China red
    ISRO: '#ff9933', // India saffron
    USSR: '#d65a4a', // Soviet red
    Firefly: '#6ad0c0', // commercial teal
    'Intuitive Machines': '#9fb8ef',
  }
  const flagMats = new Map<string, THREE.MeshBasicMaterial>()
  const flagMatFor = (op: string): THREE.MeshBasicMaterial => {
    let m = flagMats.get(op)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: OPERATOR_FLAG[op] ?? '#cfd6e0', side: THREE.DoubleSide })
      flagMats.set(op, m)
    }
    return m
  }
  const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6)
  const poleMat = new THREE.MeshBasicMaterial({ color: '#cfd6e0' })
  const flagGeo = new THREE.PlaneGeometry(0.36, 0.22)
  const pickGeo = new THREE.SphereGeometry(0.45, 8, 8)
  const pickMat = new THREE.MeshBasicMaterial() // never rendered (pick mesh hidden)
  const up = new THREE.Vector3(0, 1, 0)
  const apolloMarkers = LUNAR_SITES.map((site) => {
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
    const flag = new THREE.Mesh(flagGeo, flagMatFor(site.operator))
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
  // jmenovka jako mají tělesa v solar view — bez ní je Měsíc anonymní koule
  const moonLabel = makeNameSprite('Moon', 5 * 1.4, true)
  moonMesh.add(moonLabel)
  globe.scene().add(moonMesh)

  // a comet-style trail behind the Moon — exactly like the satellites' orbit
  // trails: the bright head sits on the Moon, fading back along the path it came
  // from. Buffers are preallocated and updated in place each frame (the colour
  // fade is static); the head sample uses the same clock as the Moon's position.
  const MOON_DIST = 480
  const MOON_TRAIL_PTS = 60
  const MOON_TRAIL_MS = 7 * 3600 * 1000 // ~7 h of past arc behind the Moon
  const moonTrailGeo = new THREE.BufferGeometry()
  const moonTrailPos = new Float32Array(MOON_TRAIL_PTS * 3)
  const moonTrailCol = new Float32Array(MOON_TRAIL_PTS * 3)
  const moonTint = new THREE.Color('#a9c2e8') // moonlight blue-white
  for (let i = 0; i < MOON_TRAIL_PTS; i++) {
    const f = (i / (MOON_TRAIL_PTS - 1)) ** 1.6 // black tail → bright head (i=last)
    moonTrailCol[i * 3] = moonTint.r * f
    moonTrailCol[i * 3 + 1] = moonTint.g * f
    moonTrailCol[i * 3 + 2] = moonTint.b * f
  }
  moonTrailGeo.setAttribute('position', new THREE.BufferAttribute(moonTrailPos, 3))
  moonTrailGeo.setAttribute('color', new THREE.BufferAttribute(moonTrailCol, 3))
  const moonTrail = new THREE.Line(
    moonTrailGeo,
    occludeLineMaterial(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  )
  moonTrail.renderOrder = 1
  globe.scene().add(moonTrail)
  const moonTrailTmp = new THREE.Vector3()
  // applySky runs per-frame from the orbit engine, but the sublunar point moves
  // ~0.00015°/s — recomputing 60 ephemerides every frame was pure GC pressure.
  // 1 Hz is invisible in live time; big warp jumps exceed the window on their
  // own (|Δ| check, so rewinding the timeline refreshes too).
  let moonTrailAtMs = Number.NEGATIVE_INFINITY
  const updateMoonTrail = (now: Date) => {
    if (Math.abs(now.getTime() - moonTrailAtMs) < 1_000) return
    moonTrailAtMs = now.getTime()
    const pos = moonTrailGeo.attributes.position as THREE.BufferAttribute
    const t0 = now.getTime()
    const dt = MOON_TRAIL_MS / (MOON_TRAIL_PTS - 1)
    for (let i = 0; i < MOON_TRAIL_PTS; i++) {
      const sp = subLunarPoint(new Date(t0 - (MOON_TRAIL_PTS - 1 - i) * dt))
      const c = globe.getCoords(sp.lat, sp.lng, 0)
      moonTrailTmp.set(c.x, c.y, c.z).normalize().multiplyScalar(MOON_DIST)
      pos.setXYZ(i, moonTrailTmp.x, moonTrailTmp.y, moonTrailTmp.z)
    }
    pos.needsUpdate = true
    moonTrailGeo.computeBoundingSphere()
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
    updateMoonTrail(now) // comet tail behind the Moon, head locked to its position
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
      disposeMaterial(moonLabel.material)
      globe.scene().remove(moonTrail)
      moonTrailGeo.dispose()
      ;(moonTrail.material as THREE.Material).dispose()
      moonTex.dispose()
      moonGlow.material.dispose()
      poleGeo.dispose()
      poleMat.dispose()
      flagGeo.dispose()
      for (const m of flagMats.values()) m.dispose()
      pickGeo.dispose()
      pickMat.dispose()
    },
  }
}
