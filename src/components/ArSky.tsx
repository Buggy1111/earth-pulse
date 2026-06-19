/** 📡 Sky AR: hold your phone up and see the satellites that are actually
 * overhead, pinned to the real sky through the camera.
 *
 * Pipeline: device camera as the backdrop → DeviceOrientation gives where the
 * phone points (compass heading + tilt) → for each tracked satellite we solve
 * its azimuth/elevation from the user's location (arMath) and project it onto
 * the screen. Pure maths lives in lib/arMath (unit-tested); this file is the
 * sensor + camera plumbing and the overlay. Best-effort heading/tilt — it's an
 * experimental "wow, that's the ISS" overlay, not an instrument. */

import { useEffect, useRef, useState } from 'react'
import { propagateSats, isIss, type TrackedSat } from '../lib/satellites'
import { lookAngles, projectToView, type LookAngles } from '../lib/arMath'
import { createArScene, type ArScene } from './arScene'

function arSupported(): boolean {
  if (typeof window === 'undefined') return false
  const hasOrientation = 'DeviceOrientationEvent' in window
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  return hasOrientation || coarsePointer
}
const SUPPORTED = arSupported()

interface OrientPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const BTN_BASE: React.CSSProperties = {
  border: '1px solid #38bdf8',
  background: 'rgba(8,16,28,0.7)',
  color: '#bae6fd',
  borderRadius: '999px',
  font: '600 13px system-ui, sans-serif',
  cursor: 'pointer',
}

/** Floating entry button — hidden on devices that can't do AR. */
export function ArLaunchButton({ onOpen }: { onOpen: () => void }): React.ReactElement | null {
  if (!SUPPORTED) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ ...BTN_BASE, position: 'fixed', right: 12, bottom: 88, padding: '8px 14px', zIndex: 40 }}
      aria-label="Open sky AR — point your phone at the sky"
    >
      📡 sky AR
    </button>
  )
}

interface Marker {
  id: string
  name: string
  x: number
  y: number
  elevationDeg: number
  iss: boolean
  kind: 'named' | 'starlink'
}

interface ArSkyProps {
  sats: TrackedSat[]
  userLoc: { lat: number; lng: number } | null
  onLocate: () => void
  onClose: () => void
}

export function ArSky({ sats, userLoc, onLocate, onClose }: ArSkyProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const arScene = useRef<ArScene | null>(null)
  const [model3D, setModel3D] = useState(false) // real 3D models loaded → drop the dots
  const orient = useRef({ heading: 0, pitch: 45, live: false })
  const [started, setStarted] = useState(false)
  const [camDenied, setCamDenied] = useState(false)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [heading, setHeading] = useState(0)
  const [hasMotion, setHasMotion] = useState(false)
  const [pointed, setPointed] = useState<{ name: string; elevationDeg: number; starlink: boolean } | null>(null)
  // live sensor diagnostics, surfaced in a debug strip so we can see whether the
  // phone is actually feeding orientation data (and what raw values)
  const orientRaw = useRef<{ alpha: number | null; beta: number | null; gamma: number | null; compass: number | null }>({ alpha: null, beta: null, gamma: null, compass: null })
  const orientCount = useRef(0)
  const [dbg, setDbg] = useState<{ heading: number; pitch: number; events: number; raw: typeof orientRaw.current } | null>(null)

  // Starlink: the whole constellation is propagated in a worker (off the main
  // thread) and the above-horizon az/el is cached here; the per-frame loop only
  // re-projects that cache as the phone turns. userLocRef keeps the worker's
  // late callbacks reading the current location.
  const slWorker = useRef<Worker | null>(null)
  const slAzEl = useRef<(LookAngles & { name: string })[]>([])
  const slNames = useRef<string[]>([])
  const userLocRef = useRef(userLoc)
  useEffect(() => {
    userLocRef.current = userLoc
  }, [userLoc])

  // start the back camera + the orientation sensor on the user's tap (iOS needs
  // the gesture for both the permission prompt and getUserMedia)
  async function start(): Promise<void> {
    setStarted(true)
    // iOS: the Motion & Orientation prompt MUST be requested inside the user
    // gesture and BEFORE any await — the camera await below would consume the
    // gesture and the prompt would silently never appear (then the compass
    // never feeds and the dots can't track). Android has no prompt and just
    // works. So this goes first, before the camera.
    const dev = window.DeviceOrientationEvent as unknown as OrientPermission | undefined
    try {
      if (dev?.requestPermission) await dev.requestPermission()
    } catch {
      // denied — we fall back to a fixed pose and the overhead list
    }
    startStarlink() // independent of the camera — kick it off right away so a
    // slow/blocked getUserMedia can never hold the satellite overlay hostage
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch {
      setCamDenied(true) // no camera → dark sky backdrop, the overlay still works
    }
  }

  // spin up the Starlink worker (once) and keep the above-horizon az/el cached
  async function startStarlink(): Promise<void> {
    if (slWorker.current) return
    try {
      const tle = await fetch('tle/starlink.txt').then((r) =>
        r.ok ? r.text() : Promise.reject(new Error('no tle')),
      )
      const w = new Worker(new URL('../workers/starlinkWorker.ts', import.meta.url), {
        type: 'module',
      })
      w.onmessage = (e: MessageEvent<{ type: string; data?: Float32Array; names?: string[] }>) => {
        if (e.data.type === 'ready') {
          slNames.current = e.data.names ?? []
          return
        }
        const obs = userLocRef.current
        if (e.data.type !== 'positions' || !e.data.data || !obs) return
        const d = e.data.data
        const out: (LookAngles & { name: string })[] = []
        for (let j = 0; j < d.length; j += 3) {
          const altKm = d[j + 2]
          if (altKm < 0) continue
          const la = lookAngles(obs, { lat: d[j], lng: d[j + 1], altKm })
          if (la.elevationDeg > 0) out.push({ ...la, name: slNames.current[j / 3] ?? 'Starlink' })
        }
        out.sort((a, b) => b.elevationDeg - a.elevationDeg)
        slAzEl.current = out.slice(0, 300) // keep the highest-in-the-sky ones
        arScene.current?.setSatellites(slAzEl.current.map((s) => ({ az: s.azimuthDeg, el: s.elevationDeg })))
      }
      w.postMessage({ type: 'init', tle })
      slWorker.current = w
    } catch {
      // no snapshot / worker failed → AR still shows the named satellites
    }
  }

  // tear the Starlink worker down when the AR overlay closes
  useEffect(() => () => slWorker.current?.terminate(), [])

  // the 3D layer: a transparent WebGL canvas over the camera that draws the real
  // Starlink model where each satellite is. Built once started; kept in sync via
  // setPose (camera aim) and setSatellites (positions).
  useEffect(() => {
    if (!started || !canvasRef.current || arScene.current) return
    const s = createArScene(canvasRef.current, () => setModel3D(true))
    s.resize(window.innerWidth, window.innerHeight)
    arScene.current = s
    const onResize = (): void => s.resize(window.innerWidth, window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      s.dispose()
      arScene.current = null
    }
  }, [started])

  // drive the Starlink worker on its own 1.5 s interval — decoupled from the
  // render loop, so propagation keeps up even if rAF is throttled (background
  // tab, weak device). Starts ticking as soon as the worker exists.
  useEffect(() => {
    if (!started) return
    const id = setInterval(() => {
      slWorker.current?.postMessage({ type: 'tick', timeMs: Date.now() })
    }, 1500)
    return () => clearInterval(id)
  }, [started])

  // read the phone's pose from the orientation sensor
  useEffect(() => {
    if (!started) return
    const onOrient = (e: DeviceOrientationEvent): void => {
      const compass = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading ?? null
      const heading = compass != null ? compass : e.alpha != null ? 360 - e.alpha : 0
      // back-camera elevation: phone vertical (beta 90) = horizon, tilted back
      // toward face-down (beta 180) = straight up
      const pitch = e.beta != null ? Math.max(-90, Math.min(90, e.beta - 90)) : 45
      orient.current = { heading, pitch, live: true }
      orientRaw.current = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, compass }
      orientCount.current++
      arScene.current?.setPose(heading, pitch) // smooth camera aim at sensor rate
      setHasMotion(true)
    }
    window.addEventListener('deviceorientation', onOrient, true)
    return () => window.removeEventListener('deviceorientation', onOrient, true)
  }, [started])

  // recompute marker positions ~8×/s from the live pose + propagated sats
  useEffect(() => {
    if (!started || !userLoc) return
    let raf = 0
    let last = 0
    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick)
      if (t - last < 120) return
      last = t
      const w = window.innerWidth
      const h = window.innerHeight
      const view = { width: w, height: h, hFovDeg: 55, vFovDeg: 55 * (h / w) }
      const { heading, pitch } = orient.current
      const pose = { headingDeg: heading, pitchDeg: pitch }
      // named satellites: propagated fresh each tick (only ~150, cheap)
      const named: Marker[] = []
      for (const p of propagateSats(sats, new Date())) {
        const la = lookAngles(userLoc, p)
        if (la.elevationDeg <= 0) continue
        const proj = projectToView(la, pose, view)
        if (!proj.visible) continue
        named.push({ id: p.id, name: p.name, x: proj.x, y: proj.y, elevationDeg: la.elevationDeg, iss: isIss(p.name), kind: 'named' })
      }
      named.sort((a, b) => b.elevationDeg - a.elevationDeg)
      // Starlink: the worker refreshes the constellation on its own interval;
      // here we just re-project the cached az/el every frame so the dots track
      // the phone as it pans
      const starlink: Marker[] = []
      const sl = slAzEl.current
      for (let i = 0; i < sl.length && starlink.length < 120; i++) {
        const proj = projectToView(sl[i], pose, view)
        if (!proj.visible) continue
        starlink.push({ id: 'sl' + i, name: sl[i].name, x: proj.x, y: proj.y, elevationDeg: sl[i].elevationDeg, iss: false, kind: 'starlink' })
      }
      const all = [...starlink, ...named.slice(0, 24)] // named drawn on top
      setMarkers(all)
      setHeading(heading)
      // 🎯 identify what you're pointing at: the marker nearest the centre
      // crosshair (within reach) is "this is what you see up there"
      let best: Marker | null = null
      let bestD = 90 * 90 // ~90 px reach
      for (const m of all) {
        const dx = m.x - w / 2
        const dy = m.y - h / 2
        const dsq = dx * dx + dy * dy
        if (dsq < bestD) {
          bestD = dsq
          best = m
        }
      }
      setPointed(best ? { name: best.name, elevationDeg: best.elevationDeg, starlink: best.kind === 'starlink' } : null)
      setDbg({ heading: Math.round(heading), pitch: Math.round(pitch), events: orientCount.current, raw: orientRaw.current })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, userLoc, sats])

  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#02040a', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: camDenied ? 0 : 1 }}
      />
      {/* 3D layer: real Starlink models over the camera (DOM labels stay on top) */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {/* satellite markers: Starlink as small bare dots (replaced by the 3D
          models once they load), named sats labelled */}
      {started &&
        markers.map((m) =>
          m.kind === 'starlink' ? (
            model3D ? null : (
              <div
                key={m.id}
                style={{ position: 'absolute', left: m.x, top: m.y, width: 6, height: 6, transform: 'translate(-50%,-50%)', pointerEvents: 'none', borderRadius: '50%', background: '#9fb8d4', boxShadow: '0 0 6px #8fb6ef' }}
              />
            )
          ) : (
            <div
              key={m.id}
              style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}
            >
              <div style={{ width: 14, height: 14, margin: '0 auto', borderRadius: '50%', background: m.iss ? '#22d3ee' : '#fbbf24', boxShadow: `0 0 10px ${m.iss ? '#22d3ee' : '#fbbf24'}` }} />
              <div style={{ marginTop: 3, font: '600 11px system-ui', color: '#e4e7ec', textShadow: '0 0 5px #000', whiteSpace: 'nowrap' }}>
                {m.name} · {Math.round(m.elevationDeg)}°
              </div>
            </div>
          ),
        )}

      {/* 🎯 centre crosshair + "what you're pointing at" readout */}
      {started && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `2px solid ${pointed ? (pointed.starlink ? '#8fb6ef' : '#fbbf24') : 'rgba(255,255,255,0.45)'}`, borderRadius: '50%', boxSizing: 'border-box' }} />
          {pointed && (
            <div style={{ marginTop: 8, font: '700 14px system-ui', color: '#fff', textShadow: '0 0 6px #000', whiteSpace: 'nowrap' }}>
              {pointed.name || 'Starlink'} · {Math.round(pointed.elevationDeg)}°
            </div>
          )}
        </div>
      )}

      {/* top status bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(#000a, transparent)', color: '#bae6fd', font: '600 13px system-ui' }}>
        <span>
          📡{' '}
          {started
            ? `${markers.filter((m) => m.kind === 'named').length} named · ${markers.filter((m) => m.kind === 'starlink').length} Starlink · facing ${compass}`
            : 'sky AR'}
        </span>
        <button type="button" onClick={onClose} style={{ ...BTN_BASE, padding: '6px 12px' }} aria-label="Close sky AR">
          ✕ close
        </button>
      </div>

      {/* 🔧 sensor debug strip — shows whether the phone is feeding orientation
          data. events climbing = sensor live; stuck at 0 = no motion permission */}
      {started && dbg && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 10px', background: '#000a', color: dbg.events > 0 ? '#86efac' : '#fca5a5', font: '500 11px ui-monospace, monospace', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          🔧 events:{dbg.events} · heading:{dbg.heading}° · tilt:{dbg.pitch}° · α:{dbg.raw.alpha == null ? '–' : Math.round(dbg.raw.alpha)} β:{dbg.raw.beta == null ? '–' : Math.round(dbg.raw.beta)} γ:{dbg.raw.gamma == null ? '–' : Math.round(dbg.raw.gamma)} · iOScompass:{dbg.raw.compass == null ? '–' : Math.round(dbg.raw.compass)}
        </div>
      )}

      {/* gates: location, then start */}
      {(!started || !userLoc) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24, background: '#02040acc', color: '#e4e7ec' }}>
          <div style={{ fontSize: 40 }} aria-hidden>📡</div>
          {!userLoc ? (
            <>
              <p style={{ maxWidth: 320, opacity: 0.8 }}>Sky AR needs your location to know which satellites are above you.</p>
              <button type="button" onClick={onLocate} style={{ ...BTN_BASE, padding: '10px 20px', fontSize: 15 }}>
                📍 use my location
              </button>
            </>
          ) : (
            <>
              <p style={{ maxWidth: 320, opacity: 0.8 }}>Point your phone at the sky and pan around to find satellites passing overhead. Experimental — tilt/compass are best-effort.</p>
              <button type="button" onClick={start} style={{ ...BTN_BASE, padding: '10px 20px', fontSize: 15 }}>
                ▶ start
              </button>
            </>
          )}
        </div>
      )}

      {/* hint when the device has no motion sensors (e.g. desktop) */}
      {started && userLoc && !hasMotion && markers.length === 0 && (
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#94a3b8', font: '500 12px system-ui' }}>
          waiting for motion sensors — on desktop there are none, try it on your phone
        </div>
      )}
    </div>
  )
}
