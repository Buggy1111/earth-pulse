import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeArModel } from './arScene'

describe('Sky AR GLB disposal', () => {
  it('disposes shared geometries, materials and textures exactly once', () => {
    const geometry = new THREE.BoxGeometry()
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    const g = vi.spyOn(geometry, 'dispose')
    const m = vi.spyOn(material, 'dispose')
    const t = vi.spyOn(texture, 'dispose')
    const root = new THREE.Group()
    root.add(new THREE.Mesh(geometry, material))
    root.add(new THREE.Mesh(geometry, material))
    disposeArModel(root)
    expect(g).toHaveBeenCalledTimes(1)
    expect(m).toHaveBeenCalledTimes(1)
    expect(t).toHaveBeenCalledTimes(1)
  })
})
