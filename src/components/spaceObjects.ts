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

// ——— generic satellite: real spacecraft look — gold MLI-foil bus, near-black
// solar wings, silver dish/antenna (emissive so it isn't black on the night side)
const BUS_GEO = new THREE.BoxGeometry(0.6, 0.6, 0.85)
const BUS_MAT = new THREE.MeshLambertMaterial({ color: '#c79a3e', emissive: '#6b5020' }) // gold foil
const PANEL_GEO = new THREE.BoxGeometry(0.62, 0.04, 0.5)
const PANEL_MAT = new THREE.MeshLambertMaterial({ color: '#1a2444', emissive: '#202f57' }) // dark blue solar cells
const BOOM_GEO = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5)
const BOOM_MAT = new THREE.MeshLambertMaterial({ color: '#9aa3b0', emissive: '#5d6571' })
// dish: open hemisphere facing forward, plus a feed horn
const DISH_GEO = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
const DISH_MAT = new THREE.MeshLambertMaterial({
  color: '#eef2f7',
  emissive: '#9aa6b6',
  side: THREE.DoubleSide,
})
const FEED_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5)

// eco: a single low-poly glint — the detailed model is ~10 meshes (= 10 draw
// calls) and a swarm of those taxes integrated GPUs while a sat is a dot anyway
const SIMPLE_GEO = new THREE.OctahedronGeometry(0.62)
const SIMPLE_MAT = new THREE.MeshLambertMaterial({ color: '#c79a3e', emissive: '#6b5020' })

/** Boxy bus + big dish + two three-segment solar wings, randomly tumbled.
 * In `simple` (eco) mode it collapses to one mesh — one draw call instead of
 * ten — so the swarm stops hammering weak GPUs during globe rotation. */
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

// ——— Hubble: silver aluminium tube, open dark aperture at the front, a gold
// aft skirt and two dark solar wings — the most recognisable telescope in orbit
const HUB_TUBE_GEO = new THREE.CylinderGeometry(0.6, 0.6, 3.4, 18, 1, true)
const HUB_TUBE_MAT = new THREE.MeshLambertMaterial({ color: '#c3c9d2', emissive: '#7c8590', side: THREE.DoubleSide })
const HUB_APERTURE_GEO = new THREE.CircleGeometry(0.58, 18)
const HUB_APERTURE_MAT = new THREE.MeshBasicMaterial({ color: '#0a0d14', side: THREE.DoubleSide })
const HUB_CAP_GEO = new THREE.CircleGeometry(0.6, 18)
const HUB_SKIRT_GEO = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 18, 1, true)
const HUB_SKIRT_MAT = new THREE.MeshLambertMaterial({ color: '#c79a3e', emissive: '#6b5020', side: THREE.DoubleSide }) // gold aft
const HUB_WING_GEO = new THREE.BoxGeometry(2.7, 0.04, 1.05)
const HUB_WING_MAT = new THREE.MeshLambertMaterial({ color: '#1a2444', emissive: '#202f57' })
const HUB_ANT_GEO = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5)

/** The Hubble Space Telescope — silver tube, dark aperture, gold skirt, wings. */
export function makeHubbleObject(): THREE.Object3D {
  const hub = new THREE.Group()
  const tube = new THREE.Mesh(HUB_TUBE_GEO, HUB_TUBE_MAT)
  tube.rotation.x = Math.PI / 2 // lie the tube along Z (forward)
  hub.add(tube)
  // open aperture at the front (−Z), aft cap at the back (+Z) with gold skirt
  const aperture = new THREE.Mesh(HUB_APERTURE_GEO, HUB_APERTURE_MAT)
  aperture.position.z = -1.7
  hub.add(aperture)
  const cap = new THREE.Mesh(HUB_CAP_GEO, HUB_TUBE_MAT)
  cap.position.z = 1.7
  hub.add(cap)
  const skirt = new THREE.Mesh(HUB_SKIRT_GEO, HUB_SKIRT_MAT)
  skirt.rotation.x = Math.PI / 2
  skirt.position.z = 1.45
  hub.add(skirt)
  // two solar wings to the sides
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(HUB_WING_GEO, HUB_WING_MAT)
    wing.position.x = side * 1.8
    hub.add(wing)
  }
  // high-gain antenna booms
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(HUB_ANT_GEO, BOOM_MAT)
    ant.position.set(0, side * 0.7, 0.8)
    hub.add(ant)
  }
  hub.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  hub.scale.setScalar(1.2)
  return hub
}

// ——— ISS: long lattice truss, 4 wing blocks of PAIRED steel-blue arrays,
// white pressurized module stack, radiators
const ISS_TRUSS_GEO = new THREE.BoxGeometry(7.2, 0.16, 0.16)
const ISS_TRUSS_MAT = new THREE.MeshLambertMaterial({ color: '#cbd5e1', emissive: '#76818f' })
const ISS_ARRAY_GEO = new THREE.BoxGeometry(1.05, 0.03, 2.9)
// the ISS's iconic gold/amber solar wings (the MLI-backed side everyone knows)
const ISS_ARRAY_MAT = new THREE.MeshLambertMaterial({ color: '#bd8838', emissive: '#6e4f22' })
const ISS_MODULE_GEO = new THREE.CylinderGeometry(0.26, 0.26, 3.6, 10)
const ISS_MODULE_MAT = new THREE.MeshLambertMaterial({ color: '#e8edf4', emissive: '#9aa6b5' })
const ISS_CROSS_GEO = new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8)
const ISS_RADIATOR_GEO = new THREE.BoxGeometry(0.55, 0.02, 1.5)
const ISS_RADIATOR_MAT = new THREE.MeshLambertMaterial({ color: '#f4f7fa', emissive: '#b7c1cc' })

// ——— ESA / DLR / JAXA sats: no public-domain glb exists for these, so they're
// hand-built like the generic bus but shaped to each spacecraft's silhouette
// (Sentinel-1 = big flat SAR panel; Sentinel-2/3 = single wing; TanDEM-X =
// hex bus + radar panel; GCOM-W1 = single wing + big AMSR2 dish). Same
// MeshLambert + strong emissive so they read on the night side.
const ESA_BUS_GEO = new THREE.BoxGeometry(0.55, 0.55, 1.05)
const WING_SEG_GEO = new THREE.BoxGeometry(0.8, 0.035, 0.58)
const WING_BOOM_GEO = new THREE.CylinderGeometry(0.022, 0.022, 2.5, 5)
const SAR_MAT = new THREE.MeshLambertMaterial({ color: '#cfd6e0', emissive: '#828b98' }) // light radar antenna
// real spacecraft are NOT all gold — silver-aluminium bus + near-black panels too
const SILVER_BUS_MAT = new THREE.MeshLambertMaterial({ color: '#cfd6e0', emissive: '#5a6470' }) // aluminium MLI
const DARK_PANEL_MAT = new THREE.MeshLambertMaterial({ color: '#12131a', emissive: '#171b2b' }) // near-black GaAs
const NADIR_MAT = new THREE.MeshLambertMaterial({ color: '#1a1a1a', emissive: '#202024' }) // black instrument
// GCOM-W1's AMSR2 reflector is an iconic gold-mesh parabola (brighter than the bus gold)
const GCOM_DISH_MAT = new THREE.MeshLambertMaterial({
  color: '#d4a93f',
  emissive: '#7a5a1e',
  side: THREE.DoubleSide,
})
const S1_SAR_GEO = new THREE.BoxGeometry(0.5, 0.09, 2.5) // long flat C-SAR panel
const TDX_BUS_GEO = new THREE.CylinderGeometry(0.4, 0.4, 1.7, 6) // hexagonal bus
const TDX_SAR_GEO = new THREE.BoxGeometry(0.1, 0.5, 1.55) // X-band SAR panel
const TDX_SOLAR_GEO = new THREE.BoxGeometry(0.06, 0.46, 1.45) // body-fixed solar
const INSTR_GEO = new THREE.BoxGeometry(0.3, 0.28, 0.34)
const GCOM_DISH_GEO = new THREE.SphereGeometry(0.6, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2)

/** One deployed solar wing: a thin boom with three dark-blue panel segments
 * marching out from the bus along ±x. */
function addSolarWing(g: THREE.Group, side: number, panelMat: THREE.Material = PANEL_MAT): void {
  const boom = new THREE.Mesh(WING_BOOM_GEO, BOOM_MAT)
  boom.rotation.z = Math.PI / 2
  boom.position.x = side * 1.4
  g.add(boom)
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(WING_SEG_GEO, panelMat)
    seg.position.x = side * (0.7 + i * 0.82)
    g.add(seg)
  }
}

function tumble(o: THREE.Object3D, scale: number): THREE.Object3D {
  o.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  o.scale.setScalar(scale)
  return o
}

/** Sentinel-1 — radar imager: gold bus, two solar wings (near-black cells), the
 * iconic long flat light-grey C-SAR antenna panel running along the body. */
export function makeSentinel1Object(): THREE.Object3D {
  const s = new THREE.Group()
  s.add(new THREE.Mesh(ESA_BUS_GEO, BUS_MAT)) // gold MLI
  addSolarWing(s, -1, DARK_PANEL_MAT)
  addSolarWing(s, 1, DARK_PANEL_MAT)
  const sar = new THREE.Mesh(S1_SAR_GEO, SAR_MAT)
  sar.position.y = 0.42
  s.add(sar)
  return tumble(s, 1.25)
}

/** Sentinel-2 — optical imager: silver-aluminium bus, a single deployed solar
 * wing, dark MSI telescope aperture on the nadir face. */
export function makeSentinel2Object(): THREE.Object3D {
  const s = new THREE.Group()
  s.add(new THREE.Mesh(ESA_BUS_GEO, SILVER_BUS_MAT))
  addSolarWing(s, 1)
  const ap = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), HUB_APERTURE_MAT)
  ap.position.y = -0.29
  ap.rotation.x = -Math.PI / 2
  s.add(ap)
  return tumble(s, 1.3)
}

/** Sentinel-3 — ocean/land: silver-aluminium bus, single solar wing, a couple of
 * black nadir instrument boxes (SRAL/SLSTR) and a small antenna. */
export function makeSentinel3Object(): THREE.Object3D {
  const s = new THREE.Group()
  s.add(new THREE.Mesh(ESA_BUS_GEO, SILVER_BUS_MAT))
  addSolarWing(s, 1)
  for (const z of [-0.3, 0.32]) {
    const instr = new THREE.Mesh(INSTR_GEO, NADIR_MAT)
    instr.position.set(0, -0.4, z)
    s.add(instr)
  }
  const ant = new THREE.Mesh(FEED_GEO, BOOM_MAT)
  ant.position.set(0.15, -0.55, -0.4)
  s.add(ant)
  return tumble(s, 1.3)
}

/** TanDEM-X — German X-band radar sat: compact hexagonal bus, one flat SAR
 * antenna panel, body-fixed solar cells on the opposite face (no big wings). */
export function makeTanDEMObject(): THREE.Object3D {
  const s = new THREE.Group()
  const bus = new THREE.Mesh(TDX_BUS_GEO, BUS_MAT)
  bus.rotation.x = Math.PI / 2 // lie the hex prism along z
  s.add(bus)
  const sar = new THREE.Mesh(TDX_SAR_GEO, SAR_MAT)
  sar.position.x = 0.46
  s.add(sar)
  const solar = new THREE.Mesh(TDX_SOLAR_GEO, PANEL_MAT)
  solar.position.x = -0.44
  solar.rotation.z = 0.18 // slightly slanted, like the real bus face
  s.add(solar)
  const horn = new THREE.Mesh(FEED_GEO, BOOM_MAT)
  horn.position.set(0, 0.35, -0.6)
  s.add(horn)
  return tumble(s, 1.15)
}

/** GCOM-W1 "Shizuku" — JAXA water-cycle sat: silver-aluminium bus, one solar
 * wing, and the big iconic gold-mesh AMSR2 offset parabolic dish on top. */
export function makeGcomObject(): THREE.Object3D {
  const s = new THREE.Group()
  s.add(new THREE.Mesh(ESA_BUS_GEO, SILVER_BUS_MAT))
  addSolarWing(s, 1)
  const dish = new THREE.Mesh(GCOM_DISH_GEO, GCOM_DISH_MAT)
  dish.position.set(-0.15, 0.5, 0.1)
  dish.rotation.set(-0.6, 0, 0.25)
  s.add(dish)
  const feed = new THREE.Mesh(FEED_GEO, BOOM_MAT)
  feed.position.set(-0.15, 0.85, 0.0)
  feed.rotation.x = -0.6
  s.add(feed)
  return tumble(s, 1.3)
}

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
  // this material OWNS its map (fresh canvas per label) — unlike the shared
  // getGlowTexture() sprites. Disposers check the flag: material.dispose()
  // alone leaks the GPU texture, but blindly disposing maps would kill the
  // shared glow for every other layer.
  sprite.material.userData.ownsMap = true
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
  sprite.material.userData.ownsMap = true
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
