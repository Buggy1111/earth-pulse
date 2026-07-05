/** Deep-space probes in the solar view: each baked HORIZONS trajectory becomes
 * a colour-coded comet trail with a small craft at its live (interpolated) head
 * and a name tag readable from afar; clicking one opens its info card. The real
 * interstellar distances (Voyager ~171 AU) dwarf the planets, so the DISPLAY
 * distance is clamped just past Pluto to keep the fleet in frame — the true
 * distance is surfaced in the panel instead. Children of the heliocentric solar
 * group, so they share the planets' frame exactly. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { occludeLineMaterial } from './trailOcclusion'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { AU_SCENE } from '../../lib/planets'
import { SUNLIT_LAYER } from './helpers'
import { isValidTraj, PROBE_INFO, probePosAu, type ProbeTraj } from '../../lib/probes'
import { makeNameSprite } from '../spaceObjects'
import { isMobileDevice } from '../perf'
import { ARROW_GEO, ARROW_MAT, disposeMaterial, getGlowTexture } from './helpers'

// hoisted per-frame scratch for the direction cones (no per-frame allocs)
const arrowDir = new THREE.Vector3()
const Y_UP = new THREE.Vector3(0, 1, 0)
const PROBE_ARROW_LEAD = 24 // scene units ahead of the craft (MODEL_TARGET 13 + cone)

const PROBES_URL = 'probes/probes.json'
const MAX_DISPLAY_AU = 200 // safety cap only; the real probes (Voyager 1 ~170 AU) all fit, shown true
const MODEL_TARGET = 13 // scene units the real glb model is normalised to

// every probe gets a real spacecraft model: NASA public-domain GLBs, official
// ESA Scifleet exports (JUICE, Solar Orbiter, BepiColombo cruise stack —
// converted FBX→GLB, © ESA, non-commercial with credit) and Lucy (Sketchfab
// CC-BY). Only Hayabusa2 still flies the generic craft (JAXA publishes none).
const MODEL_FILE: Record<string, string> = {
  voyager1: 'voyager.glb',
  voyager2: 'voyager.glb',
  newhorizons: 'new-horizons.glb',
  europaclipper: 'europa-clipper.glb',
  psyche: 'psyche.glb',
  lucy: 'lucy.glb',
  juice: 'juice.glb',
  parker: 'parker.glb',
  solarorbiter: 'solar-orbiter.glb',
  bepicolombo: 'bepicolombo.glb',
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
  /** Tail length cap in samples — at most ~200° of one revolution, so orbiters
   * (Parker's 18-month window = ~6 laps) show a comet tail, not a full ring. */
  maxSpan: number
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
    occludeLineMaterial(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })),
  )
  line.renderOrder = 1
  // how many samples cover ~200° of heliocentric sweep (ecliptic XY angle):
  // Voyager-like near-straight paths never get there (cap = whole path), while
  // multi-lap orbiters get a tail capped to just over half of ONE revolution
  let sweep = 0
  let maxSpan = n
  for (let i = n - 1; i > 0; i--) {
    const a1 = Math.atan2(traj.pos[i * 3 + 1], traj.pos[i * 3])
    const a0 = Math.atan2(traj.pos[(i - 1) * 3 + 1], traj.pos[(i - 1) * 3])
    let d = Math.abs(a1 - a0)
    if (d > Math.PI) d = 2 * Math.PI - d
    sweep += d
    if (sweep > 3.5) {
      maxSpan = n - i
      break
    }
  }
  return { line, colors, base: new THREE.Color(color), n, maxSpan }
}

/** Repaint the trail as a comet tail BEHIND the live head: bright at `headF`
 * (the craft's current spot along the path), fading back into the trajectory it
 * already flew, nothing drawn ahead of it — exactly like the satellite trails. */
function paintTail(t: ProbeTrail, headF: number): void {
  const c = t.colors.array as Float32Array
  const head = Math.max(0, Math.min(t.n - 1, Math.round(headF)))
  const span = Math.max(2, Math.min(Math.floor(t.n * 0.55), t.maxSpan))
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
  /** Direction cone leading the craft, same look as the Earth-view satellites. */
  arrow: THREE.Mesh
}

export function setupProbes(
  globe: GlobeInstance,
  group: THREE.Group,
  probeMeshesRef: { current: Map<string, THREE.Object3D> },
  onPick: (id: string) => void,
  solarLayersRef: { current: Record<string, boolean> },
): ProbesLayer {
  let disposed = false
  // one tag on the whole group: craft, trails and name sprites toggle together
  group.userData.solarLayer = 'probes'
  group.visible = solarLayersRef.current.probes !== false
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
    if (!group.visible) return // spacecraft layer filtered off
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
    // direction cone ahead of the craft — same cue the Earth-view satellites
    // (Hubble & co.) carry, scaled up for solar distances
    const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
    arrow.scale.setScalar(4)
    arrow.frustumCulled = false
    group.add(trail.line, body, arrow)
    added.push(trail.line, body, arrow)
    bodies.push(body)
    probeMeshesRef.current.set(traj.id, body)
    built.push({ traj, body, trail, arrow })

    // swap the placeholder for the real NASA model once it loads — but NOT on
    // phones: the decoded GLB fleet (~70–100 MB of VRAM) is what tips an iPhone
    // into an OOM page-reload on entering solar. The lightweight placeholder glint
    // + the comet trail still tell the whole story at a phone's tiny solar scale.
    if (!isMobileDevice())
      void loadModel(MODEL_FILE[traj.id] ?? GENERIC_MODEL)
      .then((model) => {
        if (disposed) return
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        model.scale.setScalar(MODEL_TARGET / (Math.max(size.x, size.y, size.z) || 1))
        // Textured craft read in their own baked colours, self-lit so they don't
        // go black this far from the Sun. Untextured ones used to glow FLAT in the
        // probe's accent colour — a saturated candy blob hiding all the geometry.
        // Instead light those with the Sun (move them onto the sunlit layer, like
        // the planets) so their real form shows — solar panels, body — keeping only
        // a faint accent floor so the shadowed side still reads its colour.
        const accent = new THREE.Color(color)
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          const src = mesh.material as THREE.MeshStandardMaterial | undefined
          if (!src?.emissive) return
          const m = src.clone()
          if (m.map) {
            m.emissiveMap = m.map
            m.emissive.setRGB(0.55, 0.55, 0.55)
          } else {
            mesh.layers.enable(SUNLIT_LAYER) // let the Sun shade it for real 3D form
            m.metalness = 0.1 // single point light, no env map → drop metal so it reads diffuse
            m.roughness = 0.65
            // soft tinted-silver floor (never a black silhouette, never a neon blob)
            m.emissive.setRGB(0.18 + accent.r * 0.12, 0.18 + accent.g * 0.12, 0.18 + accent.b * 0.12)
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
      for (const traj of trajs.filter(isValidTraj)) addCraft(traj)
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
        // aim the direction cone along the craft's actual heading (6 h lookahead
        // — fine even for Parker's fastest perihelion sprints)
        const [nx, ny, nz] = clampAu(...probePosAu(b.traj, new Date(now.getTime() + 21_600_000)))
        arrowDir.set((nx - x) * AU_SCENE, (ny - y) * AU_SCENE, (nz - z) * AU_SCENE)
        if (arrowDir.lengthSq() > 1e-8) {
          arrowDir.normalize()
          b.arrow.visible = true // the group tag gates the whole layer
          b.arrow.position.copy(b.body.position).addScaledVector(arrowDir, PROBE_ARROW_LEAD)
          b.arrow.quaternion.setFromUnitVectors(Y_UP, arrowDir)
        } else {
          b.arrow.visible = false // frozen at a window edge — no heading to show
        }
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
          disposeMaterial(m.material)
        })
      }
      probeMeshesRef.current.clear()
      built.length = 0
      bodies.length = 0
      added.length = 0
    },
  }
}
