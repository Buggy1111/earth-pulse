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

// request sequence — scrubbing the date slider fires a WMS load per move and
// they resolve out of order; only the LATEST request may paint the globe
// (module-level like the events-layer anim state: there is one globe instance)
let gibsSeq = 0

/** Paint (or clear) the active GIBS imagery onto the globe material. */
export function applyGibsImage(
  globe: GlobeInstance,
  layer: GibsLayer | null,
  date: string,
  deps: GibsLayerDeps,
): void {
  const mySeq = ++gibsSeq // invalidates every in-flight load, including on clear
  deps.gibsActiveRef.current = !!layer
  deps.surfaceRef.current?.setDataMode(!!layer)
  if (!layer) {
    if (deps.globeMaterialRef.current) globe.globeMaterial(deps.globeMaterialRef.current)
    deps.surfaceRef.current?.updateTileEngine()
    // the last GIBS image (~11 MB with mips) used to linger until the next layer pick
    deps.gibsMaterialRef.current?.map?.dispose()
    deps.gibsMaterialRef.current?.dispose()
    deps.gibsMaterialRef.current = null
    return
  }
  deps.surfaceRef.current?.updateTileEngine() // clear any Esri tiles first
  new THREE.TextureLoader().load(
    gibsWmsUrl(layer, date),
    (tex) => {
      if (mySeq !== gibsSeq || !deps.gibsActiveRef.current || deps.globeRef.current !== globe) {
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
    },
    undefined,
    () => {
      // WMS hiccup — keep whatever is on the globe; the next pick/date change retries
    },
  )
}
