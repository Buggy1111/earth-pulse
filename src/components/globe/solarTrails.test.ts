import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { makeTrailOrbit, updateSolarTrails, type SolarTrail } from './solarTrails'

/** Kruhová orbita o n bodech + tělísko, které po ní můžeme posouvat. */
function ring(n: number) {
  const trails: SolarTrail[] = []
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI
    return new THREE.Vector3(Math.cos(a) * 10, Math.sin(a) * 10, 0)
  })
  const body = new THREE.Object3D()
  const line = makeTrailOrbit(trails, pts, '#ff0000', 0.9, body)
  return { trails, tr: trails[0], line, body, pts }
}

describe('makeTrailOrbit', () => {
  it('span ≈ 70 % dráhy a color atribut má n×3 floatů', () => {
    const { tr } = ring(100)
    expect(tr.span).toBe(70)
    expect(tr.colors.array.length).toBe(300)
  })
})

describe('updateSolarTrails', () => {
  it('maluje hlavu na nejbližším bodě a fade dozadu PROTI směru pohybu', () => {
    const { trails, tr, body, pts } = ring(100)
    body.position.copy(pts[10])
    updateSolarTrails(trails)
    body.position.copy(pts[12]) // pohyb vpřed (rostoucí index)
    updateSolarTrails(trails)
    const c = tr.colors.array as Float32Array
    expect(c[12 * 3]).toBeCloseTo(1) // hlava plně jasná (base r=1)
    expect(c[11 * 3]).toBeGreaterThan(0) // ocásek za hlavou (odkud přiletěla)
    expect(c[11 * 3]).toBeLessThan(c[12 * 3])
    expect(c[13 * 3]).toBe(0) // před hlavou nic
  })

  it('retrográdní pohyb otočí fade (i přes wrap konce pole)', () => {
    const { trails, tr, body, pts } = ring(100)
    body.position.copy(pts[1])
    updateSolarTrails(trails)
    body.position.copy(pts[99]) // krok "dozadu" přes wrap 0→99
    updateSolarTrails(trails)
    const c = tr.colors.array as Float32Array
    expect(tr.lastDir).toBe(-1)
    expect(c[99 * 3]).toBeCloseTo(1)
    expect(c[0]).toBeGreaterThan(0) // ocásek na indexu 0 (odkud přiletěla)
    expect(c[98 * 3]).toBe(0) // před hlavou nic
  })

  it('nehnutá hlava = žádný přepočet ani GPU re-upload', () => {
    const { trails, tr, body, pts } = ring(100)
    body.position.copy(pts[5])
    updateSolarTrails(trails)
    const versionAfterFirst = tr.colors.version
    updateSolarTrails(trails) // stejná pozice → musí se přeskočit
    expect(tr.colors.version).toBe(versionAfterFirst)
  })

  it('neviditelný trail se přeskakuje úplně', () => {
    const { trails, tr, body, pts } = ring(100)
    tr.line.visible = false
    body.position.copy(pts[5])
    updateSolarTrails(trails)
    expect(tr.prevHead).toBe(-1) // nikdy nepočítal hlavu
  })
})
