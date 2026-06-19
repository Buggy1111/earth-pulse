/** The Starlink swarm: ~10.6k satellites, GPU-instanced with model LOD.
 *
 * Why instancing: a per-object mesh (like the named-sat layer) would mean 10k
 * draw calls and 10k React-tracked objects — a non-starter. Each satellite is
 * just a per-instance matrix. Why a worker: SGP4 for 10k bodies every frame
 * would stall the UI, so starlinkWorker owns propagation and posts positions
 * back; the main thread only turns lat/lng/alt into matrices at ~2 Hz.
 *
 * The model + LOD: the whole shell is cheap flat panels (one InstancedMesh).
 * The REAL Starlink GLB (public/models/sats/starlink.glb) is ~13k tris — drawn
 * 10k× that's ~140M tris/frame, far past any phone. So only the satellites
 * NEAREST the camera get the real model (a small instanced pool); zoom in or
 * point the AR at the sky and the close ones pop into 3D, the rest stay panels.
 * No GLB on disk, or a software renderer (headless/CI) → panels only. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { globeAltitude } from '../../lib/satellites'
import { selectNearest } from '../../lib/lod'

const TLE_URL = 'tle/starlink.txt'
const MODEL_URL = 'models/sats/starlink.glb'
const TICK_MS = 500 // propagation cadence — the swarm crawls, so 2 Hz reads smooth
const TARGET_SIZE = 1.6 // scene units the model/panel is normalised to (small = a swarm)
const MODEL_POOL = 400 // how many of the nearest sats get the real GLB model
const MAX_PARTS = 12 // guard against an InstancedMesh per mesh for a huge model
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0) // zero-scaled = invisible instance

const PANEL_GEO = new THREE.BoxGeometry(1.5, 0.6, 0.07) // flat plate, like a real v2-mini
const PANEL_MAT = new THREE.MeshBasicMaterial({ color: '#8fb6ef' }) // pale electric blue

/** One instanced piece of the real model: geometry+material plus where it sits
 * inside the model (so multi-mesh models reassemble from the same base matrix). */
interface RenderPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  local: THREE.Matrix4
}

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

/** True only for a genuine software rasteriser (SwiftShader/llvmpipe in
 * headless/CI), read from the globe's OWN GL context. We must NOT spawn a
 * throwaway probe context to test this: iOS caps the number of live WebGL
 * contexts, and once globe.gl holds one the probe fails — which the old
 * isSoftwareRenderer() then misread as "software" and hid the swarm models on
 * the phone (while AR, which never probes, showed them fine). Unknown = real. */
function rendererIsSoftware(globe: GlobeInstance): boolean {
  try {
    const gl = globe.renderer().getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const r = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    return /swiftshader|llvmpipe|software|basic render/i.test(r)
  } catch {
    return false
  }
}

/** Load the real GLB and flatten it to instanced parts, or null if it's not on
 * disk / fails. Materials get a mild emissive lift so the swarm reads on the
 * night side like the named-sat models do. */
async function glbParts(): Promise<RenderPart[] | null> {
  const draco = new DRACOLoader().setDecoderPath('draco/')
  const loader = new GLTFLoader().setDRACOLoader(draco)
  try {
    const gltf = await loader.loadAsync(MODEL_URL)
    const root = gltf.scene
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    root.position.sub(center)
    root.scale.setScalar(TARGET_SIZE / maxDim)
    root.updateMatrixWorld(true)

    const parts: RenderPart[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry || parts.length >= MAX_PARTS) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const src = mats[0] as THREE.MeshStandardMaterial | undefined
      if (!src) return // a mesh with no material — skip it, keep the rest
      const mat = src.clone()
      // carry the texture into the self-glow: a textured model has color = white
      // with the detail in the map, so glowing from the colour washes every panel
      // into a blank white slab (the bug we hit in the AR view). A mild lift keeps
      // the swarm readable on Earth's night side, like the named-sat models.
      if (mat.emissive) {
        if (mat.map) {
          mat.emissiveMap = mat.map
          mat.emissive.setRGB(1, 1, 1)
          mat.emissiveIntensity = 0.45
        } else {
          mat.emissive.copy(mat.color ?? new THREE.Color('#8fb6ef')).multiplyScalar(0.4)
          mat.emissiveIntensity = 1
        }
      }
      if (mat.metalness != null) mat.metalness = Math.min(mat.metalness, 0.4)
      if (mat.roughness != null) mat.roughness = Math.max(mat.roughness, 0.6)
      parts.push({ geometry: mesh.geometry, material: mat, local: mesh.matrixWorld.clone() })
    })
    return parts.length > 0 ? parts : null
  } catch {
    return null // anything went wrong with the model → fall back to the panel
  }
}

export function setupStarlinkLayer(
  globe: GlobeInstance,
  onReady?: (count: number) => void,
): StarlinkLayer {
  const worker = new Worker(new URL('../../workers/starlinkWorker.ts', import.meta.url), {
    type: 'module',
  })
  const dummy = new THREE.Object3D()
  const tmp = new THREE.Matrix4()
  const group = new THREE.Group()
  group.visible = false
  let panel: THREE.InstancedMesh | null = null
  let modelMeshes: THREE.InstancedMesh[] = []
  let modelParts: RenderPart[] | null = null
  let pos: Float32Array | null = null // scene coords per sat (NaN x = hidden)
  let d2: Float64Array | null = null // camera distance² scratch for the LOD pick
  let glbResolved = false
  let count: number | null = null
  let visible = false
  let busy = false
  let lastTick = 0
  let disposed = false

  const tryBuild = (): void => {
    if (disposed || panel || !glbResolved || count == null) return
    pos = new Float32Array(count * 3)
    d2 = new Float64Array(count)
    panel = new THREE.InstancedMesh(PANEL_GEO, PANEL_MAT, count)
    panel.frustumCulled = false
    for (let i = 0; i < count; i++) panel.setMatrixAt(i, HIDDEN)
    panel.instanceMatrix.needsUpdate = true
    group.add(panel)
    for (const part of modelParts ?? []) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, MODEL_POOL)
      im.frustumCulled = false
      for (let i = 0; i < MODEL_POOL; i++) im.setMatrixAt(i, HIDDEN)
      im.instanceMatrix.needsUpdate = true
      modelMeshes.push(im)
      group.add(im)
    }
    group.visible = visible
    globe.scene().add(group)
    onReady?.(count)
  }

  const resolveModel = (p: RenderPart[] | null): void => {
    if (disposed) return
    modelParts = p
    glbResolved = true // panels build regardless of whether the model loaded
    tryBuild()
  }
  // a true software renderer (headless/CI) would freeze on 400 model instances,
  // so it stays on panels; a real GPU (incl. phones) gets the models
  ;(rendererIsSoftware(globe) ? Promise.resolve(null) : glbParts()).then(resolveModel, () =>
    resolveModel(null),
  )

  fetch(TLE_URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((tle) => {
      if (!disposed) worker.postMessage({ type: 'init', tle })
    })
    .catch(() => {
      // snapshot missing — the swarm stays empty, the rest of the app is fine
    })

  /** Build the base matrix (position + face-Earth) for the sat stored at `i`. */
  const baseAt = (i: number): THREE.Matrix4 => {
    dummy.position.set(pos![i * 3], pos![i * 3 + 1], pos![i * 3 + 2])
    dummy.scale.set(1, 1, 1)
    dummy.lookAt(0, 0, 0) // broad face toward Earth, like a real panel
    dummy.updateMatrix()
    return dummy.matrix
  }

  worker.onmessage = (e: MessageEvent<ReadyMsg | PositionsMsg>) => {
    if (disposed) return
    const msg = e.data
    if (msg.type === 'ready') {
      count = msg.count
      tryBuild()
      return
    }
    if (!panel || !pos || !d2) return
    const data = msg.data
    const n = Math.min(panel.count, data.length / 3)
    // 1) every sat as a cheap panel; remember its scene position for the LOD pick
    for (let i = 0; i < n; i++) {
      const alt = data[i * 3 + 2]
      if (alt < 0) {
        panel.setMatrixAt(i, HIDDEN)
        pos[i * 3] = NaN
        continue
      }
      const { x, y, z } = globe.getCoords(data[i * 3], data[i * 3 + 1], globeAltitude(alt))
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      panel.setMatrixAt(i, baseAt(i))
    }
    // 2) the nearest MODEL_POOL sats get the real GLB model on top (panel hidden)
    if (modelMeshes.length) {
      const cam = globe.camera().position
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(pos[i * 3])) {
          d2[i] = Infinity
          continue
        }
        const dx = pos[i * 3] - cam.x
        const dy = pos[i * 3 + 1] - cam.y
        const dz = pos[i * 3 + 2] - cam.z
        d2[i] = dx * dx + dy * dy + dz * dz
      }
      const near = selectNearest(d2.subarray(0, n), MODEL_POOL)
      for (let s = 0; s < MODEL_POOL; s++) {
        const j = near[s]
        if (j != null && Number.isFinite(d2[j])) {
          panel.setMatrixAt(j, HIDDEN) // the model stands in for its panel
          const base = baseAt(j)
          for (let p = 0; p < modelMeshes.length; p++) {
            tmp.multiplyMatrices(base, modelParts![p].local)
            modelMeshes[p].setMatrixAt(s, tmp)
          }
        } else {
          for (const m of modelMeshes) m.setMatrixAt(s, HIDDEN)
        }
      }
      for (const m of modelMeshes) m.instanceMatrix.needsUpdate = true
    }
    panel.instanceMatrix.needsUpdate = true
    busy = false
  }

  return {
    setVisible(v: boolean) {
      visible = v
      group.visible = v
    },
    update(now: Date) {
      if (!visible || busy || !panel) return
      const real = Date.now()
      if (real - lastTick < TICK_MS) return
      lastTick = real
      busy = true
      worker.postMessage({ type: 'tick', timeMs: now.getTime() })
    },
    dispose() {
      disposed = true
      worker.terminate()
      globe.scene().remove(group)
      panel?.dispose() // PANEL_GEO / PANEL_MAT are shared constants — leave them
      for (const m of modelMeshes) {
        m.dispose()
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
      modelMeshes = []
      panel = null
    },
  }
}
