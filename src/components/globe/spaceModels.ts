/** Real NASA 3D models (public-domain .glb, github.com/nasa/NASA-3D-Resources)
 * for the orbit layer. Loaded lazily in the background and cached, then cloned
 * per satellite. Each is centred, scaled to a consistent size and given an
 * emissive boost so it reads on the night side (orbit objects aren't lit by the
 * scene's sun). Falls back to the hand-built primitives until/unless a model is
 * available. */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

interface ModelDef {
  file: string
  /** size multiplier on top of the normalised ~4-unit fit (stations are big) */
  scale?: number
}

// satellite name (from famous.txt) → its real NASA model (only self-contained
// glbs are used — Terra's model references external textures, so it keeps the
// gold primitive, as do the ESA/NOAA/GOES sats NASA doesn't model). Several
// share a model where the real thing is near-identical (Landsat 8/9, stations).
const MODELS: Record<string, ModelDef> = {
  ISS: { file: 'iss.glb', scale: 2.0 },
  Tiangong: { file: 'iss.glb', scale: 1.5 }, // a station — the ISS model stands in
  Hubble: { file: 'hubble.glb', scale: 1.15 },
  Fermi: { file: 'fermi.glb' },
  Aqua: { file: 'aqua.glb' },
  Aura: { file: 'aura.glb' },
  'Suomi NPP': { file: 'suomi-npp.glb' },
  'Landsat 8': { file: 'landsat8.glb' },
  'Landsat 9': { file: 'landsat8.glb' },
  'Sentinel-6': { file: 'sentinel6.glb' },
  'Jason-3': { file: 'jason.glb' },
  'ICESat-2': { file: 'icesat2.glb' },
  'GRACE-FO 1': { file: 'grace.glb' },
  'OCO-2': { file: 'oco2.glb' },
}

const BASE = 'models/sats/'
const TARGET_SIZE = 4.2

// the NASA models are Draco-compressed, so the loader needs a Draco decoder
// (self-hosted in public/draco — no external CDN)
const dracoLoader = new DRACOLoader().setDecoderPath('draco/')
const loader = new GLTFLoader().setDRACOLoader(dracoLoader)
const templates = new Map<string, THREE.Object3D>() // file → prepared template
const loading = new Map<string, Promise<void>>()

/** Centre, scale to TARGET_SIZE and boost emissive so the model is visible
 * without scene lighting (the orbit layer is self-lit, like the primitives). */
function prepare(scene: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  scene.position.sub(center)
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial
      if (m.color && m.emissive) {
        m.emissive.copy(m.color).multiplyScalar(0.45)
        m.emissiveIntensity = 1
      }
    }
  })
  const wrap = new THREE.Group()
  wrap.add(scene)
  wrap.scale.setScalar(TARGET_SIZE / maxDim)
  return wrap
}

/** Kick off background loading of every model used by `names`. */
export function preloadSatModels(names: Iterable<string>): Promise<void> {
  const files = new Set<string>()
  for (const n of names) if (MODELS[n]) files.add(MODELS[n].file)
  const jobs: Promise<void>[] = []
  for (const file of files) {
    let job = loading.get(file)
    if (!job) {
      job = loader
        .loadAsync(BASE + file)
        .then((g) => {
          templates.set(file, prepare(g.scene))
        })
        .catch(() => {
          // model unavailable — the primitive stays
        })
      loading.set(file, job)
    }
    jobs.push(job)
  }
  return Promise.all(jobs).then(() => undefined)
}

/** A ready-to-add clone of the real model for `name`, or null if there's no
 * model for it / it hasn't loaded yet (caller uses a primitive then). */
export function cloneSatModel(name: string): THREE.Object3D | null {
  const def = MODELS[name]
  if (!def) return null
  const tpl = templates.get(def.file)
  if (!tpl) return null
  const clone = tpl.clone(true)
  clone.scale.multiplyScalar(def.scale ?? 1)
  clone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  return clone
}
