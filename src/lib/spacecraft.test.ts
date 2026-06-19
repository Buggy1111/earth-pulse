import { describe, expect, it } from 'vitest'
import { ACTIVE_SPACECRAFT_COUNT, SOLAR_SYSTEM_SPACECRAFT } from './spacecraft'
import { APOLLO_SITES, LUNAR_SITES } from './moon'

describe('SOLAR_SYSTEM_SPACECRAFT', () => {
  it('headline count is derived from the list and in a sane range', () => {
    expect(ACTIVE_SPACECRAFT_COUNT).toBe(SOLAR_SYSTEM_SPACECRAFT.length)
    expect(ACTIVE_SPACECRAFT_COUNT).toBeGreaterThan(25)
    expect(ACTIVE_SPACECRAFT_COUNT).toBeLessThan(60)
  })

  it('every craft has a name and a known status', () => {
    for (const s of SOLAR_SYSTEM_SPACECRAFT) {
      expect(s.name).toBeTruthy()
      expect(['operating', 'cruise', 'dormant']).toContain(s.status)
    }
  })
})

describe('LUNAR_SITES', () => {
  it('puts the two Chinese far-side firsts on the far side', () => {
    const ce4 = LUNAR_SITES.find((s) => s.mission === "Chang'e 4")
    const ce6 = LUNAR_SITES.find((s) => s.mission === "Chang'e 6")
    expect(ce4?.side).toBe('far')
    expect(ce6?.side).toBe('far')
    // far side ⇒ the sub-Earth point is at lng 0, so far-side sites are past ±90°
    expect(Math.abs(ce4!.lng)).toBeGreaterThan(90)
    expect(Math.abs(ce6!.lng)).toBeGreaterThan(90)
  })

  it('keeps every site on the lunar surface', () => {
    for (const s of LUNAR_SITES) {
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(s.lng)).toBeLessThanOrEqual(180)
    }
  })

  it('the crewed subset is exactly the six NASA Apollo landings', () => {
    expect(APOLLO_SITES).toHaveLength(6)
    expect(APOLLO_SITES.every((s) => s.crew && s.operator === 'NASA' && s.side === 'near')).toBe(true)
  })
})
