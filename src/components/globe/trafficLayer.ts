/** Live traffic layers: aircraft (airplanes.live, around a centre) and ships
 * (Fintraffic digitraffic AIS, the Baltic) as two point clouds living in the
 * globe scene. Both are opt-in and only poll their free, keyless APIs while
 * their layer is on and the tab is visible — so an idle or hidden globe makes
 * no network calls. Mirrors the orbit-engine pattern: own the THREE objects,
 * run a self-contained loop, return a disposer. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { fetchAircraft, type Aircraft } from '../../lib/aircraft'
import { fetchShips, type Ship } from '../../lib/ships'
import { globeAltitude } from '../../lib/satellites'
import { getGlowTexture } from './helpers'
import type { LayerState } from '../hud/types'

export interface TrafficDeps {
  layersRef: { current: LayerState }
  solarModeRef: { current: boolean }
  /** Aircraft are queried around this point (the viewer's location) or, when
   * null, a default over central Europe. */
  userLocRef: { current: { lat: number; lng: number } | null }
}

const AIRCRAFT_POLL_MS = 8_000
const SHIPS_POLL_MS = 45_000
const DEFAULT_CENTER = { lat: 50, lng: 14 } // Prague — covers Czechia until the user shares a location

// aircraft altitude → colour: low = warm amber, cruising = cyan, high = pale
const ALT_LOW = new THREE.Color('#fbbf24')
const ALT_MID = new THREE.Color('#22d3ee')
const ALT_HIGH = new THREE.Color('#f0f9ff')
const SHIP_MOVING = new THREE.Color('#38bdf8')
const SHIP_IDLE = new THREE.Color('#a8b6c8')

function altColor(out: THREE.Color, altKm: number): void {
  const t = Math.min(1, altKm / 12)
  if (t < 0.5) out.lerpColors(ALT_LOW, ALT_MID, t / 0.5)
  else out.lerpColors(ALT_MID, ALT_HIGH, (t - 0.5) / 0.5)
}

function makePoints(size: number): THREE.Points {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3))
  // SOLID points (alphaTest, normal blending) — NOT additive, which washes out
  // to invisible over the bright daylit side of the globe. Mirrors the volcano
  // layer so traffic reads clearly on both the day and night hemispheres.
  const material = new THREE.PointsMaterial({
    size,
    map: getGlowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.4,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geom, material)
  points.renderOrder = 2
  points.frustumCulled = false
  return points
}

export function startTraffic(globe: GlobeInstance, deps: TrafficDeps): () => void {
  const scene = globe.scene()
  const aircraftPts = makePoints(4.2)
  const shipPts = makePoints(3.2)
  scene.add(aircraftPts, shipPts)

  const tmp = new THREE.Color()
  // aircraft hug the surface at globe scale; lift them a touch so they read as
  // airborne and sit clearly above the ships
  const setAircraft = (list: Aircraft[]) => {
    const n = list.length
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = list[i]
      const { x, y, z } = globe.getCoords(a.lat, a.lng, globeAltitude(a.altKm) + 0.012)
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      altColor(tmp, a.altKm)
      col[i * 3] = tmp.r
      col[i * 3 + 1] = tmp.g
      col[i * 3 + 2] = tmp.b
    }
    swap(aircraftPts, pos, col)
  }
  const setShips = (list: Ship[]) => {
    const n = list.length
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const s = list[i]
      const { x, y, z } = globe.getCoords(s.lat, s.lng, 0.001)
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      const c = s.moving ? SHIP_MOVING : SHIP_IDLE
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    swap(shipPts, pos, col)
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
      const list = await fetchShips(shipCtl.signal)
      if (!disposed) setShips(list)
    } catch {
      // keep the last good positions
    }
  }

  const tick = () => {
    const solar = deps.solarModeRef.current
    const L = deps.layersRef.current
    aircraftPts.visible = !solar && L.aircraft
    shipPts.visible = !solar && L.ships
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
  // a 1 s scheduler keeps each feed on its own cadence and reacts within a
  // second of a layer being switched on
  const timer = setInterval(tick, 1_000)
  tick()

  return () => {
    disposed = true
    clearInterval(timer)
    airCtl?.abort()
    shipCtl?.abort()
    scene.remove(aircraftPts, shipPts)
    for (const p of [aircraftPts, shipPts]) {
      p.geometry.dispose()
      ;(p.material as THREE.Material).dispose()
    }
  }
}

function swap(points: THREE.Points, pos: Float32Array, col: Float32Array): void {
  points.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  points.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
  points.geometry.computeBoundingSphere()
}
