/** NASA GIBS data layer: paint one equirectangular WMS image straight onto the
 * globe material (reliable where globe.gl's tile cache won't refetch). Null
 * restores the live day/night globe. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { gibsWmsUrl, type GibsLayer } from '../../lib/gibs'
import type { setupSurface } from './surface'

export interface GibsLayerDeps {
  globeRef: { current: GlobeInstance | null }
  gibsActiveRef: { current: boolean }
  surfaceRef: { current: ReturnType<typeof setupSurface> | null }
  globeMaterialRef: { current: THREE.ShaderMaterial | null }
  gibsMaterialRef: { current: THREE.MeshBasicMaterial | null }
}

/** Paint (or clear) the active GIBS imagery onto the globe material. */
export function applyGibsImage(
  globe: GlobeInstance,
  layer: GibsLayer | null,
  date: string,
  deps: GibsLayerDeps,
): void {
  deps.gibsActiveRef.current = !!layer
  deps.surfaceRef.current?.setDataMode(!!layer)
  if (!layer) {
    if (deps.globeMaterialRef.current) globe.globeMaterial(deps.globeMaterialRef.current)
    deps.surfaceRef.current?.updateTileEngine()
    return
  }
  deps.surfaceRef.current?.updateTileEngine() // clear any Esri tiles first
  new THREE.TextureLoader().load(gibsWmsUrl(layer, date), (tex) => {
    if (!deps.gibsActiveRef.current || deps.globeRef.current !== globe) {
      tex.dispose()
      return
    }
    tex.colorSpace = THREE.SRGBColorSpace
    const prev = deps.gibsMaterialRef.current
    const mat = new THREE.MeshBasicMaterial({ map: tex })
    deps.gibsMaterialRef.current = mat
    globe.globeMaterial(mat)
    prev?.map?.dispose()
    prev?.dispose()
  })
}
