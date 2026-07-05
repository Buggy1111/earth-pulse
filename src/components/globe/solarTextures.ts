/** Texture + material kit for the solar-system bodies. One kit instance per
 * system build: the closures share a TextureLoader and the mobile texture cap.
 * Split out of solar.ts (ADR-001: moduly pod 400 řádků). */

import * as THREE from 'three'
import { isMobileDevice } from '../perf'

export interface SolarTextureKit {
  /** Load `url` onto a sun-lit mesh: map + emissive floor + bump relief. */
  loadTex(mesh: THREE.Mesh, url: string, tint?: string): void
  /** Phong s bump podporou: krátery a pásy vrhají mikro-stíny podle Slunce. */
  litMaterial(color: string): THREE.MeshPhongMaterial
  /** Downscale a loaded texture to the mobile cap (no-op on desktop). */
  capTexture(tex: THREE.Texture): THREE.Texture
  loader: THREE.TextureLoader
}

export function createSolarTextureKit(): SolarTextureKit {
  const loader = new THREE.TextureLoader()
  // On phones the full-res planet/moon textures are ~137 MB of VRAM — a big part
  // of what OOM-reloads the page on entering solar mode. Halve them to 1024-wide:
  // a planet is a small disc on a phone, so it reads identically at 4× less memory.
  const TEX_CAP = isMobileDevice() ? 1024 : Infinity
  const capTexture = (tex: THREE.Texture): THREE.Texture => {
    const img = tex.image as { width?: number; height?: number } | undefined
    if (!img?.width || img.width <= TEX_CAP) return tex
    const w = TEX_CAP
    const h = Math.max(1, Math.round((img.height! / img.width) * w))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return tex
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h)
    const capped = new THREE.CanvasTexture(canvas)
    capped.colorSpace = tex.colorSpace
    tex.dispose() // free the full-res upload we just downscaled
    return capped
  }
  // sun-lit bodies: the texture doubles as a faint emissive floor so the
  // night side reads as a dim disc instead of vanishing into space
  const loadTex = (mesh: THREE.Mesh, url: string, tint = '#ffffff') => {
    if (!url) return
    loader.load(url, (raw) => {
      raw.colorSpace = THREE.SRGBColorSpace
      const tex = capTexture(raw)
      tex.colorSpace = THREE.SRGBColorSpace
      const m = mesh.material as THREE.MeshPhongMaterial
      m.map = tex
      m.emissiveMap = tex
      m.bumpMap = tex // jas mapy ~ reliéf: krátery/pásy dostanou mikro-stíny
      m.bumpScale = 0.35
      m.color.set(tint) // tint ≠ white casts grayscale maps (Titan's haze)
      m.emissive.set(tint)
      m.needsUpdate = true
    })
  }
  // Phong místo Lamberta: bumpMap z textury = krátery a pásy vrhají
  // mikro-stíny podle skutečné pozice Slunce; nízká shininess ať není plast
  const litMaterial = (color: string) =>
    new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.07, shininess: 4 })

  return { loadTex, litMaterial, capTexture, loader }
}

/** Concentric-ring UVs so the 1-D Saturn ring strip maps radially. */
export function radialRingUVs(geo: THREE.RingGeometry, inner: number, outer: number): void {
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  uv.needsUpdate = true
}
