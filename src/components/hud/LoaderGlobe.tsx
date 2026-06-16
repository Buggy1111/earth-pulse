/** The loader's centerpiece: a rotating wireframe Earth drawn on a small
 * canvas. Meridians and parallels are projected orthographically and fade with
 * depth so the sphere reads as genuinely 3D, two satellites sweep tilted orbits
 * with glowing comet trails, and a soft atmosphere glows behind it. Light
 * enough to run for the ~2 s intro (a few hundred strokes a frame), and it
 * honours reduced-motion by drawing a single still frame. */

import { useEffect, useRef } from 'react'

const RAD = Math.PI / 180
const TILT = 18 * RAD // fixed 3/4 view, so it never looks side-on

type Pt = [number, number, number]

/** Unit-sphere wireframe: 6 full meridians + 5 parallels, as polylines. */
function buildWire(): Pt[][] {
  const lines: Pt[][] = []
  for (let lon = 0; lon < 180; lon += 30) {
    const pts: Pt[] = []
    const sl = Math.sin(lon * RAD)
    const cl = Math.cos(lon * RAD)
    for (let t = 0; t <= 360; t += 9) {
      const c = Math.cos(t * RAD)
      pts.push([sl * c, Math.sin(t * RAD), cl * c])
    }
    lines.push(pts)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: Pt[] = []
    const b = lat * RAD
    const cb = Math.cos(b)
    const sb = Math.sin(b)
    for (let lon = 0; lon <= 360; lon += 9) {
      pts.push([cb * Math.sin(lon * RAD), sb, cb * Math.cos(lon * RAD)])
    }
    lines.push(pts)
  }
  return lines
}

/** Spin a point about Y, then tilt the whole globe forward about X. */
function project(p: Pt, spin: number, r: number, cx: number, cy: number) {
  const cs = Math.cos(spin)
  const sn = Math.sin(spin)
  const x1 = p[0] * cs + p[2] * sn
  const z1 = -p[0] * sn + p[2] * cs
  const y2 = p[1] * Math.cos(TILT) - z1 * Math.sin(TILT)
  const z2 = p[1] * Math.sin(TILT) + z1 * Math.cos(TILT)
  return { x: cx + x1 * r, y: cy - y2 * r, depth: z2 }
}

const WIRE = buildWire()
const ORBITS = [
  { r: 1.42, incl: 62 * RAD, phase: 0, speed: 1.7, color: [125, 211, 252] as const },
  { r: 1.62, incl: 118 * RAD, phase: 2.2, speed: -1.25, color: [167, 139, 250] as const },
]

export function LoaderGlobe() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = 200
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)
    const cx = size / 2
    const cy = size / 2
    const r = 62

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const draw = (time: number) => {
      const spin = time * 0.00028
      ctx.clearRect(0, 0, size, size)

      // atmosphere glow behind the sphere
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5)
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.28)')
      glow.addColorStop(0.55, 'rgba(14, 165, 233, 0.10)')
      glow.addColorStop(1, 'rgba(2, 6, 23, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, size, size)

      // wireframe — segment by segment, alpha & width by depth
      ctx.lineCap = 'round'
      for (const line of WIRE) {
        let prev = project(line[0], spin, r, cx, cy)
        for (let i = 1; i < line.length; i++) {
          const cur = project(line[i], spin, r, cx, cy)
          const d = (prev.depth + cur.depth) / 2 // −1 back … +1 front
          const a = 0.1 + 0.72 * ((d + 1) / 2) ** 1.5
          ctx.strokeStyle = `rgba(125, 211, 252, ${a.toFixed(3)})`
          ctx.lineWidth = 0.6 + 0.7 * ((d + 1) / 2)
          ctx.beginPath()
          ctx.moveTo(prev.x, prev.y)
          ctx.lineTo(cur.x, cur.y)
          ctx.stroke()
          prev = cur
        }
      }

      // crisp limb so the silhouette reads as a solid planet edge
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()

      // satellites on tilted orbits, with a fading comet trail + glowing head
      for (const o of ORBITS) {
        const head = o.phase + time * 0.001 * o.speed
        const orbitPt = (ang: number): Pt => {
          const x = o.r * Math.cos(ang)
          const z = o.r * Math.sin(ang)
          // incline the orbit plane about X
          return [x, z * Math.sin(o.incl), z * Math.cos(o.incl)]
        }
        // faint full ring
        ctx.lineWidth = 1
        for (let k = 0; k < 72; k++) {
          const a0 = (k / 72) * Math.PI * 2
          const a1 = ((k + 1) / 72) * Math.PI * 2
          const p0 = project(orbitPt(a0), spin, r, cx, cy)
          const p1 = project(orbitPt(a1), spin, r, cx, cy)
          const d = (p0.depth + p1.depth) / 2
          ctx.strokeStyle = `rgba(${o.color[0]}, ${o.color[1]}, ${o.color[2]}, ${(0.05 + 0.13 * ((d + 1) / 2)).toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
        }
        // comet trail
        const TRAIL = 22
        for (let k = TRAIL; k > 0; k--) {
          const p = project(orbitPt(head - k * 0.045), spin, r, cx, cy)
          const fade = (1 - k / TRAIL) * ((p.depth + 1) / 2)
          ctx.fillStyle = `rgba(${o.color[0]}, ${o.color[1]}, ${o.color[2]}, ${(fade * 0.5).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1 + fade * 1.4, 0, Math.PI * 2)
          ctx.fill()
        }
        // glowing head
        const h = project(orbitPt(head), spin, r, cx, cy)
        ctx.shadowBlur = 10
        ctx.shadowColor = `rgba(${o.color[0]}, ${o.color[1]}, ${o.color[2]}, 0.9)`
        ctx.fillStyle = '#e0f2fe'
        ctx.beginPath()
        ctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    if (reduce) {
      draw(8000)
      return
    }
    let raf = 0
    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} style={{ width: 200, height: 200 }} aria-hidden />
}
