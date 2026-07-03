import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { makeCoronaMaterial, makeProminenceMaterial } from './coronaMaterial'
import { NOISE_GLSL, makeSunMaterial } from './sunMaterial'

describe('sun visuals (corona + prominences)', () => {
  it('corona material is additive, transparent and time-driven', () => {
    const m = makeCoronaMaterial(90)
    expect(m.uniforms.uTime.value).toBe(0)
    expect(m.uniforms.uRadius.value).toBe(90)
    expect(m.transparent).toBe(true)
    expect(m.blending).toBe(THREE.AdditiveBlending)
    expect(m.depthWrite).toBe(false)
  })

  it('corona shader billboards in the vertex stage (no camera plumbing)', () => {
    const m = makeCoronaMaterial(90)
    expect(m.vertexShader).toContain('mvPosition.xy += position.xy')
  })

  it('prominence material lights only the limb and animates', () => {
    const m = makeProminenceMaterial()
    expect(m.uniforms.uTime.value).toBe(0)
    expect(m.blending).toBe(THREE.AdditiveBlending)
    expect(m.fragmentShader).toContain('limb')
    expect(m.fragmentShader).toContain('uTime')
  })

  it('shaders share one noise implementation', () => {
    expect(makeCoronaMaterial(1).fragmentShader).toContain(NOISE_GLSL.trim())
    expect(makeProminenceMaterial().fragmentShader).toContain(NOISE_GLSL.trim())
    expect(makeSunMaterial().fragmentShader).toContain(NOISE_GLSL.trim())
  })
})
