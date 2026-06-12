/** The sky around the globe: shared Sun uniform + Sun glow sprite, the Moon
 * (textured, Apollo markers, phase-driven glow) and the applySky updater.
 * Everything follows the (possibly time-warped) simulated clock. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { APOLLO_SITES } from '../../lib/moon'
import { subLunarPoint } from '../../lib/moon'
import { subsolarPoint } from '../../lib/sun'
import { getGlowTexture, SUN_REFRESH_MS } from './helpers'

export interface Sky {
  sunUniform: { value: THREE.Vector3 }
  sunSprite: THREE.Sprite
  moonMesh: THREE.Mesh
  apolloMarkers: THREE.Mesh[]
  applySky: (date: Date) => void
  dispose: () => void
}

export function setupSky(globe: GlobeInstance, simNowMs: () => number): Sky {
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

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5, 24, 24),
    new THREE.MeshBasicMaterial({ color: '#e8edf3' }),
  )
  new THREE.TextureLoader().load('moon-2k.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    const m = moonMesh.material as THREE.MeshBasicMaterial
    m.map = tex
    m.color.set('#ffffff')
    m.needsUpdate = true
  })

  // Apollo landing sites pinned to the lunar surface (selenographic coords)
  const markerGeo = new THREE.SphereGeometry(0.22, 8, 8)
  const markerMat = new THREE.MeshBasicMaterial({ color: '#4ade80' })
  const apolloMarkers = APOLLO_SITES.map((site) => {
    const marker = new THREE.Mesh(markerGeo, markerMat)
    const phi = (90 - site.lat) * (Math.PI / 180)
    const theta = (site.lng + 90) * (Math.PI / 180)
    marker.position.set(
      5.05 * Math.sin(phi) * Math.cos(theta),
      5.05 * Math.cos(phi),
      -5.05 * Math.sin(phi) * Math.sin(theta),
    )
    marker.userData.site = site
    moonMesh.add(marker)
    return marker
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

  const applySky = (now: Date) => {
    const sun = subsolarPoint(now)
    const { x, y, z } = globe.getCoords(sun.lat, sun.lng, 0)
    sunUniform.value.set(x, y, z).normalize()
    sunSprite.position.copy(sunUniform.value).multiplyScalar(900)
    const moon = subLunarPoint(now)
    const mc = globe.getCoords(moon.lat, moon.lng, 0)
    moonMesh.position.set(mc.x, mc.y, mc.z).normalize().multiplyScalar(480)
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
      globe.scene().remove(sunSprite)
      sunSprite.material.dispose()
      globe.scene().remove(moonMesh)
      moonMesh.geometry.dispose()
      ;(moonMesh.material as THREE.MeshBasicMaterial).dispose()
      moonGlow.material.dispose()
      markerGeo.dispose()
      markerMat.dispose()
    },
  }
}
