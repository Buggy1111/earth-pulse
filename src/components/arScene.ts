/** The 3D layer for Sky AR: a transparent WebGL canvas over the camera feed
 * that renders the real Starlink model in the sky, where each satellite
 * actually is. The phone's heading + tilt aim a perspective camera at the
 * celestial sphere, so three.js does the projection — turn the phone and the
 * models swing through the view, matching the real sky. The DOM layer keeps the
 * labels, crosshair and identify readout on top for legibility. */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const RAD = Math.PI / 180
const RADIUS = 100 // distance the models sit at; only the direction matters
const MODEL_SIZE = 10 // ~5–6° across at RADIUS — a recognisable craft, not a dot
const MODEL_URL = 'models/sats/starlink.glb'

export interface ArSat {
  az: number
  el: number
}

export interface ArScene {
  setPose(headingDeg: number, pitchDeg: number): void
  setSatellites(sats: ArSat[]): void
  resize(width: number, height: number): void
  /** True once the real model has loaded (so the DOM layer can drop its dots). */
  ready(): boolean
  dispose(): void
}

/** Unit direction for a sky position. az: compass bearing (0 = N, clockwise);
 * el: degrees above the horizon. Frame: X = East, Y = Up, Z = -North, so a
 * device heading of 0 looks down −Z (north), matching three.js' default. */
function skyDir(azDeg: number, elDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const az = azDeg * RAD
  const el = elDeg * RAD
  const c = Math.cos(el)
  return out.set(c * Math.sin(az), Math.sin(el), -c * Math.cos(az))
}

export function createArScene(canvas: HTMLCanvasElement, onReady?: () => void): ArScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1000)
  scene.add(new THREE.AmbientLight(0xffffff, 1.4))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(1, 2, 1)
  scene.add(sun)

  const POOL = 140 // a generous cap on models drawn at once (≈ what's overhead)
  const pool: THREE.Object3D[] = []
  const sats: ArSat[] = []
  const tmp = new THREE.Vector3()
  const pose = { heading: 0, pitch: 45 }
  let loaded = false
  let disposed = false
  let raf = 0

  const draco = new DRACOLoader().setDecoderPath('draco/')
  new GLTFLoader()
    .setDRACOLoader(draco)
    .loadAsync(MODEL_URL)
    .then((gltf) => {
      if (disposed) return
      const root = gltf.scene
      // self-light the model so it reads against a bright daytime sky AND the
      // dark night sky — like the named-sat models on the globe
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.material) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          const m = mat as THREE.MeshStandardMaterial
          if (m.emissive && m.color) {
            m.emissive.copy(m.color).multiplyScalar(0.55)
            m.emissiveIntensity = 1
          }
          if (m.metalness != null) m.metalness = Math.min(m.metalness, 0.4)
        }
      })
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      root.scale.setScalar(MODEL_SIZE / (Math.max(size.x, size.y, size.z) || 1))
      for (let i = 0; i < POOL; i++) {
        const clone = root.clone(true)
        clone.visible = false
        scene.add(clone)
        pool.push(clone)
      }
      loaded = true
      layout()
      onReady?.()
    })
    .catch(() => {
      // no model → the DOM dot layer stays the visual
    })

  // place each pooled model at its satellite's sky direction (hide the spares)
  function layout(): void {
    for (let i = 0; i < pool.length; i++) {
      const s = sats[i]
      if (!s) {
        pool[i].visible = false
        continue
      }
      skyDir(s.az, s.el, tmp).multiplyScalar(RADIUS)
      pool[i].position.copy(tmp)
      pool[i].lookAt(0, 0, 0) // broad face toward the observer
      pool[i].visible = true
    }
  }

  const render = (): void => {
    if (disposed) return
    raf = requestAnimationFrame(render)
    // aim the camera where the phone points (clamp short of zenith to avoid the
    // lookAt gimbal flip when the view direction nears straight up)
    skyDir(pose.heading, Math.min(pose.pitch, 85), tmp)
    camera.position.set(0, 0, 0)
    camera.lookAt(tmp)
    renderer.render(scene, camera)
  }
  render()

  return {
    setPose(headingDeg, pitchDeg) {
      pose.heading = headingDeg
      pose.pitch = pitchDeg
    },
    setSatellites(list) {
      sats.length = 0
      for (let i = 0; i < list.length && i < POOL; i++) sats.push(list[i])
      if (loaded) layout()
    },
    resize(width, height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    },
    ready: () => loaded,
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      renderer.dispose()
    },
  }
}
