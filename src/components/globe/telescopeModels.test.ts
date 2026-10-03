import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { makeRomanModel, makeWebbModel, webbSegmentCoords } from './telescopeModels'

describe('telescope models', () => {
  it('lays out Webb\'s 18 unique mirror segments with no centre piece', () => {
    const c = webbSegmentCoords()
    expect(c).toHaveLength(18)
    expect(new Set(c.map((p) => p.join(','))).size).toBe(18)
    expect(c.some(([q, r]) => q === 0 && r === 0)).toBe(false)
  })

  it('builds finite, non-empty models', () => {
    for (const make of [makeWebbModel, makeRomanModel]) {
      const size = new THREE.Box3().setFromObject(make()).getSize(new THREE.Vector3())
      expect(Number.isFinite(size.x + size.y + size.z)).toBe(true)
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.3)
    }
  })
})
