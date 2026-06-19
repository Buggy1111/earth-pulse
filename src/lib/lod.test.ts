import { describe, expect, it } from 'vitest'
import { selectNearest } from './lod'

describe('selectNearest', () => {
  it('returns the n nearest indices, closest first', () => {
    expect(selectNearest([5, 1, 3, 2, 4], 2)).toEqual([1, 3]) // dist 1 then 2
  })

  it('clamps n to the array length', () => {
    expect(selectNearest([2, 1], 10)).toEqual([1, 0])
  })

  it('sorts non-finite (hidden) distances last', () => {
    const picked = selectNearest([Infinity, 4, Infinity, 1], 2)
    expect(picked).toEqual([3, 1]) // the two finite ones, nearest first
  })

  it('handles an empty set', () => {
    expect(selectNearest([], 5)).toEqual([])
  })
})
