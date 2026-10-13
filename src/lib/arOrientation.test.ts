import { describe, expect, it } from 'vitest'
import { safeArOrientation } from './arOrientation'

describe('Sky AR orientation safety', () => {
  const previous = { heading: 45, pitch: 25 }
  it('normalizes compass and alpha values', () => {
    expect(safeArOrientation(90, 120, null, previous)).toEqual({ heading: 270, pitch: 30, valid: true })
    expect(safeArOrientation(null, 90, 725, previous)).toEqual({ heading: 5, pitch: 0, valid: true })
  })
  it('rejects non-finite sensor frames and holds the last valid pose', () => {
    expect(safeArOrientation(NaN, Infinity, NaN, previous)).toEqual({ ...previous, valid: false })
    expect(safeArOrientation(null, null, null, previous)).toEqual({ ...previous, valid: false })
    expect(safeArOrientation(NaN, 120, null, previous)).toEqual({ heading: 45, pitch: 30, valid: true })
  })
})
