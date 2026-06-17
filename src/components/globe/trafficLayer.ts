/** Live worldwide traffic: aircraft and ships drawn as proper plane & ship
 * icons (not dots) that lie flat on the globe and point the way they travel.
 *
 * - Aircraft: airplanes.live ADS-B, keyless. Covered worldwide by round-robin
 *   polling a grid of busy-airspace points (plus the viewer's location) and
 *   accumulating into a map, pruning stale contacts.
 * - Ships: aisstream.io global WebSocket when VITE_AISSTREAM_KEY is set,
 *   otherwise the keyless Fintraffic Baltic feed.
 *
 * Each layer is one InstancedMesh (a single draw call for thousands of icons,
 * so a weak GPU copes), coloured per instance by altitude / motion. Mirrors the
 * orbit-engine pattern: own the THREE objects, self-contained loop, disposer.
 * Only polls / streams while its layer is on and the tab is visible. */

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

const AIRCRAFT_STEP_MS = 1_400 // poll one grid point every ~1.4 s (≈40 s full sweep)
const AIRCRAFT_TTL_MS = 100_000 // drop a plane not refreshed within this
const SHIPS_POLL_MS = 45_000 // digitraffic snapshot cadence
const SHIP_REBUILD_MS = 2_000 // rebuild ship icons from the live aisstream map
const SHIP_TTL_MS = 180_000
const AIRCRAFT_CAP = 4_000
const SHIPS_CAP = 4_000
const AIRCRAFT_SIZE = 5.5
const SHIP_SIZE = 3.6

// busy-airspace points covering the world (oceans carry little traffic anyway)
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

/** White silhouette + dark outline so the icon pops on any background. */
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
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geom, mat, cap)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

export function startTraffic(globe: GlobeInstance, deps: TrafficDeps): () => void {
  const scene = globe.scene()
  const planeTex = planeTexture()
  const shipTex = shipTexture()
  const aircraftMesh = makeInstanced(planeTex, AIRCRAFT_CAP, AIRCRAFT_SIZE)
  const shipMesh = makeInstanced(shipTex, SHIPS_CAP, SHIP_SIZE)
  scene.add(aircraftMesh, shipMesh)

  // accumulated live contacts (id → record + last-seen) so worldwide coverage
  // builds up across the round-robin sweep / the streaming feed
  const aircraft = new Map<string, { d: Aircraft; seen: number }>()
  const ships = new Map<number, { d: Ship; seen: number }>()

  // scratch reused for every instance so updates allocate nothing
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

  /** Lay an icon flat on the sphere at lat/lng/alt, pointing along `headingDeg`
   * (0 = north, 90 = east), into instanced-mesh slot `i`. */
  const place = (mesh: THREE.InstancedMesh, i: number, lat: number, lng: number, alt: number, headingDeg: number) => {
    const { x, y, z } = globe.getCoords(lat, lng, alt)
    P.set(x, y, z)
    N.copy(P).normalize()
    east.crossVectors(worldUp, N)
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0)
    east.normalize()
    north.crossVectors(N, east)
    const a = (headingDeg * Math.PI) / 180
    fwd.copy(north).multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a))
    xAxis.crossVectors(fwd, N).normalize()
    fwd.crossVectors(N, xAxis)
    m.makeBasis(xAxis, fwd, N)
    m.scale(scaleV)
    m.setPosition(P)
    mesh.setMatrixAt(i, m)
  }

  const rebuildAircraft = () => {
    let i = 0
    for (const { d } of aircraft.values()) {
      if (i >= AIRCRAFT_CAP) break
      place(aircraftMesh, i, d.lat, d.lng, globeAltitude(d.altKm) + 0.012, d.headingDeg)
      altColor(col, d.altKm)
      aircraftMesh.setColorAt(i, col)
      i++
    }
    aircraftMesh.count = i
    aircraftMesh.instanceMatrix.needsUpdate = true
    if (aircraftMesh.instanceColor) aircraftMesh.instanceColor.needsUpdate = true
  }
  const rebuildShips = () => {
    let i = 0
    for (const { d } of ships.values()) {
      if (i >= SHIPS_CAP) break
      place(shipMesh, i, d.lat, d.lng, 0.0015, d.headingDeg)
      shipMesh.setColorAt(i, d.moving ? SHIP_MOVING : SHIP_IDLE)
      i++
    }
    shipMesh.count = i
    shipMesh.instanceMatrix.needsUpdate = true
    if (shipMesh.instanceColor) shipMesh.instanceColor.needsUpdate = true
  }

  function prune<K>(map: Map<K, { seen: number }>, ttl: number, now: number) {
    for (const [k, v] of map) if (now - v.seen > ttl) map.delete(k)
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
    const grid = deps.userLocRef.current ? [deps.userLocRef.current, ...AIRCRAFT_GRID.map(([la, lo]) => ({ lat: la, lng: lo }))] : AIRCRAFT_GRID.map(([la, lo]) => ({ lat: la, lng: lo }))
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
      ships.clear() // digitraffic is a full snapshot — replace, don't accumulate
      for (const s of list) ships.set(s.mmsi, { d: s, seen: now })
      rebuildShips()
    } catch {
      // keep the last good snapshot
    }
  }

  // global ships stream (only when a key is configured); pushes into the map,
  // the rebuild timer below draws them
  const stopStream = startAisStream((s) => {
    if (!disposed) ships.set(s.mmsi, { d: s, seen: Date.now() })
  })

  const tick = () => {
    const solar = deps.solarModeRef.current
    const L = deps.layersRef.current
    aircraftMesh.visible = !solar && L.aircraft
    shipMesh.visible = !solar && L.ships
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
    scene.remove(aircraftMesh, shipMesh)
    for (const mesh of [aircraftMesh, shipMesh]) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    planeTex.dispose()
    shipTex.dispose()
  }
}
