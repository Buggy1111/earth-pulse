import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { STORMS, makeStormsMaterial, sphereDir } from './planetEffects'

describe('signature planet weather (storms)', () => {
  it('sphereDir maps texture lat/lon to object space (poles + equator sanity)', () => {
    expect(sphereDir(90, 0).y).toBeCloseTo(1)    // severní pól
    expect(sphereDir(-90, 0).y).toBeCloseTo(-1)  // jižní pól
    const eq = sphereDir(0, -46)                 // Rudá skvrna: rovníková rovina
    expect(eq.y).toBeCloseTo(0)
    expect(eq.length()).toBeCloseTo(1)
  })

  it('Jupiter gets the texture-aligned Great Red Spot vortex', () => {
    const m = makeStormsMaterial(new THREE.Vector3(), STORMS.jupiter)
    expect(m.uniforms.uSpotColor.value.w).toBeGreaterThan(0)  // zapnuto
    expect(m.uniforms.uSpot.value.w).toBeCloseTo(0.15)        // úhlový poloměr
    expect(m.uniforms.uHex.value.x).toBe(0)                   // hexagon vypnutý
    const dir = sphereDir(-20, -46)
    expect(m.uniforms.uSpot.value.x).toBeCloseTo(dir.x)
    expect(m.uniforms.uSpot.value.y).toBeCloseTo(dir.y)
  })

  it('Saturn gets the polar hexagon, Mars the dust cycle, Neptune both streaks and a dark spot', () => {
    expect(makeStormsMaterial(new THREE.Vector3(), STORMS.saturn).uniforms.uHex.value.x).toBeGreaterThan(0)
    expect(makeStormsMaterial(new THREE.Vector3(), STORMS.mars).uniforms.uDust.value.x).toBeGreaterThan(0)
    const nep = makeStormsMaterial(new THREE.Vector3(), STORMS.neptune)
    expect(nep.uniforms.uStreaks.value.x).toBeGreaterThan(0)
    expect(nep.uniforms.uSpotColor.value.w).toBeGreaterThan(0)
  })

  it('storm shells share the frame-loop sun position instance', () => {
    const sun = new THREE.Vector3(5, 6, 7)
    const m = makeStormsMaterial(sun, STORMS.mars)
    expect(m.uniforms.uSunPos.value).toBe(sun)
  })
})

describe('irregular potato moons (Phobos, Deimos)', () => {
  it('vertices deviate from a sphere by ellipsoid + lumps + craters', async () => {
    const { makeIrregularMoonGeometry } = await import('./planetEffects')
    const geo = makeIrregularMoonGeometry(1, 42)
    const pos = geo.attributes.position
    let min = Infinity, max = 0
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))
      min = Math.min(min, r)
      max = Math.max(max, r)
    }
    expect(max / min).toBeGreaterThan(1.3)  // výrazně nekulaté
    expect(max).toBeLessThan(1.8)           // ale pořád v rozumném obalu
  })

  it('is deterministic per seed (no per-reload shape change)', async () => {
    const { makeIrregularMoonGeometry } = await import('./planetEffects')
    const a = makeIrregularMoonGeometry(1, 7)
    const b = makeIrregularMoonGeometry(1, 7)
    expect(a.attributes.position.getX(50)).toBeCloseTo(b.attributes.position.getX(50))
  })
})
