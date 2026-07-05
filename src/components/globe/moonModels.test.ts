import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { fitGeometryTo } from './moonModels'

describe('fitGeometryTo', () => {
  it('přeškáluje a vycentruje geometrii na požadovaný display poloměr', () => {
    // NASA modely jsou v km a mimo počátek — tady krabice 24×20×28 posunutá o (5,-3,2)
    const geo = new THREE.BoxGeometry(24, 20, 28)
    geo.translate(5, -3, 2)
    fitGeometryTo(geo, 1.1)
    const s = geo.boundingSphere!
    expect(s.radius).toBeCloseTo(1.1, 5)
    expect(s.center.length()).toBeCloseTo(0, 5)
  })

  it('degenerovanou geometrii nechá být (žádné dělení nulou)', () => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([1, 2, 3], 3))
    expect(() => fitGeometryTo(geo, 1.1)).not.toThrow()
    // jediný bod = poloměr 0 → fit se přeskočí, pozice zůstává
    expect(geo.getAttribute('position').getX(0)).toBe(1)
  })
})
