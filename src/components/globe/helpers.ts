/** Shared bits for the globe feature modules: tooltip/texture helpers,
 * cross-module datum types and tuning constants. */

import * as THREE from 'three'
import type { SatPos, TrackedSat } from '../../lib/satellites'

export const SUN_REFRESH_MS = 60_000
export const CLOUDS_ALTITUDE = 0.006
export const CLOUDS_DEG_PER_FRAME = -0.002
export const ARROW_LOOP_MS = 22_000

export const ARROW_GEO = new THREE.ConeGeometry(0.8, 2.4, 8)
export const ARROW_MAT = new THREE.MeshBasicMaterial({
  color: '#bdf0ff',
  transparent: true,
  opacity: 0.95,
})

/** One datum for the objects layer: a tracked satellite or the ISS itself. */
export interface OrbitObject extends SatPos {
  kind: 'sat' | 'iss'
  sat?: TrackedSat
}

/** Two overlaid strokes per orbit: a wide soft halo + a bright animated core. */
export interface TrailPath {
  points: [number, number, number][]
  kind: 'halo' | 'core'
}

/** One shown orbit: its path pair + the direction arrow riding the ring. */
export interface Trail {
  paths: TrailPath[]
  arrow: THREE.Mesh
  vectors: THREE.Vector3[]
  phase: number
}

export interface CountryLabel {
  name: string
  lat: number
  lng: number
}

/** One datum for the rings layer: steady ripples on strong quakes + bright flashes on new ones. */
export interface RingDatum {
  lat: number
  lng: number
  mag: number
  flash: boolean
}

/** Third-party text ends up in HTML tooltips — escape it. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function tooltip(html: string): string {
  return `<div style="font-family:sans-serif;font-size:12px;background:rgba(7,9,15,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15)">${html}</div>`
}

/** Small ▲ texture for the volcano points cloud. */
let triangleTexture: THREE.CanvasTexture | null = null
export function getTriangleTexture(): THREE.CanvasTexture {
  if (triangleTexture) return triangleTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(16, 3)
  ctx.lineTo(29, 29)
  ctx.lineTo(3, 29)
  ctx.closePath()
  ctx.fill()
  triangleTexture = new THREE.CanvasTexture(canvas)
  return triangleTexture
}

/** Soft radial glow, tinted by each sprite's material color. */
let glowTexture: THREE.CanvasTexture | null = null
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}
