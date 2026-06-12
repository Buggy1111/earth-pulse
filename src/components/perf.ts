/** Performance-mode helpers: weak-GPU detection + FPS sampling.
 *
 * Integrated/older GPUs (Intel UHD, mobile chips, software renderers) choke
 * on the 8K textures and high devicePixelRatio — eco mode trades them for
 * 4K + 1× pixel ratio + 30 Hz propagation, which they handle smoothly.
 */

const ECO_KEY = 'earth-pulse-eco'

export function loadEcoPreference(): boolean | null {
  try {
    const v = localStorage.getItem(ECO_KEY)
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

export function saveEcoPreference(eco: boolean): void {
  try {
    localStorage.setItem(ECO_KEY, eco ? '1' : '0')
  } catch {
    // private mode — preference just won't persist
  }
}

/** Heuristic: GPUs that are known to struggle with this scene.
 *
 * Cached after the first call and the probe context is explicitly released —
 * every WebGL context counts against the browser's ~16-context budget, and
 * exceeding it kills the globe's context (visible as the globe blinking). */
let weakGpuCache: boolean | null = null
export function detectWeakGpu(): boolean {
  if (weakGpuCache !== null) return weakGpuCache
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    if (!gl) return (weakGpuCache = true)
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    weakGpuCache = /intel.*(uhd|hd graphics)|llvmpipe|swiftshader|angle.*intel|mali|adreno|videocore/i.test(
      renderer,
    )
    return weakGpuCache
  } catch {
    return (weakGpuCache = false)
  }
}

/** Average FPS over `ms` of wall time (resolves early if the tab hides). */
export function sampleFps(ms = 4_000): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0
    const start = performance.now()
    const tick = () => {
      frames++
      const elapsed = performance.now() - start
      if (elapsed >= ms || document.hidden) {
        resolve((frames * 1000) / Math.max(elapsed, 1))
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })
}
