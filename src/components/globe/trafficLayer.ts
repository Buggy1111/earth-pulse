/** Live worldwide traffic, FlightRadar24 / MarineTraffic style: small plane &
 * ship icons that lie flat on the globe and point the way they travel, each
 * with a fading trail behind it showing where it came from.
 *
 * - Aircraft: airplanes.live ADS-B, keyless. Worldwide via round-robin polling
 *   a grid of busy-airspace points (plus the viewer's location).
 * - Ships: aisstream.io global WebSocket when VITE_AISSTREAM_KEY is set,
 *   otherwise the keyless Fintraffic Baltic feed.
 *
 * Icons are one InstancedMesh per layer; trails are one LineSegments per layer
 * (so each layer is just two draw calls for thousands of contacts). Coloured by
 * altitude (aircraft) / motion (ships). Mirrors the orbit-engine pattern: own
 * the THREE objects, self-contained loop, disposer. Only polls / streams while
 * its layer is on and the tab is visible. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { fetchAircraft, type Aircraft } from '../../lib/aircraft'
import { fetchShips, type Ship } from '../../lib/ships'
import { AISSTREAM_KEY, startAisStream } from '../../lib/aisstream'
import { globeAltitude } from '../../lib/satellites'
import type { LayerState } from '../hud/types'

export interface TrafficDeps {
  layersRef: { current: LayerState }
  solarModeRef: { current: boolean }
  userLocRef: { current: { lat: number; lng: number } | null }
}

const DEG = Math.PI / 180
const AIRCRAFT_STEP_MS = 1_400
const AIRCRAFT_TTL_MS = 100_000
const SHIPS_POLL_MS = 45_000
const SHIP_REBUILD_MS = 2_000
const SHIP_TTL_MS = 180_000
const AIRCRAFT_CAP = 4_000
const SHIPS_CAP = 4_000
const AIRCRAFT_SIZE = 2.4
const SHIP_SIZE = 1.9
const TRAIL_SEGS = 6
// trail length = distance covered in this many minutes (capped), so faster
// movers get longer tails — like a flight/voyage track
const AIRCRAFT_TRAIL_MIN = 8
const AIRCRAFT_TRAIL_MAX_KM = 170
const SHIP_TRAIL_MIN = 55
const SHIP_TRAIL_MAX_KM = 45
const AIRCRAFT_ALT = 0.012
const SHIP_ALT = 0.0015

const AIRCRAFT_GRID: [number, number][] = [
  [37, -122], [34, -118], [40, -74], [41, -87], [29, -95], [25, -80], [49, -123], [19, -99],
  [-23, -46], [-34, -58], [4, -74],
  [51, 0], [50, 8], [48, 2], [40, -3], [41, 12], [52, 21], [55, 37], [59, 18], [41, 29],
  [30, 31], [-26, 28], [6, 3],
  [28, 77], [19, 72], [25, 55], [31, 121], [39, 116], [35, 139], [1, 103], [13, 100], [22, 114],
  [-33, 151], [-37, 144],
]

const ALT_LOW = new THREE.Color('#fbbf24')
const ALT_MID = new THREE.Color('#34d3ee')
const ALT_HIGH = new THREE.Color('#f0f9ff')
const SHIP_MOVING = new THREE.Color('#4ad6ff')
const SHIP_IDLE = new THREE.Color('#b8c6d8')

function altColor(out: THREE.Color, altKm: number): void {
  const t = Math.min(1, altKm / 12)
  if (t < 0.5) out.lerpColors(ALT_LOW, ALT_MID, t / 0.5)
  else out.lerpColors(ALT_MID, ALT_HIGH, (t - 0.5) / 0.5)
}

function iconTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.lineJoin = 'round'
  draw(ctx)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 3.5
  ctx.strokeStyle = 'rgba(3, 8, 22, 0.92)'
  ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

function planeTexture(): THREE.CanvasTexture {
  return iconTexture((ctx) => {
    ctx.beginPath()
    ctx.moveTo(32, 5)
    ctx.lineTo(36, 22)
    ctx.lineTo(60, 38)
    ctx.lineTo(60, 44)
    ctx.lineTo(36, 34)
    ctx.lineTo(35, 50)
    ctx.lineTo(46, 58)
    ctx.lineTo(46, 61)
    ctx.lineTo(32, 55)
    ctx.lineTo(18, 61)
    ctx.lineTo(18, 58)
    ctx.lineTo(29, 50)
    ctx.lineTo(28, 34)
    ctx.lineTo(4, 44)
    ctx.lineTo(4, 38)
    ctx.lineTo(28, 22)
    ctx.closePath()
  })
}

function shipTexture(): THREE.CanvasTexture {
  return iconTexture((ctx) => {
    ctx.beginPath()
    ctx.moveTo(32, 4)
    ctx.quadraticCurveTo(46, 18, 45, 34)
    ctx.lineTo(45, 56)
    ctx.quadraticCurveTo(45, 60, 41, 60)
    ctx.lineTo(23, 60)
    ctx.quadraticCurveTo(19, 60, 19, 56)
    ctx.lineTo(19, 34)
    ctx.quadraticCurveTo(18, 18, 32, 4)
    ctx.closePath()
  })
}

function makeInstanced(texture: THREE.Texture, cap: number, size: number): THREE.InstancedMesh {
  const geom = new THREE.PlaneGeometry(size, size)
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(geom, mat, cap)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

function makeTrailLine(cap: number): THREE.LineSegments {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * TRAIL_SEGS * 2 * 3), 3))
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * TRAIL_SEGS * 2 * 3), 3))
  geom.setDrawRange(0, 0)
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const line = new THREE.LineSegments(geom, mat)
  line.frustumCulled = false
  line.renderOrder = 1 // under the icons
  return line
}

export function startTraffic(globe: GlobeInstance, deps: TrafficDeps): () => void {
  const scene = globe.scene()
  const planeTex = planeTexture()
  const shipTex = shipTexture()
  const aircraftMesh = makeInstanced(planeTex, AIRCRAFT_CAP, AIRCRAFT_SIZE)
  const shipMesh = makeInstanced(shipTex, SHIPS_CAP, SHIP_SIZE)
  const aircraftTrail = makeTrailLine(AIRCRAFT_CAP)
  const shipTrail = makeTrailLine(SHIPS_CAP)
  scene.add(aircraftMesh, shipMesh, aircraftTrail, shipTrail)

  const aircraft = new Map<string, { d: Aircraft; seen: number }>()
  const ships = new Map<number, { d: Ship; seen: number }>()

  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  const east = new THREE.Vector3()
  const north = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const xAxis = new THREE.Vector3()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4()
  const scaleV = new THREE.Vector3(1, 1, 1)
  const col = new THREE.Color()

  const place = (mesh: THREE.InstancedMesh, i: number, lat: number, lng: number, alt: number, headingDeg: number) => {
    const { x, y, z } = globe.getCoords(lat, lng, alt)
    P.set(x, y, z)
    N.copy(P).normalize()
    east.crossVectors(worldUp, N)
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
    east.normalize()
    north.crossVectors(N, east)
    const a = headingDeg * DEG
    fwd.copy(north).multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a))
    xAxis.crossVectors(fwd, N).normalize()
    fwd.crossVectors(N, xAxis)
    m.makeBasis(xAxis, fwd, N)
    m.scale(scaleV)
    m.setPosition(P)
    mesh.setMatrixAt(i, m)
  }

  /** Append a fading backward trail (head bright → tail transparent) into the
   * line buffers starting at vertex `v`, returning the new vertex cursor. */
  const addTrail = (
    line: THREE.LineSegments,
    v: number,
    lat: number,
    lng: number,
    alt: number,
    headingDeg: number,
    distKm: number,
    color: THREE.Color,
  ): number => {
    const pos = line.geometry.attributes.position.array as Float32Array
    const cAttr = line.geometry.attributes.color.array as Float32Array
    const back = (headingDeg + 180) * DEG
    const cosLat = Math.max(0.05, Math.cos(lat * DEG))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= TRAIL_SEGS; i++) {
      const d = distKm * (i / TRAIL_SEGS) // i=0 head, i=SEGS tail
      const dLat = (d / 111) * Math.cos(back)
      const dLng = (d / (111 * cosLat)) * Math.sin(back)
      const c = globe.getCoords(lat + dLat, lng + dLng, alt)
      pts.push(new THREE.Vector3(c.x, c.y, c.z))
    }
    for (let i = 0; i < TRAIL_SEGS; i++) {
      const ta = (1 - i / TRAIL_SEGS) ** 1.6 // head brighter
      const tb = (1 - (i + 1) / TRAIL_SEGS) ** 1.6
      for (const [p, t] of [[pts[i], ta], [pts[i + 1], tb]] as const) {
        pos[v * 3] = p.x
        pos[v * 3 + 1] = p.y
        pos[v * 3 + 2] = p.z
        cAttr[v * 3] = color.r * t
        cAttr[v * 3 + 1] = color.g * t
        cAttr[v * 3 + 2] = color.b * t
        v++
      }
    }
    return v
  }

  const rebuildAircraft = () => {
    let i = 0
    let v = 0
    for (const { d } of aircraft.values()) {
      if (i >= AIRCRAFT_CAP) break
      place(aircraftMesh, i, d.lat, d.lng, globeAltitude(d.altKm) + AIRCRAFT_ALT, d.headingDeg)
      altColor(col, d.altKm)
      aircraftMesh.setColorAt(i, col)
      if (!d.onGround && d.speedKmh > 30) {
        const dist = Math.min(AIRCRAFT_TRAIL_MAX_KM, (d.speedKmh * AIRCRAFT_TRAIL_MIN) / 60)
        v = addTrail(aircraftTrail, v, d.lat, d.lng, globeAltitude(d.altKm) + AIRCRAFT_ALT, d.headingDeg, dist, col)
      }
      i++
    }
    aircraftMesh.count = i
    aircraftMesh.instanceMatrix.needsUpdate = true
    if (aircraftMesh.instanceColor) aircraftMesh.instanceColor.needsUpdate = true
    aircraftTrail.geometry.setDrawRange(0, v)
    aircraftTrail.geometry.attributes.position.needsUpdate = true
    aircraftTrail.geometry.attributes.color.needsUpdate = true
  }

  const rebuildShips = () => {
    let i = 0
    let v = 0
    for (const { d } of ships.values()) {
      if (i >= SHIPS_CAP) break
      place(shipMesh, i, d.lat, d.lng, SHIP_ALT, d.headingDeg)
      const color = d.moving ? SHIP_MOVING : SHIP_IDLE
      shipMesh.setColorAt(i, color)
      if (d.moving) {
        const dist = Math.min(SHIP_TRAIL_MAX_KM, (d.speedKmh * SHIP_TRAIL_MIN) / 60)
        v = addTrail(shipTrail, v, d.lat, d.lng, SHIP_ALT, d.headingDeg, dist, SHIP_MOVING)
      }
      i++
    }
    shipMesh.count = i
    shipMesh.instanceMatrix.needsUpdate = true
    if (shipMesh.instanceColor) shipMesh.instanceColor.needsUpdate = true
    shipTrail.geometry.setDrawRange(0, v)
    shipTrail.geometry.attributes.position.needsUpdate = true
    shipTrail.geometry.attributes.color.needsUpdate = true
  }

  function prune<K>(map: Map<K, { seen: number }>, ttl: number, now: number) {
    for (const [k, val] of map) if (now - val.seen > ttl) map.delete(k)
  }

  let disposed = false
  let airCtl: AbortController | null = null
  let shipCtl: AbortController | null = null
  let gridIdx = 0
  let lastAir = 0
  let lastShip = 0
  let lastShipRebuild = 0

  const loadNextGridPoint = async () => {
    airCtl?.abort()
    airCtl = new AbortController()
    const u = deps.userLocRef.current
    const grid = AIRCRAFT_GRID.map(([la, lo]) => ({ lat: la, lng: lo }))
    if (u) grid.unshift(u)
    const center = grid[gridIdx % grid.length]
    gridIdx++
    try {
      const list = await fetchAircraft(center, airCtl.signal)
      if (disposed) return
      const now = Date.now()
      for (const a of list) aircraft.set(a.id, { d: a, seen: now })
      prune(aircraft, AIRCRAFT_TTL_MS, now)
      rebuildAircraft()
    } catch {
      // rate-limited / offline — keep what we have
    }
  }

  const loadShipsDigitraffic = async () => {
    shipCtl?.abort()
    shipCtl = new AbortController()
    try {
      const list = await fetchShips(shipCtl.signal, SHIPS_CAP)
      if (disposed) return
      const now = Date.now()
      ships.clear()
      for (const s of list) ships.set(s.mmsi, { d: s, seen: now })
      rebuildShips()
    } catch {
      // keep the last good snapshot
    }
  }

  const stopStream = startAisStream((s) => {
    if (!disposed) ships.set(s.mmsi, { d: s, seen: Date.now() })
  })

  const tick = () => {
    const solar = deps.solarModeRef.current
    const L = deps.layersRef.current
    aircraftMesh.visible = aircraftTrail.visible = !solar && L.aircraft
    shipMesh.visible = shipTrail.visible = !solar && L.ships
    if (solar || document.hidden) return
    const now = Date.now()
    if (L.aircraft && now - lastAir >= AIRCRAFT_STEP_MS) {
      lastAir = now
      void loadNextGridPoint()
    }
    if (L.ships) {
      if (!AISSTREAM_KEY && now - lastShip >= SHIPS_POLL_MS) {
        lastShip = now
        void loadShipsDigitraffic()
      }
      if (AISSTREAM_KEY && now - lastShipRebuild >= SHIP_REBUILD_MS) {
        lastShipRebuild = now
        prune(ships, SHIP_TTL_MS, now)
        rebuildShips()
      }
    }
  }
  const timer = setInterval(tick, 1_000)
  tick()

  return () => {
    disposed = true
    clearInterval(timer)
    stopStream()
    airCtl?.abort()
    shipCtl?.abort()
    scene.remove(aircraftMesh, shipMesh, aircraftTrail, shipTrail)
    for (const o of [aircraftMesh, shipMesh, aircraftTrail, shipTrail]) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    aircraftMesh.dispose()
    shipMesh.dispose()
    planeTex.dispose()
    shipTex.dispose()
  }
}
