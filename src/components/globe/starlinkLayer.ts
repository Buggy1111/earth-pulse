/** The Starlink swarm: ~10.6k satellites as ONE THREE.InstancedMesh.
 *
 * Why instancing: a per-object mesh (like the named-sat layer) would mean 10k
 * draw calls and 10k React-tracked objects — a non-starter. One InstancedMesh
 * is a single draw call for the whole shell; each sat is just a per-instance
 * matrix. Why a worker: SGP4 for 10k bodies every frame would stall the UI, so
 * starlinkWorker owns propagation and posts positions back; the main thread
 * only turns lat/lng/alt into instance matrices (cheap trig) at ~2 Hz. The TLE
 * snapshot (1.8 MB) is fetched lazily — only when the layer is first enabled.
 *
 * The panels are small and a distinct pale blue so the swarm reads as a
 * shimmering shell distinct from the gold/silver named satellites. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { globeAltitude } from '../../lib/satellites'

const TLE_URL = 'tle/starlink.txt'
const TICK_MS = 500 // propagation cadence — the swarm crawls, so 2 Hz reads smooth
const PANEL = new THREE.BoxGeometry(1.5, 0.6, 0.07) // flat plate, like a real v2-mini
const MATERIAL = new THREE.MeshBasicMaterial({ color: '#8fb6ef' }) // pale electric blue
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0) // zero-scaled = invisible instance

export interface StarlinkLayer {
  setVisible(visible: boolean): void
  /** Drive a propagation tick at simulated time `now` (throttled internally). */
  update(now: Date): void
  dispose(): void
}

interface ReadyMsg {
  type: 'ready'
  count: number
}
interface PositionsMsg {
  type: 'positions'
  timeMs: number
  data: Float32Array
}

export function setupStarlinkLayer(
  globe: GlobeInstance,
  onReady?: (count: number) => void,
): StarlinkLayer {
  const worker = new Worker(new URL('../../workers/starlinkWorker.ts', import.meta.url), {
    type: 'module',
  })
  const dummy = new THREE.Object3D()
  let mesh: THREE.InstancedMesh | null = null
  let visible = false
  let busy = false // a tick is in flight — don't queue another
  let lastTick = 0
  let disposed = false

  // lazily load the snapshot and hand it to the worker to parse + build satrecs
  fetch(TLE_URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((tle) => {
      if (!disposed) worker.postMessage({ type: 'init', tle })
    })
    .catch(() => {
      // snapshot missing — the swarm just stays empty, the rest of the app is fine
    })

  worker.onmessage = (e: MessageEvent<ReadyMsg | PositionsMsg>) => {
    if (disposed) return
    const msg = e.data
    if (msg.type === 'ready') {
      mesh = new THREE.InstancedMesh(PANEL, MATERIAL, msg.count)
      mesh.frustumCulled = false // instances ring the whole globe — never cull the lot
      mesh.visible = visible
      // start fully hidden until the first positions arrive
      for (let i = 0; i < msg.count; i++) mesh.setMatrixAt(i, HIDDEN)
      mesh.instanceMatrix.needsUpdate = true
      globe.scene().add(mesh)
      onReady?.(msg.count)
      return
    }
    // positions: lat/lng/alt per sat → instance matrices (alt < 0 ⇒ hide)
    const m = mesh
    if (!m) return
    const d = msg.data
    const n = Math.min(m.count, d.length / 3)
    for (let i = 0; i < n; i++) {
      const alt = d[i * 3 + 2]
      if (alt < 0) {
        m.setMatrixAt(i, HIDDEN)
        continue
      }
      const { x, y, z } = globe.getCoords(d[i * 3], d[i * 3 + 1], globeAltitude(alt))
      dummy.position.set(x, y, z)
      dummy.scale.set(1, 1, 1)
      dummy.lookAt(0, 0, 0) // broad face toward Earth, like a real panel
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    busy = false
  }

  return {
    setVisible(v: boolean) {
      visible = v
      if (mesh) mesh.visible = v
    },
    update(now: Date) {
      if (!visible || busy || !mesh) return
      const real = Date.now()
      if (real - lastTick < TICK_MS) return
      lastTick = real
      busy = true
      worker.postMessage({ type: 'tick', timeMs: now.getTime() })
    },
    dispose() {
      disposed = true
      worker.terminate()
      if (mesh) {
        globe.scene().remove(mesh)
        mesh.dispose()
        mesh = null
      }
    },
  }
}
