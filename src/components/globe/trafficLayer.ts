/** Live traffic layers: aircraft (airplanes.live, around a centre) and ships
 * (Fintraffic digitraffic AIS, the Baltic), drawn as proper plane & ship icons
 * — not dots. Each icon lies flat on the globe and points the way it's
 * travelling. Rendered with one InstancedMesh per layer (a single draw call for
 * hundreds of planes or thousands of ships, so even a weak GPU copes), coloured
 * per instance by altitude / motion. Both are opt-in-cheap: they only poll
 * their free, keyless APIs while their layer is on and the tab is visible.
 * Mirrors the orbit-engine pattern: own the THREE objects, self-contained loop,
 * return a disposer. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { fetchAircraft, type Aircraft } from '../../lib/aircraft'
import { fetchShips, type Ship } from '../../lib/ships'
import { globeAltitude } from '../../lib/satellites'
import type { LayerState } from '../hud/types'

export interface TrafficDeps {
  layersRef: { current: LayerState }
  solarModeRef: { current: boolean }
  /** Aircraft are queried around this point (the viewer's location) or, when
   * null, a default over Czechia. */
  userLocRef: { current: { lat: number; lng: number } | null }
}

const AIRCRAFT_POLL_MS = 8_000
const SHIPS_POLL_MS = 45_000
const DEFAULT_CENTER = { lat: 50, lng: 14 } // Prague — covers Czechia until a location is shared
const AIRCRAFT_CAP = 1_000
const SHIPS_CAP = 2_600
const AIRCRAFT_SIZE = 5.5
const SHIP_SIZE = 3.6

// aircraft altitude → colour: low = warm amber, cruising = cyan, high = pale
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

/** Top-down white airplane silhouette, nose toward the top of the canvas. */
function planeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(32, 5) // nose
  ctx.lineTo(36, 22)
  ctx.lineTo(60, 38) // right wingtip
  ctx.lineTo(60, 44)
  ctx.lineTo(36, 34)
  ctx.lineTo(35, 50)
  ctx.lineTo(46, 58) // right tailplane
  ctx.lineTo(46, 61)
  ctx.lineTo(32, 55) // tail
  ctx.lineTo(18, 61)
  ctx.lineTo(18, 58)
  ctx.lineTo(29, 50)
  ctx.lineTo(28, 34)
  ctx.lineTo(4, 44) // left wingtip
  ctx.lineTo(4, 38)
  ctx.lineTo(28, 22)
  ctx.closePath()
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

/** Top-down white ship silhouette, pointed bow toward the top of the canvas. */
function shipTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(32, 4) // bow
  ctx.quadraticCurveTo(46, 18, 45, 34)
  ctx.lineTo(45, 56)
  ctx.quadraticCurveTo(45, 60, 41, 60) // stern corner
  ctx.lineTo(23, 60)
  ctx.quadraticCurveTo(19, 60, 19, 56)
  ctx.lineTo(19, 34)
  ctx.quadraticCurveTo(18, 18, 32, 4)
  ctx.closePath()
  ctx.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

function makeInstanced(texture: THREE.Texture, cap: number, size: number): THREE.InstancedMesh {
  const geom = new THREE.PlaneGeometry(size, size)
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    depthWrite: true,
  })
  const mesh = new THREE.InstancedMesh(geom, mat, cap)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  mesh.frustumCulled = false // bounds come from the single quad — never auto-cull
  mesh.renderOrder = 2
  return mesh
}

export function startTraffic(globe: GlobeInstance, deps: TrafficDeps): () => void {
  const scene = globe.scene()
  const planeTex = planeTexture()
  const shipTex = shipTexture()
  const aircraftMesh = makeInstanced(planeTex, AIRCRAFT_CAP, AIRCRAFT_SIZE)
  const shipMesh = makeInstanced(shipTex, SHIPS_CAP, SHIP_SIZE)
  if (!aircraftMesh.instanceColor) {
    aircraftMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(AIRCRAFT_CAP * 3), 3)
  }
  if (!shipMesh.instanceColor) {
    shipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHIPS_CAP * 3), 3)
  }
  scene.add(aircraftMesh, shipMesh)

  // scratch objects reused for every instance so the update allocates nothing
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  const east = new THREE.Vector3()
  const north = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const xAxis = new THREE.Vector3()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4()
  const scaleV = new THREE.Vector3(1, 1, 1)
  const tmpC = new THREE.Color()

  /** Lay an icon flat on the sphere at lat/lng/alt, pointing along `headingDeg`
   * (0 = north, 90 = east), and write it into the instanced mesh slot. */
  const place = (
    mesh: THREE.InstancedMesh,
    i: number,
    lat: number,
    lng: number,
    altUnits: number,
    headingDeg: number,
  ) => {
    const { x, y, z } = globe.getCoords(lat, lng, altUnits)
    P.set(x, y, z)
    N.copy(P).normalize() // surface normal (icon faces outward along this)
    east.crossVectors(worldUp, N).normalize()
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0) // at the poles
    north.crossVectors(N, east)
    const a = (headingDeg * Math.PI) / 180
    fwd.copy(north).multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a)) // +Y of the quad
    xAxis.crossVectors(fwd, N).normalize()
    fwd.crossVectors(N, xAxis) // re-orthogonalise
    m.makeBasis(xAxis, fwd, N)
    m.scale(scaleV)
    m.setPosition(P)
    mesh.setMatrixAt(i, m)
  }

  const setAircraft = (list: Aircraft[]) => {
    const n = Math.min(list.length, AIRCRAFT_CAP)
    for (let i = 0; i < n; i++) {
      const a = list[i]
      place(aircraftMesh, i, a.lat, a.lng, globeAltitude(a.altKm) + 0.012, a.headingDeg)
      altColor(tmpC, a.altKm)
      aircraftMesh.setColorAt(i, tmpC)
    }
    aircraftMesh.count = n
    aircraftMesh.instanceMatrix.needsUpdate = true
    if (aircraftMesh.instanceColor) aircraftMesh.instanceColor.needsUpdate = true
  }
  const setShips = (list: Ship[]) => {
    const n = Math.min(list.length, SHIPS_CAP)
    for (let i = 0; i < n; i++) {
      const s = list[i]
      place(shipMesh, i, s.lat, s.lng, 0.0015, s.headingDeg)
      shipMesh.setColorAt(i, s.moving ? SHIP_MOVING : SHIP_IDLE)
    }
    shipMesh.count = n
    shipMesh.instanceMatrix.needsUpdate = true
    if (shipMesh.instanceColor) shipMesh.instanceColor.needsUpdate = true
  }

  let disposed = false
  let airCtl: AbortController | null = null
  let shipCtl: AbortController | null = null
  let lastAir = 0
  let lastShip = 0

  const loadAircraft = async () => {
    airCtl?.abort()
    airCtl = new AbortController()
    try {
      const center = deps.userLocRef.current ?? DEFAULT_CENTER
      const list = await fetchAircraft(center, airCtl.signal)
      if (!disposed) setAircraft(list)
    } catch {
      // rate-limited / offline — keep the last good positions, try again later
    }
  }
  const loadShips = async () => {
    shipCtl?.abort()
    shipCtl = new AbortController()
    try {
      const list = await fetchShips(shipCtl.signal, SHIPS_CAP)
      if (!disposed) setShips(list)
    } catch {
      // keep the last good positions
    }
  }

  const tick = () => {
    const solar = deps.solarModeRef.current
    const L = deps.layersRef.current
    aircraftMesh.visible = !solar && L.aircraft
    shipMesh.visible = !solar && L.ships
    if (solar || document.hidden) return
    const now = Date.now()
    if (L.aircraft && now - lastAir >= AIRCRAFT_POLL_MS) {
      lastAir = now
      void loadAircraft()
    }
    if (L.ships && now - lastShip >= SHIPS_POLL_MS) {
      lastShip = now
      void loadShips()
    }
  }
  const timer = setInterval(tick, 1_000)
  tick()

  return () => {
    disposed = true
    clearInterval(timer)
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
