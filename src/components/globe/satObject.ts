/** Builds each satellite's 3D model node: the real NASA glb once it's loaded,
 * otherwise a hand-built primitive placeholder — shaped per spacecraft where we
 * have a distinct silhouette, else the generic gold bus. */

import * as THREE from 'three'
import {
  makeGcomObject,
  makeHubbleObject,
  makeIssObject,
  makeNameSprite,
  makeSatelliteObject,
  makeSentinel1Object,
  makeSentinel2Object,
  makeSentinel3Object,
  makeTanDEMObject,
} from '../spaceObjects'
import { cloneSatModel } from './spaceModels'
import type { OrbitObject } from './helpers'

// the hand-built primitive for a satellite with no real glb model — shaped per
// spacecraft where we have a distinct silhouette, else the generic gold bus.
function primitiveFor(name: string, eco: boolean): THREE.Object3D {
  switch (name) {
    case 'Hubble':
      return makeHubbleObject()
    case 'Sentinel-1A':
      return makeSentinel1Object()
    case 'Sentinel-2A':
    case 'Sentinel-2B':
      return makeSentinel2Object()
    case 'Sentinel-3A':
      return makeSentinel3Object()
    case 'TanDEM-X':
      return makeTanDEMObject()
    case 'GCOM-W1':
      return makeGcomObject()
    default:
      return makeSatelliteObject(eco)
  }
}

/** The model node for one orbit datum: the real NASA glb if cached, otherwise a
 * primitive placeholder (the models are the whole point now, so they're used
 * even in eco — they're tiny on screen anyway). */
export function buildSatObject(d: object, eco: boolean): THREE.Object3D {
  const o = d as OrbitObject
  const real = cloneSatModel(o.name)
  if (real) {
    // label goes on an UNSCALED outer group, not inside the model — each glb is
    // normalised by a different factor (TARGET_SIZE / its native size), so a
    // child label would inherit that and blow up (e.g. GOES). Sibling = consistent.
    const g = new THREE.Group()
    g.add(real)
    g.add(makeNameSprite(o.name, 3, true, o.color))
    return g
  }
  if (o.kind === 'iss') return makeIssObject() // carries its own label
  // primitives are internally scaled too → same outer-group trick so the label
  // stays a consistent on-screen size across all sats.
  const g = new THREE.Group()
  g.add(primitiveFor(o.name, eco))
  g.add(makeNameSprite(o.name, 2, true, o.color))
  return g
}
