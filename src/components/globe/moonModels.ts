/** Real shape models for the irregular moons (official NASA VTAD GLB,
 * public domain — solarsystem.nasa.gov 3D resources, draco+webp optimized).
 *
 * Moons build instantly as procedural potatoes; when the real model arrives
 * its geometry+material replace the potato INSIDE the same mesh, so picking,
 * the name label, tidal-lock rotation and the frame loop never notice the
 * swap. Offline or a failed fetch simply keeps the potato.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const MOON_MODELS: Record<string, string> = {
  phobos: 'phobos.glb',
  deimos: 'deimos.glb',
}

const draco = new DRACOLoader().setDecoderPath('draco/')
const loader = new GLTFLoader().setDRACOLoader(draco)

/** Bake translate+scale into `geo` so its bounding sphere is `radius` at the
 * origin — the display size the potato had, whatever units NASA modeled in. */
export function fitGeometryTo(geo: THREE.BufferGeometry, radius: number): void {
  geo.computeBoundingSphere()
  const s = geo.boundingSphere
  if (!s || !(s.radius > 0)) return
  const k = radius / s.radius
  geo.translate(-s.center.x, -s.center.y, -s.center.z)
  geo.scale(k, k, k)
  geo.computeBoundingSphere()
}

/** Swap `holder`'s procedural geometry+material for the real NASA shape. */
export function upgradeMoonMesh(holder: THREE.Mesh, moonId: string, radius: number): void {
  const file = MOON_MODELS[moonId]
  if (!file) return
  loader
    .loadAsync(`models/moons/${file}`)
    .then((g) => {
      let real: THREE.Mesh | undefined
      g.scene.updateMatrixWorld(true)
      g.scene.traverse((o) => {
        if (!real && (o as THREE.Mesh).isMesh) real = o as THREE.Mesh
      })
      if (!real) return
      const geo = real.geometry.clone().applyMatrix4(real.matrixWorld)
      fitGeometryTo(geo, radius)
      const oldGeo = holder.geometry
      const oldMat = holder.material
      holder.geometry = geo
      holder.material = real.material
      oldGeo.dispose()
      for (const m of Array.isArray(oldMat) ? oldMat : [oldMat]) m.dispose()
    })
    .catch(() => undefined) // keep the potato
}
