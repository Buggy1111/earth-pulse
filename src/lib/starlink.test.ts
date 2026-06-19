import { describe, expect, it } from 'vitest'
import { parseTle, propagateSats, toTrackedSats } from './satellites'
// the build-time snapshot the Starlink worker parses — guards both the data
// and the exact parse path (parseTle → satrec) the worker runs off-thread.
import text from '../../public/tle/starlink.txt?raw'

describe('Starlink TLE snapshot', () => {
  const sets = parseTle(text)

  it('holds the full constellation (thousands of sats)', () => {
    expect(sets.length).toBeGreaterThan(1000)
  })

  it('every set is a Starlink and parses into a valid satrec', () => {
    expect(sets.every((s) => /starlink/i.test(s.name))).toBe(true)
    const tracked = toTrackedSats(sets)
    // virtually all element sets are valid; allow a tiny margin for the odd one
    expect(tracked.length).toBeGreaterThan(sets.length * 0.99)
  })

  it('propagates to plausible LEO positions right now', () => {
    const tracked = toTrackedSats(sets).slice(0, 200)
    const pos = propagateSats(tracked, new Date())
    expect(pos.length).toBeGreaterThan(100)
    // Starlink flies a ~550 km shell; allow drift/raising/lowering sats
    expect(pos.every((p) => p.altKm > 200 && p.altKm < 1200)).toBe(true)
    expect(pos.every((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)).toBe(true)
  })
})
