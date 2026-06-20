/** Deep-space probes in the solar view: each baked HORIZONS trajectory becomes
 * a colour-coded comet trail with a small craft at its live (interpolated) head
 * and a name tag readable from afar; clicking one opens its info card. The real
 * interstellar distances (Voyager ~171 AU) dwarf the planets, so the DISPLAY
 * distance is clamped just past Pluto to keep the fleet in frame — the true
 * distance is surfaced in the panel instead. Children of the heliocentric solar
 * group, so they share the planets' frame exactly. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { AU_SCENE } from '../../lib/planets'
import { PROBE_INFO, probePosAu, type ProbeTraj } from '../../lib/probes'
import { makeNameSprite } from '../spaceObjects'
import { getGlowTexture } from './helpers'

const PROBES_URL = 'probes/probes.json'
const MAX_DISPLAY_AU = 200 // safety cap only; the real probes (Voyager 1 ~170 AU) all fit, shown true
const MODEL_TARGET = 13 // scene units the real glb model is normalised to

// every probe gets a real spacecraft model. Voyager, New Horizons, Europa
// Clipper and Psyche are their own craft; Lucy, JUICE (no freely-downloadable
// model exists) borrow a visually-matched NASA probe — Dawn and Juno share
// their big solar-wing silhouettes. All NASA/public-domain glb.
const MODEL_FILE: Record<string, string> = {
  voyager1: 'voyager.glb',
  voyager2: 'voyager.glb',
  newhorizons: 'new-horizons.glb',
  europaclipper: 'europa-clipper.glb',
  psyche: 'psyche.glb',
  lucy: 'dawn.glb',
  juice: 'juno.glb',
}
const GENERIC_MODEL = 'generic.glb'

const draco = new DRACOLoader().setDecoderPath('draco/')
const gltfLoader = new GLTFLoader().setDRACOLoader(draco)
const modelCache = new Map<string, Promise<THREE.Object3D>>()
function loadModel(file: string): Promise<THREE.Object3D> {
  let p = modelCache.get(file)
  if (!p) {
    p = gltfLoader.loadAsync(`models/probes/${file}`).then((g) => g.scene)
    modelCache.set(file, p)
  }
  return p.then((s) => s.clone(true))
}

export interface ProbesLayer {
  /** Move every craft to its position at `now` (called from the solar frame). */
  update(now: Date): void
  dispose(): void
}

/** Clamp a heliocentric position to MAX_DISPLAY_AU while keeping its direction,
 * so far probes sit at the scene edge instead of off in the void. */
function clampAu(x: number, y: number, z: number): [number, number, number] {
  const r = Math.hypot(x, y, z)
  if (r <= MAX_DISPLAY_AU || r === 0) return [x, y, z]
  const k = MAX_DISPLAY_AU / r
  return [x * k, y * k, z * k]
}

function makeBody(color: string): THREE.Object3D {
  const g = new THREE.Group()
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.4, 0), new THREE.MeshBasicMaterial({ color }))
  core.name = 'ph' // placeholder, swapped out once the real model loads
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // constant on-screen size (like the labels) — a probe 170 AU out is a
      // sub-pixel speck in world units, so keep it a visible dot at any zoom
      sizeAttenuation: false,
    }),
  )
  glow.scale.set(0.045, 0.045, 1)
  g.add(core, glow)
  return g
}

/** A comet trail along the baked path: dark tail → bright head, additive. */
interface ProbeTrail {
  line: THREE.Line
  colors: THREE.BufferAttribute
  base: THREE.Color
  n: number
}

function makeTrail(traj: ProbeTraj, color: string): ProbeTrail {
  const n = traj.pos.length / 3
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const [x, y, z] = clampAu(traj.pos[i * 3], traj.pos[i * 3 + 1], traj.pos[i * 3 + 2])
    pts.push(new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE))
  }
  const colors = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  const geom = new THREE.BufferGeometry().setFromPoints(pts)
  geom.setAttribute('color', colors)
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  line.renderOrder = 1
  return { line, colors, base: new THREE.Color(color), n }
}

/** Repaint the trail as a comet tail BEHIND the live head: bright at `headF`
 * (the craft's current spot along the path), fading back into the trajectory it
 * already flew, nothing drawn ahead of it — exactly like the satellite trails. */
function paintTail(t: ProbeTrail, headF: number): void {
  const c = t.colors.array as Float32Array
  const head = Math.max(0, Math.min(t.n - 1, Math.round(headF)))
  const span = Math.max(2, Math.floor(t.n * 0.55))
  for (let i = 0; i < t.n; i++) {
    const k = head - i // how far behind the head (k < 0 = ahead → hidden)
    const a = k >= 0 && k <= span ? (1 - k / span) ** 1.3 : 0
    c[i * 3] = t.base.r * a
    c[i * 3 + 1] = t.base.g * a
    c[i * 3 + 2] = t.base.b * a
  }
  t.colors.needsUpdate = true
}

interface Built {
  traj: ProbeTraj
  body: THREE.Object3D
  trail: ProbeTrail
}

export function setupProbes(
  globe: GlobeInstance,
  group: THREE.Group,
  probeMeshesRef: { current: Map<string, THREE.Object3D> },
  onPick: (id: string) => void,
): ProbesLayer {
  let disposed = false
  const built: Built[] = []
  const bodies: THREE.Object3D[] = [] // raycast set
  const added: THREE.Object3D[] = [] // everything we drop into the group, for cleanup
  const raycaster = new THREE.Raycaster()
  raycaster.layers.enableAll()
  let downX = 0
  let downY = 0

  const onDown = (e: PointerEvent) => {
    downX = e.clientX
    downY = e.clientY
  }
  const onClick = (e: MouseEvent) => {
    if (disposed || bodies.length === 0) return
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) return // drag, not a click
    const rect = globe.renderer().domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, globe.camera() as THREE.PerspectiveCamera)
    const hit = raycaster.intersectObjects(bodies, true)[0]
    if (!hit) return
    let o: THREE.Object3D | null = hit.object
    while (o && !o.userData.probeId) o = o.parent
    const id = o?.userData.probeId as string | undefined
    if (id) onPick(id)
  }
  globe.renderer().domElement.addEventListener('pointerdown', onDown)
  globe.renderer().domElement.addEventListener('click', onClick)

  const addCraft = (traj: ProbeTraj) => {
    const info = PROBE_INFO[traj.id]
    const color = info?.color ?? '#cbd5e1'
    const trail = makeTrail(traj, color)
    const body = makeBody(color)
    body.userData.probeId = traj.id
    body.userData.displayRadius = MODEL_TARGET // camera framing when focused
    body.add(makeNameSprite(info?.name ?? traj.name, 7, true, color))
    // never frustum-cull the craft or its long trail — they're way out and their
    // bounding spheres make them pop in/out at the view edges otherwise
    trail.line.frustumCulled = false
    body.traverse((o) => (o.frustumCulled = false))
    group.add(trail.line, body)
    added.push(trail.line, body)
    bodies.push(body)
    probeMeshesRef.current.set(traj.id, body)
    built.push({ traj, body, trail })

    // swap the placeholder for the real NASA model once it loads
    void loadModel(MODEL_FILE[traj.id] ?? GENERIC_MODEL)
      .then((model) => {
        if (disposed) return
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        model.scale.setScalar(MODEL_TARGET / (Math.max(size.x, size.y, size.z) || 1))
        // self-lit tint so the craft reads in its own colour at any lighting
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          const src = mesh.material as THREE.MeshStandardMaterial | undefined
          if (!src?.emissive) return
          const m = src.clone()
          if (m.map) {
            m.emissiveMap = m.map
            m.emissive.setRGB(0.55, 0.55, 0.55)
          } else {
            m.emissive.set(color)
          }
          m.emissiveIntensity = 0.7
          mesh.material = m
        })
        const ph = body.getObjectByName('ph')
        if (ph) body.remove(ph)
        model.traverse((o) => (o.frustumCulled = false))
        body.add(model)
      })
      .catch(() => {
        // model failed → keep the octahedron placeholder
      })
  }

  void fetch(PROBES_URL)
    .then((r) => (r.ok ? (r.json() as Promise<ProbeTraj[]>) : Promise.reject(new Error('no probes'))))
    .then((trajs) => {
      if (disposed) return
      for (const traj of trajs) addCraft(traj)
    })
    .catch(() => {
      // no snapshot → the rest of the solar view is unaffected
    })

  return {
    update(now: Date) {
      const jd = now.getTime() / 86_400_000 + 2_440_587.5
      for (const b of built) {
        const [x, y, z] = clampAu(...probePosAu(b.traj, now))
        b.body.position.set(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE)
        paintTail(b.trail, (jd - b.traj.jd0) / b.traj.stepDays)
      }
    },

    dispose() {
      disposed = true
      globe.renderer().domElement.removeEventListener('pointerdown', onDown)
      globe.renderer().domElement.removeEventListener('click', onClick)
      for (const o of added) {
        group.remove(o)
        o.traverse((c) => {
          const m = c as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
          m.geometry?.dispose?.()
          const mat = m.material
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
          else mat?.dispose?.()
        })
      }
      probeMeshesRef.current.clear()
      built.length = 0
      bodies.length = 0
      added.length = 0
    },
  }
}
