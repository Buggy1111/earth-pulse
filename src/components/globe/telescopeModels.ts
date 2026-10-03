/** Procedural stand-ins for the two L2 telescopes — neither agency ships a free
 * glTF, so JWST and Roman are built from primitives that carry their instantly
 * recognisable silhouettes: Webb's 18 gold hexagons over a kite-shaped
 * five-layer sunshield, Roman's white barrel with a solar-panel wing. Each is
 * normalised to ~1 unit across; probesLayer scales it to MODEL_TARGET. */

import * as THREE from 'three'

const GOLD = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.85, roughness: 0.25, emissive: '#5a4310', emissiveIntensity: 0.6 })
const SHIELD = new THREE.MeshStandardMaterial({ color: '#c9d3e6', metalness: 0.5, roughness: 0.35, emissive: '#3a4660', emissiveIntensity: 0.55, side: THREE.DoubleSide })
const BUS = new THREE.MeshStandardMaterial({ color: '#8d96a8', metalness: 0.4, roughness: 0.5, emissive: '#2a3040', emissiveIntensity: 0.5 })
const WHITE = new THREE.MeshStandardMaterial({ color: '#eef2f8', metalness: 0.15, roughness: 0.55, emissive: '#4a5568', emissiveIntensity: 0.5 })
const PANEL = new THREE.MeshStandardMaterial({ color: '#1d3a8a', metalness: 0.6, roughness: 0.3, emissive: '#10245e', emissiveIntensity: 0.7, side: THREE.DoubleSide })

/** Axial hex-grid coordinates of JWST's 18 segments: two rings around an empty centre. */
export function webbSegmentCoords(): [number, number][] {
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
  const out: [number, number][] = []
  for (const ring of [1, 2]) {
    let q = dirs[4][0] * ring
    let r = dirs[4][1] * ring
    for (const d of dirs) {
      for (let i = 0; i < ring; i++) {
        out.push([q, r])
        q += d[0]
        r += d[1]
      }
    }
  }
  return out
}

export function makeWebbModel(): THREE.Object3D {
  const g = new THREE.Group()
  // sunshield: a wide kite, five stacked sheets
  const kite = new THREE.Shape()
  kite.moveTo(-0.5, 0)
  kite.lineTo(0, 0.3)
  kite.lineTo(0.5, 0)
  kite.lineTo(0, -0.3)
  kite.closePath()
  for (let i = 0; i < 5; i++) {
    const sheet = new THREE.Mesh(new THREE.ShapeGeometry(kite), SHIELD)
    sheet.rotation.x = -Math.PI / 2
    sheet.position.y = i * 0.012
    g.add(sheet)
  }
  // bus under the shield (warm side faces the Sun)
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), BUS)
  bus.position.y = -0.06
  g.add(bus)
  // the gold mirror, tilted up out of the shield plane
  const mirror = new THREE.Group()
  const hexR = 0.032
  for (const [q, r] of webbSegmentCoords()) {
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(hexR, hexR, 0.006, 6), GOLD)
    hex.position.set(hexR * 1.76 * (q + r / 2), 0, hexR * 1.52 * r)
    mirror.add(hex)
  }
  mirror.rotation.x = -Math.PI / 2.6
  mirror.position.set(0, 0.17, 0.02)
  g.add(mirror)
  // secondary-mirror boom
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.16, 5), BUS)
  boom.position.set(0, 0.26, 0.13)
  boom.rotation.x = -Math.PI / 2.6
  g.add(boom)
  return g
}

export function makeRomanModel(): THREE.Object3D {
  const g = new THREE.Group()
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 20, 1, true), WHITE)
  barrel.rotation.z = Math.PI / 2
  g.add(barrel)
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), BUS)
  cap.position.x = -0.275
  cap.rotation.y = -Math.PI / 2
  g.add(cap)
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), BUS)
  bus.position.x = 0.3
  g.add(bus)
  // solar-array wing + deployable sun-shade
  const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), PANEL)
  wing.rotation.x = -Math.PI / 2
  wing.position.set(0.1, 0.17, 0)
  g.add(wing)
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), SHIELD)
  shade.position.set(-0.3, 0, 0)
  shade.rotation.y = Math.PI / 2
  g.add(shade)
  return g
}

export const TELESCOPE_MODELS: Record<string, () => THREE.Object3D> = {
  webb: makeWebbModel,
  roman: makeRomanModel,
}
