import { describe, expect, it } from 'vitest'
import { parseTle, propagateSats, toTrackedSats } from './satellites'
import { lookAngles } from './arMath'
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
    // Starlink flies a ~550 km shell; allow drift/raising/lowering sats.
    // 98 % quantile, not every(): a handful of the 200 are always deorbiting,
    // and a snapshot even a week old drifts a few of them past the bounds —
    // the canary should fire on ROTTEN data (weekly refresh action dead),
    // not on the odd dying satellite.
    const plausible = pos.filter((p) => p.altKm > 200 && p.altKm < 1200)
    expect(plausible.length).toBeGreaterThan(pos.length * 0.98)
    expect(pos.every((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)).toBe(true)
  })

  // the Sky AR feed: the whole constellation propagated, then filtered to those
  // above an observer's horizon with valid look angles
  it('puts dozens of Starlinks above the horizon over Czechia right now', () => {
    const tracked = toTrackedSats(sets)
    const vitkov = { lat: 49.77, lng: 17.75 } // Michal's area, MSK
    const above = propagateSats(tracked, new Date())
      .map((p) => lookAngles(vitkov, p))
      .filter((la) => la.elevationDeg > 0)
    // a 10k LEO shell always has a good crowd overhead
    expect(above.length).toBeGreaterThan(50)
    expect(above.every((la) => la.azimuthDeg >= 0 && la.azimuthDeg <= 360)).toBe(true)
    expect(above.every((la) => la.elevationDeg > 0 && la.elevationDeg <= 90)).toBe(true)
  })
})
