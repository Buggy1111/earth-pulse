/** Miniature 3D models for the orbit layer — a generic satellite and the ISS.
 *
 * Built from primitives with shared geometries/materials (~150 instances live
 * at once). Sizes are in globe.gl scene units (globe radius = 100), wildly
 * exaggerated on purpose — a to-scale satellite would be invisible.
 */

import * as THREE from 'three'

// gold foil body, deep-blue panels, slight emissive so the night side stays visible
const BODY_GEO = new THREE.BoxGeometry(0.55, 0.55, 0.9)
const BODY_MAT = new THREE.MeshLambertMaterial({ color: '#c9a227', emissive: '#8a6d1a' })
const PANEL_GEO = new THREE.BoxGeometry(1.7, 0.04, 0.55)
const PANEL_MAT = new THREE.MeshLambertMaterial({ color: '#1d4ed8', emissive: '#1e3a8a' })
const DISH_GEO = new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
const DISH_MAT = new THREE.MeshLambertMaterial({ color: '#e2e8f0', emissive: '#94a3b8' })

/** Box body + two solar wings + a small dish, randomly tumbled per instance. */
export function makeSatelliteObject(): THREE.Object3D {
  const sat = new THREE.Group()
  sat.add(new THREE.Mesh(BODY_GEO, BODY_MAT))

  const left = new THREE.Mesh(PANEL_GEO, PANEL_MAT)
  left.position.x = -1.15
  const right = new THREE.Mesh(PANEL_GEO, PANEL_MAT)
  right.position.x = 1.15
  sat.add(left, right)

  const dish = new THREE.Mesh(DISH_GEO, DISH_MAT)
  dish.position.z = 0.55
  dish.rotation.x = Math.PI / 2
  sat.add(dish)

  // every real satellite points somewhere else
  sat.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  sat.scale.setScalar(1.4)
  return sat
}

const ISS_TRUSS_GEO = new THREE.BoxGeometry(5.6, 0.18, 0.18)
const ISS_TRUSS_MAT = new THREE.MeshLambertMaterial({ color: '#94a3b8', emissive: '#64748b' })
const ISS_MODULE_GEO = new THREE.CylinderGeometry(0.28, 0.28, 3.4, 10)
const ISS_MODULE_MAT = new THREE.MeshLambertMaterial({ color: '#e5e7eb', emissive: '#9ca3af' })
const ISS_ARRAY_GEO = new THREE.BoxGeometry(1.15, 0.03, 2.3)
const ISS_ARRAY_MAT = new THREE.MeshLambertMaterial({ color: '#b45309', emissive: '#92400e' })
const ISS_RADIATOR_GEO = new THREE.BoxGeometry(0.5, 0.02, 1.3)
const ISS_RADIATOR_MAT = new THREE.MeshLambertMaterial({ color: '#f1f5f9', emissive: '#cbd5e1' })

/** Recognizable mini-ISS: main truss, pressurized module stack crossing it,
 * eight amber solar arrays in four pairs, plus white radiators. */
export function makeIssObject(): THREE.Object3D {
  const iss = new THREE.Group()
  iss.add(new THREE.Mesh(ISS_TRUSS_GEO, ISS_TRUSS_MAT))

  // pressurized modules run perpendicular to the truss (Zarya–Zvezda axis)
  const modules = new THREE.Mesh(ISS_MODULE_GEO, ISS_MODULE_MAT)
  modules.rotation.x = Math.PI / 2
  iss.add(modules)

  // four solar array pairs at the truss ends, panels facing "up"
  for (const xEnd of [-2.4, -1.6, 1.6, 2.4]) {
    for (const zSide of [-1.35, 1.35]) {
      const panel = new THREE.Mesh(ISS_ARRAY_GEO, ISS_ARRAY_MAT)
      panel.position.set(xEnd, 0, zSide)
      iss.add(panel)
    }
  }

  // central thermal radiators, slightly tilted off the truss
  for (const z of [-0.85, 0.85]) {
    const radiator = new THREE.Mesh(ISS_RADIATOR_GEO, ISS_RADIATOR_MAT)
    radiator.position.set(0.55, 0.25, z)
    radiator.rotation.x = 0.35
    iss.add(radiator)
  }

  return iss
}
