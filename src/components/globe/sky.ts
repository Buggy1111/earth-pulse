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
  const starTex = new THREE.TextureLoader().load('night-sky.png')
  starTex.mapping = THREE.EquirectangularReflectionMapping
  starTex.colorSpace = THREE.SRGBColorSpace
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
  sunSprite.scale.set(160, 160, 1)
  globe.scene().add(sunSprite)

  // textured, terminator-shaded Moon — the lit fraction matches the real phase
  const moonTex = new THREE.TextureLoader().load('moon-2k.jpg')
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5, 64, 48),
    makeMoonMaterial(moonTex, sunUniform),
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
    sunSprite.position.copy(sunUniform.value).multiplyScalar(900)
    const moon = subLunarPoint(now)
    const mc = globe.getCoords(moon.lat, moon.lng, 0)
    moonMesh.position.set(mc.x, mc.y, mc.z).normalize().multiplyScalar(480)
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
