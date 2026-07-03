import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ATMOSPHERES, makeAtmosphereMaterial, makeRingShadowMaterial } from './planetEffects'

describe('planet effects (ring shadows + atmospheres)', () => {
  it('ring material shares the sun position Vector3 instance', () => {
    const sun = new THREE.Vector3(1, 2, 3)
    const a = makeRingShadowMaterial(sun, 75, '#d8c9a3', 1)
    const b = makeRingShadowMaterial(sun, 32, '#9fb6c0', 0.25)
    expect(a.uniforms.uSunPos.value).toBe(sun)
    expect(b.uniforms.uSunPos.value).toBe(sun) // frame loop píše jednou, čtou všichni
    sun.set(9, 9, 9)
    expect(a.uniforms.uSunPos.value.x).toBe(9)
  })

  it('ring material starts textureless and can be upgraded to a map', () => {
    const m = makeRingShadowMaterial(new THREE.Vector3(), 75, '#ffffff', 1)
    expect(m.uniforms.uHasMap.value).toBe(0)
    expect(m.uniforms.uMap.value).toBeNull()
    expect(m.transparent).toBe(true)
    expect(m.side).toBe(THREE.DoubleSide)
    expect(m.fragmentShader).toContain('uPlanetRadius') // stínový válec
  })

  it('atmosphere material is an additive BackSide fresnel shell', () => {
    const m = makeAtmosphereMaterial('#e8d8a0', 2.6, 1.1)
    expect(m.side).toBe(THREE.BackSide)
    expect(m.blending).toBe(THREE.AdditiveBlending)
    expect(m.depthWrite).toBe(false)
    expect(m.uniforms.uPower.value).toBe(2.6)
    expect(m.uniforms.uIntensity.value).toBe(1.1)
  })

  it('atmospheres exist for the bodies that really have one', () => {
    expect(Object.keys(ATMOSPHERES).sort()).toEqual(
      ['jupiter', 'mars', 'neptune', 'saturn', 'uranus', 'venus'])
    // Venuše nejhustší, Mars nejtenčí — poměry odpovídají realitě
    expect(ATMOSPHERES.venus.intensity).toBeGreaterThan(ATMOSPHERES.mars.intensity)
  })
})
