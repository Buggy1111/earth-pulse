/** Miniature 3D models for the orbit layer, built to match real reference
 * shots: a comms-style satellite (boxy bus, big dish, segmented solar wings)
 * and the ISS (long truss, four blocks of paired steel-blue arrays, white
 * module stack). Shared geometries/materials — ~150 instances live at once.
 * Sizes are in globe.gl scene units (globe radius = 100), wildly exaggerated
 * on purpose — a to-scale satellite would be invisible.
 *
 * Emissive values are deliberately strong: on the night side there are no
 * scene lights to speak of, and an unlit model is black-on-black.
 */

import * as THREE from 'three'

// ——— generic satellite: white/grey bus + parabolic dish + 2×3-segment wings
const BUS_GEO = new THREE.BoxGeometry(0.6, 0.6, 0.85)
const BUS_MAT = new THREE.MeshLambertMaterial({ color: '#dde3ec', emissive: '#8b94a3' })
const PANEL_GEO = new THREE.BoxGeometry(0.62, 0.04, 0.5)
const PANEL_MAT = new THREE.MeshLambertMaterial({ color: '#1e3a8a', emissive: '#27418f' })
const BOOM_GEO = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5)
const BOOM_MAT = new THREE.MeshLambertMaterial({ color: '#9aa3b0', emissive: '#5d6571' })
// dish: open hemisphere facing forward, plus a feed horn
const DISH_GEO = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
const DISH_MAT = new THREE.MeshLambertMaterial({
  color: '#f1f5f9',
  emissive: '#aab4c2',
  side: THREE.DoubleSide,
})
const FEED_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5)

// eco: a single low-poly glint — the detailed model is ~10 meshes (= 10 draw
// calls) and 148 of those choke integrated GPUs while a sat is a dot anyway
const SIMPLE_GEO = new THREE.OctahedronGeometry(0.62)
const SIMPLE_MAT = new THREE.MeshLambertMaterial({ color: '#dde3ec', emissive: '#8b94a3' })

/** Boxy bus + big dish + two three-segment solar wings, randomly tumbled.
 * In `simple` (eco) mode it collapses to one mesh — one draw call instead of
 * ten — so 148 of them stop hammering weak GPUs during globe rotation. */
export function makeSatelliteObject(simple = false): THREE.Object3D {
  if (simple) {
    const sat = new THREE.Mesh(SIMPLE_GEO, SIMPLE_MAT)
    sat.scale.setScalar(1.7)
    return sat
  }
  const sat = new THREE.Group()
  sat.add(new THREE.Mesh(BUS_GEO, BUS_MAT))

  // wing boom through the bus
  const boom = new THREE.Mesh(BOOM_GEO, BOOM_MAT)
  boom.rotation.z = Math.PI / 2
  sat.add(boom)

  // three panel segments per wing with small gaps, like the reference shot
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(PANEL_GEO, PANEL_MAT)
      panel.position.x = side * (0.65 + i * 0.68)
      sat.add(panel)
    }
  }

  // dish on top, tilted slightly off-axis like a real comms antenna
  const dish = new THREE.Mesh(DISH_GEO, DISH_MAT)
  dish.position.set(0, 0.42, 0.1)
  dish.rotation.x = -0.5
  sat.add(dish)
  const feed = new THREE.Mesh(FEED_GEO, BOOM_MAT)
  feed.position.set(0, 0.62, 0.0)
  feed.rotation.x = -0.5
  sat.add(feed)

  // every real satellite points somewhere else
  sat.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  sat.scale.setScalar(1.35)
  return sat
}

// ——— ISS: long lattice truss, 4 wing blocks of PAIRED steel-blue arrays,
// white pressurized module stack, radiators
const ISS_TRUSS_GEO = new THREE.BoxGeometry(7.2, 0.16, 0.16)
const ISS_TRUSS_MAT = new THREE.MeshLambertMaterial({ color: '#cbd5e1', emissive: '#76818f' })
const ISS_ARRAY_GEO = new THREE.BoxGeometry(1.05, 0.03, 2.9)
const ISS_ARRAY_MAT = new THREE.MeshLambertMaterial({ color: '#41599c', emissive: '#3f5694' })
const ISS_MODULE_GEO = new THREE.CylinderGeometry(0.26, 0.26, 3.6, 10)
const ISS_MODULE_MAT = new THREE.MeshLambertMaterial({ color: '#e8edf4', emissive: '#9aa6b5' })
const ISS_CROSS_GEO = new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8)
const ISS_RADIATOR_GEO = new THREE.BoxGeometry(0.55, 0.02, 1.5)
const ISS_RADIATOR_MAT = new THREE.MeshLambertMaterial({ color: '#f4f7fa', emissive: '#b7c1cc' })

/** Name tag sprite for celestial bodies (planets in solar mode). */
export function makeNameSprite(
  text: string,
  bodyRadius: number,
  screenSpace = false,
  color = '#dbe5f0',
): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 34px sans-serif'
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 8
  ctx.fillStyle = color
  ctx.fillText(text, 128, 44)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  )
  if (screenSpace) {
    // constant on-screen size — readable from any distance (solar mode)
    ;(sprite.material as THREE.SpriteMaterial).sizeAttenuation = false
    sprite.scale.set(0.07, 0.0175, 1)
  } else {
    const s = Math.max(bodyRadius * 2.6, 40)
    sprite.scale.set(s, s / 4, 1)
  }
  sprite.position.y = bodyRadius * 1.9
  return sprite
}

/** "ISS" name tag as a sprite glued to the model — moves perfectly with it. */
function makeIssLabel(): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(125, 211, 252, 0.9)'
  ctx.shadowBlur = 10
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText('ISS', 64, 36)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  )
  sprite.scale.set(4.6, 1.7, 1)
  sprite.position.y = 3.2
  return sprite
}

/** ISS like the reference render: four blocks of paired arrays on a long
 * truss, white module stack crossing the center, radiators alongside. */
export function makeIssObject(): THREE.Object3D {
  const iss = new THREE.Group()
  iss.add(new THREE.Mesh(ISS_TRUSS_GEO, ISS_TRUSS_MAT))

  // 4 wing blocks (2 per truss end), each = 2 parallel paired panels
  // reaching fore and aft of the truss — 16 panels total like the real thing
  for (const xBlock of [-3.1, -2.0, 2.0, 3.1]) {
    for (const zSide of [-1, 1]) {
      for (const lane of [-0.55, 0.55]) {
        const panel = new THREE.Mesh(ISS_ARRAY_GEO, ISS_ARRAY_MAT)
        panel.position.set(xBlock + lane * 0.5, 0, zSide * 1.62)
        iss.add(panel)
      }
    }
  }

  // pressurized modules: long stack perpendicular to the truss + cross modules
  const modules = new THREE.Mesh(ISS_MODULE_GEO, ISS_MODULE_MAT)
  modules.rotation.x = Math.PI / 2
  iss.add(modules)
  for (const z of [-0.9, 0.6]) {
    const cross = new THREE.Mesh(ISS_CROSS_GEO, ISS_MODULE_MAT)
    cross.rotation.z = Math.PI / 2
    cross.position.set(0, 0, z)
    iss.add(cross)
  }

  // white thermal radiators near the center, tilted off the truss plane
  for (const x of [-1.1, 1.1]) {
    const radiator = new THREE.Mesh(ISS_RADIATOR_GEO, ISS_RADIATOR_MAT)
    radiator.position.set(x, 0.3, 0)
    radiator.rotation.x = 0.5
    iss.add(radiator)
  }

  iss.add(makeIssLabel())
  return iss
}
