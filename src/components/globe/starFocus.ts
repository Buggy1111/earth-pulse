/** Fly-to-a-star close-up for the solar view. A star is an unresolved point of
 * light at infinity, so we can't travel to it — instead, clicking one builds a
 * procedural 3D star sphere (colour, size, granulation, corona all from its real
 * physics) a little way ahead along its true sky direction and glides the camera
 * in to orbit it, exactly like focusing a planet. Closing the card flies back to
 * the system. One reusable mesh, re-skinned per pick — single GL context. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { starAppearance } from '../../lib/starLook'
import type { StarPick } from '../../lib/stars'
import { flyCamera } from './cameraFlight'
import { getGlowTexture } from './helpers'
import { applyStarLook, makeStarMaterial } from './starMaterial'
import { makeCoronaMaterial } from './coronaMaterial'

export interface StarFocus {
  /** Build/skin the star along sky direction `dir` and glide in to orbit it. */
  focus(star: StarPick, dir: THREE.Vector3): void
  /** Fly back out to the system overview and hide the star. */
  defocus(): void
  /** Per-frame: boil the surface, spin and pulse it (real seconds). */
  update(seconds: number): void
  dispose(): void
  /** Name of the currently focused star, or null. */
  current(): string | null
}

export function setupStarFocus(
  globe: GlobeInstance,
  pinTargetRef: { current: THREE.Object3D | null },
): StarFocus {
  const cam = globe.camera() as THREE.PerspectiveCamera
  const controls = globe.controls()

  const mat = makeStarMaterial(starAppearance('G2V', 0, 0))
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), mat)
  mesh.visible = false
  mesh.renderOrder = -1
  const glowMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glowMat.opacity = 0.45 // živá koróna přebírá hlavní roli
  mesh.add(glow)
  // živá koróna hvězdy — stejný shader jako Slunce, tónovaný spektrální
  // barvou (uScale kompenzuje mesh.scale, billboard vertex ho nevidí)
  const coronaMat = makeCoronaMaterial(1)
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), coronaMat)
  mesh.add(corona)
  globe.scene().add(mesh)

  let focused: string | null = null
  let radius = 1
  let spin = 0
  let pulse = 0
  // the orbit min-distance to restore on defocus — captured ONCE at setup so a
  // second pick (while still flying to the first) can't overwrite it with a
  // star-zoom value and leave the camera trapped at the wrong zoom afterwards
  const prevMin = controls.minDistance
  let cancelFly: (() => void) | null = null

  // glide between fixed endpoints, easing camera + target together
  const fly = (endCam: THREE.Vector3, endTarget: THREE.Vector3, dur: number, onLand?: () => void) => {
    cancelFly?.()
    const startCam = cam.position.clone()
    const startTarget = controls.target.clone()
    cancelFly = flyCamera(globe, {
      duration: dur,
      onFrame: (e) => {
        cam.position.lerpVectors(startCam, endCam, e)
        controls.target.lerpVectors(startTarget, endTarget, e)
      },
      onLand,
    })
  }

  return {
    focus(star, dir) {
      if (focused === star.name && mesh.visible) return
      const look = starAppearance(star.spect, star.mag, star.distLy)
      radius = look.radius
      spin = look.spin
      pulse = look.pulse
      applyStarLook(mat, look)
      glowMat.color.fromArray(look.coronaColor)
      glow.scale.set(look.coronaScale, look.coronaScale, 1)
      coronaMat.uniforms.uTint.value.fromArray(look.coronaColor)
      mesh.scale.setScalar(radius)
      mesh.userData.displayRadius = radius

      // place the star ahead of the camera along its true sky bearing, far
      // enough that gliding in reads as a real approach
      const d = dir.clone().normalize()
      const center = cam.position.clone().add(d.multiplyScalar(radius * 10 + 2500))
      mesh.position.copy(center)
      mesh.visible = true
      focused = star.name

      pinTargetRef.current = null // own the camera until we land
      controls.minDistance = Math.max(radius * 1.6, 2)
      const endCam = center.clone().add(cam.position.clone().sub(center).normalize().multiplyScalar(radius * 4.5))
      fly(endCam, center, 1500, () => {
        pinTargetRef.current = mesh // hand to the chase loop (mesh is fixed → glued)
      })
    },
    defocus() {
      if (focused === null) return
      focused = null
      pinTargetRef.current = null
      const target = new THREE.Vector3(0, 0, 0) // the live Earth sits at the origin
      const out = cam.position.clone().sub(mesh.position)
      if (out.lengthSq() < 1) out.set(0, 8000, 16000)
      const endCam = target.clone().add(out.normalize().multiplyScalar(30000))
      fly(endCam, target, 1200, () => {
        mesh.visible = false
        controls.minDistance = prevMin
      })
    },
    update(seconds) {
      if (!mesh.visible) return
      mat.uniforms.uTime.value = seconds
      coronaMat.uniforms.uTime.value = seconds
      mesh.rotation.y = seconds * spin
      const liveR = pulse ? radius * (1 + pulse * Math.sin(seconds * 0.6)) : radius
      if (pulse) mesh.scale.setScalar(liveR)
      // billboard shader nevidí mesh.scale — geometrie je ±8 jednotek, takže
      // uScale = poloměr dá koróně ±8 poloměrů světa a uRadius drží r=1 na limbu
      coronaMat.uniforms.uScale.value = liveR
      coronaMat.uniforms.uRadius.value = liveR
    },
    dispose() {
      cancelFly?.()
      if (pinTargetRef.current === mesh) pinTargetRef.current = null
      controls.minDistance = prevMin
      globe.scene().remove(mesh)
      mesh.geometry.dispose()
      mat.dispose()
      glowMat.dispose()
      corona.geometry.dispose()
      coronaMat.dispose()
    },
    current() {
      return focused
    },
  }
}
