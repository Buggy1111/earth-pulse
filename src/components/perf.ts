/** Performance-mode helpers: weak-GPU detection + FPS sampling.
 *
 * Integrated/older GPUs (Intel UHD, software renderers) choke on the 8K
 * textures and high devicePixelRatio — desktop eco mode trades them for 2K +
 * 1× pixel ratio + 30 Hz propagation, which they handle smoothly. Phones/
 * tablets are a separate tier (4K, see isMobileDevice + GlobeView).
 */

/** Heuristic: GPUs that are known to struggle with this scene.
 *
 * Cached after the first call and the probe context is explicitly released in a
 * `finally` — every WebGL context counts against the browser's ~16-context
 * budget, and exceeding it kills the globe's context (visible as the globe
 * blinking). Releasing in `finally` means even a throwing getParameter still
 * frees the probe. */
let weakGpuCache: boolean | null = null
export function detectWeakGpu(): boolean {
  if (weakGpuCache !== null) return weakGpuCache
  let gl: WebGLRenderingContext | null = null
  try {
    gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return (weakGpuCache = true)
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    weakGpuCache = /intel.*(uhd|hd graphics)|llvmpipe|swiftshader|angle.*intel|mali|adreno|videocore/i.test(
      renderer,
    )
    return weakGpuCache
  } catch {
    return (weakGpuCache = false)
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/** Phone/tablet check: a coarse primary pointer + a touchscreen.
 *
 * These devices have a far smaller GPU/RAM budget than a desktop — and as an
 * INSTALLED standalone PWA, iOS caps a page's memory lower still than a Safari
 * tab. The 8K day+night textures at 2× pixel ratio cost ≈0.5–0.7 GB of GPU
 * memory, which silently trips WebKit's limit: the app blanks (lost WebGL
 * context) or iOS kills and reloads it — read as "it crashes / keeps
 * restarting". So mobiles render the 4K stack at 1× DPR (≈0.18 GB) — sharp, and
 * well under the budget. A phone GPU outruns a weak desktop integrated GPU, so
 * it gets 4K, not the desktop-eco 2K.
 *
 * Deliberately separate from `detectWeakGpu` (a GPU-name allow-list): iOS
 * reports "Apple GPU", which is NOT in that list — but so does an M-series Mac,
 * which is plenty powerful. The pointer+touch test is what tells them apart: a
 * Mac has a fine pointer and no touch, so it correctly keeps full quality. */
let mobileCache: boolean | null = null
export function isMobileDevice(): boolean {
  if (mobileCache !== null) return mobileCache
  try {
    return (mobileCache =
      window.matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints ?? 0) > 0)
  } catch {
    return (mobileCache = false)
  }
}

/** Pixel ratio to use while the camera is locked up close to a satellite.
 *
 * Close-up a heavy GLB model (Hubble, SWOT, Suomi NPP…) fills the whole
 * viewport; at a phone's full 2–3× devicePixelRatio the per-frame fragment
 * load can trip the mobile GPU's watchdog, the browser kills the WebGL
 * context and the app goes blank — read as a crash. Capping the ratio cuts
 * fragment work ~4× on a 2× screen, and since the model is huge on screen the
 * lower resolution is barely noticeable. Callers clamp against the CURRENT
 * ratio so this never RAISES it (e.g. when eco mode already forced 1×). */
export function followPixelRatio(devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, 1.25)
}

/** Software-renderer test reading an EXISTING GL context (the globe's
 * own) instead of creating a probe. Prefer this once the globe is up: a probe
 * context can fail spuriously under iOS's live-context cap and misreport a
 * perfectly good GPU as "software". */
export function glIsSoftware(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    return /swiftshader|llvmpipe|software|basic render/i.test(renderer)
  } catch {
    return false
  }
}

/** `glIsSoftware` against a globe's live context, guarded — `getContext()` can
 * throw on a torn-down globe. The one place callers ask "is this globe on a CPU
 * renderer?" (no throwaway probe context — see the iOS context-cap note above). */
export function globeIsSoftware(globe: {
  renderer(): { getContext(): WebGLRenderingContext | WebGL2RenderingContext }
}): boolean {
  try {
    return glIsSoftware(globe.renderer().getContext())
  } catch {
    return false
  }
}

/** Average FPS over `ms` of wall time. Resolves Infinity ("couldn't measure,
 * don't act on it") when the tab hides mid-sample — rAF stops on hidden tabs,
 * so counting wall time across a background stint reported ~0 fps and made
 * the quality watchdog downgrade perfectly good GPUs. */
export function sampleFps(ms = 4_000): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0
    let done = false
    const start = performance.now()
    const finish = (fps: number) => {
      if (done) return
      done = true
      document.removeEventListener('visibilitychange', onHide)
      resolve(fps)
    }
    const onHide = () => document.hidden && finish(Infinity)
    document.addEventListener('visibilitychange', onHide)
    if (document.hidden) return finish(Infinity)
    const tick = () => {
      if (done) return
      frames++
      const elapsed = performance.now() - start
      if (elapsed >= ms) {
        finish((frames * 1000) / Math.max(elapsed, 1))
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })
}
