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
  /** real MLI/bus body colour — bare light parts are tinted to it (real photos) */
  tint?: string
}

// real spacecraft body colours (from reference imagery) — they are NOT all gold
const GOLD = '#c79a3e' // gold MLI foil
const SILVER = '#c2ccd8' // bare aluminium / light grey
const WHITE = '#e4e7ec' // white thermal blankets / panels

// satellite name (from famous.txt) → its real NASA model (public-domain glbs).
// Several share a model where the real thing is near-identical: Landsat 8/9,
// GOES-16/18, stations (ISS/Tiangong), and the three JPSS sats (Suomi NPP /
// NOAA-20 / NOAA-21) which fly the same Ball BCP-2000 bus. `tint` is the real
// body colour each bus reads as in photos.
const MODELS: Record<string, ModelDef> = {
  ISS: { file: 'iss.glb', scale: 2.0, tint: WHITE },
  Tiangong: { file: 'iss.glb', scale: 1.5, tint: WHITE }, // a station — ISS model stands in
  Hubble: { file: 'hubble.glb', scale: 1.15, tint: SILVER },
  Terra: { file: 'terra.glb', tint: SILVER },
  Fermi: { file: 'fermi.glb', tint: WHITE },
  Aqua: { file: 'aqua.glb', tint: SILVER },
  Aura: { file: 'aura.glb', tint: SILVER },
  'Suomi NPP': { file: 'suomi-npp.glb', tint: GOLD },
  'NOAA-20': { file: 'suomi-npp.glb', tint: GOLD }, // JPSS-1 — same bus as Suomi NPP
  'NOAA-21': { file: 'suomi-npp.glb', tint: GOLD }, // JPSS-2 — same bus as Suomi NPP
  'Landsat 8': { file: 'landsat8.glb', tint: SILVER },
  'Landsat 9': { file: 'landsat8.glb', tint: SILVER },
  'Sentinel-6': { file: 'sentinel6.glb', tint: GOLD },
  'Jason-3': { file: 'jason.glb', tint: GOLD },
  'ICESat-2': { file: 'icesat2.glb', tint: SILVER },
  'GRACE-FO 1': { file: 'grace.glb', tint: GOLD },
  'OCO-2': { file: 'oco2.glb', tint: SILVER },
  SWOT: { file: 'swot.glb', tint: SILVER }, // NASA/JPL public-domain model
  'GOES-16': { file: 'goes.glb', tint: WHITE },
  'GOES-18': { file: 'goes.glb', tint: WHITE }, // same bus as GOES-16
}

// file → its body tint (shared-model files all read the same colour)
const FILE_TINT = new Map<string, string | undefined>()
for (const def of Object.values(MODELS)) if (!FILE_TINT.has(def.file)) FILE_TINT.set(def.file, def.tint)
const _tintCol = new THREE.Color()

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
function prepare(scene: THREE.Object3D, tint?: string): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  scene.position.sub(center)
  const t = { h: 0, s: 0, l: 0 }
  if (tint) _tintCol.set(tint).getHSL(t)
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial
      if (!m.color) continue
      const hsl = { h: 0, s: 0, l: 0 }
      m.color.getHSL(hsl)
      // The grey/silver bus skin (low-saturation base) is recoloured to the
      // satellite's REAL body colour — gold / silver / white — EVEN when it has a
      // texture (those textures are greyscale detail, so the tint multiplies in
      // and recolours them). This is why Hubble & ISS used to stay flat grey.
      // Already-coloured parts (GOES gold, Landsat instruments, solar panels) and
      // dark parts keep their own colour, just get the metal sheen.
      const greyBus = hsl.s < 0.12 && hsl.l > 0.22
      if (tint && greyBus) {
        m.color.setHSL(t.h, t.s, Math.min(0.82, Math.max(0.52, hsl.l)))
        m.metalness = Math.max(m.metalness ?? 0, 0.62)
        m.roughness = Math.min(m.roughness ?? 1, 0.4)
      } else if (!m.map) {
        m.metalness = Math.max(m.metalness ?? 0, 0.5)
        m.roughness = Math.min(m.roughness ?? 1, 0.5)
      }
      if (m.emissive) {
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
          templates.set(file, prepare(g.scene, FILE_TINT.get(file)))
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
