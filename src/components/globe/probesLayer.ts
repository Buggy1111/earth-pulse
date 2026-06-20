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
import { PROBE_INFO, probePosAu, type ProbePick, type ProbeTraj } from '../../lib/probes'
import { makeNameSprite } from '../spaceObjects'
import { getGlowTexture } from './helpers'

const PROBES_URL = 'probes/probes.json'
const MAX_DISPLAY_AU = 55 // clamp display distance to just past Pluto's orbit (~49 AU)
const MODEL_TARGET = 13 // scene units the real glb model is normalised to

// real NASA public-domain models: the iconic probes get their own, the rest a
// generic deep-space-probe bus (Deep Space 1) — every probe is a real craft.
const MODEL_FILE: Record<string, string> = {
  voyager1: 'voyager.glb',
  voyager2: 'voyager.glb',
  newhorizons: 'new-horizons.glb',
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

const _v = new THREE.Vector3()

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
    }),
  )
  glow.scale.set(26, 26, 1)
  g.add(core, glow)
  return g
}

/** A comet trail along the baked path: dark tail → bright head, additive. */
function makeTrail(traj: ProbeTraj, color: string): THREE.Line {
  const n = traj.pos.length / 3
  const pts: THREE.Vector3[] = []
  const colors = new Float32Array(n * 3)
  const c = new THREE.Color(color)
  for (let i = 0; i < n; i++) {
    const [x, y, z] = clampAu(traj.pos[i * 3], traj.pos[i * 3 + 1], traj.pos[i * 3 + 2])
    pts.push(new THREE.Vector3(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE))
    const f = (i / (n - 1)) ** 1.5 // fade lingers near the head
    colors[i * 3] = c.r * f
    colors[i * 3 + 1] = c.g * f
    colors[i * 3 + 2] = c.b * f
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts)
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  line.renderOrder = 1
  return line
}

interface Built {
  traj: ProbeTraj
  body: THREE.Object3D
}

export function setupProbes(
  globe: GlobeInstance,
  group: THREE.Group,
  onPick: (pick: ProbePick | null) => void,
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
    const b = id ? built.find((x) => x.traj.id === id) : undefined
    if (!id || !b) return
    const info = PROBE_INFO[id]
    const d = probeDistances(b.traj, new Date())
    onPick({
      id,
      name: info?.name ?? id,
      operator: info?.operator ?? '',
      launched: info?.launched ?? 0,
      color: info?.color ?? '#cbd5e1',
      blurb: info?.blurb ?? '',
      sunAu: d.sunAu,
      sunKm: d.sunKm,
    })
  }
  globe.renderer().domElement.addEventListener('pointerdown', onDown)
  globe.renderer().domElement.addEventListener('click', onClick)

  void fetch(PROBES_URL)
    .then((r) => (r.ok ? (r.json() as Promise<ProbeTraj[]>) : Promise.reject(new Error('no probes'))))
    .then((trajs) => {
      if (disposed) return
      for (const traj of trajs) {
        const info = PROBE_INFO[traj.id]
        const color = info?.color ?? '#cbd5e1'
        const trail = makeTrail(traj, color)
        const body = makeBody(color)
        body.userData.probeId = traj.id
        body.add(makeNameSprite(info?.name ?? traj.name, 7, true, color))
        group.add(trail, body)
        added.push(trail, body)
        bodies.push(body)
        built.push({ traj, body })

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
            body.add(model)
          })
          .catch(() => {
            // model failed → keep the octahedron placeholder
          })
      }
    })
    .catch(() => {
      // no snapshot → the rest of the solar view is unaffected
    })

  return {
    update(now: Date) {
      for (const b of built) {
        const [x, y, z] = clampAu(...probePosAu(b.traj, now))
        b.body.position.set(x * AU_SCENE, y * AU_SCENE, z * AU_SCENE)
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
      built.length = 0
      bodies.length = 0
      added.length = 0
    },
  }
}

/** Live distance read-outs for the info panel: true heliocentric distance (AU
 * + km) and distance from Earth, both unclamped. */
export function probeDistances(traj: ProbeTraj, now: Date): { sunAu: number; sunKm: number } {
  const [x, y, z] = probePosAu(traj, now)
  const sunAu = _v.set(x, y, z).length()
  return { sunAu, sunKm: sunAu * 149_597_870.7 }
}
