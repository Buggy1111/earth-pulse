import { describe, expect, it } from 'vitest'
import { warpedSimMs } from './clock'

describe('warpedSimMs', () => {
  const clock = { realMs: 1_000, simMs: 5_000, warp: 1 }

  it('at the anchor instant returns simMs', () => {
    expect(warpedSimMs(clock, 1_000)).toBe(5_000)
  })

  it('advances 1:1 with real time at warp 1', () => {
    expect(warpedSimMs(clock, 3_000)).toBe(7_000) // +2000 real → +2000 sim
  })

  it('runs warp× faster than real time', () => {
    expect(warpedSimMs({ realMs: 1_000, simMs: 0, warp: 60 }, 2_000)).toBe(60_000)
  })

  it('runs backwards under negative warp', () => {
    expect(warpedSimMs({ realMs: 1_000, simMs: 10_000, warp: -2 }, 2_000)).toBe(8_000)
  })

  it('adds the timeline scrub offset', () => {
    expect(warpedSimMs(clock, 1_000, -3_600_000)).toBe(5_000 - 3_600_000)
  })
})
