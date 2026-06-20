/** The one camera-flight engine shared by every fly-to in the scene (focusing a
 * planet/moon/probe, gliding to a star, flying back out). Runs an eased rAF and
 * hands each frame's 0→1 progress to the caller, which positions the camera
 * however it needs — fixed endpoints or tracking a moving body. One version of
 * the easing, the rAF loop, and the "a user grab cancels the glide" rule. */

import type { GlobeInstance } from 'globe.gl'

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Run an eased camera flight. `onFrame(eased)` fires each rAF with the eased
 * progress so the caller drives the camera; `onLand` fires exactly once when the
 * flight completes OR the user grabs the controls mid-flight (so dragging always
 * lands you where you are). Returns a cancel fn that hard-stops the flight
 * WITHOUT landing — for teardown — and is safe to call any number of times. */
export function flyCamera(
  globe: GlobeInstance,
  opts: { duration: number; onFrame: (eased: number) => void; onLand?: () => void },
): () => void {
  const controls = globe.controls()
  // Freeze OrbitControls' damping inertia for the flight. Otherwise the leftover
  // spin from the drag that preceded the flight keeps getting applied by
  // controls.update() every frame, and the camera careens around — the
  // "wheel of fortune" when you orbit a focused star and then fly back out.
  // Flushed to zero on the first update below; restored exactly on land/cancel.
  const controlsD = controls as unknown as { enableDamping: boolean }
  const prevDamping = controlsD.enableDamping
  controlsD.enableDamping = false
  const t0 = performance.now()
  let raf = 0
  let done = false
  const onDrag = () => land()
  const finish = () => {
    cancelAnimationFrame(raf)
    controls.removeEventListener('start', onDrag)
    controlsD.enableDamping = prevDamping
  }
  const land = () => {
    if (done) return
    done = true
    finish()
    opts.onLand?.()
  }
  controls.addEventListener('start', onDrag)
  const step = () => {
    const t = Math.min((performance.now() - t0) / opts.duration, 1)
    opts.onFrame(easeInOutCubic(t))
    controls.update()
    if (t < 1) raf = requestAnimationFrame(step)
    else land()
  }
  raf = requestAnimationFrame(step)
  return () => {
    if (done) return
    done = true
    finish()
  }
}
