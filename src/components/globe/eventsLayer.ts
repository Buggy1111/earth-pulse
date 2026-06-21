/** EONET natural-event markers on the globe. Each event gets a click target
 * (globe.gl's points layer, which nothing else claims) plus a living visual in
 * its own scene group: a pulsing radar ring in the category colour — like the
 * earthquake ripples, so events are clearly ALIVE on the globe — over a themed
 * core (storms spin as a cyclone, volcanoes throb as an eruption, the rest glow). */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { eventMeta, type EarthEvent } from '../../lib/events'
import { escapeHtml, getGlowTexture, tooltip } from './helpers'

const GLOW_GROUP = 'event-glows'
const RING_MIN = 1.6
const RING_MAX = 8

type CoreAnim = 'spin' | 'pulse' | null
interface Look {
  texture: () => THREE.Texture
  anim: CoreAnim
  scale: number
  additive: boolean
}

function lookFor(category: string): Look {
  switch (category) {
    case 'severeStorms':
      return { texture: getSpiralTexture, anim: 'spin', scale: 4.6, additive: false }
    case 'volcanoes':
      return { texture: getBurstTexture, anim: 'pulse', scale: 4, additive: true }
    default:
      return { texture: getGlowTexture, anim: null, scale: 2.6, additive: true }
  }
}

/** Soft radar ring — transparent centre, bright mid-radius, transparent edge. */
let ringTex: THREE.CanvasTexture | null = null
function getRingTexture(): THREE.CanvasTexture {
  if (ringTex) return ringTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.48)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)')
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.95)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ringTex = new THREE.CanvasTexture(canvas)
  return ringTex
}

/** A cyclone spiral — white arms spiralling out from a soft eye, tinted blue. */
let spiralTex: THREE.CanvasTexture | null = null
function getSpiralTexture(): THREE.CanvasTexture {
  if (spiralTex) return spiralTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath()
    const offset = arm * Math.PI
    for (let t = 0; t <= 1; t += 0.02) {
      const angle = offset + t * Math.PI * 3.1
      const radius = t * (size / 2 - 7)
      if (t === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    ctx.lineWidth = 2 + arm
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.fill()
  spiralTex = new THREE.CanvasTexture(canvas)
  return spiralTex
}

/** An eruption burst — alternating long/short spikes radiating from a hot core. */
let burstTex: THREE.CanvasTexture | null = null
function getBurstTexture(): THREE.CanvasTexture {
  if (burstTex) return burstTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const len = i % 2 === 0 ? size / 2 - 8 : size / 2 - 26
    ctx.lineWidth = i % 2 === 0 ? 3.5 : 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 8, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.fill()
  burstTex = new THREE.CanvasTexture(canvas)
  return burstTex
}

// one persistent rAF animates the CURRENT globe's group. Targets `animGlobe`
// (updated each call), not a captured globe, so it survives React StrictMode's
// mount/remount in dev, and reads the group each frame so it survives refreshes.
let running = false
let animGlobe: GlobeInstance | null = null
let frame = 0
let rafId = 0
function ensureAnim(globe: GlobeInstance): void {
  animGlobe = globe
  if (running) return
  running = true
  let reduce = false
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    /* default to animating */
  }
  const tick = () => {
    frame++
    const t = frame * 0.05
    const group = animGlobe ? animGlobe.scene().getObjectByName(GLOW_GROUP) : null
    // nothing to animate (events hidden/empty, or the globe was torn down) → stop
    // the loop and let the main thread idle; applyEventsLayer re-arms it when
    // events come back. Prevents a forever-rAF holding a destroyed globe alive.
    if (!group || group.children.length === 0) {
      running = false
      rafId = 0
      return
    }
    {
      for (const child of group.children) {
        const ud = child.userData
        const sprite = child as THREE.Sprite
        const mat = sprite.material as THREE.SpriteMaterial
        if (ud.anim === 'ring') {
          // expanding radar ping that fades as it grows, repeating — even under
          // reduced-motion we keep a calm steady ring so the marker stays visible
          if (reduce) {
            sprite.scale.set(RING_MAX * 0.6, RING_MAX * 0.6, 1)
            mat.opacity = 0.4
          } else {
            const cycle = (frame * 0.01 + ud.phase) % 1
            const s = RING_MIN + (RING_MAX - RING_MIN) * cycle
            sprite.scale.set(s, s, 1)
            mat.opacity = 0.85 * (1 - cycle) * (1 - cycle)
          }
        } else if (!reduce && ud.anim === 'spin') {
          mat.rotation += 0.018
        } else if (!reduce && ud.anim === 'pulse') {
          const s = ud.baseScale * (1 + 0.16 * Math.sin(t + ud.phase))
          sprite.scale.set(s, s, 1)
        }
      }
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

/** Stop the events animation loop and release the globe reference. Called from
 * the scene cleanup so a torn-down globe (e.g. switching to Drift, which unmounts
 * GlobeView) isn't kept alive by a perpetual rAF. */
export function stopEventsAnim(): void {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  running = false
  animGlobe = null
}

export function applyEventsLayer(
  globe: GlobeInstance,
  events: EarthEvent[],
  show: boolean,
  onClick: (e: EarthEvent) => void,
): void {
  globe
    .pointsData(show ? events : [])
    .pointLat((d) => (d as EarthEvent).lat)
    .pointLng((d) => (d as EarthEvent).lng)
    .pointColor((d) => eventMeta((d as EarthEvent).category).color)
    .pointAltitude(0.04)
    .pointRadius(0.3)
    .pointResolution(12)
    .pointLabel((d) => {
      const e = d as EarthEvent
      const m = eventMeta(e.category)
      const mag = e.magnitude ? ` · ${Math.round(e.magnitude).toLocaleString('en-US')} ${e.magnitudeUnit ?? ''}` : ''
      // both title and label come from the EONET feed → escape both (the label
      // is the raw category id for any category not in our static map)
      return tooltip(`${m.icon} <b>${escapeHtml(e.title)}</b> · ${escapeHtml(m.label)}${mag}`)
    })
    .onPointClick((d) => onClick(d as EarthEvent))

  // our own scene group: a pulsing ring + a themed core per event
  let group = globe.scene().getObjectByName(GLOW_GROUP) as THREE.Group | null
  if (!group) {
    group = new THREE.Group()
    group.name = GLOW_GROUP
    globe.scene().add(group)
  }
  for (const child of [...group.children]) {
    group.remove(child)
    ;((child as THREE.Sprite).material as THREE.Material).dispose()
  }
  if (show) {
    events.forEach((e, i) => {
      const color = eventMeta(e.category).color
      const pos = globe.getCoords(e.lat, e.lng, 0.02)
      const phase = (i * 0.37) % 1

      // pulsing radar ring — the loud, "this is alive" signal, like quake ripples
      const ring = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getRingTexture(),
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      ring.userData = { anim: 'ring', phase }
      Object.assign(ring.position, pos)
      ring.renderOrder = 2
      group!.add(ring)

      // themed core sits at the centre (storm spiral, volcano burst, else glow)
      const look = lookFor(e.category)
      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: look.texture(),
          color,
          transparent: true,
          opacity: look.additive ? 0.85 : 0.95,
          blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false,
        }),
      )
      core.scale.set(look.scale, look.scale, 1)
      core.userData = { anim: look.anim, baseScale: look.scale, phase: (i * 1.7) % (Math.PI * 2) }
      Object.assign(core.position, pos)
      core.renderOrder = 3
      group!.add(core)
    })
  }
  ensureAnim(globe)
}
