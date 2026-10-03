import { describe, expect, it } from 'vitest'
import { droneParams, planetActivity } from './ambient'
import type { Quake } from './quakes'

const NOW = Date.UTC(2026, 9, 3, 12)
const q = (mag: number, agoH: number): Quake => ({
  id: `${mag}-${agoH}`, lat: 0, lng: 0, mag, depthKm: 10, place: 'x', time: NOW - agoH * 3_600_000,
})

describe('ambient drone', () => {
  it('is calm for a quiet planet', () => {
    expect(planetActivity({ quakes: [], kp: 1, now: NOW })).toBe(0)
    expect(planetActivity({ quakes: [q(2.1, 1), q(2.8, 3)], kp: 2, now: NOW })).toBeLessThan(0.05)
  })

  it('rises with a big quake and saturates for a great one', () => {
    const busy = planetActivity({ quakes: [q(5.2, 1), q(4.6, 2), q(4.4, 3)], kp: 2, now: NOW })
    const major = planetActivity({ quakes: [q(7.4, 0.5)], kp: 2, now: NOW })
    expect(busy).toBeGreaterThan(0.1)
    expect(major).toBeGreaterThan(busy)
    expect(major).toBeGreaterThan(0.8)
    expect(planetActivity({ quakes: [q(9.1, 0)], kp: null, now: NOW })).toBeLessThanOrEqual(1)
  })

  it('ignores old quakes and reacts to a geomagnetic storm', () => {
    expect(planetActivity({ quakes: [q(7.5, 20)], kp: 1, now: NOW })).toBe(0)
    expect(planetActivity({ quakes: [], kp: 7, now: NOW })).toBeGreaterThan(0.5)
  })

  it('maps calm → open fifth and distress → clash, monotonically', () => {
    const calm = droneParams(0)
    const mid = droneParams(0.6)
    const bad = droneParams(1)
    expect(calm.ratio).toBeCloseTo(1.5, 3)
    expect(mid.ratio).toBeCloseTo(Math.SQRT2, 3)
    expect(bad.ratio).toBeCloseTo(1.0595, 3)
    expect(calm.cutoffHz).toBeGreaterThan(mid.cutoffHz)
    expect(mid.cutoffHz).toBeGreaterThan(bad.cutoffHz)
    expect(bad.lfoHz).toBeGreaterThan(calm.lfoHz)
    expect(bad.gain).toBeGreaterThan(calm.gain)
    expect(bad.gain).toBeLessThan(0.2) // always gentle
    expect(droneParams(5).ratio).toBe(droneParams(1).ratio) // clamped
  })
})
