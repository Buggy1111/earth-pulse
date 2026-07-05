import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MAX_OCCLUDERS, occludeLineMaterial, occluderUniform, setOccluder } from './trailOcclusion'

describe('setOccluder', () => {
  it('balí radius² do w správného slotu', () => {
    setOccluder(3, 1, 2, 3, 5)
    const v = occluderUniform.value[3]
    expect([v.x, v.y, v.z, v.w]).toEqual([1, 2, 3, 25])
    setOccluder(3, 0, 0, 0, 0) // úklid pro ostatní testy
  })

  it('index mimo rozsah tiše ignoruje (žádný crash, žádný zápis)', () => {
    expect(() => setOccluder(-1, 9, 9, 9, 9)).not.toThrow()
    expect(() => setOccluder(MAX_OCCLUDERS, 9, 9, 9, 9)).not.toThrow()
    expect(occluderUniform.value.every((v) => v.w !== 81)).toBe(true)
  })
})

describe('occludeLineMaterial', () => {
  it('patchne shader: sdílený uniform, varying a discard smyčka přes MAX_OCCLUDERS', () => {
    const mat = occludeLineMaterial(new THREE.LineBasicMaterial({ vertexColors: true }))
    // onBeforeCompile běží až při renderu — zavoláme ho s minimálním three
    // shader skeletem (tokeny, které patch nahrazuje, v three 0.18x existují)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
      fragmentShader: 'uniform float opacity;\nvoid main() {\n}',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(shader.uniforms.uBodies).toBe(occluderUniform) // sdílená instance, ne kopie
    expect(shader.vertexShader).toContain('vWorldTrail = (modelMatrix * vec4(position, 1.0)).xyz')
    expect(shader.fragmentShader).toContain(`uniform vec4 uBodies[${MAX_OCCLUDERS}];`)
    expect(shader.fragmentShader).toContain(`for (int i = 0; i < ${MAX_OCCLUDERS}; i++)`)
    expect(shader.fragmentShader).toContain('discard')
    expect(mat.vertexColors).toBe(true) // původní nastavení materiálu zůstává
  })
})
