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
import { getGlowTexture } from './helpers'
import { applyStarLook, makeStarMaterial } from './starMaterial'

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

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
  mesh.add(glow)
  globe.scene().add(mesh)

  let focused: string | null = null
  let radius = 1
  let spin = 0
  let pulse = 0
  let prevMin = controls.minDistance
  let raf = 0

  const fly = (endCam: THREE.Vector3, endTarget: THREE.Vector3, dur: number, onLand?: () => void) => {
    cancelAnimationFrame(raf)
    const startCam = cam.position.clone()
    const startTarget = controls.target.clone()
    const t0 = performance.now()
    const onDrag = () => {
      cancelAnimationFrame(raf)
      controls.removeEventListener('start', onDrag)
      onLand?.()
    }
    controls.addEventListener('start', onDrag)
    const step = () => {
      const t = Math.min((performance.now() - t0) / dur, 1)
      const e = easeInOutCubic(t)
      cam.position.lerpVectors(startCam, endCam, e)
      controls.target.lerpVectors(startTarget, endTarget, e)
      controls.update()
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        controls.removeEventListener('start', onDrag)
        onLand?.()
      }
    }
    raf = requestAnimationFrame(step)
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
      prevMin = controls.minDistance
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
      mesh.rotation.y = seconds * spin
      if (pulse) mesh.scale.setScalar(radius * (1 + pulse * Math.sin(seconds * 0.6)))
    },
    dispose() {
      cancelAnimationFrame(raf)
      if (pinTargetRef.current === mesh) pinTargetRef.current = null
      controls.minDistance = prevMin
      globe.scene().remove(mesh)
      mesh.geometry.dispose()
      mat.dispose()
      glowMat.dispose()
    },
    current() {
      return focused
    },
  }
}
