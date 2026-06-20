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

/** True on a software/CPU WebGL renderer (SwiftShader, LLVMpipe) — i.e. a
 * headless/CI browser with no GPU. The Starlink model LOD skips the real GLB
 * there: 10k× a real mesh has no chance on a software rasteriser, and it would
 * just hang the e2e run. Real mobile/desktop GPUs are NOT flagged. */
let softwareCache: boolean | null = null
export function isSoftwareRenderer(): boolean {
  if (softwareCache !== null) return softwareCache
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return (softwareCache = true)
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return (softwareCache = /swiftshader|llvmpipe|software|basic render/i.test(renderer))
  } catch {
    return (softwareCache = false)
  }
}

/** Same software-renderer test, but reading an EXISTING GL context (the globe's
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
