/** Real spacecraft 3D models (.glb) for the orbit layer — mostly public-domain
 * NASA 3D Resources, plus a few Sketchfab CC-BY ones (Tiangong, Sentinel-1A).
 * Loaded lazily in the background and cached, then cloned
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

// satellite name (from famous.txt) → its real model (mostly public-domain NASA).
// Several share a model where the real thing is near-identical: Landsat 8/9,
// GOES-16/18, and the three JPSS sats (Suomi NPP / NOAA-20 / NOAA-21) which fly
// the same Ball BCP-2000 bus. `tint` is the real body colour each bus reads as
// in photos.
const MODELS: Record<string, ModelDef> = {
  ISS: { file: 'iss.glb', scale: 2.0, tint: WHITE },
  Tiangong: { file: 'tiangong.glb', scale: 1.5, tint: WHITE }, // its own model (Sketchfab CC-BY)
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
  'Sentinel-1A': { file: 'sentinel-1a.glb', tint: GOLD }, // Sketchfab CC-BY
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

// A soft "low Earth orbit" reflection environment for the model materials:
// blue-white Earth below, black space above, one hot sun. Drawn on a canvas
// (equirectangular) so every renderer converts it itself — no PMREM target
// tied to one WebGL context. Without it the metals and solar arrays have
// nothing to reflect and read as flat, ambient-lit cut-outs.
let orbitEnv: THREE.Texture | null = null
function orbitEnvironment(): THREE.Texture | null {
  if (orbitEnv || typeof document === 'undefined') return orbitEnv
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 256
  const x = cv.getContext('2d')
  if (!x) return null
  const sky = x.createLinearGradient(0, 0, 0, cv.height)
  sky.addColorStop(0, '#05070d')
  sky.addColorStop(0.47, '#1a2433')
  sky.addColorStop(0.5, '#9fc3ee') // limb glow
  sky.addColorStop(0.62, '#3f74b8')
  sky.addColorStop(1, '#1d3f75')
  x.fillStyle = sky
  x.fillRect(0, 0, cv.width, cv.height)
  // cloud bands on the Earth half
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(235,242,250,${0.08 + ((i * 37) % 10) / 60})`
    x.fillRect(((i * 97) % cv.width), 140 + ((i * 53) % 100), 30 + ((i * 41) % 70), 4 + (i % 5))
  }
  const sun = x.createRadialGradient(150, 70, 0, 150, 70, 46)
  sun.addColorStop(0, 'rgba(255,255,250,1)')
  sun.addColorStop(0.25, 'rgba(255,244,220,0.9)')
  sun.addColorStop(1, 'rgba(255,240,210,0)')
  x.fillStyle = sun
  x.fillRect(80, 0, 140, 140)
  orbitEnv = new THREE.CanvasTexture(cv)
  orbitEnv.mapping = THREE.EquirectangularReflectionMapping
  orbitEnv.colorSpace = THREE.SRGBColorSpace
  return orbitEnv
}

/** ISS-specific finish (real NASA model, material names from its glb): glossy
 * copper solar arrays, polished aluminium modules and foil, so it reads like the
 * reference renders instead of a flat white cut-out. */
function issFinish(m: THREE.MeshStandardMaterial) {
  const n = m.name
  if (n === 'shiny_panel') {
    m.color.set('#ff9a52') // pushes the brown array texture to warm copper
    m.metalness = 0.4
    m.roughness = 0.26
    m.envMapIntensity = 0.6
    m.emissive.set('#9a4a1e')
    m.emissiveIntensity = 0.55
  } else if (n.startsWith('ISS_AO') || n.startsWith('ISS_0')) {
    m.metalness = 0.55
    m.roughness = 0.34
    m.envMapIntensity = 1.1
    m.emissive.setRGB(0.32, 0.32, 0.34)
  } else if (n === 'foil_silver' || n === 'base_metal' || n === 'olive *') {
    m.metalness = 1
    m.roughness = 0.2
    m.envMapIntensity = 1.3
  } else if (n === 'white' || n === 'ecostressWhite') {
    m.metalness = 0.25
    m.roughness = 0.35
  }
}

// ── Tiangong: the Sketchfab model ships untextured flat colours (electric-blue
// arrays, plain white hulls). Give it procedural surface detail instead. ────
const canvasTexture = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const x = cv.getContext('2d')
  if (x) draw(x)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
let tgTex: { cells: THREE.Texture; mli: THREE.Texture } | null = null
function tiangongTextures() {
  if (tgTex || typeof document === 'undefined') return tgTex
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  // solar wings: deep-blue cells under a fine silver grid, a bright bus bar every 4
  const cells = canvasTexture(512, 512, (x) => {
    x.fillStyle = '#b8c3d2'
    x.fillRect(0, 0, 512, 512)
    const S = 32
    for (let i = 0; i < 512; i += S)
      for (let j = 0; j < 512; j += S) {
        const v = 0.8 + rnd() * 0.35
        const g = x.createLinearGradient(i, j, i + S, j + S)
        g.addColorStop(0, `rgb(${20 * v},${52 * v},${132 * v})`)
        g.addColorStop(1, `rgb(${6 * v},${18 * v},${62 * v})`)
        x.fillStyle = g
        x.fillRect(i + 1.5, j + 1.5, S - 3, S - 3)
      }
    x.fillStyle = 'rgba(225,232,242,0.9)'
    for (let i = 0; i <= 512; i += 128) {
      x.fillRect(i - 2, 0, 4, 512)
      x.fillRect(0, i - 2, 512, 4)
    }
  })
  // hulls: white MLI blankets — quilted panels, stitch lines, faint wear
  const mli = canvasTexture(512, 512, (x) => {
    x.fillStyle = '#d9dad6'
    x.fillRect(0, 0, 512, 512)
    const S = 128
    for (let i = 0; i < 512; i += S)
      for (let j = 0; j < 512; j += S) {
        const v = 226 + Math.floor(rnd() * 18)
        const g = x.createLinearGradient(i, j, i + S, j + S)
        g.addColorStop(0, `rgb(${v + 6},${v + 6},${v + 4})`)
        g.addColorStop(1, `rgb(${v - 14},${v - 14},${v - 18})`)
        x.fillStyle = g
        x.fillRect(i + 1, j + 1, S - 2, S - 2)
        x.strokeStyle = 'rgba(100,100,96,0.22)'
        x.setLineDash([2, 4])
        x.strokeRect(i + 10, j + 10, S - 20, S - 20)
        x.setLineDash([])
      }
    for (let k = 0; k < 900; k++) {
      x.fillStyle = `rgba(60,60,64,${0.03 + rnd() * 0.06})`
      x.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 2)
    }
  })
  tgTex = { cells, mli }
  return tgTex
}

/** Box-projected UVs (world units / tile) for a mesh that ships without any. */
function boxProjectUvs(geo: THREE.BufferGeometry, tile: number) {
  if (geo.attributes.uv) return
  if (!geo.attributes.normal) geo.computeVertexNormals()
  const p = geo.attributes.position, n = geo.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    const [u, v] =
      ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)]
    uv[i * 2] = u / tile
    uv[i * 2 + 1] = v / tile
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function tiangongFinish(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, modelSize: number) {
  let m = mat
  const tex = tiangongTextures()
  if (!tex) return
  // the wing panels reuse hull materials on their cell faces — a thin, broad
  // mesh is a solar wing whatever its material says (own material copy, so
  // the hulls sharing it keep their blankets)
  mesh.geometry.computeBoundingBox()
  const bs = mesh.geometry.boundingBox!.getSize(new THREE.Vector3())
  const dims = [bs.x, bs.y, bs.z].sort((a, b) => a - b)
  const wing = !Array.isArray(mesh.material) && dims[0] < dims[2] * 0.03 && dims[1] > dims[2] * 0.08
  if (wing && !m.name.startsWith('solar_gold')) {
    m = m.clone()
    m.name = 'solar_blue.wing'
    mesh.material = m
  }
  const n = m.name
  // tiles are sized in model units, but each mesh's vertices are in its own
  // (often heavily scaled) local space — convert, or the pattern collapses
  const ws = mesh.getWorldScale(new THREE.Vector3())
  const local = (world: number) => world / (Math.abs(ws.x) || 1)
  if (n.startsWith('solar_blue')) {
    // the wings are crinkled strips of thin triangles in several orientations:
    // project per FACE (non-indexed → flat normals), not per mesh/vertex
    if (mesh.geometry.index && !mesh.geometry.attributes.uv) {
      const flatGeo = mesh.geometry.toNonIndexed()
      flatGeo.deleteAttribute('normal')
      flatGeo.computeVertexNormals()
      mesh.geometry = flatGeo
    }
    boxProjectUvs(mesh.geometry, local(modelSize * 0.09))
    m.map = tex.cells
    m.color.set('#ffffff')
    m.metalness = 0.2
    m.roughness = 0.3
    m.envMapIntensity = 0.45
    m.emissive.set('#0d1f4a')
    m.emissiveIntensity = 1
    // the wings' blue cells share their plane with the backing sheets in this
    // model — pull the cells forward so they win the depth test from either
    // side instead of z-fighting into a triangle checkerboard
    m.side = THREE.DoubleSide
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -2
  } else if (n.startsWith('skin_out') || n.startsWith('skin_inner') || n === 'Material.003') {
    boxProjectUvs(mesh.geometry, local(modelSize * 0.16))
    m.map = tex.mli
    m.color.multiplyScalar(0.88)
    m.metalness = 0.15
    m.roughness = 0.45
    m.envMapIntensity = 0.6
    m.emissive.setRGB(0.1, 0.1, 0.1)
  } else if (n.startsWith('solar_gold')) {
    // the wings' backing sheet (largest surface in the model): a warm copper
    // kapton tone, satin — mirror-metal here turned whole wings white
    m.color.set('#a8643a')
    m.metalness = 0.35
    m.roughness = 0.45
    m.envMapIntensity = 0.4
    m.emissive.set('#3a1e0e')
    m.side = THREE.DoubleSide
  } else if (n === 'metal_handle') {
    m.metalness = 1
    m.roughness = 0.22
    m.envMapIntensity = 1.3
  } else if (n.startsWith('metal_silver') || n.startsWith('mirror')) {
    m.metalness = 1
    m.roughness = 0.18
    m.envMapIntensity = 1.3
  }
  m.needsUpdate = true
}

/** Centre, scale to TARGET_SIZE and boost emissive so the model is visible
 * without scene lighting (the orbit layer is self-lit, like the primitives). */
function prepare(scene: THREE.Object3D, tint?: string, file?: string): THREE.Group {
  const env = orbitEnvironment()
  scene.updateMatrixWorld(true)
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
      if (env && 'envMap' in m) {
        m.envMap = env
        m.envMapIntensity = 0.8
      }
      // A FULL-COLOUR textured part (real ISS/Hubble/Aqua skins): the orbit layer
      // is self-lit, so a flat emissive colour washes the texture out to grey.
      // Drive emissive from the texture itself (neutral grey) so its real colours —
      // ISS's blue solar panels, gold foil — read at any lighting, untinted.
      if (m.map) {
        m.emissiveMap = m.map
        m.emissive.setRGB(0.6, 0.6, 0.6)
        m.emissiveIntensity = 1
        if (file === 'iss.glb') issFinish(m)
        continue
      }
      const hsl = { h: 0, s: 0, l: 0 }
      m.color.getHSL(hsl)
      // Bare grey/silver bus skin (low-saturation base) is recoloured to the
      // satellite's REAL body colour — gold / silver / white. Already-coloured
      // parts (panels, instruments) and dark parts keep their own colour.
      const greyBus = hsl.s < 0.12 && hsl.l > 0.22
      if (tint && greyBus) {
        m.color.setHSL(t.h, t.s, Math.min(0.82, Math.max(0.52, hsl.l)))
        m.metalness = Math.max(m.metalness ?? 0, 0.62)
        m.roughness = Math.min(m.roughness ?? 1, 0.4)
      } else {
        m.metalness = Math.max(m.metalness ?? 0, 0.5)
        m.roughness = Math.min(m.roughness ?? 1, 0.5)
      }
      if (m.emissive) {
        m.emissive.copy(m.color).multiplyScalar(0.45)
        m.emissiveIntensity = 1
      }
      if (file === 'iss.glb') issFinish(m)
      if (file === 'tiangong.glb') tiangongFinish(mesh, m, maxDim)
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
          templates.set(file, prepare(g.scene, FILE_TINT.get(file), file))
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
