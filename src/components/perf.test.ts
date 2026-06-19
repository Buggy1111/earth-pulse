import { describe, expect, it } from 'vitest'
import { followPixelRatio } from './perf'

describe('followPixelRatio', () => {
  it('caps a high-DPR phone so the close-up fragment load drops', () => {
    expect(followPixelRatio(3)).toBe(1.25)
    expect(followPixelRatio(2)).toBe(1.25)
  })

  it('never raises a screen that is already below the cap', () => {
    expect(followPixelRatio(1)).toBe(1)
    expect(followPixelRatio(0.75)).toBe(0.75)
  })

  it('falls back to 1 for a missing/zero ratio', () => {
    expect(followPixelRatio(0)).toBe(1)
    expect(followPixelRatio(NaN as unknown as number)).toBe(1)
  })
})
